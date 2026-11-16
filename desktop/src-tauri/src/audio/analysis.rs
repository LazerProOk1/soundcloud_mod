//! Track analysis: where the music really starts and ends (silence at the edges),
//! where the ending fade-out begins, and the body loudness. Computed once per cached
//! file in the background and stored as a small JSON next to the normalization cache.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use rodio::Source;
use sha2::{Digest, Sha256};

use crate::audio::decode::{is_ogg_opus, seekable_decoder, OpusSource};

const ANALYSIS_VERSION: u8 = 1;
/// Envelope resolution.
const WINDOW_SECS: f64 = 0.05;
/// A run of loud windows this long counts as music (ignores single clicks).
const MIN_MUSIC_RUN: usize = 4;
/// Smoothing for the fade-out search (~1 s).
const SMOOTH_WINDOWS: usize = 20;
/// The fade-out starts where the level drops this far below the track's body level.
const FADE_DROP_DB: f32 = 9.0;
/// Longest ending we treat as a "fade-out".
const MAX_FADE_SECS: f64 = 20.0;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackAnalysis {
    pub version: u8,
    pub duration_secs: f64,
    /// First moment with music (silence before it can be skipped).
    pub music_start_secs: f64,
    /// Last moment with music (silence after it can be skipped).
    pub music_end_secs: f64,
    /// Where the ending fade-out begins (== music_end when the track ends abruptly).
    pub fade_out_start_secs: f64,
    /// Typical loudness of the track body, dBFS.
    pub body_db: f32,
}

/// Loudness envelope (dBFS per window) of any rodio source, mixed to mono power.
fn envelope<S: Source<Item = f32>>(source: S) -> (Vec<f32>, f64) {
    let channels = source.channels().get() as usize;
    let rate = source.sample_rate().get() as f64;
    let per_window = ((rate * WINDOW_SECS) as usize).max(1) * channels.max(1);
    let window_secs = per_window as f64 / (rate * channels.max(1) as f64);
    let mut env = Vec::new();
    let (mut sum, mut n) = (0.0f64, 0usize);
    for s in source {
        sum += (s as f64) * (s as f64);
        n += 1;
        if n == per_window {
            env.push(power_db(sum / n as f64));
            sum = 0.0;
            n = 0;
        }
    }
    if n > per_window / 4 {
        env.push(power_db(sum / n as f64));
    }
    (env, window_secs)
}

fn power_db(mean_square: f64) -> f32 {
    if mean_square <= 1e-12 {
        -120.0
    } else {
        (10.0 * mean_square.log10()) as f32
    }
}

