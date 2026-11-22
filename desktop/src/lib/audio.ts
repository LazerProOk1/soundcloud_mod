import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import i18n from '../i18n';
import { useCachedUrnsStore } from '../stores/cached-urns';
import type { Track } from '../stores/player';
import { usePlayerStore } from '../stores/player';
import { type CrossfadeCurve, useSettingsStore } from '../stores/settings';
import { useWaveTasteStore } from '../stores/wave-taste';
import {
  api,
  buildStorageUrls,
  getSessionId,
  resolveTrackFromStreaming,
  streamFallbackUrls,
} from './api';
import { proxiedAssetUrl } from './asset-url';
import {
  enforceAudioCacheLimit,
  ensureTrackCached,
  getCacheInfo,
  markTrackPlayed,
  removeCachedTrack,
  type TrackCacheInfo,
} from './cache';
import { trackedInvoke as invoke } from './diagnostics';
import { isUrnDisliked } from './dislikes';
import { recordEvent } from './events';
import { art } from './formatters';
import { rememberRecentlyPlayed, rememberTracks } from './offline-index';
import { getUrnCluster, recordClusterFeedback } from './recsFeedback';
import {
  isRefusal,
  isRefusedDirect,
  isRefusedMirror,
  rememberRefusedDirect,
  rememberRefusedMirror,
} from './refused-tracks';
import { getArtistDisplay, getDisplayTitle } from './track-display';
import { dedupeSongs, isVariant } from './track-variants';
import { rankWave } from './wave-rank';

const SKIP_THRESHOLD_SEC = 30;
/** Минимум, чтобы засчитать «прослушано полностью» для коротких треков (50% длительности). */
const FULL_PLAY_RATIO = 0.5;

/* ── Audio engine state ──────────────────────────────────────── */

let currentUrn: string | null = null;
let hasTrack = false;
let fallbackDuration = 0;
let cachedTime = 0;
let cachedTimeWallMs = 0; // performance.now() when cachedTime was last set by a tick
let cachedPlaybackRate = 1.0; // effective speed sent to Rust (rate * pitch multiplier)
let cachedDuration = 0;
let loadGen = 0;
let lastEndedUrn: string | null = null;
/** Ignore audio:ended events until this timestamp (set on seek to prevent spurious next()). */
let seekGuardUntilMs = 0;
/** Wall-clock time of the last seek operation. */
let lastSeekWallMs = 0;
/** Track position at the last seek (seconds). */
let lastSeekPosition = 0;
const listeners = new Set<() => void>();
const API_PREVIEW_DURATION_MS = 30_000;

/** Stored Tauri event unlisten functions — called on HMR dispose to prevent duplicate listeners. */
const tauriUnlisteners: Array<() => void> = [];
/** Timer ID for the deferred media-position update after a seek. */
let seekPositionTimer: ReturnType<typeof setTimeout> | null = null;

/* ── Crossfade state ─────────────────────────────────────────── */

/** When crossfade fade-in is active, this is the rAF id. */
let fadeInRafId: number | null = null;
/** True while a crossfade is in progress (prevents volume conflicts). */
let crossfading = false;
/** Overlap length of the current automatic crossfade, ms. */
let handoffMs = 0;
/** Set when we jump to the next track before the current one ends (overlap crossfade):
 *  the old track's own `audio:ended` must not advance the queue a second time. */
let handoffPending = false;
/** Set by armHandoff: the next loadTrack must not stop the playing track (Rust fades it out). */
let handoffArmed = false;

/* ── Seek while streaming ─────────────────────────────────────── */
/** The current track plays from a file that is still downloading. */
let streamingPartial = false;
/** Download progress of the current track, 0..1. */
let streamProgress = 0;
/** A seek past the downloaded part waits here until the bytes arrive. */
let pendingSeek: number | null = null;
/** Audio was paused while waiting for a pending seek; play again after it. */
let resumeAfterPendingSeek = false;
/** The stream decoder refused a seek: wait for the complete file for the next ones. */
let seekNeedsFullFile = false;

/* ── Track analysis (silence at the edges, ending fade-out) ───── */
interface TrackAnalysis {
  durationSecs: number;
  musicStartSecs: number;
  musicEndSecs: number;
  fadeOutStartSecs: number;
  bodyDb: number;
}
/** Analysis of the playing track; null until known. */
let currentAnalysis: TrackAnalysis | null = null;
/** Disliked tracks skipped in a row (see the player subscription). */
let dislikedSkips = 0;
/** The upcoming track's analysis was already requested for this current track. */
let upcomingAnalyzedFor: string | null = null;

async function analyzeTrack(urn: string, path: string, cachedOnly: boolean) {
  try {
    return await invoke<TrackAnalysis | null>('audio_analyze_track', {
      path,
      cacheKey: urn,
      cachedOnly,
    });
  } catch {
    return null;
  }
}

/** Uses a cached analysis right away, otherwise computes it in the background. */
async function loadAnalysis(urn: string, path: string, gen: number) {
  const quick = await analyzeTrack(urn, path, true);
  if (quick) {
    currentAnalysis = quick;
    return;
  }
  void analyzeTrack(urn, path, false).then((a) => {
    if (a && gen === loadGen && currentUrn === urn) currentAnalysis = a;
  });
}

const CURVE_ID: Record<CrossfadeCurve, number> = { equal: 0, linear: 1, scurve: 2 };

/** Fade-in shape for t in 0..1, mirroring Rust's fade-out of the previous track. */
export function fadeInGain(t: number, curve: CrossfadeCurve): number {
  const x = Math.min(1, Math.max(0, t));
  if (curve === 'linear') return x;
  if (curve === 'scurve') return 0.5 * (1 - Math.cos(Math.PI * x));
  return Math.sin((x * Math.PI) / 2);
}

