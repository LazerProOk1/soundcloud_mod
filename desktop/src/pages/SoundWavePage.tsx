/**
 * SoundWavePage — immersive full-screen SoundWave player.
 *
 * Layers: a soft background built from the artwork's dominant colours, the glass
 * stage (cover, artist, progress, transport), the wave tuning dialog (languages,
 * hide-liked, refresh) and the "Next in the wave" strip.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { ControlVolumeBtn, ProgressSlider } from '../components/layout/NowPlayingBar';
import { useClusterWave } from '../components/music/cluster';
import { LikeButton } from '../components/music/LikeButton';
import { LiveSpectrumCanvas } from '../components/music/LiveSpectrumCanvas';
import { useInfiniteWave } from '../components/music/soundwave/use-infinite-wave';
import { VibeTuner } from '../components/music/soundwave/vibe-tuner';
import { WaveStage } from '../components/music/soundwave/wave-stage';
import { WaveTuneDialog } from '../components/music/soundwave/wave-tune-dialog';
import { rgbToCss, useArtworkColor } from '../hooks/useArtworkColor';
import { api } from '../lib/api';
import { handlePrev } from '../lib/audio';
import { toggleDislike } from '../lib/dislikes';
import { recordEvent } from '../lib/events';
import { art, dur } from '../lib/formatters';
import {
  ALL_LIKES_PAGE_SIZE,
  useLikedTracks,
  useRecommendedTracks,
  useRelatedPool,
} from '../lib/hooks';
import {
  AudioLines,
  Loader2,
  MessageCircle,
  MicVocal,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from '../lib/icons';
import { isUrnLiked } from '../lib/likes';
import { matchOnSoundCloud } from '../lib/link-import';
import {
  getArtistDisplay,
  getDisplayTitle,
  useArtistDisplay,
  useDisplayTitle,
} from '../lib/track-display';
import { matchesLanguages } from '../lib/track-language';
import { dedupeSongs, isVariant } from '../lib/track-variants';
import { mixIn, rankWave } from '../lib/wave-rank';
import { tuneWaveTracks } from '../lib/wave-vibes';
import { useAuthStore } from '../stores/auth';
import { useLyricsStore } from '../stores/lyrics';
import { type Track, usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { useWaveTasteStore } from '../stores/wave-taste';

/* ── Module-level wave session tracker ────────────────────────────
 * Persists across SoundWavePage unmount/remount (navigation away and back).
 * Tracks every URN ever queued by the wave so isWaveTrack stays correct
 * even after infinite-wave refill adds tracks not in the initial cluster.
 * Cleared when the user starts playing from a non-wave source.            */
const _waveUrns = new Set<string>();
/** Fewer plays than this reads as a no-name upload in the wave. */
const MIN_WAVE_PLAYS = 10_000;

/** A track worth putting in the wave: played enough, or liked. */
function isQuality(tr: Track): boolean {
  return isUrnLiked(tr.urn) || (tr.playback_count ?? MIN_WAVE_PLAYS) >= MIN_WAVE_PLAYS;
}

/**
 * Quality is a preference, never a reason for an empty wave: with enough good tracks only they
 * stay; otherwise the good ones lead and the rest follow.
 */
function preferQuality(list: Track[]): Track[] {
  const good = list.filter(isQuality);
  if (good.length >= Math.min(10, Math.ceil(list.length / 2))) return good;
  return [...good, ...list.filter((tr) => !isQuality(tr))];
}

const NO_TRACKS: Track[] = [];
function _registerWave(urns: string[]) {
  for (const u of urns) _waveUrns.add(u);
}

/* Listening memory, on any page: a wave track that really played for HEARD_AFTER_SECS rests
   for days (see wave-rank). Time is counted only while playing, so a paused track isn't
   "heard". Skips and finished tracks are recorded by the audio engine (lib/audio.ts). */
const HEARD_AFTER_SECS = 3;
let listening: { track: Track; ms: number; since: number | null; heard: boolean } | null = null;
let heardTimer: ReturnType<typeof setTimeout> | null = null;

function pauseClock() {
  if (heardTimer) clearTimeout(heardTimer);
  heardTimer = null;
  if (listening?.since != null) {
    listening.ms += Date.now() - listening.since;
    listening.since = null;
  }
}

