/**
 * Discover / Каталог — страница открытия новой музыки.
 *
 * Разделы:
 *  1. Рекомендованные треки (ИИ, на основе лайков)
 *  2. Открывай по жанрам (фильтр-пилюли + карточки)
 *  3. Новые релизы подписок (Following)
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
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="glass-flat w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight text-white/88">{title}</h2>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white/30 hover:text-white/65 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.09] transition-all duration-200 cursor-pointer"
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
        icon={<Sparkles size={15} className="text-amber-400/80" />}
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
        icon={<Compass size={15} className="text-accent/85" />}
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
                  className={`glass-pill px-4 py-1.5 text-[12px] font-medium capitalize cursor-pointer transition-all duration-200 ${
                    active ? 'text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                  style={
                    active
                      ? {
                          background:
                            'linear-gradient(135deg, var(--color-accent-glow), rgba(255,255,255,0.12))',
                          borderColor: 'rgba(255,255,255,0.24)',
                          boxShadow: '0 4px 16px var(--color-accent-glow)',
                        }
                      : undefined
                  }
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
        icon={<Music size={15} className="text-white/55" />}
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
    <section className="pt-1 pb-2 animate-fade-in-scale">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background:
                'linear-gradient(135deg, var(--color-accent-glow), rgba(99,102,241,0.18))',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 16px rgba(0,0,0,0.25)',
            }}
          >
            <Compass size={22} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="syne text-2xl text-white/92 leading-tight">{t('nav.discover')}</h1>
            <p className="text-[12px] text-white/40 mt-0.5">
              {t('discover.subtitle', 'Explore music tailored to your taste')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/soundwave')}
          className="glass-pill px-4 py-2 text-[12px] font-semibold text-white/85 hover:text-white inline-flex items-center gap-2 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent-glow), rgba(255,255,255,0.06))',
            borderColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <AudioLines size={14} style={{ color: 'var(--color-accent)' }} />
          {t('nav.soundwave')}
        </button>
      </div>
      <div className="mt-4 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.03] to-transparent" />
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
