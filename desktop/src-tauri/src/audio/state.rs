use std::num::{NonZeroU16, NonZeroU32};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use rodio::mixer::Mixer;
use rodio::Player;
use tauri::AppHandle;

use crate::app::diagnostics;
use crate::audio::analyser::AnalyserBuffer;
use crate::audio::device::open_device_sink;
use crate::audio::types::{AudioThreadCmd, EqParams, LyricsTimingLine, MediaCmd};

pub struct LyricsTimelineState {
    pub lines: Vec<LyricsTimingLine>,
    pub active_index: Option<usize>,
}

pub struct AudioState {
    pub player: Mutex<Option<Player>>,
    pub mixer: Arc<Mutex<Mixer>>,
    pub eq_params: Arc<RwLock<EqParams>>,
    pub normalization_enabled: AtomicBool,
    pub normalization_gain: Mutex<f32>,
    pub volume: Mutex<f32>,
    pub playback_rate: Mutex<f32>,
    /// Accumulated song content position in seconds (accounts for playback rate).
    /// Unlike `player.get_pos()` which returns wall-clock time, this tracks
    /// how far into the audio file we've actually played.
    pub song_pos_secs: Mutex<f64>,
    /// Last wall-clock position from `player.get_pos()` seen in the tick loop.
    /// Used to compute deltas for `song_pos_secs`.
    pub last_wall_pos_secs: Mutex<f64>,
    pub has_track: AtomicBool,
    pub ended_notified: AtomicBool,
    pub suppress_ended_until_ms: AtomicU64,
    pub device_error: Arc<AtomicBool>,
    pub device_reconnected: Arc<AtomicBool>,
    pub load_gen: AtomicU64,
    /// One-shot: when the next track is committed, fade the previous one out over this
    /// many ms (overlapping crossfade) instead of cutting it. 0 = cut.
    pub handoff_fade_ms: AtomicU64,
    /// Fade-out shape for the handoff: 0 equal-power, 1 linear, 2 S-curve.
    pub handoff_curve: std::sync::atomic::AtomicU8,
    pub media_tx: Mutex<Option<std::sync::mpsc::Sender<MediaCmd>>>,
    pub audio_tx: std::sync::mpsc::Sender<AudioThreadCmd>,
    pub source_bytes: Mutex<Option<Arc<[u8]>>>,
    /// Streamed track: cache file it will be saved to (used to rebuild on seek/reload).
    pub stream_final_path: Mutex<Option<std::path::PathBuf>>,
    pub follow_default_output: AtomicBool,
    pub last_known_default_output: Mutex<Option<String>>,
    pub lyrics_timeline: Mutex<Option<LyricsTimelineState>>,
    pub analyser_buffer: Arc<AnalyserBuffer>,
}

/// Without an output device the audio thread keeps retrying with this backoff.
const DEVICE_RETRY_MIN_MS: u64 = 1_000;
const DEVICE_RETRY_MAX_MS: u64 = 30_000;

