import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { toggleDislike } from '../../../lib/dislikes';
import { useLikedTracks, useRecommendedTracks, useRelatedPool } from '../../../lib/hooks';
import {
  AudioLines,
  Compass,
  Disc3,
  Fullscreen,
  Headphones,
  Pause,
  Play,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
} from '../../../lib/icons';
import { setTrackLiked } from '../../../lib/like-toggle';
import { isUrnLiked } from '../../../lib/likes';
import { useLiquidLight } from '../../../lib/useLiquidLight';
import { tuneWaveTracks } from '../../../lib/wave-vibes';
import { useAuthStore } from '../../../stores/auth';
import type { Track } from '../../../stores/player';
import { usePlayerStore } from '../../../stores/player';
import { useSettingsStore } from '../../../stores/settings';
import {
  type ClusterHydrated,
  type ClusterId,
  ClusterRow,
  ClusterSkeletonState,
  NeighborsRow,
  useClusterWave,
} from '../cluster';
import { AmbientLayer } from './ambient';
import { useInfiniteWave } from './use-infinite-wave';
import { VibeTuner } from './vibe-tuner';

const CLUSTER_ORDER: ClusterId[] = [
  'for_you',
  'top_artists',
  'adjacent',
  'fresh_drops',
  'same_vibe',
  'deep_cuts',
];

const CLUSTER_ICON: Partial<Record<ClusterId, React.ReactNode>> = {
  wave: <AudioLines size={14} />,
  for_you: <Sparkles size={14} />,
  top_artists: <Headphones size={14} />,
  adjacent: <Compass size={14} />,
  fresh_drops: <Disc3 size={14} />,
  same_vibe: <AudioLines size={14} />,
  deep_cuts: <Star size={14} />,
};

const WAVE_ICON = <AudioLines size={14} />;