fn percentile(values: &mut [f32], p: f64) -> f32 {
    if values.is_empty() {
        return -120.0;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((values.len() - 1) as f64 * p).round() as usize;
    values[idx]
}

/// Pure part of the analysis (unit-tested): envelope → edges and fade-out.
pub fn analyze_envelope(env: &[f32], window_secs: f64) -> TrackAnalysis {
    let duration = env.len() as f64 * window_secs;
    let empty = TrackAnalysis {
        version: ANALYSIS_VERSION,
        duration_secs: duration,
        music_start_secs: 0.0,
        music_end_secs: duration,
        fade_out_start_secs: duration,
        body_db: -120.0,
    };
    // Body level: the louder part of everything that isn't digital silence.
    let mut audible: Vec<f32> = env.iter().copied().filter(|d| *d > -70.0).collect();
    if audible.len() < MIN_MUSIC_RUN {
        return empty;
    }
    let body = percentile(&mut audible, 0.7);
    // Silence is relative to the track (quiet acoustic songs) but never above -40 dBFS.
    let silence = (body - 35.0).clamp(-60.0, -40.0);

    let loud = |i: usize| env[i] > silence;
    let run_from = |i: usize| (i..env.len()).take_while(|&j| loud(j)).count();
    let run_to = |i: usize| (0..=i).rev().take_while(|&j| loud(j)).count();

    let Some(start_idx) = (0..env.len()).find(|&i| loud(i) && run_from(i) >= MIN_MUSIC_RUN) else {
        return empty;
    };
    let end_idx = (start_idx..env.len())
        .rev()
        .find(|&i| loud(i) && run_to(i) >= MIN_MUSIC_RUN)
        .unwrap_or(env.len() - 1);

    // Small margins so the first/last note is never clipped.
    let music_start = (start_idx as f64 * window_secs - 0.05).max(0.0);
    let music_end = ((end_idx + 1) as f64 * window_secs + 0.15).min(duration);

    // Fade-out: last point where the smoothed level is still near the body level.
    let threshold = body - FADE_DROP_DB;
    let smooth_at = |i: usize| {
        let from = i.saturating_sub(SMOOTH_WINDOWS / 2);
        let to = (i + SMOOTH_WINDOWS / 2).min(env.len() - 1);
        // Average in the power domain, then back to dB.
        let p: f64 = env[from..=to]
            .iter()
            .map(|d| 10f64.powf(*d as f64 / 10.0))
            .sum::<f64>()
            / (to - from + 1) as f64;
        power_db(p)
    };
    let mut fade_idx = end_idx;
    for i in (start_idx..=end_idx).rev() {
        if smooth_at(i) >= threshold {
            fade_idx = i;
            break;
        }
    }
    let mut fade_start = ((fade_idx + 1) as f64 * window_secs).min(music_end);
    if music_end - fade_start > MAX_FADE_SECS {
        fade_start = music_end - MAX_FADE_SECS;
    }
    if music_end - fade_start < 0.5 {
        fade_start = music_end;
    }

    TrackAnalysis {
        version: ANALYSIS_VERSION,
        duration_secs: duration,
        music_start_secs: music_start,
        music_end_secs: music_end,
        fade_out_start_secs: fade_start,
        body_db: body,
    }
}

fn analyze_bytes(bytes: Arc<[u8]>) -> Result<TrackAnalysis, String> {
    let (env, window) = if is_ogg_opus(&bytes) {
        envelope(OpusSource::new(bytes).map_err(|e| format!("decode: {e}"))?)
    } else {
        match seekable_decoder(&bytes) {
            Ok(src) => envelope(src),
            Err(_) => envelope(OpusSource::new(bytes).map_err(|e| format!("decode: {e}"))?),
        }
    };
    Ok(analyze_envelope(&env, window))
}

fn cache_file(dir: &Path, key: &str, len: u64) -> PathBuf {
    let mut h = Sha256::new();
    h.update(key.as_bytes());
    h.update(b":");
    h.update(len.to_le_bytes());
    dir.join(format!("{}.json", hex::encode(h.finalize())))
}

fn read_cached(dir: &Path, key: &str, len: u64) -> Option<TrackAnalysis> {
    let raw = std::fs::read(cache_file(dir, key, len)).ok()?;
    let a: TrackAnalysis = serde_json::from_slice(&raw).ok()?;
    (a.version == ANALYSIS_VERSION).then_some(a)
}

/// Returns the analysis for an audio file, computing and caching it when needed.
/// With `cached_only`, never decodes (cheap enough to call right before playback).
pub fn analyze_file(
    path: &Path,
    key: &str,
    cache_dir: &Path,
    cached_only: bool,
) -> Result<Option<TrackAnalysis>, String> {
    let len = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if let Some(a) = read_cached(cache_dir, key, len) {
        return Ok(Some(a));
    }
    if cached_only {
        return Ok(None);
    }
    let bytes: Arc<[u8]> = std::fs::read(path).map_err(|e| e.to_string())?.into();
    let analysis = analyze_bytes(bytes)?;
    if std::fs::create_dir_all(cache_dir).is_ok() {
        if let Ok(json) = serde_json::to_vec(&analysis) {
            let _ = std::fs::write(cache_file(cache_dir, key, len), json);
        }
    }
    Ok(Some(analysis))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(parts: &[(usize, f32)]) -> Vec<f32> {
        parts
            .iter()
            .flat_map(|(n, db)| std::iter::repeat_n(*db, *n))
            .collect()
    }

    #[test]
    fn finds_silent_edges_and_fade() {
        // 2 s silence, 60 s music at -14 dB, 8 s linear fade to -60, 3 s silence.
        let mut e = env(&[(40, -90.0), (1200, -14.0)]);
        for i in 0..160 {
            e.push(-14.0 - 46.0 * i as f32 / 160.0);
        }
        e.extend(env(&[(60, -90.0)]));
        let a = analyze_envelope(&e, 0.05);
        assert!((a.music_start_secs - 1.95).abs() < 0.11, "{a:?}");
        assert!(a.music_end_secs > 68.0 && a.music_end_secs < 70.3, "{a:?}");
        assert!(
            a.fade_out_start_secs > 61.0 && a.fade_out_start_secs < 65.0,
            "{a:?}"
        );
    }

    #[test]
    fn abrupt_ending_has_no_fade_and_clicks_are_ignored() {
        // A click before the music must not count as its start.
        let e = env(&[
            (20, -90.0),
            (1, -10.0),
            (20, -90.0),
            (600, -12.0),
            (40, -90.0),
        ]);
        let a = analyze_envelope(&e, 0.05);
        assert!(a.music_start_secs > 1.9, "{a:?}");
        assert_eq!(a.fade_out_start_secs, a.music_end_secs);
    }

    #[test]
    fn silent_file_keeps_full_range() {
        let a = analyze_envelope(&env(&[(100, -100.0)]), 0.05);
        assert_eq!(a.music_start_secs, 0.0);
        assert_eq!(a.music_end_secs, a.duration_secs);
    }
}
