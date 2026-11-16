//! Progressive + HLS downloaders for the anon SC stream path.
//!
//! Direct GETs against SoundCloud media hosts — no proxies, short segment
//! retries, and task abort on failure so callers can quickly fall back to the
//! streaming server.

use std::time::Duration;

use bytes::{Bytes, BytesMut};
use futures_util::StreamExt;
use reqwest::Client;
use url::Url;

const HLS_PREFETCH_SEGMENTS: usize = 3;
const SEGMENT_RETRY_DELAY_MS: u64 = 200;

/// Fetch a single-file (progressive) audio stream.
pub async fn download_progressive(
    client: &Client,
    url: &str,
    progress: &(dyn Fn(f64) + Send + Sync),
) -> Result<Bytes, String> {
    let resp = send_ok(client, url).await?;
    let total = resp.content_length().unwrap_or(0);
    let mut buf = BytesMut::with_capacity(total as usize);
    let mut body = resp.bytes_stream();
    while let Some(chunk) = body.next().await {
        buf.extend_from_slice(&chunk.map_err(|e| format!("body: {e}"))?);
        if total > 0 {
            progress(buf.len() as f64 / total as f64);
        }
    }
    if buf.is_empty() {
        return Err("progressive download returned empty body".into());
    }
    if total > 0 && (buf.len() as u64) < total {
        return Err(format!(
            "truncated progressive response: got {} of {total} bytes",
            buf.len()
        ));
    }
    Ok(buf.freeze())
}

/// Fetch + concat every segment of an HLS playlist.
pub async fn download_hls_full(
    client: &Client,
    m3u8_url: &str,
    progress: &(dyn Fn(f64) + Send + Sync),
) -> Result<Bytes, String> {
    let m3u8_text = fetch_bytes_with_retry(client, m3u8_url).await?;
    let m3u8_content = String::from_utf8_lossy(&m3u8_text);
    let (init_url, segment_urls) = parse_m3u8(&m3u8_content, m3u8_url);

    if segment_urls.is_empty() {
        return Err("No segments found in m3u8".into());
    }

    let mut buf = BytesMut::new();

    if let Some(ref init) = init_url {
        let data = fetch_bytes_with_retry(client, init).await?;
        if data.windows(4).any(|w| w == b"enca") {
            return Err("Stream is CENC encrypted".into());
        }
        buf.extend_from_slice(&data);
    }

    let mut inflight: Vec<tokio::task::JoinHandle<Result<Bytes, String>>> = Vec::new();
    let mut next_idx = 0usize;

    let fill_queue = |inflight: &mut Vec<tokio::task::JoinHandle<Result<Bytes, String>>>,
                      next_idx: &mut usize,
                      client: &Client,
                      urls: &[String]| {
        while *next_idx < urls.len() && inflight.len() < HLS_PREFETCH_SEGMENTS {
            let c = client.clone();
            let u = urls[*next_idx].clone();
            inflight.push(tokio::spawn(async move {
                fetch_bytes_with_retry(&c, &u).await
            }));
            *next_idx += 1;
        }
    };

    fill_queue(&mut inflight, &mut next_idx, client, &segment_urls);

    let mut fetched = 0usize;
    while !inflight.is_empty() {
        let handle = inflight.remove(0);
        match handle.await {
            Ok(Ok(chunk)) => {
                buf.extend_from_slice(&chunk);
                fetched += 1;
                progress(fetched as f64 / segment_urls.len() as f64);
            }
            Ok(Err(e)) => {
                for pending in inflight {
                    pending.abort();
                }
                return Err(format!("segment download: {e}"));
            }
            Err(e) => {
                for pending in inflight {
                    pending.abort();
                }
                return Err(format!("segment task panic: {e}"));
            }
        }
        fill_queue(&mut inflight, &mut next_idx, client, &segment_urls);
    }

    Ok(buf.freeze())
}

async fn fetch_bytes_with_retry(client: &Client, url: &str) -> Result<Bytes, String> {
    match fetch_bytes(client, url).await {
        Ok(b) => Ok(b),
        Err(first_err) => {
            // Don't retry definitive 4xx client errors (except 408/429).
            if is_non_retryable_http(&first_err) {
                return Err(first_err);
            }
            tokio::time::sleep(Duration::from_millis(SEGMENT_RETRY_DELAY_MS)).await;
            fetch_bytes(client, url).await
        }
    }
}

fn is_non_retryable_http(err: &str) -> bool {
    if let Some(rest) = err.strip_prefix("HTTP ") {
        if let Ok(code) = rest
            .split_whitespace()
            .next()
            .unwrap_or("")
            .parse::<u16>()
        {
            return (400..500).contains(&code) && code != 408 && code != 429;
        }
    }
    false
}

async fn fetch_bytes(client: &Client, url: &str) -> Result<Bytes, String> {
    let resp = send_ok(client, url).await?;
    resp.bytes().await.map_err(|e| format!("body: {e}"))
}

async fn send_ok(client: &Client, url: &str) -> Result<reqwest::Response, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    Ok(resp)
}

fn parse_m3u8(content: &str, base_url: &str) -> (Option<String>, Vec<String>) {
    let base = Url::parse(base_url).unwrap_or_else(|_| Url::parse("https://localhost").unwrap());
    let mut init_url = None;
    let mut segment_urls = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if let Some(start) = line.find("#EXT-X-MAP:URI=\"") {
            let rest = &line[start + 16..];
            if let Some(end) = rest.find('"') {
                init_url = Some(resolve_url(&rest[..end], &base));
            }
            continue;
        }
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        segment_urls.push(resolve_url(line, &base));
    }

    (init_url, segment_urls)
}

fn resolve_url(url: &str, base: &Url) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    base.join(url)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| url.to_string())
}