export const SoundWaveBlock = React.memo(function SoundWaveBlock() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const selectedLanguages = useSettingsStore((s) => s.soundwaveLanguages);
  const hideLiked = useSettingsStore((s) => s.soundwaveHideLiked);
  const waveVibe = useSettingsStore((s) => s.soundwaveVibe);
  const setWaveVibe = useSettingsStore((s) => s.setSoundwaveVibe);
  const waveMode = useSettingsStore((s) => s.soundwaveMode);
  const setWaveMode = useSettingsStore((s) => s.setSoundwaveMode);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const qc = useQueryClient();

  const refreshSeed = 0;
  /* Dynamic cursor spotlight — tracks mouse position on the glass panel */
  const panelRef = useLiquidLight<HTMLElement>();

  const stableLanguages = useMemo(() => [...selectedLanguages].sort(), [selectedLanguages]);
  const langKey = stableLanguages.join(',') || 'all';

  const url = useMemo(() => {
    if (!isAuthenticated) return null;
    const qs = new URLSearchParams();
    if (stableLanguages.length > 0) qs.set('languages', stableLanguages.join(','));
    // seed > 0 busts both the TanStack Query cache (via queryKey) and the server cache
    if (refreshSeed > 0) qs.set('seed', String(refreshSeed));
    return `/recommendations?${qs}`;
  }, [isAuthenticated, stableLanguages, refreshSeed]);

  const { data, isLoading } = useClusterWave({
    queryKey: ['cluster-wave', 'home', langKey, refreshSeed],
    url,
    enabled: isAuthenticated,
    staleMs: refreshSeed === 0 ? 30_000 : 0,
  });

  const rawClusters = useMemo(() => data?.clusters ?? [], [data]);
  const rawAllTracks = useMemo(() => data?.allTracks ?? [], [data]);

  // ── Fallback: SC native recommendations via liked tracks ──────
  // Used when the custom backend is unreachable (clusters stay empty).
  const likedQuery = useLikedTracks(60);
  const likedTracks = useMemo(() => likedQuery.tracks, [likedQuery.tracks]);
  const { data: relatedPool, isLoading: poolLoading } = useRelatedPool(likedTracks);
  const localRecs = useRecommendedTracks(relatedPool, 40);

  const backendWorking = rawClusters.length > 0 || rawAllTracks.length > 0;

  // Fallback chain: backend → localRecs (SC-native related pool)
  // We do NOT fall back to liked tracks — user doesn't want to see them here
  const immediateBase = useMemo(() => {
    if (backendWorking) return rawAllTracks;
    return localRecs;
  }, [backendWorking, rawAllTracks, localRecs]);

  const hideLikedFilter = useCallback((tr: Track) => !tr.user_favorite && !isUrnLiked(tr.urn), []);

  const filteredAllTracks = useMemo(() => {
    const base = hideLiked ? immediateBase.filter(hideLikedFilter) : immediateBase;
    return tuneWaveTracks(base, waveVibe, waveMode);
  }, [immediateBase, hideLiked, hideLikedFilter, waveVibe, waveMode]);

  const filteredClusters = useMemo(() => {
    if (!hideLiked) return rawClusters;
    return rawClusters
      .map((c) => ({
        ...c,
        tracks: c.tracks.filter(hideLikedFilter),
        neighbors: c.neighbors?.filter((n) => {
          const matchTrack = c.tracks.find((tr) => tr.urn.endsWith(`:${n.track_id}`));
          if (!matchTrack) return true;
          return !matchTrack.user_favorite && !isUrnLiked(matchTrack.urn);
        }),
      }))
      .filter((c) => c.tracks.length > 0) as ClusterHydrated[];
  }, [rawClusters, hideLiked, hideLikedFilter]);

  const orderedClusters = useMemo(() => {
    const byId = new Map(filteredClusters.map((c) => [c.id, c]));
    return CLUSTER_ORDER.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [filteredClusters]);

  const waveCluster = useMemo(
    () => orderedClusters.find((c) => c.id === 'wave') ?? null,
    [orderedClusters],
  );

  const waveTrack = currentTrack ?? filteredAllTracks[0] ?? null;
  const isCurrent = !!currentTrack && waveTrack?.urn === currentTrack.urn;

  useInfiniteWave({
    enabled: isAuthenticated,
    seedKind: 'user',
    initialTracks: waveCluster?.tracks ?? [],
    initialCursor: null,
    languages: stableLanguages,
    filterTrack: hideLiked ? hideLikedFilter : undefined,
  });

  if (!isAuthenticated) return null;

  const handlePlayAll = () => {
    if (!filteredAllTracks.length) return;
    usePlayerStore.getState().play(filteredAllTracks[0], filteredAllTracks);
  };

  const waveIsPlaying = isCurrent && isPlaying;
  const handleMainPlay = () => {
    const player = usePlayerStore.getState();
    if (isCurrent) {
      if (player.isPlaying) player.pause();
      else player.resume();
      return;
    }
    handlePlayAll();
  };
  // "Не то": dislike teaches the wave, then skip right away.
  const handleNotThis = () => {
    const cur = usePlayerStore.getState().currentTrack;
    if (!cur) return;
    void toggleDislike(qc, cur, true);
    usePlayerStore.getState().next();
  };
  // "Ещё такого": a like is the strongest positive signal the wave learns from.
  const handleMoreLikeThis = () => {
    const cur = usePlayerStore.getState().currentTrack;
    if (!cur) return;
    void setTrackLiked(qc, cur, true);
    toast.success(t('soundwave.moreLikeThisDone', 'Учтём — будет больше такого'));
  };

  // Show cold state only if truly nothing available (backend down + no liked tracks cached).
  // Also wait for the related-pool query to finish — it loads slightly after the cluster wave.
  const anyLoading = isLoading || (poolLoading && likedTracks.length > 0);
  const showCold = !anyLoading && orderedClusters.length === 0 && immediateBase.length === 0;
  const playableTracks = filteredAllTracks;

  return (
    <section
      ref={panelRef}
      className="relative rounded-3xl overflow-hidden glass-featured select-none"
      style={{
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.04) inset, 0 10px 60px rgba(0,0,0,0.45), 0 0 60px var(--color-accent-glow)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <AmbientLayer particleCount={10} blur={35} intensity={0.5} />

      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            /* Mesh background shows through at top, text stays readable at bottom */
            'linear-gradient(180deg, rgba(8,8,10,0.05) 0%, rgba(8,8,10,0.18) 50%, rgba(8,8,10,0.72) 100%)',
          contain: 'strict',
        }}
      />

      <div className="relative p-6 flex flex-col gap-5" style={{ isolation: 'isolate' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent), rgba(255,255,255,0.12))',
                boxShadow: '0 0 24px var(--color-accent-glow), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <AudioLines size={18} style={{ color: 'var(--color-accent-contrast)' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="soundwave-title text-[20px] font-bold tracking-tight leading-none">
                  SoundWave
                </h2>
              </div>
              <p className="text-[11.5px] text-white/50 mt-1 truncate">{t('soundwave.tagline')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/soundwave')}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title={t('soundwave.openFullscreen', 'Open full wave')}
          >
            <Fullscreen size={13} />
            {t('soundwave.settings', 'Настроить')}
          </button>
        </div>

        {/* Justify-style controls: one big play button with quick feedback on each side. */}
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={handleNotThis}
            disabled={!currentTrack}
            className="flex items-center gap-2 h-11 px-5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[14px] font-semibold text-white/85 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <ThumbsDown size={17} />
            {t('soundwave.notThis', 'Не то')}
          </button>
          <button
            type="button"
            onClick={handleMainPlay}
            disabled={playableTracks.length === 0 && !isCurrent}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-white text-black transition-transform duration-200 ease-[var(--ease-apple)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.06] active:scale-[0.95] shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
            title={t('soundwave.playAll')}
          >
            {waveIsPlaying ? (
              <Pause size={26} fill="currentColor" />
            ) : (
              <Play size={26} fill="currentColor" className="ml-1" />
            )}
          </button>
          <button
            type="button"
            onClick={handleMoreLikeThis}
            disabled={!currentTrack}
            className="flex items-center gap-2 h-11 px-5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[14px] font-semibold text-white/85 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <ThumbsUp size={17} />
            {t('soundwave.moreLikeThis', 'Ещё такого')}
          </button>
        </div>

        <VibeTuner
          vibe={waveVibe}
          mode={waveMode}
          onVibeChange={setWaveVibe}
          onModeChange={setWaveMode}
          compact
        />

        <div className="min-h-[280px]">
          {anyLoading ? (
            <ClusterSkeletonState rows={3} itemsPerRow={6} />
          ) : showCold ? (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={playableTracks.length === 0}
                className="flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ease-[var(--ease-apple)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.93] hover:scale-[1.08]"
                style={{
                  background: 'var(--color-accent)',
                  boxShadow:
                    '0 8px 32px var(--color-accent-glow), 0 0 60px var(--color-accent-glow), inset 0 1px 0 rgba(255,255,255,0.30)',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-white/70">
                  {t('soundwave.coldTitle', 'Начать слушать')}
                </p>
                <p className="text-[12px] text-white/35 mt-1">
                  {t('soundwave.coldDesc', 'Лайкни пару треков — настроим волну')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {filteredAllTracks.length > 0 && (
                <ClusterRow
                  clusterId="wave"
                  title={
                    backendWorking
                      ? t('soundwave.home.waveTitle')
                      : localRecs.length > 0
                        ? t('home.recommended', 'Рекомендуем')
                        : t('library.likedTracks', 'Понравившиеся')
                  }
                  description={
                    backendWorking
                      ? t('soundwave.home.waveDesc')
                      : localRecs.length > 0
                        ? t('discover.subtitle', 'Подобрано по твоим лайкам')
                        : t('soundwave.idleSub', 'Ставь лайки — SoundWave настроит волну')
                  }
                  icon={backendWorking ? WAVE_ICON : <Sparkles size={14} />}
                  index={0}
                  tracks={filteredAllTracks}
                  queue={filteredAllTracks}
                />
              )}
              {orderedClusters.map((c, idx) =>
                (c.id === 'top_artists' || c.id === 'adjacent') && c.neighbors ? (
                  <NeighborsRow
                    key={c.id}
                    title={t(`soundwave.home.cluster.${c.id}`)}
                    description={t(`soundwave.home.cluster.${c.id}Desc`)}
                    icon={CLUSTER_ICON[c.id]}
                    index={idx + 1}
                    cluster={c}
                    queue={filteredAllTracks}
                  />
                ) : (
                  <ClusterRow
                    key={c.id}
                    clusterId={c.id}
                    title={t(`soundwave.home.cluster.${c.id}`)}
                    description={t(`soundwave.home.cluster.${c.id}Desc`)}
                    icon={CLUSTER_ICON[c.id]}
                    index={idx + 1}
                    tracks={c.tracks}
                    queue={filteredAllTracks}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
