use std::path::PathBuf;
use std::sync::OnceLock;

use tokio::fs;

use crate::network::image_cache::{
    cache_key, fetch_upstreams, parse_request, sniff_content_type, ImageResult,
};

pub struct State {
    pub assets_dir: PathBuf,
    pub http_client: reqwest::Client,
    pub rt_handle: tokio::runtime::Handle,
}

pub static STATE: OnceLock<State> = OnceLock::new();

async fn write_cached_asset(cache_path: PathBuf, data: Vec<u8>) {
    let tmp = PathBuf::from(format!(
        "{}.tmp-{}",
        cache_path.display(),
        std::process::id()
    ));
    if fs::write(&tmp, &data).await.is_err() {
        let _ = fs::remove_file(&tmp).await;
        return;
    }
    if fs::rename(&tmp, &cache_path).await.is_err() {
        let _ = fs::remove_file(&tmp).await;
    }
}

pub async fn proxy_request(encoded: &str) -> ImageResult {
    let Some(state) = STATE.get() else {
        return ImageResult::text(503, "not ready");
    };
    let (target_url, upstreams) = match parse_request(encoded) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let cache_path = state.assets_dir.join(cache_key(&target_url));

    if let Ok(data) = fs::read(&cache_path).await {
        if !data.is_empty() {
            #[cfg(debug_assertions)]
            println!("[Proxy] cache HIT {}", target_url);
            let content_type = sniff_content_type(&data).to_string();
            return ImageResult {
                status: 200,
                content_type,
                data,
            };
        }
        let _ = fs::remove_file(&cache_path).await;
    }

    #[cfg(debug_assertions)]
    println!("[Proxy] {} -> upstream", target_url);

    let (status, data) = fetch_upstreams(&state.http_client, &target_url, &upstreams).await;

    let content_type = if status == 200 && !data.is_empty() {
        sniff_content_type(&data).to_string()
    } else {
        String::new()
    };

    let is_cacheable = status == 200 && !data.is_empty() && content_type.starts_with("image/");
    if is_cacheable {
        let data_clone = data.clone();
        let path = cache_path.clone();
        tokio::spawn(async move {
            write_cached_asset(path, data_clone).await;
        });
    }

    ImageResult {
        status,
        content_type,
        data,
    }
}

/// Long browser cache for successful image responses. Image URLs are
/// content-addressable (sndcdn artwork-XXX), so effectively immutable. Without
/// this the WebView re-hits the proxy on every render and the disk cache only
/// saves a network roundtrip — not the disk read.
pub fn cache_control_for(status: u16) -> &'static str {
    if status == 200 {
        "public, max-age=31536000, immutable"
    } else {
        "no-store"
    }
}

pub async fn handle_uri(request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let path = request.uri().path();
    let result = match path.strip_prefix("/img/") {
        Some(encoded) => crate::network::image_cache::handle(encoded).await,
        None => proxy_request(path.trim_start_matches('/')).await,
    };
    http::Response::builder()
        .status(result.status)
        .header("content-type", &result.content_type)
        .header("cache-control", cache_control_for(result.status))
        .header("access-control-allow-origin", "*")
        .body(result.data)
        .unwrap()
}