/** Arms Rust to keep the current track playing and fade it out once the next one starts. */
function armHandoff(ms: number) {
  const curve = useSettingsStore.getState().crossfadeCurve;
  handoffArmed = true;
  handoffPending = true;
  invoke('audio_set_handoff_fade', { ms: Math.round(ms), curve: CURVE_ID[curve] }).catch(() => {});
  // Safety net: if the next track never loads (end of queue, error), stop the old one.
  setTimeout(() => {
    if (handoffPending && !hasTrack) invoke('audio_stop').catch(() => {});
    handoffPending = false;
  }, ms + 20000);
}

function sameAlbum(a: Track | undefined | null, b: Track | undefined | null) {
  const album = (t: Track | undefined | null) =>
    t?.enrichment?.album?.title ?? t?.publisher_metadata?.album_title ?? '';
  const x = album(a);
  return !!x && x === album(b) && a?.user?.urn === b?.user?.urn;
}

function applyVolume(targetVolume: number) {
  invoke('audio_set_volume', { volume: targetVolume }).catch(() => {});
}

/** Animate volume from `from` → `to` over `durationMs` ms, then call `onDone`. */
function animateVolume(
  from: number,
  to: number,
  durationMs: number,
  onDone?: () => void,
  shape: (t: number) => number = (t) => t,
) {
  const startMs = performance.now();
  const diff = to - from;

  if (fadeInRafId !== null) {
    cancelAnimationFrame(fadeInRafId);
    fadeInRafId = null;
  }

  const step = () => {
    const elapsed = performance.now() - startMs;
    const t = Math.min(1, elapsed / durationMs);
    applyVolume(from + diff * shape(t));
    if (t < 1) {
      fadeInRafId = requestAnimationFrame(step);
    } else {
      fadeInRafId = null;
      onDone?.();
    }
  };
  fadeInRafId = requestAnimationFrame(step);
}

function notify() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns the current playback position in seconds, interpolated between
 *  Rust tick events so the value is smooth at any frame rate and correct
 *  at any playback speed. */
export function getCurrentTime(): number {
  const elapsedMs = performance.now() - cachedTimeWallMs;
  return cachedTime + (elapsedMs / 1000) * cachedPlaybackRate;
}

export function getDuration(): number {
  return cachedDuration;
}

/** Returns current position floored to whole seconds.
 *  Use this as a `useSyncExternalStore` snapshot instead of
 *  `() => Math.floor(getCurrentTime())` — that inline function uses
 *  `performance.now()` and can return different values on consecutive
 *  React calls within the same render, causing an infinite loop. */
export function getAudioSecond(): number {
  return Math.floor(cachedTime);
}

/** Can the decoder reach `pos` right now? While streaming, only the downloaded part is safe:
 *  seeking further would block the audio thread waiting for bytes. */
function canSeekTo(pos: number) {
  if (!streamingPartial) return true;
  if (seekNeedsFullFile || cachedDuration <= 0) return false;
  return pos / cachedDuration <= streamProgress - 0.03;
}

/** Waits with a seek until the stream has the bytes for it (see `canSeekTo`). */
function holdSeek(clamped: number) {
  // Not downloaded yet: show the target and wait for the bytes instead of hanging.
  // Hold the audio meanwhile — otherwise it keeps playing the old spot while the UI
  // (lyrics, progress) already shows the new one, and they drift apart.
  if (pendingSeek == null && usePlayerStore.getState().isPlaying) {
    resumeAfterPendingSeek = true;
    invoke('audio_pause').catch(() => {});
  }
  pendingSeek = clamped;
  cachedTime = clamped;
  cachedTimeWallMs = performance.now();
  seekGuardUntilMs = performance.now() + 60_000;
  lastSeekPosition = clamped;
  usePlayerStore.setState({ isBuffering: true });
  notify();
}

export function seek(seconds: number) {
  if (!hasTrack) return;

  // Clamp: never seek past the end — rodio fires audio:ended immediately if position ≥ duration,
  // which would spuriously advance to the next track.
  const clamped = Math.max(
    0,
    cachedDuration > 0.2 ? Math.min(seconds, cachedDuration - 0.15) : seconds,
  );

  if (!canSeekTo(clamped)) {
    holdSeek(clamped);
    return;
  }
  pendingSeek = null;
  const resume = resumeAfterPendingSeek;
  resumeAfterPendingSeek = false;

  // Reset any in-progress crossfade so volume is restored after manual seek.
  if (crossfading || fadeInRafId !== null) {
    crossfading = false;
    if (fadeInRafId !== null) {
      cancelAnimationFrame(fadeInRafId);
      fadeInRafId = null;
    }
    applyVolume(usePlayerStore.getState().volume);
  }

  // Guard: ignore audio:ended for 800ms after seek — Rodio can emit ended mid-seek.
  // Extended guard: store seek position so audio:ended listener can reject events
  // that fire too early relative to the expected remaining playtime.
  seekGuardUntilMs = performance.now() + 800;
  lastSeekWallMs = performance.now();
  lastSeekPosition = clamped;

  invoke('audio_seek', { position: clamped })
    .catch((e) => {
      // Still streaming and the decoder can't jump there yet: wait for the download
      // instead of leaving the UI on the new spot while the audio stays on the old one.
      if (streamingPartial) {
        seekNeedsFullFile = true;
        holdSeek(clamped);
      } else console.error(e);
    })
    .finally(() => {
      usePlayerStore.setState({ isBuffering: false });
      if (resume && usePlayerStore.getState().isPlaying) invoke('audio_play').catch(() => {});
    });
  cachedTime = clamped;
  cachedTimeWallMs = performance.now();
  notify();
  // Debounce the media-position update so rapid scrubbing doesn't queue many IPC calls.
  if (seekPositionTimer !== null) clearTimeout(seekPositionTimer);
  seekPositionTimer = setTimeout(() => {
    seekPositionTimer = null;
    updateMediaPosition();
  }, 150);
}

