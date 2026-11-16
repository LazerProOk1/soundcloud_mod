/**
 * SoundWavePage — полноэкранный иммерсивный плеер SoundWave в стиле Liquid Glass.
 *
 * Особенности:
 *   – Мягкий многослойный фон из доминирующих цветов обложки без резких полос
 *   – Панель управления: фильтр языков, скрытие лайкнутых и обновление волны
 *   – Центральная стеклянная сцена: обложка, имя артиста, прогресс-бар и элементы управления
 *   – Лента «Далее в волне» с быстрым переходом к любому следующему треку
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { useClusterWave } from '../components/music/cluster';
import { useInfiniteWave } from '../components/music/soundwave/use-infinite-wave';
import { VibeTuner } from '../components/music/soundwave/vibe-tuner';
import { WaveTuneDialog } from '../components/music/soundwave/wave-tune-dialog';
import { rgbToCss, useArtworkColor } from '../hooks/useArtworkColor';
import { api } from '../lib/api';
import { handlePrev } from '../lib/audio';
import { toggleDislike } from '../lib/dislikes';
import { recordEvent } from '../lib/events';
import { art } from '../lib/formatters';
import { useLikedTracks, useRecommendedTracks, useRelatedPool } from '../lib/hooks';
import {
  AudioLines,
  Loader2,
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
import { useArtistDisplay, useDisplayTitle } from '../lib/track-display';
import { matchesLanguages } from '../lib/track-language';
import { dedupeSongs, isVariant } from '../lib/track-variants';
import { mixIn, rankWave } from '../lib/wave-rank';
import { tuneWaveTracks } from '../lib/wave-vibes';
import { useAuthStore } from '../stores/auth';
import { type Track, usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { useWaveTasteStore } from '../stores/wave-taste';

/* ── Module-level wave session tracker ────────────────────────────
 * Persists across SoundWavePage unmount/remount (navigation away and back).
 * Tracks every URN ever queued by the wave so isWaveTrack stays correct
 * even after infinite-wave refill adds tracks not in the initial cluster.
 * Cleared when the user starts playing from a non-wave source.            */
