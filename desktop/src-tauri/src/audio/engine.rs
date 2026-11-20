use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::State;
use tokio::task;

use crate::audio::decode::{
    create_player_from_bytes, create_player_from_reader, is_ogg_opus,
    read_cached_normalization_gain, resolve_normalization_gain,
};
use crate::audio::state::AudioState;
use crate::audio::types::{AudioLoadResult, MediaCmd, StreamLoadResult, EQ_BANDS};
use crate::track_cache::live;

const ENDED_SUPPRESS_MS: u64 = 1200;

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn suppress_ended_temporarily(state: &AudioState) {
    state
        .suppress_ended_until_ms
        .store(now_ms() + ENDED_SUPPRESS_MS, Ordering::Relaxed);
}

fn volume_to_rodio(v: f64) -> f32 {
    (v / 100.0).clamp(0.0, 2.0) as f32
}

/// Seeks to a position in the song. rodio's `Speed` source multiplies seek targets by its
/// speed factor (it treats them as wall-clock time), so at 1.15x a seek to 60 s used to land
/// at 69 s while the lyrics and the progress bar showed 60 s. Divide the factor back out.
/// Returns the value `get_pos()` reports right after the seek (wall-clock, not song time).
fn seek_song_pos(player: &rodio::Player, song_pos: f64) -> Result<f64, rodio::source::SeekError> {
    let wall_pos = song_pos / f64::from(player.speed().max(0.01));
    player
        .try_seek(Duration::from_secs_f64(wall_pos))
        .map(|()| wall_pos)
}

fn apply_current_rate(state: &AudioState, player: &rodio::Player) {
    let rate = *state.playback_rate.lock().unwrap();
    if (rate - 1.0).abs() > f32::EPSILON {
        player.set_speed(rate);
    }
}

fn commit_loaded_track(
    state: &AudioState,
    bytes: Option<Arc<[u8]>>,
    new_player: rodio::Player,
    normalization_gain: f32,
) {
    apply_current_rate(state, &new_player);
    let mut player_guard = state.player.lock().unwrap();
    if let Some(old) = player_guard.take() {
        let fade_ms = state.handoff_fade_ms.swap(0, Ordering::Relaxed);
        if fade_ms > 0 && !old.is_paused() && !old.empty() {
            fade_out_and_stop(old, fade_ms, state.handoff_curve.load(Ordering::Relaxed));
        } else {
            old.stop();
        }
    }
    *player_guard = Some(new_player);
    drop(player_guard);

    // None for streamed tracks: seeking goes through the decoder, or `source_bytes_or_cached`.
    if bytes.is_some() {
        *state.stream_final_path.lock().unwrap() = None;
    }
    *state.source_bytes.lock().unwrap() = bytes;
    *state.normalization_gain.lock().unwrap() = normalization_gain;
    // Reset song-position trackers to zero for the new track.
    *state.song_pos_secs.lock().unwrap() = 0.0;
    *state.last_wall_pos_secs.lock().unwrap() = 0.0;
    state.has_track.store(true, Ordering::Relaxed);
    state.ended_notified.store(false, Ordering::Relaxed);
    state.device_error.store(false, Ordering::Relaxed);
}

/// Fade-out gain for t in 0..=1 (1 → 0). The new track fades in with the mirrored curve.
pub fn fade_out_gain(t: f32, curve: u8) -> f32 {
    let t = t.clamp(0.0, 1.0);
    match curve {
        1 => 1.0 - t,
        2 => 0.5 * (1.0 + (std::f32::consts::PI * t).cos()),
        // Equal power: the sum of both tracks' power stays constant, no dip in the middle.
        _ => (t * std::f32::consts::FRAC_PI_2).cos(),
    }
}

