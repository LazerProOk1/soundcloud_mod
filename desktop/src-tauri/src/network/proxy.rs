use std::path::PathBuf;
use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use tokio::fs;

use crate::network::image_cache::{cache_key, sniff_content_type};
use crate::shared::constants::is_domain_whitelisted;

pub struct State {
    pub assets_dir: PathBuf,
    pub http_client: reqwest::Client,
    pub rt_handle: tokio::runtime::Handle,
}

pub static STATE: OnceLock<State> = OnceLock::new();

pub struct ProxyResult {
    pub status: u16,
    pub content_type: String,
    pub data: Vec<u8>,
}

async fn write_cached_asset(cache_path: PathBuf, data: Vec<u8>) {
    let tmp = PathBuf::from(format!("{}.tmp-{}", cache_path.display(), std::process::id()));
    if fs::write(&tmp, &data).await.is_err() {
        let _ = fs::remove_file(&tmp).await;
        return;
    }
    if fs::rename(&tmp, &cache_path).await.is_err() {
        let _ = fs::remove_file(&tmp).await;
    }
}

pub async fn proxy_request(encoded: &str) -> ProxyResult {
    let state = match STATE.get() {
        Some(s) => s,
        None => {
            return ProxyResult {
                status: 503,
                content_type: "text/plain".into(),
                data: b"not ready".to_vec(),
            }
        }
    };

    let decoded = urlencoding::decode(encoded).unwrap_or_default();
    let payload_bytes = match BASE64.decode(decoded.as_bytes()) {
        Ok(bytes) => bytes,
        Err(_) => {
            return ProxyResult {
                status: 400,
                content_type: "text/plain".into(),
                data: b"invalid base64".to_vec(),
            }
        }
    };

    let payload: Vec<String> = match serde_json::from_slice(&payload_bytes) {
        Ok(v) => v,
        Err(_) => {
            return ProxyResult {
                status: 400,
                content_type: "text/plain".into(),
                data: b"invalid payload".to_vec(),
            }
        }
    };

    let target_url = match payload.first() {
        Some(s) if !s.is_empty() => s.clone(),
        _ => {
            return ProxyResult {
                status: 400,
                content_type: "text/plain".into(),
                data: b"missing target".to_vec(),
            }
        }
    };
    let upstreams = &payload[1..];
    if upstreams.is_empty() {
        return ProxyResult {
            status: 400,
            content_type: "text/plain".into(),
            data: b"missing upstream".to_vec(),
        };
    }

    let host = target_url
        .split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .and_then(|authority| authority.split(':').next())
        .unwrap_or("");

    if is_domain_whitelisted(host) {
        return ProxyResult {
            status: 403,
            content_type: "text/plain".into(),
            data: b"whitelisted domain".to_vec(),
        };
    }

    let cache_path = state.assets_dir.join(cache_key(&target_url));

    if let Ok(data) = fs::read(&cache_path).await {
        if !data.is_empty() {
            #[cfg(debug_assertions)]
            println!("[Proxy] cache HIT {}", target_url);
            let content_type = sniff_content_type(&data).to_string();
            return ProxyResult {
                status: 200,
                content_type,
                data,
            };
        }
        let _ = fs::remove_file(&cache_path).await;
    }

    #[cfg(debug_assertions)]
    println!("[Proxy] {} -> upstream", target_url);

    let encoded_for_header = BASE64.encode(target_url.as_bytes());
    let mut status = 502u16;
    let mut data: Vec<u8> = Vec::new();

    for upstream in upstreams {
        let resp = match state
            .http_client
            .get(upstream)
            .header("X-Target", &encoded_for_header)
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        status = resp.status().as_u16();
        match resp.bytes().await {
            Ok(b) => data = b.to_vec(),
            Err(_) => continue,
        }

        if status < 500 {
            break;
        }
    }

    let content_type = if status == 200 && !data.is_empty() {
        sniff_content_type(&data).to_string()
    } else {
        String::new()
    };

    let is_cacheable = status == 200
        && !data.is_empty()
        && content_type.starts_with("image/");
    if is_cacheable {
        let data_clone = data.clone();
        let path = cache_path.clone();
        tokio::spawn(async move {
            write_cached_asset(path, data_clone).await;
        });
    }

    ProxyResult {
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

    if let Some(encoded) = path.strip_prefix("/img/") {
        let result = crate::network::image_cache::handle(encoded).await;
        return http::Response::builder()
            .status(result.status)
            .header("content-type", &result.content_type)
            .header("cache-control", cache_control_for(result.status))
            .header("access-control-allow-origin", "*")
            .body(result.data)
            .unwrap();
    }

    let encoded = path.trim_start_matches('/');
    let result = proxy_request(encoded).await;
    http::Response::builder()
        .status(result.status)
        .header("content-type", &result.content_type)
        .header("cache-control", cache_control_for(result.status))
        .header("access-control-allow-origin", "*")
        .body(result.data)
        .unwrap()
}
