import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Aura, auraRgb, isLight } from '../../../lib/aura';
import {
  AudioLines,
  ChevronDown,
  Compass,
  Disc3,
  pauseBlack14,
  pauseWhite14,
  playBlack14,
  playWhite14,
  Star,
} from '../../../lib/icons';
import { usePlayerStore } from '../../../stores/player';
import { useSettingsStore } from '../../../stores/settings';
import {
  ClusterEmptyState,
  type ClusterId,
  ClusterRow,
  ClusterSkeletonState,
  NeighborsRow,
  useClusterWave,
} from '../../music/cluster';
import { useInfiniteWave } from '../../music/soundwave/use-infinite-wave';

interface Props {
  artistId: string;
  artistName: string;
  aura: Aura;
}

const CLUSTER_ORDER: ClusterId[] = ['wave', 'essence', 'vibe', 'neighbors', 'deep'];

const CLUSTER_ICON: Partial<Record<ClusterId, React.ReactNode>> = {
  wave: <AudioLines size={14} />,
  essence: <Disc3 size={14} />,
  vibe: <AudioLines size={14} />,
  neighbors: <Compass size={14} />,
  deep: <Star size={14} />,
};

const WAVE_KEYFRAMES = `
@keyframes artistWaveEq {
  0%,100% { transform: scaleY(0.35); }
  50%     { transform: scaleY(1); }
}
`;

const EASE = 'cubic-bezier(0.32, 0.72, 0.24, 1)';

