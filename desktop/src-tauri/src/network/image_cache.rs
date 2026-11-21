use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use sha2::{Digest, Sha256};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;

use crate::shared::constants::is_domain_whitelisted;

struct InflightImage {
    notify: Notify,
    result: std::sync::Mutex<Option<ImageResult>>,
}

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Permanent on-disk image cache.
///
/// Lives in `app_data_dir/images/` (NOT cache_dir) so the OS never reclaims
/// the files. The directory is sharded by the first two hex chars of the
/// SHA256 key so we never end up with hundreds of thousands of entries in
/// a single directory.
pub struct ImageCache {
    pub dir: PathBuf,
    pub http_client: reqwest::Client,
    inflight: std::sync::Mutex<HashMap<String, Arc<InflightImage>>>,
}

impl ImageCache {
    pub fn new(dir: PathBuf, http_client: reqwest::Client) -> Self {
        Self {
            dir,
            http_client,
            inflight: std::sync::Mutex::new(HashMap::new()),
        }
    }
}

pub static STATE: OnceLock<ImageCache> = OnceLock::new();

#[derive(Clone)]
pub struct ImageResult {
    pub status: u16,
    pub content_type: String,
    pub data: Vec<u8>,
}

impl ImageResult {
    pub(crate) fn text(status: u16, msg: &str) -> Self {
        Self {
            status,
            content_type: "text/plain".into(),
            data: msg.as_bytes().to_vec(),
        }
    }
}

pub(crate) fn cache_key(url: &str) -> String {
    hex::encode(Sha256::digest(url.as_bytes()))
}

fn cache_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(&key[..2]).join(key)
}

/// Sniff the content type from the leading bytes, so no sidecar .meta file is needed.
pub(crate) fn sniff_content_type(data: &[u8]) -> &'static str {
    if data.len() >= 3 && data[..3] == [0xFF, 0xD8, 0xFF] {
        "image/jpeg"
    } else if data.len() >= 8 && data[..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        "image/png"
    } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        "image/webp"
    } else if data.len() >= 6 && (&data[..6] == b"GIF87a" || &data[..6] == b"GIF89a") {
        "image/gif"
    } else if data.len() >= 12
        && &data[4..8] == b"ftyp"
        && (&data[8..12] == b"avif" || &data[8..12] == b"avis")
    {
        "image/avif"
    } else if data.len() >= 5 && (&data[..5] == b"<?xml" || &data[..4] == b"<svg") {
        "image/svg+xml"
    } else if data.len() >= 4 && data[..4] == [0x00, 0x00, 0x01, 0x00] {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

/// Atomic write: tmp -> flush -> rename. Survives crashes — we either have
/// the old file or the fully-written new one, never a partial blob.
async fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let seq = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("tmp-{}-{seq}", std::process::id()));
    {
        let mut f = File::create(&tmp).await?;
        f.write_all(data).await?;
        f.flush().await?;
    }
    if let Err(e) = fs::rename(&tmp, path).await {
        let _ = fs::remove_file(&tmp).await;
        return Err(e);
    }
    Ok(())
}

/// Decodes `base64(json([target, ...upstreams]))` and rejects whitelisted targets.
pub(crate) fn parse_request(encoded: &str) -> Result<(String, Vec<String>), ImageResult> {
    let decoded = urlencoding::decode(encoded).unwrap_or_default();
    let bytes = BASE64
        .decode(decoded.as_bytes())
        .map_err(|_| ImageResult::text(400, "invalid base64"))?;
    let mut payload: Vec<String> =
        serde_json::from_slice(&bytes).map_err(|_| ImageResult::text(400, "invalid payload"))?;
    if !matches!(payload.first(), Some(s) if !s.is_empty()) {
        return Err(ImageResult::text(400, "missing target"));
    }
    let target = payload.remove(0);
    if payload.is_empty() {
        return Err(ImageResult::text(400, "missing upstream"));
    }
    let host = target
        .split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .and_then(|authority| authority.split(':').next())
        .unwrap_or("");
    if is_domain_whitelisted(host) {
        return Err(ImageResult::text(403, "whitelisted domain"));
    }
    Ok((target, payload))
}

