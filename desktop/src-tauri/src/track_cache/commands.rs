use std::collections::HashMap;

use tauri::State;

use crate::track_cache::state::{LikeCacheEntry, TrackCacheEntry, TrackCacheState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreloadEntry {
    pub urn: String,
    pub url: Option<String>,
    pub urls: Option<Vec<String>>,
    #[serde(default, alias = "storage_urls")]
    pub storage_urls: Option<Vec<String>>,
    #[serde(default, alias = "session_id")]
    pub session_id: Option<String>,
}

#[tauri::command]
pub async fn track_ensure_cached(
    urn: String,
    url: Option<String>,
    urls: Option<Vec<String>>,
    storage_urls: Option<Vec<String>>,
    session_id: Option<String>,
    state: State<'_, TrackCacheState>,
) -> Result<TrackCacheEntry, String> {
    // Empty lists = direct SoundCloud only (the legacy server is skipped).
    let fallback_urls: Vec<String> = match (urls, url) {
        (Some(u), _) if !u.is_empty() => u,
        (_, Some(u)) => vec![u],
        _ => Vec::new(),
    };
    let storage_urls = storage_urls.unwrap_or_default();
    state
        .ensure_cached(
            &urn,
            &fallback_urls,
            &storage_urls,
            session_id.as_deref(),
            false,
        )
        .await
}

#[tauri::command]
pub async fn track_cache_from_fallback(
    urn: String,
    artist: String,
    title: String,
    duration_ms: Option<u64>,
    sources: Option<Vec<String>>,
    state: State<'_, TrackCacheState>,
) -> Result<TrackCacheEntry, String> {
    state
        .cache_from_fallback(
            &urn,
            &artist,
            &title,
            duration_ms,
            &sources.unwrap_or_default(),
        )
        .await
}

/// YouTube Music radio for a song, for My Wave (metadata; matched on SoundCloud in JS).
#[tauri::command]
pub async fn wave_ytm_radio(
    query: String,
    duration_ms: Option<u64>,
    limit: Option<usize>,
    state: State<'_, TrackCacheState>,
) -> Result<Vec<super::youtube::RadioTrack>, String> {
    state
        .ytm_radio(&query, duration_ms, limit.unwrap_or(25).min(50))
        .await
}

#[tauri::command]
pub async fn track_get_cache_info(
    urn: String,
    state: State<'_, TrackCacheState>,
) -> Result<Option<TrackCacheEntry>, String> {
    // Every lookup opens the file and reads its metadata sidecar: on the main thread a list of
    // tracks serialized the whole IPC queue behind these scans (3 s and more in desktop.log).
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.get_cache_entry(&urn))
        .await
        .map_err(|error| format!("cache lookup failed: {error}"))
}

/// Cache state of many tracks at once: one call per list instead of one call per row.
#[tauri::command]
pub async fn track_get_cache_infos(
    urns: Vec<String>,
    state: State<'_, TrackCacheState>,
) -> Result<HashMap<String, TrackCacheEntry>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        urns
            .into_iter()
            .filter_map(|urn| state.get_cache_entry(&urn).map(|entry| (urn, entry)))
            .collect()
    })
    .await
    .map_err(|error| format!("cache lookup failed: {error}"))
}

#[tauri::command]
pub async fn track_preload(
    entries: Vec<PreloadEntry>,
    state: State<'_, TrackCacheState>,
) -> Result<(), String> {
    let mut queued = 0u32;
    for entry in entries {
        if state.is_cached(&entry.urn) {
            continue;
        }
        let fallback_urls: Vec<String> = match (entry.urls, entry.url) {
            (Some(u), _) if !u.is_empty() => u,
            (_, Some(u)) => vec![u],
            _ => continue,
        };

        let Some(permit) = state.try_acquire_preload_slot() else {
            break;
        };

        queued += 1;
        let state = state.inner().clone();
        let urn = entry.urn;
        let storage_urls = entry.storage_urls.unwrap_or_default();
        let session_id = entry.session_id;

        tokio::spawn(async move {
            let _permit = permit;
            #[cfg(debug_assertions)]
            println!("[TrackCache] preloading {urn}");
            if let Err(err) = state
                .ensure_cached(
                    &urn,
                    &fallback_urls,
                    &storage_urls,
                    session_id.as_deref(),
                    false,
                )
                .await
            {
                eprintln!("[TrackCache] preload {urn}: {err}");
            }
        });
    }
    if queued > 0 {
        println!("[TrackCache] queued {queued} preloads");
    }
    Ok(())
}