const _waveUrns = new Set<string>();
function _registerWave(urns: string[]) {
  for (const u of urns) _waveUrns.add(u);
}

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
  const selectedLanguages = useSettingsStore((s) => s.soundwaveLanguages);
  const setSelectedLanguages = useSettingsStore((s) => s.setSoundwaveLanguages);
  const hideLiked = useSettingsStore((s) => s.soundwaveHideLiked);
  const setHideLiked = useSettingsStore((s) => s.setSoundwaveHideLiked);
  const hideVariants = useSettingsStore((s) => s.soundwaveHideVariants);
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
  const playerNext = usePlayerStore((s) => s.next);
  const queryClient = useQueryClient();
  const [tuneOpen, setTuneOpen] = useState(false);

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
    useShallow((s) => ({ artists: s.artists, banned: s.banned, recent: s.recent })),
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

  const allTracks = useMemo(() => {
    const base = backendWorking ? rawAllTracks : localRecs;
    let pool = [...seedRelated, ...base].filter(waveFilter);
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
    return rankWave(tuneWaveTracks(dedupeSongs(pool), waveVibe, waveMode), taste);
    // likedQuery.tracks only matters for the familiar mix; taste re-ranks on every change.
  }, [
    backendWorking,
    rawAllTracks,
    localRecs,
    seedRelated,
    waveFilter,
    waveVibe,
    waveMode,
    hideLiked,
    likedQuery.tracks,
    stableLanguages,
    taste,
    refreshSeed,
  ]);

  const waveCluster = useMemo(
    () => rawClusters.find((c) => c.id === 'wave') ?? null,
    [rawClusters],
  );

  const onWaveTracksAdded = useCallback((tracks: typeof allTracks) => {
    _registerWave(tracks.map((tr) => tr.urn));
  }, []);

  useInfiniteWave({
    enabled: isAuthenticated,
    seedKind: 'user',
    initialTracks: waveCluster?.tracks ?? [],
    initialCursor: null,
    languages: stableLanguages,
    filterTrack: waveFilter,
    onTracksAdded: onWaveTracksAdded,
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
    if (allTracks.length === 0) return;
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
  useEffect(() => {
    if (!reshapeAfterSeed.current || seedRelated.length === 0 || !isWaveTrack) return;
    reshapeAfterSeed.current = false;
    const { currentTrack: cur } = usePlayerStore.getState();
    const upcoming = allTracks.filter((tr) => tr.urn !== cur?.urn).slice(0, 60);
    _registerWave(upcoming.map((tr) => tr.urn));
    usePlayerStore.getState().clearUpcoming();
    usePlayerStore.getState().addToQueue(upcoming);
  }, [seedRelated, allTracks, isWaveTrack]);

  const handlePlayFromWave = useCallback(
    (track: Track) => {
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

  return (
    <div
      className="relative w-full flex flex-col overflow-hidden page-enter"
      style={{
        minHeight: 'calc(100vh - 40px)',
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
        className="relative z-10 flex flex-col flex-1 justify-between max-w-[1040px] w-full mx-auto px-6 md:px-10 py-7 gap-6"
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    background: isWaveTrack ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                    border: '0.5px solid rgba(255,255,255,0.14)',
                    color: isWaveTrack ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isPlaying && !!currentTrack ? 'animate-pulse' : ''
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
              className="flex items-center gap-2 h-8 px-3.5 rounded-full text-[12px] font-semibold text-white/85 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] cursor-pointer"
            >
              <SlidersHorizontal size={13} />
              {t('waveTune.open')}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={spinning}
              className="flex items-center gap-2 h-8 px-3.5 rounded-full text-[12px] font-semibold text-white/85 hover:text-white transition-all duration-200 cursor-pointer disabled:opacity-40 active:scale-95 select-none"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
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

        {/* ── Central Liquid Glass Stage ────────────────────────── */}
        <section className="relative p-2 md:p-4 flex flex-col items-center gap-6 my-auto">
          {/* Cover */}
          <button
            type="button"
            key={displayTrack?.urn ?? 'none'}
            onClick={handlePlayPause}
            disabled={allTracks.length === 0 && !isWaveTrack}
            className="np-cover-img w-[200px] h-[200px] rounded-xl overflow-hidden bg-white/[0.06] shadow-[0_16px_40px_rgba(0,0,0,0.5)] cursor-pointer disabled:cursor-default"
          >
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
                decoding="async"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center">
                <AudioLines size={40} className="text-white/25" />
              </span>
            )}
          </button>

          {/* Title · artist · why it's here */}
          <div className="text-center max-w-3xl w-full">
            {displayTrack ? (
              <div key={displayTrack.urn} className="track-swap-text">
                <button
                  type="button"
                  onClick={() => navigate(`/track/${encodeURIComponent(displayTrack.urn)}`)}
                  className="block mx-auto max-w-full truncate text-white leading-[1.05] tracking-tight font-extrabold hover:opacity-85 cursor-pointer"
                  style={{ fontSize: 'clamp(30px, 4.6vw, 54px)' }}
                >
                  {displayTitle}
                </button>
                <button
                  type="button"
                  onClick={artistTarget ? () => navigate(artistTarget) : undefined}
                  disabled={!artistTarget}
                  className="mt-2 text-[17px] font-semibold text-white/70 hover:text-white hover:underline cursor-pointer disabled:cursor-default disabled:no-underline"
                >
                  {artistDisplay.primary}
                </button>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[14px] text-white/50">
                  <Sparkles size={14} />
                  {isUrnLiked(displayTrack.urn) || displayTrack.user_favorite
                    ? t('waveTune.reasonLiked')
                    : t('waveTune.reasonNew')}
                </p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-12 w-64 rounded-2xl bg-white/10 animate-pulse" />
                <div className="h-4 w-40 rounded-lg bg-white/[0.06] animate-pulse" />
              </div>
            ) : (
              <div className="py-2">
                <p className="text-[18px] text-white/70 font-semibold">
                  {t('soundwave.coldTitle')}
                </p>
                <p className="text-[13px] text-white/40 mt-1">{t('soundwave.coldDesc')}</p>
              </div>
            )}
          </div>

          {/* Not this · Play/Pause · More like this */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleNotThis}
              disabled={!displayTrack || !isWaveTrack}
              className="flex items-center gap-2 h-11 px-5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.08] text-[14px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <ThumbsDown size={17} />
              {t('soundwave.notThis')}
            </button>
            <button
              type="button"
              onClick={handlePrev}
              disabled={!currentTrack}
              aria-label={t('kb.prevTrack')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/[0.1] cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <SkipBack size={22} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={allTracks.length === 0 && !isWaveTrack}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="play-fab relative w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.4)] cursor-pointer disabled:opacity-40"
            >
              {isBuffering && !!currentTrack ? (
                <Loader2 size={24} className="animate-spin" />
              ) : isPlaying && !!currentTrack ? (
                <Pause size={24} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={24} fill="currentColor" strokeWidth={0} className="ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={playerNext}
              disabled={!currentTrack}
              aria-label={t('kb.nextTrack')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/[0.1] cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <SkipForward size={22} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={handleMoreLikeThis}
              disabled={!displayTrack || !isWaveTrack}
              className="flex items-center gap-2 h-11 px-5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.08] text-[14px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <ThumbsUp size={17} />
              {t('soundwave.moreLikeThis')}
            </button>
          </div>

          {/* Start Wave CTA when listening outside the wave */}
          {!isWaveTrack && currentTrack && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleStartWave}
                disabled={allTracks.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold cursor-pointer bg-white text-black hover:scale-[1.04] active:scale-95 transition-transform disabled:opacity-40 select-none"
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
                {t('soundwave.startWave', 'Start wave')}
              </button>
              <p className="text-[11px] text-white/40 truncate max-w-sm">
                {t('soundwave.nowPlayingOther', {
                  defaultValue: 'Playing now: {{title}}',
                  title: currentTrack.title,
                })}
              </p>
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
                  key={tr.urn}
                  type="button"
                  onClick={() => handlePlayFromWave(tr)}
                  title={`${tr.user?.username ?? ''} — ${tr.title}`}
                  className="wave-next-chip flex items-center gap-2 h-9 pl-1 pr-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.08] cursor-pointer max-w-[240px]"
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