/// Keeps the previous track playing on the mixer while it fades out, then stops it.
/// This is what makes the crossfade an actual overlap rather than fade-out → fade-in.
fn fade_out_and_stop(old: rodio::Player, fade_ms: u64, curve: u8) {
    std::thread::spawn(move || {
        let start_vol = old.volume();
        let started = std::time::Instant::now();
        let total = std::time::Duration::from_millis(fade_ms);
        loop {
            let elapsed = started.elapsed();
            if elapsed >= total || old.empty() {
                break;
            }
            let t = elapsed.as_secs_f32() / total.as_secs_f32();
            old.set_volume(start_vol * fade_out_gain(t, curve));
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        old.stop();
    });
}

async fn build_player_from_bytes(
    bytes: Arc<[u8]>,
    mixer: rodio::mixer::Mixer,
    volume: f32,
    normalization_enabled: bool,
    normalization_cache_dir: Option<PathBuf>,
    normalization_cache_key: Option<String>,
    start_paused: bool,
    eq_params: std::sync::Arc<std::sync::RwLock<crate::audio::types::EqParams>>,
    analyser_buffer: std::sync::Arc<crate::audio::analyser::AnalyserBuffer>,
) -> Result<(Arc<[u8]>, rodio::Player, Option<f64>, f32), String> {
    task::spawn_blocking(move || {
        let normalization_gain = if normalization_enabled {
            resolve_normalization_gain(
                &bytes,
                normalization_cache_dir.as_deref(),
                normalization_cache_key.as_deref(),
            )?
        } else {
            1.0
        };
        let (player, duration_secs) = create_player_from_bytes(
            &bytes,
            &mixer,
            volume,
            normalization_gain,
            start_paused,
            eq_params,
            analyser_buffer,
        )?;
        Ok((bytes, player, duration_secs, normalization_gain))
    })
    .await
    .map_err(|e| format!("audio decode task failed: {e}"))?
}

/// Bytes of the current track: kept in memory for normal loads, read back from the cache
/// file for a streamed track once its download has finished.
fn source_bytes_or_cached(state: &AudioState) -> Option<Arc<[u8]>> {
    if let Some(bytes) = state.source_bytes.lock().unwrap().clone() {
        return Some(bytes);
    }
    let path = state.stream_final_path.lock().unwrap().clone()?;
    let data: Arc<[u8]> = Arc::from(std::fs::read(&path).ok()?);
    *state.source_bytes.lock().unwrap() = Some(data.clone());
    Some(data)
}

pub fn reload_current_track(state: &AudioState) -> Result<(), String> {
    suppress_ended_temporarily(state);
    let bytes = source_bytes_or_cached(state);
    let Some(bytes) = bytes else {
        return Ok(());
    };

    let (was_paused, song_pos) = {
        let player = state.player.lock().unwrap();
        let Some(player) = player.as_ref() else {
            return Ok(());
        };
        // Use the tracked song position (not get_pos() which returns wall-clock time)
        // so we seek to the correct content position even at non-1x playback rates.
        let song_pos = *state.song_pos_secs.lock().unwrap();
        (player.is_paused(), song_pos)
    };
    let position = Duration::from_secs_f64(song_pos);

    let mixer = state.mixer.lock().unwrap().clone();
    let vol = *state.volume.lock().unwrap();
    let normalization_enabled = state.normalization_enabled.load(Ordering::Relaxed);
    let normalization_gain = *state.normalization_gain.lock().unwrap();
    let (new_player, _) = create_player_from_bytes(
        &bytes,
        &mixer,
        vol,
        if normalization_enabled {
            normalization_gain
        } else {
            1.0
        },
        was_paused,
        state.eq_params.clone(),
        state.analyser_buffer.clone(),
    )?;
    // Seek before applying the rate: the new player is still at 1x, so wall time == song time.
    let wall_pos = if song_pos > 0.0 {
        seek_song_pos(&new_player, song_pos).unwrap_or(0.0)
    } else {
        0.0
    };
    apply_current_rate(state, &new_player);
    // After reload+seek, reset wall-clock base to match the new player's get_pos().
    *state.last_wall_pos_secs.lock().unwrap() = wall_pos;

    let mut player = state.player.lock().unwrap();
    if let Some(old) = player.take() {
        old.stop();
    }
    *player = Some(new_player);
    state.has_track.store(true, Ordering::Relaxed);
    state.ended_notified.store(false, Ordering::Relaxed);
    state.device_error.store(false, Ordering::Relaxed);

    Ok(())
}

pub async fn load_file(
    path: String,
    normalization_cache_dir: Option<PathBuf>,
    normalization_cache_key: Option<String>,
    start_paused: bool,
    state: State<'_, AudioState>,
) -> Result<AudioLoadResult, String> {
    let generation = state.load_gen.fetch_add(1, Ordering::Relaxed) + 1;

    let bytes = task::spawn_blocking({
        let path = path.clone();
        move || std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
    })
    .await
    .map_err(|e| format!("audio file read task failed: {e}"))??;

    if state.load_gen.load(Ordering::Relaxed) != generation {
        return Ok(AudioLoadResult {
            duration_secs: None,
        });
    }

    let mixer = state.mixer.lock().unwrap().clone();
    let vol = *state.volume.lock().unwrap();
    let normalization_enabled = state.normalization_enabled.load(Ordering::Relaxed);
    let bytes: Arc<[u8]> = Arc::from(bytes);
    let (bytes, new_player, duration_secs, normalization_gain) = build_player_from_bytes(
        bytes,
        mixer,
        vol,
        normalization_enabled,
        normalization_cache_dir,
        normalization_cache_key,
        start_paused,
        state.eq_params.clone(),
        state.analyser_buffer.clone(),
    )
    .await?;

    if state.load_gen.load(Ordering::Relaxed) != generation {
        new_player.stop();
        return Ok(AudioLoadResult {
            duration_secs: None,
        });
    }

    suppress_ended_temporarily(&state);
    commit_loaded_track(&state, Some(bytes), new_player, normalization_gain);

    Ok(AudioLoadResult { duration_secs })
}

/// Bytes needed before playback starts from a still-downloading file.
const STREAM_START_BYTES: u64 = 160 * 1024;

/// Start playing a track whose download is in progress (see `track_cache::live`).
/// Returns `streaming: false` when there is nothing to stream (no live download within
/// `wait_ms`, or it already finished) — the caller then loads the cached file normally.
pub async fn load_stream(
    urn: String,
    normalization_cache_dir: Option<PathBuf>,
    start_paused: bool,
    wait_ms: u64,
    state: State<'_, AudioState>,
) -> Result<StreamLoadResult, String> {
    let generation = state.load_gen.fetch_add(1, Ordering::Relaxed) + 1;
    let not_streaming = StreamLoadResult {
        streaming: false,
        duration_secs: None,
    };

    let mixer = state.mixer.lock().unwrap().clone();
    let vol = *state.volume.lock().unwrap();
    let normalization_enabled = state.normalization_enabled.load(Ordering::Relaxed);
    let eq = state.eq_params.clone();
    let analyser = state.analyser_buffer.clone();
    // Wait (async) for the download to register and buffer enough bytes.
    let deadline = std::time::Instant::now() + Duration::from_millis(wait_ms);
    let live = loop {
        if state.load_gen.load(Ordering::Relaxed) != generation {
            return Ok(not_streaming);
        }
        // A finished/failed attempt may be followed by the next source registering a new
        // live download for the same URN, so just keep polling until the deadline.
        if let Some(l) = live::get(&urn).filter(|l| l.is_running()) {
            let total = l.total();
            if l.written() >= STREAM_START_BYTES || (total > 0 && l.written() >= total) {
                break l;
            }
        }
        if std::time::Instant::now() > deadline {
            return Ok(not_streaming);
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    };

    let final_path = live.final_path.clone();
    let built = task::spawn_blocking(
        move || -> Result<(rodio::Player, Option<f64>, f32), String> {
            let mut head = [0u8; 64];
            let head_len = {
                use std::io::Read;
                std::fs::File::open(&live.path)
                    .and_then(|mut f| f.read(&mut head))
                    .map_err(|e| format!("stream open: {e}"))?
            };
            let opus = is_ogg_opus(&head[..head_len]);
            let total = live.total();
            let gain = if normalization_enabled && total > 0 {
                read_cached_normalization_gain(
                    normalization_cache_dir.as_deref(),
                    Some(&urn),
                    total as usize,
                )
                .unwrap_or(1.0)
            } else {
                1.0
            };
            let reader =
                live::GrowingReader::open(live).map_err(|e| format!("stream open: {e}"))?;
            let (player, duration) = create_player_from_reader(
                reader,
                total,
                opus,
                &mixer,
                vol,
                gain,
                start_paused,
                eq,
                analyser,
            )?;
            Ok((player, duration, gain))
        },
    )
    .await
    .map_err(|e| format!("stream task failed: {e}"))?;

    let Ok((new_player, duration_secs, gain)) = built else {
        // Decoder couldn't start on the partial file — let the caller wait for the full file.
        return Ok(not_streaming);
    };
    if state.load_gen.load(Ordering::Relaxed) != generation {
        new_player.stop();
        return Ok(not_streaming);
    }
    suppress_ended_temporarily(&state);
    commit_loaded_track(&state, None, new_player, gain);
    *state.stream_final_path.lock().unwrap() = Some(final_path);
    Ok(StreamLoadResult {
        streaming: true,
        duration_secs,
    })
}

pub fn play(state: State<'_, AudioState>) {
    // If the device errored (sleep/wake, headphone unplug), reconnect immediately
    // instead of waiting for stall detection (2s delay).
    if state.device_error.load(Ordering::Relaxed) {
        state
            .audio_tx
            .send(crate::audio::types::AudioThreadCmd::Reconnect)
            .ok();
    }
    // Always unpause so reload_current_track sees was_paused=false
    if let Ok(player) = state.player.try_lock() {
        if let Some(ref player) = *player {
            player.play();
        }
    }
}

pub fn pause(state: State<'_, AudioState>) {
    if let Ok(player) = state.player.try_lock() {
        if let Some(ref player) = *player {
            player.pause();
        }
    }
}

pub fn stop(state: State<'_, AudioState>) {
    state.has_track.store(false, Ordering::Relaxed);
    state.load_gen.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut player) = state.player.try_lock() {
        if let Some(old) = player.take() {
            old.stop();
        }
    }
    if let Ok(mut bytes) = state.source_bytes.try_lock() {
        *bytes = None;
    }
}

pub fn seek(position: f64, state: State<'_, AudioState>) -> Result<(), String> {
    suppress_ended_temporarily(&state);
    let was_paused = state
        .player
        .lock()
        .unwrap()
        .as_ref()
        .map(|player| player.is_paused())
        .unwrap_or(false);

    // For position 0, recreate the player to avoid decoder state issues — unless the track
    // is still streaming (no complete bytes to rebuild from): then seek in place.
    let streaming = state.stream_final_path.lock().unwrap().is_some();
    if position > 0.0 || streaming {
        let player = state.player.lock().unwrap();
        if let Some(ref player) = *player {
            if let Ok(wall_pos) = seek_song_pos(player, position) {
                state.ended_notified.store(false, Ordering::Relaxed);
                // Re-anchor the song-position tracker: get_pos() now reports `wall_pos`.
                *state.song_pos_secs.lock().unwrap() = position;
                *state.last_wall_pos_secs.lock().unwrap() = wall_pos;
                return Ok(());
            }
        }
    }

    let Some(bytes) = source_bytes_or_cached(&state) else {
        return Err("No source to reload for seek (still downloading)".into());
    };

    let mixer = state.mixer.lock().unwrap().clone();
    let vol = *state.volume.lock().unwrap();
    let normalization_enabled = state.normalization_enabled.load(Ordering::Relaxed);
    let normalization_gain = *state.normalization_gain.lock().unwrap();
    let (new_player, _) = create_player_from_bytes(
        &bytes,
        &mixer,
        vol,
        if normalization_enabled {
            normalization_gain
        } else {
            1.0
        },
        was_paused,
        state.eq_params.clone(),
        state.analyser_buffer.clone(),
    )?;
    // Still at 1x here (the rate is applied below), so wall time == song time.
    let wall_pos = if position > 0.0 {
        seek_song_pos(&new_player, position).map_err(|e| format!("Seek failed: {e}"))?
    } else {
        0.0
    };
    apply_current_rate(&state, &new_player);
    // Reset song-position trackers for the rebuilt player.
    *state.song_pos_secs.lock().unwrap() = position;
    *state.last_wall_pos_secs.lock().unwrap() = wall_pos;

    let mut player = state.player.lock().unwrap();
    if let Some(old) = player.take() {
        old.stop();
    }
    *player = Some(new_player);
    state.ended_notified.store(false, Ordering::Relaxed);

    Ok(())
}

pub fn set_volume(volume: f64, state: State<'_, AudioState>) {
    let vol = volume_to_rodio(volume);
    *state.volume.lock().unwrap() = vol;
    // A crossfade is armed: the playing track belongs to the fade-out now; the value
    // is for the incoming track, which picks it up from `state.volume` when it's built.
    if state.handoff_fade_ms.load(Ordering::Relaxed) > 0 {
        return;
    }
    if let Some(ref player) = *state.player.lock().unwrap() {
        player.set_volume(vol);
    }
}

fn clamp_playback_rate(rate: f64) -> f32 {
    (rate.clamp(0.5, 2.0)) as f32
}

pub fn set_playback_rate(rate: f64, state: State<'_, AudioState>) {
    let value = clamp_playback_rate(rate);
    *state.playback_rate.lock().unwrap() = value;
    if let Some(ref player) = *state.player.lock().unwrap() {
        player.set_speed(value);
    }
}

pub fn set_eq(enabled: bool, gains: Vec<f64>, state: State<'_, AudioState>) {
    if let Ok(mut params) = state.eq_params.write() {
        params.enabled = enabled;
        for (index, &gain) in gains.iter().enumerate().take(EQ_BANDS) {
            params.gains[index] = gain.clamp(-12.0, 12.0);
        }
    }
}

pub fn set_normalization(enabled: bool, state: State<'_, AudioState>) {
    state
        .normalization_enabled
        .store(enabled, Ordering::Relaxed);
}

pub fn set_metadata(
    title: String,
    artist: String,
    cover_url: Option<String>,
    duration_secs: f64,
    state: State<'_, AudioState>,
) {
    if let Some(tx) = state.media_tx.lock().unwrap().as_ref() {
        tx.send(MediaCmd::SetMetadata {
            title,
            artist,
            cover_url,
            duration_secs,
        })
        .ok();
    }
}

pub fn set_playback_state(playing: bool, state: State<'_, AudioState>) {
    if let Some(tx) = state.media_tx.lock().unwrap().as_ref() {
        tx.send(MediaCmd::SetPlaying(playing)).ok();
    }
}

pub fn set_media_position(position: f64, state: State<'_, AudioState>) {
    if let Some(tx) = state.media_tx.lock().unwrap().as_ref() {
        tx.send(MediaCmd::SetPosition(position)).ok();
    }
}

pub async fn save_track_to_path(cache_path: String, dest_path: String) -> Result<String, String> {
    tokio::fs::copy(&cache_path, &dest_path)
        .await
        .map_err(|e| format!("Copy failed: {}", e))?;
    Ok(dest_path)
}