/// Tries each upstream (target passed in `X-Target`) until one answers below 500.
pub(crate) async fn fetch_upstreams(
    client: &reqwest::Client,
    target: &str,
    upstreams: &[String],
) -> (u16, Vec<u8>) {
    let encoded_for_header = BASE64.encode(target.as_bytes());
    let mut status = 502u16;
    let mut data: Vec<u8> = Vec::new();
    for upstream in upstreams {
        let Ok(resp) = client
            .get(upstream)
            .header("X-Target", &encoded_for_header)
            .send()
            .await
        else {
            continue;
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
    (status, data)
}

pub async fn handle(encoded: &str) -> ImageResult {
    let state = match STATE.get() {
        Some(s) => s,
        None => return ImageResult::text(503, "not ready"),
    };

    let (target_url, upstreams) = match parse_request(encoded) {
        Ok(r) => r,
        Err(r) => return r,
    };

    let key = cache_key(&target_url);
    let path = cache_path(&state.dir, &key);

    if let Ok(data) = fs::read(&path).await {
        if !data.is_empty() {
            #[cfg(debug_assertions)]
            println!("[ImageCache] HIT  {}", target_url);
            let ct = sniff_content_type(&data).to_string();
            return ImageResult {
                status: 200,
                content_type: ct,
                data,
            };
        }
        let _ = fs::remove_file(&path).await;
    }

    // Coalesce concurrent fetches for the same target_url.
    // Waiters register `notified()` while the map lock is held, so a leader that
    // finishes in between cannot be missed; the guard removes the entry and wakes
    // waiters even if the leader's request is cancelled mid-fetch.
    let existing = {
        let mut map = state.inflight.lock().unwrap_or_else(|e| e.into_inner());
        match map.get(&key) {
            Some(existing) => Some(existing.clone()),
            None => {
                map.insert(
                    key.clone(),
                    Arc::new(InflightImage {
                        notify: Notify::new(),
                        result: std::sync::Mutex::new(None),
                    }),
                );
                None
            }
        }
    };
    if let Some(existing) = existing {
        let notified = existing.notify.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        let ready = existing
            .result
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(res) = ready {
            return res;
        }
        let _ = tokio::time::timeout(std::time::Duration::from_secs(30), notified).await;
        if let Some(res) = existing
            .result
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            return res;
        }
        return ImageResult::text(502, "coalesced image fetch failed");
    }
    let inflight_guard = InflightGuard {
        state,
        key: key.clone(),
    };

    #[cfg(debug_assertions)]
    println!("[ImageCache] MISS {}", target_url);

    let (mut status, mut data) = fetch_upstreams(&state.http_client, &target_url, &upstreams).await;

    // All upstreams failed — fetch the target URL directly as last resort
    if status >= 500 || data.is_empty() {
        if let Ok(resp) = state.http_client.get(&target_url).send().await {
            let direct_status = resp.status().as_u16();
            if let Ok(b) = resp.bytes().await {
                if !b.is_empty() {
                    status = direct_status;
                    data = b.to_vec();
                }
            }
        }
    }

    let content_type = if status == 200 && !data.is_empty() {
        sniff_content_type(&data).to_string()
    } else {
        String::new()
    };

    if status == 200 && !data.is_empty() && content_type.starts_with("image/") {
        let path_clone = path.clone();
        let data_clone = data.clone();
        tokio::spawn(async move {
            if let Err(e) = write_atomic(&path_clone, &data_clone).await {
                #[cfg(debug_assertions)]
                eprintln!("[ImageCache] write failed: {}", e);
                let _ = e;
            }
        });
    }

    let res = ImageResult {
        status,
        content_type,
        data,
    };

    inflight_guard.finish(res.clone());
    res
}

/// Removes the in-flight entry and wakes waiters on completion *and* on cancellation.
struct InflightGuard<'a> {
    state: &'a ImageCache,
    key: String,
}

impl InflightGuard<'_> {
    fn finish(self, res: ImageResult) {
        let map = self
            .state
            .inflight
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = map.get(&self.key) {
            *entry.result.lock().unwrap_or_else(|e| e.into_inner()) = Some(res);
        }
        drop(map);
        // Drop runs next: removes the entry and notifies.
    }
}

impl Drop for InflightGuard<'_> {
    fn drop(&mut self) {
        let removed = self
            .state
            .inflight
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.key);
        if let Some(entry) = removed {
            entry.notify.notify_waiters();
        }
    }
}

/* ── Maintenance commands (size / clear) ─────────────────── */

async fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(p) = stack.pop() {
        let mut entries = match fs::read_dir(&p).await {
            Ok(e) => e,
            Err(_) => continue,
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(ft) = entry.file_type().await else {
                continue;
            };
            if ft.is_dir() {
                stack.push(entry.path());
            } else if ft.is_file() {
                if let Ok(meta) = entry.metadata().await {
                    total = total.saturating_add(meta.len());
                }
            }
        }
    }
    total
}

#[tauri::command]
pub async fn image_cache_size() -> u64 {
    let Some(state) = STATE.get() else { return 0 };
    dir_size(&state.dir).await
}

#[tauri::command]
pub async fn image_cache_clear() -> Result<(), String> {
    let Some(state) = STATE.get() else {
        return Err("image cache not ready".into());
    };
    let dir = state.dir.clone();
    if let Err(e) = fs::remove_dir_all(&dir).await {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.to_string());
        }
    }
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(())
}
