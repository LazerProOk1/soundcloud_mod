use tauri::{AppHandle, Manager, State};

use crate::audio::device;
use crate::audio::engine;
use crate::audio::state::AudioState;
use crate::audio::timing;
use crate::audio::types::{AudioLoadResult, AudioSink, StreamLoadResult};

#[tauri::command]
pub async fn audio_load_file(
    path: String,
    cache_key: Option<String>,
    start_paused: bool,
    app: AppHandle,
    state: State<'_, AudioState>,
) -> Result<AudioLoadResult, String> {
    let normalization_cache_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("audio-normalization"));
    engine::load_file(
        path,
        normalization_cache_dir,
        cache_key,
        start_paused,
        state,
    )
    .await
}

/// Silence at the edges and the ending fade-out of an audio file (cached per file).
/// `cached_only`: return only an existing result, never decode (safe right before playback).
#[tauri::command]
pub async fn audio_analyze_track(
    path: String,
    cache_key: String,
    cached_only: Option<bool>,
    app: AppHandle,
) -> Result<Option<crate::audio::analysis::TrackAnalysis>, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("audio-analysis");
    let cached_only = cached_only.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        crate::audio::analysis::analyze_file(
            std::path::Path::new(&path),
            &cache_key,
            &dir,
            cached_only,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn audio_load_stream(
    urn: String,
    start_paused: bool,
    wait_ms: Option<u64>,
    app: AppHandle,
    state: State<'_, AudioState>,
) -> Result<StreamLoadResult, String> {
    let normalization_cache_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("audio-normalization"));
    engine::load_stream(
        urn,
        normalization_cache_dir,
        start_paused,
        wait_ms.unwrap_or(15_000),
        state,
    )
    .await
}

#[tauri::command]
pub async fn audio_load_url(
    url: String,
    session_id: Option<String>,
    cache_path: Option<String>,
    cache_key: Option<String>,
    start_paused: bool,
    app: AppHandle,
    state: State<'_, AudioState>,
) -> Result<AudioLoadResult, String> {
    let normalization_cache_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("audio-normalization"));
    engine::load_url(
        url,
        session_id,
        cache_path,
        normalization_cache_dir,
        cache_key,
        start_paused,
        state,
    )
    .await
}

#[tauri::command]
pub fn audio_play(state: State<'_, AudioState>) {
    engine::play(state);
}

#[tauri::command]
pub fn audio_pause(state: State<'_, AudioState>) {
    engine::pause(state);
}

#[tauri::command]
pub fn audio_stop(state: State<'_, AudioState>) {
    engine::stop(state);
}

#[tauri::command]
pub fn audio_seek(position: f64, state: State<'_, AudioState>) -> Result<(), String> {
    engine::seek(position, state)
}

#[tauri::command]
pub fn audio_set_volume(volume: f64, state: State<'_, AudioState>) {
    engine::set_volume(volume, state);
}

/// Arms an overlapping crossfade for the next track load (one-shot).
#[tauri::command]
pub fn audio_set_handoff_fade(ms: u64, curve: u8, state: State<'_, AudioState>) {
    state
        .handoff_fade_ms
        .store(ms.min(20_000), std::sync::atomic::Ordering::Relaxed);
    state
        .handoff_curve
        .store(curve, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub fn audio_set_analyser(enabled: bool, state: State<'_, AudioState>) {
    state
        .analyser_buffer
        .enabled
        .store(enabled, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub fn audio_set_playback_rate(rate: f64, state: State<'_, AudioState>) {
    engine::set_playback_rate(rate, state);
}

#[tauri::command]
pub fn audio_get_position(state: State<'_, AudioState>) -> f64 {
    engine::get_position(state)
}

#[tauri::command]
pub fn audio_set_eq(enabled: bool, gains: Vec<f64>, state: State<'_, AudioState>) {
    engine::set_eq(enabled, gains, state);
}

#[tauri::command]
pub fn audio_set_normalization(enabled: bool, state: State<'_, AudioState>) {
    engine::set_normalization(enabled, state);
}

#[tauri::command]
pub fn audio_is_playing(state: State<'_, AudioState>) -> bool {
    engine::is_playing(state)
}

#[tauri::command]
pub fn audio_set_metadata(
    title: String,
    artist: String,
    cover_url: Option<String>,
    duration_secs: f64,
    state: State<'_, AudioState>,
) {
    engine::set_metadata(title, artist, cover_url, duration_secs, state);
}

#[tauri::command]
pub fn audio_set_playback_state(playing: bool, state: State<'_, AudioState>) {
    engine::set_playback_state(playing, state);
}

#[tauri::command]
pub fn audio_set_media_position(position: f64, state: State<'_, AudioState>) {
    engine::set_media_position(position, state);
}

#[tauri::command]
pub fn audio_list_devices() -> Vec<AudioSink> {
    device::list_devices()
}

#[tauri::command]
pub fn audio_switch_device(
    device_name: Option<String>,
    state: State<'_, AudioState>,
) -> Result<(), String> {
    device::switch_device(state, device_name)
}

#[tauri::command]
pub fn audio_set_follow_default_output(follow: bool, state: State<'_, AudioState>) {
    device::set_follow_default_output(state, follow);
}

#[tauri::command]
pub async fn save_track_to_path(cache_path: String, dest_path: String) -> Result<String, String> {
    engine::save_track_to_path(cache_path, dest_path).await
}

#[tauri::command]
pub fn audio_set_lyrics_timeline(
    lines: Vec<crate::audio::types::LyricsTimingLine>,
    state: State<'_, AudioState>,
) {
    timing::audio_set_lyrics_timeline(lines, state);
}

#[tauri::command]
pub fn audio_clear_lyrics_timeline(state: State<'_, AudioState>) {
    timing::audio_clear_lyrics_timeline(state);
}

#[tauri::command]
pub fn audio_set_comments_timeline(
    comments: Vec<crate::audio::types::FloatingCommentEvent>,
    state: State<'_, AudioState>,
) {
    timing::audio_set_comments_timeline(comments, state);
}

#[tauri::command]
pub fn audio_clear_comments_timeline(state: State<'_, AudioState>) {
    timing::audio_clear_comments_timeline(state);
}