function EqualizerBars() {
  return (
    <div className="flex items-end gap-[2.5px] h-[14px]" aria-hidden>
      {[0.15, 0, 0.3, 0.05].map((delay, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full"
          style={{
            height: '100%',
            background: 'currentColor',
            transformOrigin: 'bottom',
            animation: `artistWaveEq ${0.8 + i * 0.07}s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export const ArtistSoundWave = React.memo(function ArtistSoundWave({
  artistId,
  artistName,
  aura,
}: Props) {
  const { t } = useTranslation();
  const collapsed = useSettingsStore((s) => s.artistWaveCollapsed);
  const setCollapsed = useSettingsStore((s) => s.setArtistWaveCollapsed);

  const { data, isLoading } = useClusterWave({
    queryKey: ['cluster-wave', 'artist', artistId],
    url: artistId ? `/recommendations/artist/${encodeURIComponent(artistId)}` : null,
  });

  const currentUrn = usePlayerStore((s) => s.currentTrack?.urn);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const clusters = data?.clusters ?? [];
  const allTracks = useMemo(() => data?.allTracks ?? [], [data]);
  const waveUrns = useMemo(() => new Set(allTracks.map((t) => t.urn)), [allTracks]);
  const isPlayingFromWave = isPlaying && !!currentUrn && waveUrns.has(currentUrn);

  const orderedClusters = useMemo(() => {
    const byId = new Map(clusters.map((c) => [c.id, c]));
    return CLUSTER_ORDER.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [clusters]);

  const waveCluster = useMemo(
    () => orderedClusters.find((c) => c.id === 'wave') ?? null,
    [orderedClusters],
  );

  useInfiniteWave({
    enabled: !!artistId,
    seedKind: 'artist',
    seedId: artistId,
    initialTracks: waveCluster?.tracks ?? [],
    initialCursor: null,
  });

  const handlePlay = useCallback(() => {
    if (allTracks.length === 0) return;
    const { play, pause, resume } = usePlayerStore.getState();
    if (isPlayingFromWave) {
      pause();
      return;
    }
    if (currentUrn && waveUrns.has(currentUrn)) {
      resume();
      return;
    }
    play(allTracks[0], allTracks);
  }, [allTracks, currentUrn, isPlayingFromWave, waveUrns]);

  const lightAura = isLight(aura);
  const showEmpty = !isLoading && orderedClusters.length === 0;
  const canPlay = allTracks.length > 0;

  const playIcon = isPlayingFromWave
    ? lightAura
      ? pauseBlack14
      : pauseWhite14
    : lightAura
      ? playBlack14
      : playWhite14;

  return (
    <section
      className="relative rounded-2xl overflow-hidden select-none ui-card"
      style={
        {
          '--color-accent': auraRgb(aura),
          '--color-accent-glow': 'transparent',
          '--color-accent-hover': auraRgb(aura),
          '--color-accent-contrast': lightAura ? '#000' : '#fff',
        } as React.CSSProperties
      }
    >
      <style>{WAVE_KEYFRAMES}</style>

      <div className="relative" style={{ isolation: 'isolate' }}>
        {/* HEADER — always visible */}
        <div className="flex items-center gap-3 md:gap-4 p-3 md:p-3.5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-accent text-[var(--color-accent-contrast)]">
            {isPlayingFromWave ? <EqualizerBars /> : <AudioLines size={20} />}
          </div>

          {/* title + caption */}
          <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[16px] font-bold text-white truncate leading-tight">
                {t('artist.wave.title')}
              </span>
            </div>
            <p className="text-[13px] text-white/50 truncate" title={artistName}>
              {t('artist.wave.desc', { name: artistName })}
            </p>
          </div>

          <button
            type="button"
            onClick={handlePlay}
            disabled={!canPlay || isLoading}
            className="press inline-flex items-center gap-2 h-9 pl-3 pr-4 rounded-full ui-accent text-[13px] font-semibold cursor-pointer shrink-0"
          >
            {playIcon}
            <span className="whitespace-nowrap">
              {isPlayingFromWave ? t('artist.wave.pause') : t('artist.wave.playAll')}
            </span>
          </button>

          {/* chevron (rotates via CSS transform transition) */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            className="press w-9 h-9 rounded-full flex items-center justify-center cursor-pointer bar-control text-white/70 hover:text-white shrink-0"
          >
            <ChevronDown
              size={14}
              className="transition-transform"
              style={{
                transition: `transform 0.5s ${EASE}`,
                transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              }}
            />
          </button>
        </div>

        {/* COLLAPSIBLE BODY — pure CSS grid-template-rows 0fr ↔ 1fr */}
        <div
          className="grid"
          style={{
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            transition: `grid-template-rows 0.55s ${EASE}`,
          }}
        >
          <div className="overflow-hidden min-h-0">
            <div
              style={{
                transition: `opacity 0.4s ${EASE}`,
                transitionDelay: collapsed ? '0s' : '0.12s',
                opacity: collapsed ? 0 : 1,
              }}
            >
              <div className="mx-4 md:mx-5 h-px bg-white/[0.06]" />

              <div className="relative p-5 md:p-6 pt-6 md:pt-7">
                {isLoading ? (
                  <ClusterSkeletonState />
                ) : showEmpty ? (
                  <ClusterEmptyState
                    title={t('artist.wave.empty')}
                    description={t('artist.wave.emptyDesc')}
                  />
                ) : (
                  <div className="relative flex flex-col gap-7">
                    {orderedClusters.map((c, idx) =>
                      c.id === 'neighbors' && c.neighbors ? (
                        <NeighborsRow
                          key={c.id}
                          title={t(`artist.wave.cluster.${c.id}`)}
                          description={t(`artist.wave.cluster.${c.id}Desc`)}
                          icon={CLUSTER_ICON[c.id]}
                          index={idx}
                          cluster={c}
                          queue={allTracks}
                        />
                      ) : (
                        <ClusterRow
                          key={c.id}
                          clusterId={c.id}
                          title={t(`artist.wave.cluster.${c.id}`)}
                          description={t(`artist.wave.cluster.${c.id}Desc`)}
                          icon={CLUSTER_ICON[c.id]}
                          index={idx}
                          tracks={c.tracks}
                          queue={allTracks}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