export function handlePrev() {
  if (getCurrentTime() > 3) {
    seek(0);
  } else {
    usePlayerStore.getState().prev();
  }
}

/* ── Native audio control ────────────────────────────────────── */

function stopTrack() {
  invoke('audio_stop').catch(console.error);
  hasTrack = false;
  cachedTime = 0;
}

export async function switchAudioDevice(deviceName: string | null, manual = false) {
  if (manual) {
    await invoke('audio_set_follow_default_output', { follow: deviceName == null });
  }

  await invoke('audio_switch_device', { deviceName });
}

/** Reload the current track on new audio device, preserving position */
export async function reloadCurrentTrack() {
  const track = usePlayerStore.getState().currentTrack;
  if (!track) return;
  const wasPlaying = usePlayerStore.getState().isPlaying;
  const pos = cachedTime;
  await loadTrack(track);
  if (pos > 0) seek(pos);
  if (!wasPlaying) invoke('audio_pause').catch(console.error);
}

function getLoadErrorText(error: unknown): string | null {
  let message: string | null = null;

  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object' && error) {
    if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    } else if ('error' in error && typeof error.error === 'string') {
      message = error.error;
    }
  }

  if (!message) {
    const fallback = String(error).trim();
    if (fallback && fallback !== '[object Object]') {
      message = fallback;
    }
  }

  if (!message) return null;

  const normalized = message
    .trim()
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Command [^:]+ failed:\s*/i, '');

  const unquoted =
    normalized.startsWith('"') && normalized.endsWith('"')
      ? normalized.slice(1, -1).trim()
      : normalized;

  const sanitized = unquoted
    .replace(/\bhttps?:\/\/[^\s"')\]]+/gi, '')
    .replace(/\bscproxy:\/\/[^\s"')\]]+/gi, '')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~-]+/gi, '$1 [redacted]')
    .replace(
      /\b(oauth_token|token|sig|signature|client_id|x-session-id)=([^&\s]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\s+\bfrom\b\s*(?=$|[):;,.])/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([):;,.])/g, '$1')
    .trim();

  return sanitized || null;
}

type TrackMetadataPatch = Partial<Track> & {
  full_duration?: number;
};

function getResolvedDurationMs(track: {
  duration?: number;
  full_duration?: number;
}): number | null {
  if (typeof track.full_duration === 'number' && track.full_duration > 0) {
    return track.full_duration;
  }
  if (typeof track.duration === 'number' && track.duration > 0) {
    return track.duration;
  }
  return null;
}

function getPreviewResolveUrl(track: Pick<Track, 'duration' | 'permalink_url'>): string | null {
  if (track.duration !== API_PREVIEW_DURATION_MS || !track.permalink_url) {
    return null;
  }

  try {
    const url = new URL(track.permalink_url);
    return url.hostname.endsWith('soundcloud.com') ? url.toString() : null;
  } catch {
    return null;
  }
}

function mergeTrackMetadata(base: Track, patch: TrackMetadataPatch): Track {
  const resolvedDuration = getResolvedDurationMs(patch);

  return {
    ...base,
    ...patch,
    duration:
      resolvedDuration == null ||
      (resolvedDuration === API_PREVIEW_DURATION_MS && base.duration > API_PREVIEW_DURATION_MS)
        ? base.duration
        : resolvedDuration,
    permalink_url: patch.permalink_url ?? base.permalink_url,
    user: patch.user ? { ...base.user, ...patch.user } : base.user,
  };
}

function commitTrackMetadata(track: Track) {
  usePlayerStore.getState().replaceTrackMetadata(track);
  void rememberTracks([track]);

  if (useSettingsStore.getState().cacheListenedTracks) {
    void rememberRecentlyPlayed(track);
    // Warm the permanent image cache by requesting the artwork URL via the proxy
    const artworkUrl = track.artwork_url ?? track.user?.avatar_url;
    if (artworkUrl) {
      const cached = proxiedAssetUrl(art(artworkUrl));
      if (cached) {
        const img = new Image();
        img.src = cached;
      }
    }
  }

  if (currentUrn !== track.urn) return;

  if (track.duration <= 0) {
    updateMetadata(track);
    return;
  }

  const durationSecs = track.duration / 1000;
  fallbackDuration = durationSecs;
  cachedDuration = durationSecs;
  updateMetadata(track, durationSecs);
  notify();
}

async function fetchFreshTrackMetadata(track: Track): Promise<Track> {
  try {
    const freshTrack = await api<Track>(`/tracks/${encodeURIComponent(track.urn)}`, {
      silent: true,
    });
    return mergeTrackMetadata(track, freshTrack);
  } catch (error) {
    console.warn('[Audio] Failed to hydrate track metadata:', error);
    return track;
  }
}

async function resolveTrackMetadata(track: Track): Promise<Track> {
  const resolveUrl = getPreviewResolveUrl(track);
  if (!resolveUrl) return track;

  try {
    const resolvedTrack = await resolveTrackFromStreaming(resolveUrl);
    return mergeTrackMetadata(track, resolvedTrack);
  } catch (error) {
    console.warn('[Audio] Failed to resolve preview duration:', error);
    return track;
  }
}

async function loadTrack(track: Track) {
  const gen = ++loadGen;
  if (handoffArmed) {
    // Overlapping crossfade: the old track keeps playing until the new one starts,
    // then Rust fades it out. Just forget it on our side.
    handoffArmed = false;
    hasTrack = false;
    cachedTime = 0;
  } else {
    stopTrack();
  }
  streamingPartial = false;
  streamProgress = 0;
  pendingSeek = null;
  resumeAfterPendingSeek = false;
  seekNeedsFullFile = false;
  currentAnalysis = null;
  upcomingAnalyzedFor = null;
  currentUrn = track.urn;
  const urn = track.urn;

  // Reset seek guards on new track load
  seekGuardUntilMs = 0;
  lastSeekWallMs = 0;
  lastSeekPosition = 0;

  void hydrateTrackMetadata(track, gen);

  fallbackDuration = track.duration / 1000;
  cachedDuration = fallbackDuration;
  cachedTime = 0;
  usePlayerStore.setState({ downloadProgress: null, isBuffering: true });
  usePlayerStore.getState().setPlaybackTransport(null, null);
  notify();

  // Sync EQ state to Rust
  const { eqEnabled, eqGains, normalizeVolume } = useSettingsStore.getState();
  invoke('audio_set_eq', { enabled: eqEnabled, gains: eqGains }).catch(console.error);
  invoke('audio_set_normalization', { enabled: normalizeVolume }).catch(console.error);

  // Sync volume + playback rate (pitch is folded into the speed value sent to Rust)
  // If a crossfade is in progress, start the new track silent so the fade-in can
  // ramp up from 0 — otherwise loadTrack would reset the faded-out volume back to
  // user volume and the first audio buffer would play at full level.
  const _cfDuration = useSettingsStore.getState().crossfadeDuration;
  const startVolume = crossfading && _cfDuration > 0 ? 0 : usePlayerStore.getState().volume;
  invoke('audio_set_volume', { volume: startVolume }).catch(console.error);
  const initialRate = getEffectivePlaybackRate();
  cachedPlaybackRate = initialRate;
  cachedTime = 0;
  cachedTimeWallMs = performance.now();
  invoke('audio_set_playback_rate', { rate: initialRate }).catch(console.error);

  try {
    const highQualityStreaming = useSettingsStore.getState().highQualityStreaming;

    // Strategy 1: Cache hit — instant (evict and re-download if decode fails)
    const cached = await getCacheInfo(urn);
    if (cached?.path) {
      if (gen !== loadGen) return;
      useCachedUrnsStore.getState().markCached(urn);
      try {
        usePlayerStore.getState().setPlaybackTransport(cached.quality, cached.source);
        const loadResult = await invoke<{ duration_secs: number | null }>('audio_load_file', {
          path: cached.path,
          cacheKey: urn,
          startPaused: !usePlayerStore.getState().isPlaying,
        });
        if (gen !== loadGen) return;
        void markTrackPlayed(urn).catch(() => {});
        if (loadResult?.duration_secs) {
          fallbackDuration = loadResult.duration_secs;
          cachedDuration = loadResult.duration_secs;
          updateMetadata(track, loadResult.duration_secs);
          notify();
        }
        await loadAnalysis(urn, cached.path, gen);
        if (gen !== loadGen) return;
        afterLoad(track, gen);
        return;
      } catch (cacheLoadErr) {
        if (gen !== loadGen) return;
        console.warn('[Audio] Cached file decode failed, evicting & re-downloading:', cacheLoadErr);
        await removeCachedTrack(urn).catch(() => {});
      }
    }

    // Strategy 2: Download full track to cache — Rust picks storage/API internally
    usePlayerStore.setState({ downloadProgress: 0 });

    // Sources in the user's order (Settings → Sources). Fallback sites search by
    // artist + title; the result is cached under this URN, so likes and playlists work.
    const fromFallback = (source: string) => () =>
      invoke<TrackCacheInfo>('track_cache_from_fallback', {
        urn,
        artist: getArtistDisplay(track).primary,
        title: getDisplayTitle(track),
        durationMs: track.duration || null,
        sources: [source],
      });
    const enabled = useSettingsStore
      .getState()
      .musicSources.filter((s) => s.enabled)
      .map((s) => s.id);
    // "SoundCloud" = direct first, then our mirror right away: the mirror answers in a few
    // seconds for tracks SoundCloud won't give anonymously, while YouTube needs yt-dlp
    // (~7 s just to find the track), so it's tried only after both.
    // A track the mirror already had no stream for would spend ~8 s failing there again: try
    // the fallback sources first. (Not the track's preview/blocked flag: SoundCloud often still
    // streams those, and YouTube downloads can crawl.) SoundCloud stays last in that case.
    const scClosed = isRefusedMirror(urn);
    const order = scClosed
      ? [
          ...enabled.filter((id) => id !== 'soundcloud'),
          ...enabled.filter((id) => id === 'soundcloud'),
        ]
      : enabled;
    const steps = order.flatMap((id) =>
      id === 'soundcloud'
        ? [
            // Skip the direct attempt for tracks SoundCloud already refused recently.
            ...(isRefusedDirect(urn)
              ? []
              : [
                  () =>
                    ensureTrackCached(urn, highQualityStreaming, true).catch((e) => {
                      if (isRefusal(e)) rememberRefusedDirect(urn);
                      throw e;
                    }),
                ]),
            () =>
              ensureTrackCached(urn, highQualityStreaming).catch((e) => {
                if (isRefusal(e)) rememberRefusedMirror(urn);
                throw e;
              }),
          ]
        : [fromFallback(id)],
    );
    if (steps.length === 0) steps.push(() => ensureTrackCached(urn, highQualityStreaming, true));

    let download: Promise<TrackCacheInfo> = steps[0]();
    for (const step of steps.slice(1)) {
      download = download.catch((error) => {
        if (gen !== loadGen) throw error;
        console.warn('[Audio] Source failed, trying the next one:', error);
        return step();
      });
    }
    // Don't leave an unhandled rejection if streaming wins and the download later fails.
    download.catch(() => {});

    // Play while downloading: Rust starts from the growing cache file as soon as the first
    // ~160 KB arrive. Falls back to the full-file path when the source can't be streamed.
    // Whichever is ready first wins: the stream, or the full file (non-streamable sources).
    // If the file wins, audio_load_file bumps Rust's load generation and cancels the stream wait.
    const streamed = await Promise.race([
      invoke<{ streaming: boolean; duration_secs: number | null }>('audio_load_stream', {
        urn,
        startPaused: !usePlayerStore.getState().isPlaying,
        waitMs: 15000,
      }).catch(() => null),
      download.then(
        () => null,
        () => null,
      ),
    ]);
    if (gen !== loadGen) return;
    if (streamed?.streaming) {
      usePlayerStore.setState({ downloadProgress: null });
      streamingPartial = true;
      const finishStream = () => {
        if (gen !== loadGen) return;
        streamingPartial = false;
        if (pendingSeek != null) seek(pendingSeek);
      };
      download.then(finishStream, finishStream);
      download
        .then((info) => {
          if (gen === loadGen && info?.path) void loadAnalysis(urn, info.path, gen);
        })
        .catch(() => {});
      if (streamed.duration_secs) {
        fallbackDuration = streamed.duration_secs;
        cachedDuration = streamed.duration_secs;
        updateMetadata(track, streamed.duration_secs);
        notify();
      }
      download
        .then((info) => {
          if (gen === loadGen) {
            usePlayerStore.getState().setPlaybackTransport(info.quality, info.source);
          }
          void enforceAudioCacheLimit().catch(console.error);
        })
        .catch((e) => console.warn('[Audio] Background download failed after stream start:', e));
      afterLoad(track, gen);
      return;
    }

    const cachedInfo = await download;
    if (gen !== loadGen) return;
    usePlayerStore.setState({ downloadProgress: null });
    usePlayerStore.getState().setPlaybackTransport(cachedInfo.quality, cachedInfo.source);

    let loadResult: { duration_secs: number | null };
    try {
      loadResult = await invoke<{ duration_secs: number | null }>('audio_load_file', {
        path: cachedInfo.path,
        cacheKey: urn,
        startPaused: !usePlayerStore.getState().isPlaying,
      });
    } catch (decodeErr) {
      await removeCachedTrack(urn).catch(() => {});
      throw decodeErr;
    }
    if (loadResult?.duration_secs) {
      fallbackDuration = loadResult.duration_secs;
      cachedDuration = loadResult.duration_secs;
      updateMetadata(track, loadResult.duration_secs);
      notify();
    }
    void enforceAudioCacheLimit().catch(console.error);

    if (gen !== loadGen) return;
    await loadAnalysis(urn, cachedInfo.path, gen);
    if (gen !== loadGen) return;
    afterLoad(track, gen);
  } catch (e) {
    console.error('[Audio] Load failed:', e);
    usePlayerStore.setState({ downloadProgress: null });
    usePlayerStore.getState().setPlaybackTransport(null, null);
    if (gen !== loadGen) return;
    const errorText = getLoadErrorText(e);
    toast.error(i18n.t('track.loadError'), {
      description: errorText ? `${track.title}: ${errorText}` : track.title,
    });
    // Skip unavailable tracks instead of stopping the music.
    const { queue, queueIndex, repeat, next, pause } = usePlayerStore.getState();
    if (queueIndex < queue.length - 1 || repeat === 'all') next();
    else pause();
  } finally {
    if (gen === loadGen) {
      usePlayerStore.getState().setBuffering(false);
    }
  }
}

function afterLoad(track: Track, gen: number) {
  if (gen !== loadGen) {
    invoke('audio_stop').catch(console.error);
    return;
  }
  hasTrack = true;

  const historyTrack =
    usePlayerStore.getState().currentTrack?.urn === track.urn
      ? usePlayerStore.getState().currentTrack
      : track;

  // Record to listening history (fire-and-forget), skip on repeat-one (same track looping)
  if (historyTrack?.urn && historyTrack.title && usePlayerStore.getState().repeat !== 'one') {
    api('/history', {
      method: 'POST',
      silent: true,
      body: JSON.stringify({
        scTrackId: historyTrack.urn,
        title: historyTrack.title,
        // Same artist the player shows, not the uploader's handle (re-uploaders use names like 42CF80).
        artistName: getArtistDisplay(historyTrack).primary || historyTrack.user?.username || '',
        artistUrn: historyTrack.user?.urn || null,
        artworkUrl: historyTrack.artwork_url || null,
        duration: historyTrack.duration || 0,
      }),
    }).catch(() => {});
  }

  const isPlaying = usePlayerStore.getState().isPlaying;

  // ── Crossfade fade-in ───────────────────────────────────────
  // applyVolume(0) MUST be called before audio_play, otherwise the first
  // audio buffer fires at user volume before the IPC set-volume arrives.
  const crossfadeSecs = useSettingsStore.getState().crossfadeDuration;
  handoffPending = false;
  if (crossfading && crossfadeSecs > 0 && isPlaying) {
    const userVolume = usePlayerStore.getState().volume;
    const curve = useSettingsStore.getState().crossfadeCurve;
    applyVolume(0);
    invoke('audio_play').catch(console.error);
    animateVolume(
      0,
      userVolume,
      handoffMs || crossfadeSecs * 1000,
      () => {
        crossfading = false;
        // Restore exact user volume in case float drift occurred
        applyVolume(usePlayerStore.getState().volume);
      },
      (t) => fadeInGain(t, curve),
    );
  } else {
    crossfading = false;
    invoke(isPlaying ? 'audio_play' : 'audio_pause').catch(console.error);
  }
  updatePlaybackState(isPlaying);
  updateMediaPosition();
  preloadQueue();
}

async function hydrateTrackMetadata(track: Track, gen: number) {
  let nextTrack = await fetchFreshTrackMetadata(track);
  if (gen !== loadGen || currentUrn !== track.urn) return;

  nextTrack = await resolveTrackMetadata(nextTrack);
  if (gen !== loadGen || currentUrn !== track.urn) return;
  commitTrackMetadata(nextTrack);
}

function handleTrackEnd() {
  const state = usePlayerStore.getState();
  if (state.repeat === 'one') {
    // rodio sink is empty after track ends — must reload
    if (state.currentTrack) void loadTrack(state.currentTrack);
  } else {
    const { queue, queueIndex } = state;
    const isLast = queueIndex >= queue.length - 1;
    if (isLast && state.repeat === 'off' && queue.length > 0) {
      void autoplayRelated(queue[queueIndex]);
    } else {
      // Clear currentUrn so subscriber detects change even if next track has same URN
      currentUrn = null;
      usePlayerStore.getState().next();
    }
  }
}

/* ── Tauri event listeners ───────────────────────────────────── */

/** Register a Tauri event listener and store its unlisten function for cleanup. */
function tauriListen<T>(event: string, handler: (e: { payload: T }) => void): void {
  listen<T>(event, handler)
    .then((unlisten) => tauriUnlisteners.push(unlisten))
    .catch(console.error);
}

tauriListen<number>('audio:tick', (event) => {
  // During an overlapping crossfade the ticks still come from the outgoing track.
  if (handoffPending && !hasTrack) return;
  // Right after a seek Rust can still emit ticks with the old position; taking them
  // would snap the progress bar and lyrics back before they catch up again.
  if (performance.now() < seekGuardUntilMs && Math.abs(event.payload - lastSeekPosition) > 1) {
    return;
  }
  cachedTime = event.payload;
  cachedTimeWallMs = performance.now();
  if (cachedDuration <= 0) cachedDuration = fallbackDuration;
  notify();

  // ── Crossfade: start the next track while this one is still playing ──
  // Rust keeps the old track on the mixer and fades it out; the new one fades in.
  const { crossfadeDuration: crossfadeSecs, crossfadeKeepAlbums } = useSettingsStore.getState();
  const player = usePlayerStore.getState();
  if (
    crossfadeSecs > 0 &&
    !crossfading &&
    !handoffPending &&
    player.isPlaying &&
    player.repeat !== 'one' &&
    cachedDuration > crossfadeSecs * 2
  ) {
    const remaining = cachedDuration - cachedTime;
    const nextTrack = player.queue[player.queueIndex + 1];
    const keepGapless = crossfadeKeepAlbums && sameAlbum(player.currentTrack, nextTrack);
    // The track fades out by itself: start the transition together with that fade
    // (if it's not much longer than the chosen length), not N seconds before the end.
    const a = currentAnalysis;
    const naturalFade = a ? a.musicEndSecs - a.fadeOutStartSecs : 0;
    const followFade =
      !!a &&
      naturalFade >= crossfadeSecs &&
      naturalFade <= crossfadeSecs * 2.5 &&
      cachedTime >= a.fadeOutStartSecs;
    if (remaining > 0.3 && (remaining <= crossfadeSecs || followFade) && !keepGapless) {
      crossfading = true;
      handoffMs = remaining * 1000;
      armHandoff(handoffMs);
      recordFullPlay();
      handleTrackEnd();
    }
  }

  // Analyse the next track ahead of time, so its natural fade-out is known when it plays.
  if (currentUrn && upcomingAnalyzedFor !== currentUrn && cachedDuration - cachedTime < 45) {
    upcomingAnalyzedFor = currentUrn;
    const next = player.queue[player.queueIndex + 1];
    if (next?.urn) {
      void getCacheInfo(next.urn).then((info) => {
        if (info?.path) void analyzeTrack(next.urn, info.path, false);
      });
    }
  }
});

tauriListen<{ urn: string; progress: number }>('track:download-progress', (event) => {
  const { urn, progress } = event.payload;
  if (urn === currentUrn) {
    usePlayerStore.setState({ downloadProgress: progress });
    streamProgress = Math.max(streamProgress, progress);
    if (pendingSeek != null && canSeekTo(pendingSeek)) seek(pendingSeek);
  }
});

/** An `ended` that came during the seek guard may be real (seek right to the end):
 *  check again once the guard is over instead of dropping it and stalling. */
let endedRecheck: ReturnType<typeof setTimeout> | null = null;
function recheckEndedLater() {
  const urn = currentUrn;
  if (endedRecheck) clearTimeout(endedRecheck);
  endedRecheck = setTimeout(() => {
    endedRecheck = null;
    if (!urn || currentUrn !== urn || !hasTrack || handoffPending) return;
    if (cachedDuration > 0 && cachedDuration - cachedTime < 1.5) {
      recordFullPlay();
      hasTrack = false;
      handleTrackEnd();
    }
  }, 1300);
}

tauriListen<void>('audio:ended', () => {
  // The queue already moved on for an overlapping crossfade.
  if (handoffPending) return;
  // Suppress spurious ended events fired by Rodio during/immediately after a seek
  if (performance.now() < seekGuardUntilMs) {
    recheckEndedLater();
    return;
  }

  // Extended seek guard: block audio:ended if it fires significantly earlier than
  // the expected remaining playtime. E.g. seeking to 5s before end → guard 4s.
  // This catches Rodio emitting ended 1-2s after seek instead of waiting.
  if (lastSeekWallMs > 0 && cachedDuration > 0) {
    const expectedRemainingMs = (cachedDuration - lastSeekPosition) * 1000;
    const elapsedSinceSeekMs = performance.now() - lastSeekWallMs;
    // If ended fires >1.5s before the expected end, it's a spurious Rodio event
    if (elapsedSinceSeekMs < expectedRemainingMs - 1500) {
      recheckEndedLater();
      return;
    }
  }

  recordFullPlay();
  hasTrack = false;
  handleTrackEnd();
});

function recordFullPlay() {
  if (!currentUrn) return;
  // Засчитываем full_play только если трек реально игрался: либо ≥30s,
  // либо проиграно ≥50% длительности (для коротких треков). Иначе это
  // зависшая загрузка / зеро-длительность баг — не отправляем.
  const playedEnough =
    cachedTime >= SKIP_THRESHOLD_SEC ||
    (cachedDuration > 0 && cachedTime >= cachedDuration * FULL_PLAY_RATIO);
  if (playedEnough) {
    const positionPct = cachedDuration > 0 ? Math.min(1, cachedTime / cachedDuration) : undefined;
    recordEvent('full_play', currentUrn, positionPct);
    const cur = usePlayerStore.getState().currentTrack;
    if (cur?.urn === currentUrn) useWaveTasteStore.getState().finished(cur);
    const cluster = getUrnCluster(currentUrn);
    if (cluster) recordClusterFeedback(cluster, 'complete');
  }
  lastEndedUrn = currentUrn;
}

/* ── Store subscriber ────────────────────────────────────────── */

usePlayerStore.subscribe((state, prev) => {
  const nextUrn = state.currentTrack?.urn ?? null;
  const trackChanged = nextUrn !== currentUrn;
  const playToggled = state.isPlaying !== prev.isPlaying;

  if (trackChanged) {
    const previousUrn = currentUrn;
    const previousTime = cachedTime;
    const previousHadTrack = hasTrack;

    if (
      previousUrn &&
      previousHadTrack &&
      previousTime < SKIP_THRESHOLD_SEC &&
      previousUrn !== lastEndedUrn
    ) {
      const previousDuration = cachedDuration > 0 ? cachedDuration : fallbackDuration;
      const positionPct = previousDuration > 0 ? previousTime / previousDuration : undefined;
      recordEvent('skip', previousUrn, positionPct);
      if (prev.currentTrack?.urn === previousUrn) {
        useWaveTasteStore.getState().skipped(prev.currentTrack, previousTime);
      }
    }
    lastEndedUrn = null;

    if (state.currentTrack) {
      // Disliked tracks are skipped without loading, but only when the queue moves on by itself
      // (same queue, next index). A disliked track you pick yourself (from Dislikes, a list or
      // the queue) plays: skipping it turned every pick into a chain of skips and froze the UI.
      // The skip runs on the next tick, not inside this listener (it used to recurse until the
      // stack overflowed), and a full lap of skips stops playback.
      const advanced =
        state.queue === prev.queue &&
        (state.queueIndex === prev.queueIndex + 1 ||
          (state.queueIndex === 0 && prev.queueIndex === state.queue.length - 1));
      if (advanced && isUrnDisliked(state.currentTrack.urn)) {
        currentUrn = null;
        fallbackDuration = 0;
        cachedDuration = 0;
        cachedTime = 0;
        hasTrack = false;
        usePlayerStore.getState().setPlaybackTransport(null, null);
        notify();
        dislikedSkips += 1;
        const { queue } = usePlayerStore.getState();
        if (dislikedSkips > Math.max(1, queue.length)) {
          dislikedSkips = 0;
          usePlayerStore.getState().pause();
        } else {
          setTimeout(() => usePlayerStore.getState().next(), 0);
        }
        return;
      }
      dislikedSkips = 0;
      // Manual skip while playing: let the previous track fade out quickly instead of cutting.
      if (
        !crossfading &&
        previousHadTrack &&
        prev.isPlaying &&
        useSettingsStore.getState().crossfadeOnSkip
      ) {
        armHandoff(700);
      }
      updateMetadata(state.currentTrack);
      void loadTrack(state.currentTrack);
    } else {
      stopTrack();
      currentUrn = null;
      fallbackDuration = 0;
      cachedDuration = 0;
      usePlayerStore.getState().setPlaybackTransport(null, null);
      notify();
    }
    return;
  }

  if (playToggled && !trackChanged) {
    if (state.isPlaying) {
      if (!hasTrack && state.currentTrack) {
        void loadTrack(state.currentTrack);
      } else {
        invoke('audio_play').catch(console.error);
      }
    } else {
      invoke('audio_pause').catch(console.error);
    }
    updatePlaybackState(state.isPlaying);
  }

  if (state.volume !== prev.volume) {
    invoke('audio_set_volume', { volume: state.volume }).catch(console.error);
  }

  if (
    state.playbackRate !== prev.playbackRate ||
    state.pitchSemitones !== prev.pitchSemitones ||
    state.pitchControlMode !== prev.pitchControlMode
  ) {
    const rate = getEffectivePlaybackRate();
    cachedTime = getCurrentTime(); // capture interpolated position before rate changes
    cachedTimeWallMs = performance.now();
    cachedPlaybackRate = rate;
    invoke('audio_set_playback_rate', { rate }).catch(console.error);
  }
});

/** Combine playback rate and (manual) pitch into a single Rust-side speed value.
 *  Rust uses rodio's `set_speed` which couples tempo+pitch — so manual pitch is
 *  applied as a multiplier on top of the user's rate.
 */
function getEffectivePlaybackRate(): number {
  const { playbackRate, pitchControlMode, pitchSemitones } = usePlayerStore.getState();
  if (pitchControlMode === 'manual' && Math.abs(pitchSemitones) > 0.001) {
    return playbackRate * 2 ** (pitchSemitones / 12);
  }
  return playbackRate;
}

/* ── EQ settings subscriber ──────────────────────────────────── */

useSettingsStore.subscribe((state, prev) => {
  if (state.eqEnabled !== prev.eqEnabled || state.eqGains !== prev.eqGains) {
    invoke('audio_set_eq', { enabled: state.eqEnabled, gains: state.eqGains }).catch(console.error);
  }

  if (state.normalizeVolume !== prev.normalizeVolume) {
    invoke('audio_set_normalization', { enabled: state.normalizeVolume }).catch(console.error);
    if (usePlayerStore.getState().currentTrack) {
      void reloadCurrentTrack();
    }
  }
});

/* ── Native Media Controls (souvlaki: MPRIS/SMTC) ───────────── */

function updateMetadata(track: Track, durationSecs?: number) {
  const coverUrl = art(track.artwork_url, 't500x500') || undefined;
  const display = getArtistDisplay(track);
  const title = getDisplayTitle(track);
  invoke('audio_set_metadata', {
    title,
    artist: display.primary,
    coverUrl: coverUrl || null,
    durationSecs: durationSecs ?? track.duration / 1000,
  }).catch(console.error);
}

function updatePlaybackState(playing: boolean) {
  invoke('audio_set_playback_state', { playing }).catch(console.error);
}

function updateMediaPosition() {
  const pos = getCurrentTime();
  if (pos > 0) {
    invoke('audio_set_media_position', { position: pos }).catch(console.error);
  }
}

// Listen for media control events from souvlaki (MPRIS/SMTC)
tauriListen<void>('media:play', () => usePlayerStore.getState().resume());
tauriListen<void>('media:pause', () => usePlayerStore.getState().pause());
tauriListen<void>('media:toggle', () => usePlayerStore.getState().togglePlay());
tauriListen<void>('media:next', () => usePlayerStore.getState().next());
tauriListen<void>('media:prev', () => handlePrev());
tauriListen<number>('media:seek', (e) => seek(e.payload));
tauriListen<number>('media:seek-relative', (e) => {
  const offset = e.payload;
  if (offset > 0) {
    seek(Math.min(getCurrentTime() + offset, getDuration()));
  } else {
    seek(Math.max(getCurrentTime() + offset, 0));
  }
});

/* ── HMR cleanup — prevents duplicate listeners on hot reload ── */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const unlisten of tauriUnlisteners) unlisten();
    tauriUnlisteners.length = 0;
    if (seekPositionTimer !== null) {
      clearTimeout(seekPositionTimer);
      seekPositionTimer = null;
    }
  });
}