pub fn init(app: AppHandle) -> AudioState {
    let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<AudioThreadCmd>();
    let device_error_flag = Arc::new(AtomicBool::new(false));
    let reconnected_flag = Arc::new(AtomicBool::new(false));

    // Starting with no output device is normal (Bluetooth off, HDMI unplugged, remote session)
    // and must not block the app: mixing goes into this silent mixer until a device opens, then
    // the thread swaps its contents for the real one without touching the state layout.
    let (silent_mixer, _silent_output) = rodio::mixer::mixer(
        NonZeroU16::new(2).unwrap_or(NonZeroU16::MIN),
        NonZeroU32::new(48_000).unwrap_or(NonZeroU32::MIN),
    );
    let shared_mixer = Arc::new(Mutex::new(silent_mixer));

    let mixer_for_thread = shared_mixer.clone();
    let reconnected_for_thread = reconnected_flag.clone();
    let error_flag_for_thread = device_error_flag.clone();
    let cmd_tx_for_thread = cmd_tx.clone();
    std::thread::Builder::new()
        .name("audio-output".into())
        .spawn(move || {
            let mut retry_ms = DEVICE_RETRY_MIN_MS;
            let mut attempts = 0u32;
            let mut device_sink = loop {
                match open_device_sink(None, &cmd_tx_for_thread, &error_flag_for_thread) {
                    Ok(sink) => break sink,
                    Err(error) => {
                        attempts += 1;
                        error_flag_for_thread.store(true, Ordering::Relaxed);
                        if attempts == 1 {
                            diagnostics::log_native(
                                &app,
                                "ERROR",
                                format!(
                                    "[Audio] no output device: {error}; retrying in background"
                                ),
                            );
                        }
                        std::thread::sleep(Duration::from_millis(retry_ms));
                        retry_ms = (retry_ms * 2).min(DEVICE_RETRY_MAX_MS);
                    }
                }
            };
            *mixer_for_thread.lock().unwrap() = device_sink.mixer().clone();
            error_flag_for_thread.store(false, Ordering::Relaxed);
            if attempts > 0 {
                // The tick loop reloads the current track once a device is available.
                diagnostics::log_native(
                    &app,
                    "INFO",
                    format!("[Audio] output device opened after {attempts} attempt(s)"),
                );
                reconnected_for_thread.store(true, Ordering::Release);
            }

            loop {
                match cmd_rx.recv() {
                    Ok(AudioThreadCmd::SwitchDevice { name, reply }) => {
                        // Open the new device before dropping the current one, so a failed
                        // switch keeps playing instead of leaving the app without output.
                        match open_device_sink(
                            name.as_deref(),
                            &cmd_tx_for_thread,
                            &error_flag_for_thread,
                        ) {
                            Ok(new_sink) => {
                                let mixer = new_sink.mixer().clone();
                                *mixer_for_thread.lock().unwrap() = mixer.clone();
                                // Release the old sink only once the new device is open.
                                drop(std::mem::replace(&mut device_sink, new_sink));
                                error_flag_for_thread.store(false, Ordering::Relaxed);
                                reply.send(Ok(mixer)).ok();
                            }
                            Err(error) => {
                                error_flag_for_thread.store(true, Ordering::Relaxed);
                                diagnostics::log_native(
                                    &app,
                                    "WARN",
                                    format!("[Audio] device switch failed: {error}"),
                                );
                                reply.send(Err(error)).ok();
                            }
                        }
                    }
                    Ok(AudioThreadCmd::Reconnect) => {
                        std::thread::sleep(Duration::from_millis(500));
                        match open_device_sink(None, &cmd_tx_for_thread, &error_flag_for_thread) {
                            Ok(new_sink) => {
                                *mixer_for_thread.lock().unwrap() = new_sink.mixer().clone();
                                drop(std::mem::replace(&mut device_sink, new_sink));
                                error_flag_for_thread.store(false, Ordering::Relaxed);
                                reconnected_for_thread.store(true, Ordering::Release);
                            }
                            // The tick loop and `play` retry; a dead output must not kill the thread.
                            Err(error) => {
                                error_flag_for_thread.store(true, Ordering::Relaxed);
                                diagnostics::log_native(
                                    &app,
                                    "WARN",
                                    format!("[Audio] reconnect failed: {error}"),
                                );
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        })
        .expect("failed to spawn audio thread");

    AudioState {
        player: Mutex::new(None),
        mixer: shared_mixer,
        eq_params: Arc::new(RwLock::new(EqParams::default())),
        normalization_enabled: AtomicBool::new(true),
        normalization_gain: Mutex::new(1.0),
        volume: Mutex::new(0.25),
        playback_rate: Mutex::new(1.0),
        song_pos_secs: Mutex::new(0.0),
        last_wall_pos_secs: Mutex::new(0.0),
        has_track: AtomicBool::new(false),
        ended_notified: AtomicBool::new(false),
        suppress_ended_until_ms: AtomicU64::new(0),
        device_error: device_error_flag,
        device_reconnected: reconnected_flag,
        load_gen: AtomicU64::new(0),
        handoff_fade_ms: AtomicU64::new(0),
        handoff_curve: std::sync::atomic::AtomicU8::new(0),
        media_tx: Mutex::new(None),
        audio_tx: cmd_tx,
        source_bytes: Mutex::new(None),
        stream_final_path: Mutex::new(None),
        follow_default_output: AtomicBool::new(true),
        last_known_default_output: Mutex::new(None),
        lyrics_timeline: Mutex::new(None),
        analyser_buffer: AnalyserBuffer::new(),
    }
}
