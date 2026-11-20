use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::app::diagnostics;
use crate::audio::engine;
use crate::audio::state::AudioState;
use crate::audio::timing;
use crate::audio::types::{
    AudioThreadCmd, STALL_COOLDOWN_MS, STALL_THRESHOLD_MS, TICK_INTERVAL_MS,
};

/// Decoder state copied out of the `player` mutex so the tick loop works without it.
enum PlayerSnapshot {
    NoPlayer,
    Empty,
    Track {
        wall_pos: f64,
        pos_ms: u64,
        playing: bool,
    },
}

pub fn start_tick_emitter(app: &AppHandle) {
    let handle = app.clone();
    std::thread::Builder::new()
        .name("audio-tick".into())
        .spawn(move || loop {
            let mut last_pos_ms = 0u64;
            let mut last_progress_at = std::time::Instant::now();
            let mut stall_cooldown_until = std::time::Instant::now();

            loop {
                std::thread::sleep(Duration::from_millis(TICK_INTERVAL_MS));
                let state = handle.state::<AudioState>();

                if state.device_reconnected.swap(false, Ordering::Acquire) {
                    let _ = engine::reload_current_track(&state);
                    diagnostics::log_native(
                        &handle,
                        "INFO",
                        "[Audio] Device reconnected and reloaded",
                    );
                    handle.emit("audio:device-reconnected", ()).ok();
                }

                if !state.has_track.load(Ordering::Relaxed) {
                    last_pos_ms = 0;
                    last_progress_at = std::time::Instant::now();
                    continue;
                }

                // Snapshot the decoder state under the player lock and release it right
                // away: emitting events, taking other mutexes and logging used to happen
                // while holding `player`, so seek/play/rate changes could wait a whole tick.
                let snapshot = {
                    let guard = state.player.lock().unwrap();
                    match guard.as_ref() {
                        None => PlayerSnapshot::NoPlayer,
                        Some(player) if player.empty() => PlayerSnapshot::Empty,
                        Some(player) => {
                            let pos = player.get_pos();
                            PlayerSnapshot::Track {
                                wall_pos: pos.as_secs_f64(),
                                pos_ms: pos.as_millis() as u64,
                                playing: !player.is_paused(),
                            }
                        }
                    }
                };

                match snapshot {
                    PlayerSnapshot::NoPlayer => {}
                    PlayerSnapshot::Empty => {
                        let suppress_ended = super::engine::now_ms()
                            < state.suppress_ended_until_ms.load(Ordering::Relaxed);
                        if !state.device_error.load(Ordering::Relaxed)
                            && !suppress_ended
                            && !state.ended_notified.swap(true, Ordering::Relaxed)
                        {
                            handle.emit("audio:ended", ()).ok();
                        }
                    }
                    PlayerSnapshot::Track {
                        wall_pos,
                        pos_ms,
                        playing,
                    } => {
                        // Compute song-content position (accounts for playback speed).
                        // `player.get_pos()` returns wall-clock elapsed, not song time —
                        // at 2x speed it still advances at 1 real-second per second.
                        // We accumulate deltas multiplied by the current rate so lyrics
                        // and the JS progress bar both see the correct song position.
                        let song_pos = {
                            let rate = *state.playback_rate.lock().unwrap() as f64;
                            let mut last = state.last_wall_pos_secs.lock().unwrap();
                            let mut song = state.song_pos_secs.lock().unwrap();
                            // A jump in the player clock is a seek or a reconnect, not playback.
                            // Right after a seek rodio can still report the old position for a
                            // tick (it refreshes it periodically): counting that jump — even
                            // capped — added up to 0.5 s per seek, so lyrics drifted ahead after
                            // every click on a line. Re-anchor instead of adding.
                            let raw = wall_pos - *last;
                            *last = wall_pos;
                            if (0.0..=0.5).contains(&raw) {
                                *song = (*song + raw * rate).max(0.0);
                            }
                            *song
                        };

                        handle.emit("audio:tick", song_pos).ok();
                        timing::process_lyrics_timeline(&handle, &state, song_pos);

                        let now = std::time::Instant::now();

                        if !playing {
                            last_pos_ms = pos_ms;
                            last_progress_at = now;
                            continue;
                        }

                        if pos_ms > last_pos_ms {
                            last_pos_ms = pos_ms;
                            last_progress_at = now;
                            continue;
                        }

                        // Backward seek detected — reset stall tracking
                        if pos_ms < last_pos_ms.saturating_sub(500) {
                            last_pos_ms = pos_ms;
                            last_progress_at = now;
                            continue;
                        }

                        if now < stall_cooldown_until {
                            continue;
                        }

                        // Buffering a streamed track is not a dead device.
                        if crate::track_cache::live::STREAM_WAITING.load(Ordering::Relaxed) {
                            last_progress_at = now;
                            continue;
                        }

                        if now.duration_since(last_progress_at).as_millis() as u64
                            > STALL_THRESHOLD_MS
                        {
                            diagnostics::log_native(
                                &handle,
                                "WARN",
                                "[Audio] Stall detected, reconnecting audio device",
                            );
                            // Reconnect device — stall often means the audio stream
                            // died silently (macOS sleep/wake, headphone unplug).
                            // Just reloading the track on a dead mixer won't help.
                            state.audio_tx.send(AudioThreadCmd::Reconnect).ok();
                            stall_cooldown_until = std::time::Instant::now()
                                + Duration::from_millis(STALL_COOLDOWN_MS);
                            last_progress_at = std::time::Instant::now();
                        }
                    }
                }
            }
        })
        .expect("failed to spawn tick thread");
}