function startClock() {
  const l = listening;
  if (!l || l.since != null) return;
  l.since = Date.now();
  if (l.heard) return;
  heardTimer = setTimeout(
    () => {
      if (listening !== l) return;
      l.heard = true;
      useWaveTasteStore.getState().played(l.track);
    },
    Math.max(0, HEARD_AFTER_SECS * 1000 - l.ms),
  );
}

usePlayerStore.subscribe((s, prev) => {
  const changed = s.currentTrack?.urn !== prev.currentTrack?.urn;
  if (changed || s.isPlaying !== prev.isPlaying) pauseClock();
  if (changed) {
    listening = null;
    if (s.currentTrack && _waveUrns.has(s.currentTrack.urn)) {
      listening = { track: s.currentTrack, ms: 0, since: null, heard: false };
    }
  }
  if (s.isPlaying) startClock();
});

/** Small string hash for a stable pseudo-random order. */
function hashKey(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* ── SoundWavePage ────────────────────────────────────────────────── */
export function SoundWavePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // "Start wave" pressed before the pool loaded: start it once the tracks arrive.
  const startPending = useRef(false);
  const [startQueued, setStartQueued] = useState(false);
  const selectedLanguages = useSettingsStore((s) => s.soundwaveLanguages);
  const setSelectedLanguages = useSettingsStore((s) => s.setSoundwaveLanguages);
  const hideLiked = useSettingsStore((s) => s.soundwaveHideLiked);
  const setHideLiked = useSettingsStore((s) => s.setSoundwaveHideLiked);
  const hideVariants = useSettingsStore((s) => s.soundwaveHideVariants);
  const useYtm = useSettingsStore((s) => s.soundwaveYtm);
  const setHideVariants = useSettingsStore((s) => s.setSoundwaveHideVariants);
  const waveVibe = useSettingsStore((s) => s.soundwaveVibe);
  const setWaveVibe = useSettingsStore((s) => s.setSoundwaveVibe);
  const waveMode = useSettingsStore((s) => s.soundwaveMode);
  const setWaveMode = useSettingsStore((s) => s.setSoundwaveMode);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const queue = usePlayerStore((s) => s.queue);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const openLyricsPanel = useLyricsStore((s) => s.openPanel);
  const playerNext = usePlayerStore((s) => s.next);
  const queryClient = useQueryClient();
  const [tuneOpen, setTuneOpen] = useState(false);
  const coverRef = useRef<HTMLButtonElement>(null);
  const allTracksRef = useRef<Track[]>([]);

  const [refreshSeed, setRefreshSeed] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const stableLanguages = useMemo(() => [...selectedLanguages].sort(), [selectedLanguages]);
  const langKey = stableLanguages.join(',') || 'all';

  const url = useMemo(() => {
    if (!isAuthenticated) return null;
    const qs = new URLSearchParams();
    if (stableLanguages.length > 0) qs.set('languages', stableLanguages.join(','));
    if (refreshSeed > 0) qs.set('seed', String(refreshSeed));
    return `/recommendations?${qs}`;
  }, [isAuthenticated, stableLanguages, refreshSeed]);

  const { data, isLoading, isFetching } = useClusterWave({
    queryKey: ['cluster-wave', 'sw-page', langKey, refreshSeed],
    url,
    enabled: isAuthenticated,
    staleMs: refreshSeed === 0 ? 30_000 : 0,
  });

  const rawAllTracks = useMemo(() => data?.allTracks ?? [], [data]);
  const rawClusters = useMemo(() => data?.clusters ?? [], [data]);

  /* Fallback: liked → related pool */
  const likedQuery = useLikedTracks(60);
  // Radio seeds come from the whole library, not only the latest likes.
  const allLiked = useLikedTracks(ALL_LIKES_PAGE_SIZE, true).tracks;
  const { data: relatedPool } = useRelatedPool(likedQuery.tracks);
  const localRecs = useRecommendedTracks(relatedPool, 40);

  const backendWorking = rawClusters.length > 0 || rawAllTracks.length > 0;
  // One filter for the initial pool and for tracks the infinite wave appends later.
  // Language is checked client-side: the backend mostly ignores `languages`.
  const waveFilter = useCallback(
    (tr: Track) =>
      (!hideLiked || (!tr.user_favorite && !isUrnLiked(tr.urn))) &&
      (!hideVariants || !isVariant(tr)) &&
      matchesLanguages(tr, stableLanguages),
    [hideLiked, hideVariants, stableLanguages],
  );

  /* Taste: skips, finished tracks, "Not this", "More like this" (persisted). */
  const taste = useWaveTasteStore(
    useShallow((s) => ({
      artists: s.artists,
      banned: s.banned,
      recent: s.recent,
      heard: s.heard,
      skippedSongs: s.skippedSongs,
    })),
  );
  const seeds = useWaveTasteStore((s) => s.seeds);
  // "More like this": related tracks of the latest seeds lead the wave.
  const seedKey = seeds
    .slice(0, 3)
    .map((s) => s.urn)
    .join(',');
  const { data: seedRelated = [] } = useQuery({
    queryKey: ['wave-seeds', seedKey],
    enabled: isAuthenticated && seedKey.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const lists = await Promise.all(
        seeds.slice(0, 3).map((s) => {
          const id = s.urn.split(':').pop() ?? s.urn;
          return api<{ collection?: Track[] }>(
            `/tracks/${encodeURIComponent(id)}/related?limit=20`,
            { silent: true },
          )
            .then((r) => r.collection ?? [])
            .catch(() => [] as Track[]);
        }),
      );
      return lists.flat();
    },
  });

  /* "New" like Justify: YouTube Music radio of a few of your tracks, matched on
     SoundCloud. Much closer to your taste than SoundCloud's own recommendations. */
  const ytmSeeds = useMemo(() => {
    const liked = [...allLiked]
      .map((tr) => ({ tr, k: hashKey(`${tr.urn}:ytm:${refreshSeed}`) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.tr);
    const out: Track[] = [];
    // One "More like this" pick, the rest spread over all likes: a single recent track
    // must not steer the whole wave.
    for (const tr of [...seeds.slice(0, 1), ...liked]) {
      if (out.length >= 5) break;
      if (!out.some((o) => o.urn === tr.urn)) out.push(tr);
    }
    return out;
  }, [allLiked, seeds, refreshSeed]);
  const ytmKey = ytmSeeds.map((s) => s.urn).join(',');
  const { data: ytmData = NO_TRACKS } = useQuery({
    queryKey: ['wave-ytm', ytmKey],
    enabled: isAuthenticated && useYtm && ytmSeeds.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const radios = await Promise.all(
        ytmSeeds.map((s) =>
          invoke<{ artist: string; title: string; durationMs: number | null }[]>('wave_ytm_radio', {
            query: `${getArtistDisplay(s).primary} ${getDisplayTitle(s)}`,
            durationMs: s.duration || null,
            limit: 20,
          }).catch(() => []),
        ),
      );
      // Round-robin over the radios, one song once.
      const seen = new Set<string>();
      const items: { artist: string; title: string; durationMs: number | null }[] = [];
      for (let i = 0; i < 20; i++) {
        for (const r of radios) {
          const it = r[i];
          if (!it) continue;
          const key = `${it.artist}|${it.title}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(it);
        }
      }
      const found: Track[] = [];
      let next = 0;
      const worker = async () => {
        while (next < items.length && found.length < 30) {
          const it = items[next++];
          const tr = await matchOnSoundCloud(it);
          if (tr) found.push(tr);
        }
      };
      // Search is slow (seconds per query): 6 in parallel, stop at 30 hits.
      await Promise.all(Array.from({ length: 6 }, worker));
      return found;
    },
  });
  // Off: ignore radio picks still in the query cache too.
  const ytmTracks = useYtm ? ytmData : NO_TRACKS;

  const allTracks = useMemo(() => {
    const base = backendWorking ? rawAllTracks : localRecs;
    // Taste-driven picks lead: "more like this", then YouTube Music radio (two of them
    // for every one server recommendation).
    let pool = [...seedRelated, ...mixIn(ytmTracks, base, 2)].filter(waveFilter);
    // "Familiar" character: liked tracks woven into the stream (one after every two new ones).
    if (!hideLiked && waveMode === 'similar') {
      const liked = [...likedQuery.tracks]
        // Stable shuffle (changes only with "Update wave"), so the queue doesn't jump around.
        .map((tr) => ({ tr, k: hashKey(`${tr.urn}:${refreshSeed}`) }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.tr)
        .slice(0, 40);
      pool = mixIn(
        pool,
        liked.filter((tr) => matchesLanguages(tr, stableLanguages)),
        2,
      );
    }
    // One upload per song, vibe order, then taste on top.
    return preferQuality(rankWave(tuneWaveTracks(dedupeSongs(pool), waveVibe, waveMode), taste));
    // likedQuery.tracks only matters for the familiar mix; taste re-ranks on every change.
  }, [
    backendWorking,
    rawAllTracks,
    localRecs,
    seedRelated,
    ytmTracks,
    waveFilter,
    waveVibe,
    waveMode,
    hideLiked,
    likedQuery.tracks,
    stableLanguages,
    taste,
    refreshSeed,
  ]);

  allTracksRef.current = allTracks;

  const waveCluster = useMemo(
    () => rawClusters.find((c) => c.id === 'wave') ?? null,
    [rawClusters],
  );

  const onWaveTracksAdded = useCallback((tracks: typeof allTracks) => {
    _registerWave(tracks.map((tr) => tr.urn));
  }, []);

  const isWaveUrn = useCallback((urn: string) => _waveUrns.has(urn), []);
  const rankBatch = useCallback(
    // A refill never brings back a resting track while any fresh one is left.
    (tracks: Track[]) =>
      preferQuality(rankWave(dedupeSongs(tracks), useWaveTasteStore.getState(), 1)),
    [],
  );
  const waveFallback = useCallback(() => allTracksRef.current, []);

  useInfiniteWave({
    enabled: isAuthenticated,
    seedKind: 'user',
    initialTracks: waveCluster?.tracks ?? [],
    initialCursor: null,
    languages: stableLanguages,
    filterTrack: waveFilter,
    onTracksAdded: onWaveTracksAdded,
    ownsTrack: isWaveUrn,
    rank: rankBatch,
    fallback: waveFallback,
  });

  const isWaveTrack = currentTrack ? _waveUrns.has(currentTrack.urn) : false;

  useEffect(() => {
    if (currentTrack && !_waveUrns.has(currentTrack.urn) && _waveUrns.size > 0) {
      _waveUrns.clear();
    }
  }, [currentTrack]);

  const wavePreview = allTracks[0] ?? null;
  // Show what is actually playing; the wave preview only when nothing plays.
  const displayTrack = currentTrack ?? wavePreview ?? null;

  /* Upcoming tracks preview (from active wave queue or initial wave pool) */
  const upNextTracks = useMemo(() => {
    const source = isWaveTrack && queue.length > 1 ? queue : allTracks;
    if (!displayTrack) return source.slice(0, 5);
    const idx = source.findIndex((tr) => tr.urn === displayTrack.urn);
    const after = idx >= 0 ? source.slice(idx + 1) : source;
    return after.slice(0, 5);
  }, [isWaveTrack, queue, allTracks, displayTrack]);

  /* Dynamic artwork colors */
  const artworkUrl = art(displayTrack?.artwork_url, 't500x500');
  const colors = useArtworkColor(artworkUrl);
  const dom = colors?.dominant;
  const sec = colors?.secondary;

  const artistDisplay = useArtistDisplay(displayTrack ?? ({} as Track));
  const displayTitle = useDisplayTitle(displayTrack ?? ({} as Track));
  /** "Not this": remember the dislike and move on. */
  const handleNotThis = () => {
    if (!displayTrack) return;
    void toggleDislike(queryClient, displayTrack, true);
    useWaveTasteStore.getState().notThis(displayTrack);
    playerNext();
  };
  /** "More like this": a positive signal for recommendations (doesn't touch your likes). */
  const handleMoreLikeThis = () => {
    if (!displayTrack) return;
    recordEvent('like', displayTrack.urn);
    useWaveTasteStore.getState().moreLikeThis(displayTrack);
    reshapeAfterSeed.current = true;
    toast.success(t('soundwave.moreLikeThisDone'));
  };

  const handleStartWave = useCallback(() => {
    // Still loading: remember the click and start as soon as the pool arrives.
    if (allTracks.length === 0) {
      startPending.current = true;
      setStartQueued(true);
      return;
    }
    startPending.current = false;
    setStartQueued(false);
    _waveUrns.clear();
    _registerWave(allTracks.map((tr) => tr.urn));
    usePlayerStore.getState().play(allTracks[0], allTracks);
  }, [allTracks]);

  // Changing language / vibe / mode while the wave plays restarts it with the new mix
  // (once the re-filtered pool is ready), instead of finishing the old queue.
  const filterKey = `${stableLanguages.join(',')}|${waveVibe}|${waveMode}|${hideLiked}|${hideVariants}`;
  const prevFilterKey = useRef(filterKey);
  const restartPending = useRef(false);
  useEffect(() => {
    if (!startPending.current || allTracks.length === 0) return;
    handleStartWave();
  }, [allTracks, handleStartWave]);
  useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    if (isWaveTrack) restartPending.current = true;
  }, [filterKey, isWaveTrack]);
  useEffect(() => {
    if (!restartPending.current || allTracks.length === 0) return;
    restartPending.current = false;
    handleStartWave();
  }, [allTracks, handleStartWave]);

  // "More like this": once the seed's related tracks arrive, the rest of the queue is rebuilt
  // around them (the current track keeps playing).
  const reshapeAfterSeed = useRef(false);
  const ytmApplied = useRef(false);
  useEffect(() => {
    if (ytmApplied.current || ytmTracks.length === 0 || !isWaveTrack) return;
    ytmApplied.current = true;
    reshapeAfterSeed.current = true;
  }, [ytmTracks, isWaveTrack]);
  useEffect(() => {
    if (!reshapeAfterSeed.current || !isWaveTrack) return;
    if (seedRelated.length === 0 && ytmTracks.length === 0) return;
    reshapeAfterSeed.current = false;
    const { currentTrack: cur } = usePlayerStore.getState();
    const { queue: q, queueIndex: qi } = usePlayerStore.getState();
    const played = new Set(q.slice(0, qi + 1).map((tr) => tr.urn));
    const upcoming = allTracks
      .filter((tr) => tr.urn !== cur?.urn && !played.has(tr.urn))
      .slice(0, 60);
    _registerWave(upcoming.map((tr) => tr.urn));
    usePlayerStore.getState().clearUpcoming();
    usePlayerStore.getState().addToQueue(upcoming);
  }, [seedRelated, ytmTracks, allTracks, isWaveTrack]);

  const handlePlayFromWave = useCallback(
    (track: Track) => {
      // Already queued after the current track: just jump there. Re-playing the whole queue
      // would reshuffle it (with shuffle on) and bring back tracks already heard.
      const { queueIndex, playFromQueue } = usePlayerStore.getState();
      const ahead = isWaveTrack
        ? queue.findIndex((tr, i) => i > queueIndex && tr.urn === track.urn)
        : -1;
      if (ahead >= 0) {
        playFromQueue(ahead);
        return;
      }
      const source = isWaveTrack && queue.length > 0 ? queue : allTracks;
      const list = source.some((tr) => tr.urn === track.urn) ? source : [track, ...source];
      _waveUrns.clear();
      _registerWave(list.map((tr) => tr.urn));
      usePlayerStore.getState().play(track, list);
    },
    [isWaveTrack, queue, allTracks],
  );

  // The big button controls whatever is playing (shown in the centre); with nothing
  // playing it starts the wave.
  const handlePlayPause = useCallback(() => {
    if (currentTrack) togglePlay();
    else if (allTracks.length > 0) handleStartWave();
  }, [currentTrack, allTracks.length, togglePlay, handleStartWave]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshSeed((s) => s + 1);
    setTimeout(() => setIsRefreshing(false), 700);
  }, []);

  const artistTarget = displayTrack?.enrichment?.primary_artist?.id
    ? `/artist/${encodeURIComponent(displayTrack.enrichment.primary_artist.id)}`
    : displayTrack?.user?.urn
      ? `/user/${encodeURIComponent(displayTrack.user.urn)}`
      : null;

  if (!isAuthenticated) return null;

  const spinning = isRefreshing || isFetching || isLoading;
  const playingHere = isPlaying && !!currentTrack;

  return (
    <div
      className="relative w-full flex flex-col overflow-hidden"
      style={{
        // The visible area between the title bar and the player bar, so the wave card fits
        // on screen at launch instead of pushing past the bottom edge.
        minHeight: 'calc(100vh - 150px)',
        background: '#07070c',
      }}
    >
      {/* ── Blurred artwork backdrop ──────────────────────────── */}
      {artworkUrl && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${artworkUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(32px) saturate(1.5)',
            transform: 'scale(1.16) translateZ(0)',
            opacity: 0.36,
            transition: 'background-image 1.2s ease-out',
          }}
        />
      )}

      {/* ── Soft Liquid Glass ambient orbs (blur-free smooth gradients) ─ */}
      <div
        aria-hidden="true"
        className="wave-blob absolute pointer-events-none"
        style={{
          width: '120%',
          height: '78%',
          top: '-22%',
          left: '-15%',
          borderRadius: '50%',
          background: dom
            ? `radial-gradient(ellipse at center, ${rgbToCss(dom, 0.22)} 0%, ${rgbToCss(dom, 0.07)} 42%, transparent 70%)`
            : 'none',
          transition: 'background 1.2s ease-out',
        }}
      />
      <div
        aria-hidden="true"
        className="wave-blob absolute pointer-events-none"
        style={{
          width: '105%',
          height: '68%',
          bottom: '-18%',
          right: '-18%',
          borderRadius: '50%',
          background: sec
            ? `radial-gradient(ellipse at center, ${rgbToCss(sec, 0.14)} 0%, ${rgbToCss(sec, 0.05)} 42%, transparent 70%)`
            : 'none',
          transition: 'background 1.2s ease-out',
        }}
      />

      {/* ── Subtle vignette for glass legibility ──────────────── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 110% 70% at 50% 55%, rgba(8,8,12,0.18) 0%, rgba(8,8,12,0.72) 100%)',
        }}
      />

      {/* ═══════════════ CONTENT ═══════════════ */}
      <div
        className="relative z-10 flex flex-col flex-1 justify-between max-w-[1040px] w-full mx-auto px-6 md:px-10 py-4 gap-3"
        style={{ isolation: 'isolate' }}
      >
        {/* ── Top Bar: Brand + Live Pill + Filters + Refresh ── */}
        <header className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white text-black">
              <AudioLines size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="soundwave-title text-[20px] font-bold tracking-tight leading-none">
                  {t('soundwave.myWave', 'My Wave')}
                </h1>
                <span
                  className={`bar-control inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] ${
                    isWaveTrack ? 'is-active' : ''
                  }`}
                  style={{
                    color: isWaveTrack ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isPlaying && currentTrack ? 'animate-pulse' : ''
                    }`}
                    style={{
                      background: isWaveTrack ? 'var(--color-accent)' : 'rgba(255,255,255,0.35)',
                    }}
                  />
                  {isWaveTrack
                    ? t('soundwave.statusLive', 'Live')
                    : t('soundwave.statusStandby', 'Ready')}
                </span>
              </div>
              <p className="text-[11.5px] text-white/45 mt-1">{t('soundwave.tagline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTuneOpen(true)}
              className="bar-control press flex items-center gap-2 h-8 px-3.5 rounded-full text-[12px] font-semibold text-white/85 hover:text-white cursor-pointer"
            >
              <SlidersHorizontal size={13} />
              {t('waveTune.open')}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={spinning}
              className="bar-control press flex items-center gap-2 h-8 px-3.5 rounded-full text-[12px] font-semibold text-white/85 hover:text-white cursor-pointer disabled:opacity-40 select-none"
            >
              <RefreshCw size={12} className={spinning ? 'animate-spin' : ''} />
              {t('soundwave.updateWave', 'Update wave')}
            </button>
          </div>
        </header>

        <VibeTuner
          vibe={waveVibe}
          mode={waveMode}
          onVibeChange={setWaveVibe}
          onModeChange={setWaveMode}
        />

        {/* ── The wave card: title on top, cover on the living horizon with play on it,
             dotted spectrum, progress and the action row (old card + new stage). ── */}
        <section
          className="wave-card relative my-auto flex w-full flex-col items-center gap-3 rounded-[32px] px-5 py-4 md:px-10 md:py-5"
          // Look per interface style lives in index.css (.wave-card); the cover colour only
          // tints the Liquid Glass glow.
          style={{ '--wave-glow': dom ? rgbToCss(dom, 0.16) : 'transparent' } as CSSProperties}
        >
          {/* Artist (headline) · title · length · why it's here */}
          <div className="w-full max-w-3xl text-center">
            {displayTrack ? (
              <div key={displayTrack.urn} className="track-swap-text">
                <button
                  type="button"
                  onClick={artistTarget ? () => navigate(artistTarget) : undefined}
                  disabled={!artistTarget}
                  className="mx-auto block max-w-full truncate pb-[0.12em] font-extrabold leading-[1.2] tracking-tight text-white hover:opacity-85 cursor-pointer disabled:cursor-default disabled:hover:opacity-100"
                  // No glow: `truncate` clips it into a visible box around the title.
                  style={{ fontSize: 'clamp(24px, 3.4vw, 42px)' }}
                >
                  {artistDisplay.primary}
                </button>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/track/${encodeURIComponent(displayTrack.urn)}`)}
                    className="max-w-xl truncate text-[17px] font-semibold text-white/75 hover:text-white cursor-pointer"
                  >
                    {displayTitle}
                  </button>
                  {displayTrack.duration > 0 && (
                    <span className="shrink-0 text-[13px] tabular-nums text-white/35">
                      · {dur(displayTrack.duration)}
                    </span>
                  )}
                </div>
                {!isWaveTrack && currentTrack ? (
                  // Something else is playing: a small pill starts the wave instead of a big block.
                  <button
                    type="button"
                    onClick={handleStartWave}
                    title={t('soundwave.nowPlayingOther', { title: currentTrack.title })}
                    className="press mx-auto mt-2 flex h-8 select-none items-center gap-1.5 rounded-full ui-primary px-3.5 text-[12.5px] font-bold cursor-pointer disabled:opacity-40"
                  >
                    {startQueued && allTracks.length === 0 ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Play size={12} fill="currentColor" strokeWidth={0} />
                    )}
                    {t('soundwave.startWave')}
                  </button>
                ) : (
                  <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[13px] text-white/45">
                    <Sparkles size={13} />
                    {isUrnLiked(displayTrack.urn) || displayTrack.user_favorite
                      ? t('waveTune.reasonLiked')
                      : t('waveTune.reasonNew')}
                  </p>
                )}
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-12 w-64 animate-pulse rounded-2xl bg-white/10" />
                <div className="h-4 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
              </div>
            ) : (
              <div className="py-2">
                <p className="text-[18px] font-semibold text-white/70">
                  {t('soundwave.coldTitle')}
                </p>
                <p className="mt-1 text-[13px] text-white/40">{t('soundwave.coldDesc')}</p>
              </div>
            )}
          </div>

          {/* Prev · cover with play on it · next, over the wave horizon */}
          <div className="relative flex w-full items-center justify-center gap-6 md:gap-12">
            <WaveStage active={isPlaying && !!currentTrack} pulseTarget={coverRef} />
            <button
              type="button"
              onClick={handlePrev}
              disabled={!currentTrack}
              aria-label={t('kb.prevTrack')}
              className="press relative z-10 flex h-12 w-12 items-center justify-center rounded-full bar-control text-white/75 hover:text-white cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button
              type="button"
              key={displayTrack?.urn ?? 'none'}
              onClick={handlePlayPause}
              aria-label={isPlaying && currentTrack ? t('kb.playPause') : t('soundwave.startWave')}
              ref={coverRef}
              style={{
                // Tilt toward the cursor, an occasional idle tilt (CSS), bass pulse and sway.
                transform:
                  'perspective(700px) rotateY(calc(var(--tx, 0deg) + var(--idle-x, 0deg) + var(--bass, 0) * var(--dip-x, 12deg))) rotateX(calc(var(--ty, 0deg) + var(--idle-y, 0deg) + var(--bass, 0) * var(--dip-y, -12deg))) translateY(calc(var(--sway, 0) * 1px)) scale(calc(1 + var(--bass, 0) * 0.06))',
                transition: 'transform 0.12s linear, box-shadow 1.2s ease-out',
                boxShadow: dom
                  ? `0 24px 64px ${rgbToCss(dom, 0.5)}, 0 8px 24px rgba(0,0,0,0.55)`
                  : '0 24px 64px rgba(0,0,0,0.55)',
              }}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5;
                const y = (e.clientY - r.top) / r.height - 0.5;
                e.currentTarget.style.setProperty('--tx', `${(x * 16).toFixed(2)}deg`);
                e.currentTarget.style.setProperty('--ty', `${(-y * 16).toFixed(2)}deg`);
              }}
              onPointerLeave={(e) => {
                e.currentTarget.style.setProperty('--tx', '0deg');
                e.currentTarget.style.setProperty('--ty', '0deg');
              }}
              className="np-cover-img group/art relative z-10 size-[clamp(132px,calc(100vh-640px),220px)] shrink-0 overflow-hidden rounded-3xl bg-white/[0.06] ring-1 ring-white/15 cursor-pointer disabled:cursor-default"
            >
              {artworkUrl ? (
                <img
                  src={artworkUrl}
                  alt={displayTitle}
                  className="h-full w-full object-cover"
                  decoding="async"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <AudioLines size={40} className="text-white/25" />
                </span>
              )}
              {/* Play on the cover: always shown when paused, on hover while playing. */}
              <span
                className={`absolute inset-0 flex items-center justify-center transition-[background-color,opacity] duration-300 ${
                  playingHere
                    ? 'bg-black/0 opacity-0 group-hover/art:bg-black/30 group-hover/art:opacity-100'
                    : 'bg-black/25 opacity-100'
                }`}
              >
                <span className="play-fab flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover/art:scale-110">
                  {isBuffering && currentTrack ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : playingHere ? (
                    <Pause size={24} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={24} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                  )}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={playerNext}
              disabled={!currentTrack}
              aria-label={t('kb.nextTrack')}
              className="press relative z-10 flex h-12 w-12 items-center justify-center rounded-full bar-control text-white/75 hover:text-white cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>

          {/* Dotted spectrum, progress and actions */}
          {currentTrack && (
            <div className="flex w-full max-w-2xl flex-col gap-2">
              <LiveSpectrumCanvas active={isPlaying} bars={56} height={18} variant="dots" />
              <ProgressSlider />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ControlVolumeBtn size="sm" />
                  <button
                    type="button"
                    onClick={handleNotThis}
                    disabled={!isWaveTrack}
                    className="press flex h-10 items-center gap-2 rounded-full bar-control px-4 text-[13px] font-semibold text-white/85 hover:text-white cursor-pointer disabled:opacity-35 disabled:cursor-default"
                  >
                    <ThumbsDown size={15} />
                    {t('soundwave.notThis')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMoreLikeThis}
                    disabled={!isWaveTrack}
                    className="press flex h-10 items-center gap-2 rounded-full bar-control px-4 text-[13px] font-semibold text-white/85 hover:text-white cursor-pointer disabled:opacity-35 disabled:cursor-default"
                  >
                    <ThumbsUp size={15} />
                    {t('soundwave.moreLikeThis')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openLyricsPanel({ tab: 'lyrics', rightPanelOpen: true })}
                    title={t('kb.lyrics')}
                    aria-label={t('kb.lyrics')}
                    className="flex h-10 w-10 items-center justify-center rounded-full ui-icon text-white/60 hover:text-white cursor-pointer"
                  >
                    <MicVocal size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openLyricsPanel({ tab: 'comments', rightPanelOpen: true })}
                    title={t('track.comments')}
                    aria-label={t('track.comments')}
                    className="flex h-10 w-10 items-center justify-center rounded-full ui-icon text-white/60 hover:text-white cursor-pointer"
                  >
                    <MessageCircle size={17} />
                  </button>
                  <LikeButton
                    key={currentTrack.urn}
                    track={currentTrack}
                    variant="always"
                    size={18}
                    className="h-10 w-10"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Up next: a compact "Next" row of chips, like a queue preview ── */}
        {upNextTracks.length > 0 && (
          <footer className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <span className="text-[13px] font-semibold text-white/60 mr-1">
              {t('soundwave.next', 'Next')}
            </span>
            {upNextTracks.slice(0, 3).map((tr, i) => {
              const thumb = art(tr.artwork_url, 't67x67');
              return (
                <button
                  key={`${tr.urn}-${i}`}
                  type="button"
                  onClick={() => handlePlayFromWave(tr)}
                  title={`${tr.user?.username ?? ''} — ${tr.title}`}
                  className="wave-next-chip flex items-center gap-2 h-9 pl-1 pr-3.5 rounded-full bar-control cursor-pointer max-w-[240px]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                      decoding="async"
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0 flex items-center justify-center">
                      <AudioLines size={12} className="text-white/40" />
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-white/90 truncate">{tr.title}</span>
                </button>
              );
            })}
          </footer>
        )}
      </div>
      <WaveTuneDialog
        open={tuneOpen}
        onOpenChange={setTuneOpen}
        mode={waveMode}
        hideLiked={hideLiked}
        hideVariants={hideVariants}
        onHideVariantsChange={setHideVariants}
        vibe={waveVibe}
        languages={selectedLanguages}
        onModeChange={setWaveMode}
        onHideLikedChange={setHideLiked}
        onVibeChange={setWaveVibe}
        onLanguagesChange={setSelectedLanguages}
        onListen={() => {
          if (!isWaveTrack || !isPlaying) handleStartWave();
        }}
      />
    </div>
  );
}