#[tauri::command]
pub async fn track_cache_size(state: State<'_, TrackCacheState>) -> Result<u64, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.cache_size())
        .await
        .map_err(|error| format!("cache size failed: {error}"))
}

#[tauri::command]
pub async fn track_liked_cache_size(state: State<'_, TrackCacheState>) -> Result<u64, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.liked_cache_size())
        .await
        .map_err(|error| format!("liked cache size failed: {error}"))
}

#[tauri::command]
pub fn track_clear_cache(state: State<'_, TrackCacheState>) {
    state.clear_cache();
}

#[tauri::command]
pub fn track_clear_liked_cache(state: State<'_, TrackCacheState>) {
    state.clear_liked_cache();
}

#[tauri::command]
pub async fn track_list_cached(state: State<'_, TrackCacheState>) -> Result<Vec<String>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.list_cached_urns())
        .await
        .map_err(|error| format!("cache listing failed: {error}"))
}

#[tauri::command]
pub async fn track_remove_cached(
    urn: String,
    state: State<'_, TrackCacheState>,
) -> Result<bool, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.remove_cached(&urn))
        .await
        .map_err(|error| format!("cache removal failed: {error}"))
}

#[tauri::command]
pub async fn track_mark_played(
    urn: String,
    state: State<'_, TrackCacheState>,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.mark_played(&urn))
        .await
        .map_err(|error| format!("mark played failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn track_enforce_cache_limit(
    limit_mb: u64,
    protected_urns: Option<Vec<String>>,
    state: State<'_, TrackCacheState>,
) -> Result<(), String> {
    let protected = protected_urns.unwrap_or_default();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.enforce_limit(limit_mb, &protected);
    })
    .await
    .map_err(|error| format!("cache limit failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn track_cache_likes(
    entries: Vec<LikeCacheEntry>,
    state: State<'_, TrackCacheState>,
) -> Result<(), String> {
    let state = state.inner().clone();
    tokio::spawn(async move {
        if let Err(err) = state.cache_likes(entries).await {
            eprintln!("[TrackCache] cache_likes error: {err}");
        }
    });
    Ok(())
}

#[tauri::command]
pub fn track_cache_likes_running(state: State<'_, TrackCacheState>) -> bool {
    state.cache_likes_running()
}

#[tauri::command]
pub fn track_cancel_cache_likes(state: State<'_, TrackCacheState>) {
    state.cancel_cache_likes();
}

#[cfg(test)]
mod tests {
    use super::PreloadEntry;

    #[test]
    fn preload_entry_accepts_camel_and_snake_case() {
        let camel = r#"{"urn":"soundcloud:tracks:10","urls":["https://api"],"storageUrls":["https://s3"],"sessionId":"s1"}"#;
        let p1: PreloadEntry = serde_json::from_str(camel).unwrap();
        assert_eq!(
            p1.storage_urls.as_deref(),
            Some(&["https://s3".to_string()][..])
        );
        assert_eq!(p1.session_id.as_deref(), Some("s1"));

        let snake = r#"{"urn":"soundcloud:tracks:11","url":"https://api","storage_urls":["https://s3b"],"session_id":"s2"}"#;
        let p2: PreloadEntry = serde_json::from_str(snake).unwrap();
        assert_eq!(
            p2.storage_urls.as_deref(),
            Some(&["https://s3b".to_string()][..])
        );
        assert_eq!(p2.session_id.as_deref(), Some("s2"));
    }
}