/* ── Autoplay ────────────────────────────────────────────────── */

let autoplayLoading = false;

async function autoplayRelated(lastTrack: Track) {
  if (autoplayLoading) return;
  autoplayLoading = true;

  try {
    const { queue, queueIndex } = usePlayerStore.getState();
    const existingUrns = new Set(queue.map((t) => t.urn));
    const hideVariants = useSettingsStore.getState().soundwaveHideVariants;
    // Related tracks of the last one; if they're all filtered out or already played,
    // try the few before it — the music shouldn't just stop.
    const seeds = [lastTrack, ...queue.slice(Math.max(0, queueIndex - 3), queueIndex).reverse()];
    let fresh: Track[] = [];
    for (const seed of seeds) {
      const res = await api<{ collection: Track[] }>(
        `/tracks/${encodeURIComponent(seed.urn)}/related?limit=30`,
        { silent: true },
      ).catch(() => ({ collection: [] as Track[] }));
      fresh = rankWave(
        dedupeSongs(
          res.collection.filter(
            (t) => !existingUrns.has(t.urn) && (!hideVariants || !isVariant(t)),
          ),
        ),
        useWaveTasteStore.getState(),
      );
      if (fresh.length > 0) break;
    }
    if (fresh.length === 0) {
      usePlayerStore.getState().pause();
      return;
    }

    usePlayerStore.getState().addToQueue(fresh);
    usePlayerStore.getState().next();
  } catch (e) {
    console.error('Autoplay related failed:', e);
    usePlayerStore.getState().pause();
  } finally {
    autoplayLoading = false;
  }
}

