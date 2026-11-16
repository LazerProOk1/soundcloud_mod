/**
 * SoundWavePage — полноэкранный иммерсивный плеер SoundWave в стиле Liquid Glass.
 *
 * Особенности:
 *   – Мягкий многослойный фон из доминирующих цветов обложки без резких полос
 *   – Панель управления: фильтр языков, скрытие лайкнутых и обновление волны
 *   – Центральная стеклянная сцена: обложка, имя артиста, прогресс-бар и элементы управления
 *   – Лента «Далее в волне» с быстрым переходом к любому следующему треку
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ControlVolumeBtn,
  NowBarDislikeButton,
  ProgressSlider,
} from '../components/layout/NowPlayingBar';
import { useClusterWave } from '../components/music/cluster';
import { LikeButton } from '../components/music/LikeButton';
import { LiveSpectrumCanvas } from '../components/music/LiveSpectrumCanvas';
import { HideLikedToggle } from '../components/music/soundwave/hide-liked-toggle';
import { LanguageFilter } from '../components/music/soundwave/language-filter';
import { useInfiniteWave } from '../components/music/soundwave/use-infinite-wave';
import { VibeTuner } from '../components/music/soundwave/vibe-tuner';
import { rgbToCss, useArtworkColor } from '../hooks/useArtworkColor';
import { handlePrev } from '../lib/audio';
import { art, dur } from '../lib/formatters';
import { useLikedTracks, useRecommendedTracks, useRelatedPool } from '../lib/hooks';
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
} from '../lib/icons';
import { isUrnLiked } from '../lib/likes';
import { useArtistDisplay, useDisplayTitle } from '../lib/track-display';
import { matchesLanguages } from '../lib/track-language';
import { tuneWaveTracks } from '../lib/wave-vibes';
import { useAuthStore } from '../stores/auth';
import { useLyricsStore } from '../stores/lyrics';
import { type Track, usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';

/* ── Module-level wave session tracker ────────────────────────────
 * Persists across SoundWavePage unmount/remount (navigation away and back).
 * Tracks every URN ever queued by the wave so isWaveTrack stays correct
 * even after infinite-wave refill adds tracks not in the initial cluster.
 * Cleared when the user starts playing from a non-wave source.            */
const _waveUrns = new Set<string>();
function _registerWave(urns: string[]) {
  for (const u of urns) _waveUrns.add(u);
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
      matchesLanguages(tr, stableLanguages),
    [hideLiked, stableLanguages],
  );

  const allTracks = useMemo(() => {
    const base = backendWorking ? rawAllTracks : localRecs;
    return tuneWaveTracks(base.filter(waveFilter), waveVibe, waveMode);
  }, [backendWorking, rawAllTracks, localRecs, waveFilter, waveVibe, waveMode]);

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
  const openLyricsPanel = useLyricsStore((s) => s.openPanel);

  const handleStartWave = useCallback(() => {
    if (allTracks.length === 0) return;
    _waveUrns.clear();
    _registerWave(allTracks.map((tr) => tr.urn));
    usePlayerStore.getState().play(allTracks[0], allTracks);
  }, [allTracks]);

  // Changing language / vibe / mode while the wave plays restarts it with the new mix
  // (once the re-filtered pool is ready), instead of finishing the old queue.
  const filterKey = `${stableLanguages.join(',')}|${waveVibe}|${waveMode}|${hideLiked}`;
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
            <HideLikedToggle value={hideLiked} onChange={setHideLiked} />
            <LanguageFilter selected={selectedLanguages} onChange={setSelectedLanguages} />
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
          {/* Artist & Track Title */}
          <div className="text-center max-w-2xl w-full">
            {displayTrack ? (
              <>
                <button
                  type="button"
                  onClick={artistTarget ? () => navigate(artistTarget) : undefined}
                  disabled={!artistTarget}
                  className={`text-white/95 leading-[1.02] tracking-tight font-extrabold transition-opacity ${
                    artistTarget ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
                  }`}
                  style={{
                    fontSize: 'clamp(28px, 5vw, 56px)',
                    fontFamily: 'var(--font-display)',
                    textShadow: '0 2px 12px rgba(0,0,0,0.35)',
                  }}
                >
                  {artistDisplay.primary}
                </button>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/track/${encodeURIComponent(displayTrack.urn)}`)}
                    className="text-[15px] md:text-[17px] font-semibold text-white/75 hover:text-white truncate max-w-xl transition-colors cursor-pointer"
                  >
                    {displayTitle}
                  </button>
                  {displayTrack.duration > 0 && (
                    <span className="text-[12px] text-white/35 font-mono shrink-0">
                      · {dur(displayTrack.duration)}
                    </span>
                  )}
                </div>
              </>
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

          {/* Transport: Prev · Artwork + Play/Pause · Next */}
          <div className="flex items-center justify-center gap-6 md:gap-10">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!isWaveTrack && !currentTrack}
              aria-label={t('kb.prevTrack')}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white/65 hover:text-white bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipBack size={22} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              onClick={handlePlayPause}
              disabled={allTracks.length === 0 && !isWaveTrack}
              className="relative rounded-3xl overflow-hidden cursor-pointer group/art shrink-0 ring-1 ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                width: 216,
                height: 216,
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
            >
              {artworkUrl ? (
                <img
                  src={artworkUrl}
                  alt={displayTitle}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover/art:scale-[1.05]"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full bg-white/[0.06] flex items-center justify-center">
                  <AudioLines size={40} className="text-white/25" />
                </div>
              )}

              <div
                className="absolute inset-0 transition-opacity duration-300 group-hover/art:opacity-90"
                style={{ background: 'rgba(0,0,0,0.22)' }}
              />

              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-[62px] h-[62px] rounded-full flex items-center justify-center transition-transform duration-200 group-hover/art:scale-110 active:scale-90"
                  style={{
                    background: '#fff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    color: '#0b0b0f',
                  }}
                >
                  {isBuffering && !!currentTrack ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : isPlaying && !!currentTrack ? (
                    <Pause size={22} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={22} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={playerNext}
              disabled={!isWaveTrack && !currentTrack}
              aria-label={t('kb.nextTrack')}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white/65 hover:text-white bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipForward size={22} strokeWidth={1.8} />
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

          {/* Live Progress + Controls */}
          {isWaveTrack && displayTrack && (
            <div className="w-full max-w-xl flex flex-col gap-3">
              <LiveSpectrumCanvas
                active={isPlaying}
                bars={40}
                height={24}
                className="max-w-xs mx-auto opacity-85"
              />
              <ProgressSlider />
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <ControlVolumeBtn size="sm" />
                  <NowBarDislikeButton trackUrn={displayTrack.urn} />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openLyricsPanel({ tab: 'lyrics', rightPanelOpen: true })}
                    title={t('kb.lyrics')}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
                  >
                    <MicVocal size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openLyricsPanel({ tab: 'comments', rightPanelOpen: true })}
                    title={t('track.comments', 'Comments')}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
                  >
                    <MessageCircle size={17} />
                  </button>
                  <LikeButton
                    key={displayTrack.urn}
                    track={displayTrack}
                    variant="always"
                    size={18}
                    className="w-10 h-10"
                    title={t('track.likes')}
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
    </div>
  );
}
