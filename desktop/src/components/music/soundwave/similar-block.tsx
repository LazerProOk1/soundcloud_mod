import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, Compass, Disc3, Headphones, playBlack14, Sparkles } from '../../../lib/icons';
import { usePlayerStore } from '../../../stores/player';
import {
  ClusterEmptyState,
  type ClusterId,
  ClusterRow,
  ClusterSkeletonState,
  NeighborsRow,
  useClusterWave,
} from '../cluster';
import { useInfiniteWave } from './use-infinite-wave';

interface Props {
  trackUrn: string;
}

const CLUSTER_ORDER: ClusterId[] = [
  'wave',
  'same_artist',
  'same_vibe',
  'featured_with',
  'fans_also',
];

const CLUSTER_ICON: Partial<Record<ClusterId, React.ReactNode>> = {
  wave: <AudioLines size={14} />,
  same_artist: <Disc3 size={14} />,
  same_vibe: <AudioLines size={14} />,
  featured_with: <Compass size={14} />,
  fans_also: <Headphones size={14} />,
};

export const SoundWaveSimilarBlock = React.memo(function SoundWaveSimilarBlock({
  trackUrn,
}: Props) {
  const { t } = useTranslation();
  const trackId = useMemo(() => trackUrn.split(':').pop() ?? '', [trackUrn]);

  const { data, isLoading } = useClusterWave({
    queryKey: ['cluster-wave', 'similar', trackId],
    url: trackId ? `/recommendations/similar/${encodeURIComponent(trackId)}` : null,
  });

  const clusters = data?.clusters ?? [];
  const allTracks = useMemo(() => data?.allTracks ?? [], [data]);

  const orderedClusters = useMemo(() => {
    const byId = new Map(clusters.map((c) => [c.id, c]));
    return CLUSTER_ORDER.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [clusters]);

  const waveCluster = useMemo(
    () => orderedClusters.find((c) => c.id === 'wave') ?? null,
    [orderedClusters],
  );

  useInfiniteWave({
    enabled: !!trackId,
    seedKind: 'track',
    seedId: trackId,
    initialTracks: waveCluster?.tracks ?? [],
    initialCursor: null,
  });

  const handlePlay = useCallback(() => {
    if (allTracks.length === 0) return;
    usePlayerStore.getState().play(allTracks[0], allTracks);
  }, [allTracks]);

  const showEmpty = !isLoading && orderedClusters.length === 0;
  const canPlay = allTracks.length > 0;

  return (
    <section className="relative rounded-2xl overflow-hidden select-none ui-card">
      <div className="relative p-5 md:p-6 flex flex-col gap-6" style={{ isolation: 'isolate' }}>
        <header className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent">
            <AudioLines size={17} style={{ color: 'var(--color-accent-contrast)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="soundwave-title text-[18px] font-black tracking-tight leading-none">
                {t('soundwave.similar.title')}
              </h2>
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bar-control text-[11px] font-semibold text-white/70">
                <Sparkles size={10} />
                AI
              </span>
            </div>
            <p className="text-[11.5px] text-white/45 mt-1 truncate">
              {t('soundwave.similar.desc')}
            </p>
          </div>

          {canPlay && (
            <button
              type="button"
              onClick={handlePlay}
              className="press flex items-center gap-2 pl-2.5 pr-4 h-9 rounded-full ui-accent font-semibold text-[13px] cursor-pointer"
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.9)' }}
              >
                {playBlack14}
              </span>
              {t('soundwave.similar.playAll')}
            </button>
          )}
        </header>

        {isLoading ? (
          <ClusterSkeletonState rows={2} itemsPerRow={6} />
        ) : showEmpty ? (
          <ClusterEmptyState
            title={t('soundwave.similar.empty')}
            description={t('soundwave.similar.emptyDesc')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {orderedClusters.map((c, idx) =>
              c.id === 'featured_with' && c.neighbors ? (
                <NeighborsRow
                  key={c.id}
                  title={t(`soundwave.similar.cluster.${c.id}`)}
                  description={t(`soundwave.similar.cluster.${c.id}Desc`)}
                  icon={CLUSTER_ICON[c.id]}
                  index={idx}
                  cluster={c}
                  queue={allTracks}
                />
              ) : (
                <ClusterRow
                  key={c.id}
                  clusterId={c.id}
                  title={t(`soundwave.similar.cluster.${c.id}`)}
                  description={t(`soundwave.similar.cluster.${c.id}Desc`)}
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
    </section>
  );
});