/* ── Preloading ──────────────────────────────────────────────── */

let preloadTimer: ReturnType<typeof setTimeout> | null = null;
/** Hover this long before a track is fetched: sweeping the mouse over a list fetches nothing. */
const HOVER_INTENT_MS = 400;

/** Starts fetching a hovered track so a click plays at once; `cancelPreload` on mouse leave. */
export function preloadTrack(urn: string) {
  if (!urn || urn === currentUrn) return;
  if (preloadTimer) clearTimeout(preloadTimer);
  preloadTimer = setTimeout(() => {
    preloadTimer = null;
    if (urn === currentUrn) return;
    const sessionId = getSessionId();
    invoke('track_preload', {
      entries: [
        { urn, urls: streamFallbackUrls(urn), storageUrls: buildStorageUrls(urn), sessionId },
      ],
    }).catch(console.error);
  }, HOVER_INTENT_MS);
}

export function cancelPreload() {
  if (preloadTimer) clearTimeout(preloadTimer);
  preloadTimer = null;
}

export function preloadQueue() {
  const { queue, queueIndex } = usePlayerStore.getState();
  const entries: Array<{
    urn: string;
    urls: string[];
    storageUrls: string[];
    sessionId: string | null;
  }> = [];
  const upcomingTracks: Track[] = [];
  const sessionId = getSessionId();

  for (let i = 1; i <= 2; i++) {
    const idx = queueIndex + i;
    if (idx < queue.length) {
      const track = queue[idx];
      if (!track?.urn || track.urn === currentUrn) continue;
      entries.push({
        urn: track.urn,
        urls: streamFallbackUrls(track.urn),
        storageUrls: buildStorageUrls(track.urn),
        sessionId,
      });
      upcomingTracks.push(track);
    }
  }

  if (entries.length > 0) {
    invoke('track_preload', { entries })
      .then(() => {
        // Refresh reactive cache badge set after preloading upcoming queue entries.
        void import('./cache')
          .then(({ listCachedUrns }) => listCachedUrns())
          .then((list) => useCachedUrnsStore.getState().markManyCached(list))
          .catch(() => {});
      })
      .catch(console.error);
    // Fetch lyrics for upcoming tracks in background (low concurrency — audio has priority)
    void import('./lyrics-fetch').then(({ cacheLyricsForTracks }) =>
      cacheLyricsForTracks(upcomingTracks, 2),
    );
  }
}

usePlayerStore.subscribe((state, prev) => {
  if (
    hasTrack &&
    state.currentTrack?.urn === prev.currentTrack?.urn &&
    (state.queueIndex !== prev.queueIndex || state.queue !== prev.queue)
  ) {
    preloadQueue();
  }
});
