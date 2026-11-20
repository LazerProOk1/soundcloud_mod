/**
 * Discover — browsing page for new music.
 *
 * Sections: recommended tracks (from likes), genre pills, subscription releases.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrackCard } from '../components/music/TrackCard';
import { HorizontalScroll } from '../components/ui/HorizontalScroll';
import { ShelfSkeleton } from '../components/ui/ShelfSkeleton';
import { Skeleton } from '../components/ui/Skeleton';
import {
  useBatchTrackHydration,
  useDiscoverData,
  useFollowingTracks,
  useLikedTracks,
  useRecommendedTracks,
  useRelatedPool,
} from '../lib/hooks';
import { AudioLines, ChevronRight, Compass, Music, Sparkles } from '../lib/icons';
import type { Track } from '../stores/player';

/* ── Section Header ────────────────────────────────────────── */

function SectionHeader({
  title,
  icon,
  onSeeAll,
}: {
  title: string;
  icon: React.ReactNode;
  onSeeAll?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="flex items-center gap-2.5 text-[24px] font-bold tracking-tight text-white">
        {icon}
        {title}
      </h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1 text-[13px] font-semibold text-white/55 hover:text-white cursor-pointer"
        >
          {t('common.seeAll')}
          <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

/* ── Recommended shelf ─────────────────────────────────────── */

const RecommendedShelf = React.memo(function RecommendedShelf({
  likedTracks,
}: {
  likedTracks: Track[];
}) {
  const { t } = useTranslation();
  const { data: pool, isLoading } = useRelatedPool(likedTracks);
  const tracks = useRecommendedTracks(pool, 40);

  if (!isLoading && tracks.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('home.recommended', 'Recommended For You')}
        icon={<Sparkles size={20} className="text-white/60" />}
      />
      <HorizontalScroll>
        {isLoading ? (
          <ShelfSkeleton />
        ) : (
          tracks.map((track, i) => (
            <div
              key={track.urn}
              className="w-[180px] shrink-0 animate-liquid-reveal"
              style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}
            >
              <TrackCard track={track} queue={tracks} />
            </div>
          ))
        )}
      </HorizontalScroll>
    </section>
  );
});

/* ── Genre discover ────────────────────────────────────────── */

const GenreDiscover = React.memo(function GenreDiscover({ likedTracks }: { likedTracks: Track[] }) {
  const { t } = useTranslation();
  const { data: pool, isLoading } = useRelatedPool(likedTracks);
  const discoverData = useDiscoverData(pool, likedTracks);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const genres = useMemo(() => discoverData.map((d) => d.genre), [discoverData]);
  const selectedGenre =
    activeGenre && genres.includes(activeGenre) ? activeGenre : (genres[0] ?? null);
  const genreTracks = useMemo(
    () => discoverData.find((d) => d.genre === selectedGenre)?.tracks ?? [],
    [discoverData, selectedGenre],
  );

  if (!isLoading && genres.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('home.discover', 'Discover by Genre')}
        icon={<Compass size={20} className="text-white/60" />}
      />

      {/* Genre pills */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))
          : genres.map((g) => {
              const active = selectedGenre === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setActiveGenre(g)}
                  className={`press h-8 rounded-full px-3.5 text-[13px] font-semibold capitalize cursor-pointer ${
                    active
                      ? 'bg-white text-black'
                      : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.11] hover:text-white'
                  }`}
                >
                  {g}
                </button>
              );
            })}
      </div>

      <HorizontalScroll>
        {isLoading ? (
          <ShelfSkeleton />
        ) : (
          genreTracks.map((track, i) => (
            <div
              key={track.urn}
              className="w-[180px] shrink-0 animate-liquid-reveal"
              style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}
            >
              <TrackCard track={track} queue={genreTracks} />
            </div>
          ))
        )}
      </HorizontalScroll>
    </section>
  );
});

/* ── Following new releases ────────────────────────────────── */

const FollowingShelf = React.memo(function FollowingShelf() {
  const { t } = useTranslation();
  const { data, isLoading } = useFollowingTracks(30);
  const tracks = useMemo(() => data?.collection ?? [], [data]);

  if (!isLoading && tracks.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('home.freshReleases', 'Fresh Releases')}
        icon={<Music size={20} className="text-white/60" />}
      />
      <HorizontalScroll>
        {isLoading ? (
          <ShelfSkeleton count={6} />
        ) : (
          tracks.map((track, i) => (
            <div
              key={track.urn}
              className="w-[180px] shrink-0 animate-liquid-reveal"
              style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}
            >
              <TrackCard track={track} queue={tracks} />
            </div>
          ))
        )}
      </HorizontalScroll>
    </section>
  );
});

/* ── Page hero header ──────────────────────────────────────── */

function DiscoverHero() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="flex flex-wrap items-end justify-between gap-4 pt-1">
      <div>
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-white">
          {t('nav.discover')}
        </h1>
        <p className="mt-1 text-[14px] text-white/50">
          {t('discover.subtitle', 'Explore music tailored to your taste')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/soundwave')}
        className="press inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white cursor-pointer"
      >
        <AudioLines size={16} style={{ color: 'var(--color-accent)' }} />
        {t('nav.soundwave')}
      </button>
    </section>
  );
}

/* ── Discover Page ─────────────────────────────────────────── */

export function Discover() {
  const likedQuery = useLikedTracks(100);
  const likedTracks = useMemo(() => likedQuery.tracks, [likedQuery.tracks]);
  useBatchTrackHydration(likedTracks);

  return (
    <div className="p-6 pb-4 space-y-8 page-enter">
      <DiscoverHero />
      <RecommendedShelf likedTracks={likedTracks} />
      <GenreDiscover likedTracks={likedTracks} />
      <FollowingShelf />
    </div>
  );
}
