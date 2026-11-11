import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrackCard } from '../components/music/TrackCard';
import { HorizontalScroll } from '../components/ui/HorizontalScroll';
import { Skeleton } from '../components/ui/Skeleton';
import {
  useBatchTrackHydration,
  useDiscoverData,
  useFollowingTracks,
  useLikedTracks,
  useRecommendedTracks,
  useRelatedPool,
} from '../lib/hooks';
import { ChevronRight, Compass, Headphones, Heart, Music, Sparkles } from '../lib/icons';
import {
  getOfflineFollowingTracks,
  getOfflineLikedTracks,
  getRecentlyPlayed,
} from '../lib/offline-index';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';

/* ── Helpers ──────────────────────────────────────────────── */

function greetingKey() {
  const h = new Date().getHours();
  if (h < 6) return 'home.goodNight';
  if (h < 12) return 'home.goodMorning';
  if (h < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

/* ── Section Header ───────────────────────────────────────── */

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
        <h2 className="text-[17px] font-semibold tracking-tight text-white/92">{title}</h2>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white/45 hover:text-white/80 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200 cursor-pointer"
        >
          {t('common.seeAll')}
          <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

/* ── Skeletons ────────────────────────────────────────────── */

function ShelfSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[180px] shrink-0">
          <Skeleton className="aspect-square w-full" rounded="lg" />
          <Skeleton className="h-4 w-3/4 mt-2.5" rounded="sm" />
          <Skeleton className="h-3 w-1/2 mt-1.5" rounded="sm" />
        </div>
      ))}
    </>
  );
}

/* ── Featured Card (hero, first feed track) ───────────────── */

/* ── Feed Track Card (compact horizontal) ─────────────────── */

/* ── Feed Playlist Card ───────────────────────────────────── */

/* ── Isolated Sections ────────────────────────────────────── */

// FallbackShelf удалён — содержал захардкоженные треки оригинального автора

const LikedShelf = React.memo(function LikedShelf({
  likedTracks,
  isLoading,
}: {
  likedTracks: Track[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [offlineLiked, setOfflineLiked] = useState<Track[]>([]);

  useEffect(() => {
    getOfflineLikedTracks()
      .then(setOfflineLiked)
      .catch(() => {});
  }, []);

  const displayTracks = likedTracks.length > 0 ? likedTracks : offlineLiked;
  const showSkeleton = isLoading && displayTracks.length === 0;

  if (!showSkeleton && displayTracks.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('library.likedTracks')}
        icon={<Heart size={15} className="text-accent" />}
        onSeeAll={() => navigate('/library')}
      />
      <HorizontalScroll>
        {showSkeleton ? (
          <ShelfSkeleton />
        ) : (
          displayTracks.map((track) => (
            <div key={track.urn} className="w-[180px] shrink-0">
              <TrackCard track={track} queue={displayTracks} />
            </div>
          ))
        )}
      </HorizontalScroll>
    </section>
  );
});

const FollowingShelf = React.memo(function FollowingShelf({
  followingTracks,
  isLoading,
}: {
  followingTracks: Track[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [offlineFollowing, setOfflineFollowing] = useState<Track[]>([]);

  useEffect(() => {
    getOfflineFollowingTracks()
      .then(setOfflineFollowing)
      .catch(() => {});
  }, []);

  const source = followingTracks.length > 0 ? followingTracks : offlineFollowing;
  // One card per release: tracks of the same album share artwork, keep the first.
  const displayTracks = useMemo(() => {
    const seen = new Set<string>();
    return source.filter((t) => {
      const key = t.artwork_url || t.urn;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [source]);
  const showSkeleton = isLoading && displayTracks.length === 0;

  if (!showSkeleton && displayTracks.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('home.freshReleases')}
        icon={<Music size={15} className="text-white/50" />}
      />
      <HorizontalScroll>
        {showSkeleton ? (
          <ShelfSkeleton />
        ) : (
          displayTracks.map((track) => (
            <div key={track.urn} className="w-[180px] shrink-0">
              <TrackCard track={track} queue={displayTracks} />
            </div>
          ))
        )}
      </HorizontalScroll>
    </section>
  );
});

const RecentlyPlayedShelf = React.memo(function RecentlyPlayedShelf() {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    getRecentlyPlayed()
      .then(setTracks)
      .catch(() => {});
  }, []);

  if (tracks.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t('home.recentlyPlayed', 'Recently Played')}
        icon={<Headphones size={15} className="text-white/50" />}
      />
      <HorizontalScroll>
        {tracks.map((track) => (
          <div key={track.urn} className="w-[180px] shrink-0">
            <TrackCard track={track} queue={tracks} />
          </div>
        ))}
      </HorizontalScroll>
    </section>
  );
});

const DiscoverSection = React.memo(function DiscoverSection({
  likedTracks,
}: {
  likedTracks: Track[];
}) {
  const { t } = useTranslation();
  const { data: pool, isLoading } = useRelatedPool(likedTracks);

  // ── Recommended ──
  const recommendedTracks = useRecommendedTracks(pool, 40);
  useBatchTrackHydration(recommendedTracks);

  // ── Discover by genre ──
  const discoverData = useDiscoverData(pool, likedTracks);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const genres = useMemo(() => discoverData.map((d) => d.genre), [discoverData]);
  const selectedGenre =
    activeGenre && genres.includes(activeGenre) ? activeGenre : (genres[0] ?? null);
  const genreTracks = useMemo(
    () => discoverData.find((d) => d.genre === selectedGenre)?.tracks ?? [],
    [discoverData, selectedGenre],
  );

  return (
    <>
      {/* Recommended For You */}
      {(isLoading || recommendedTracks.length > 0) && (
        <section>
          <SectionHeader
            title={t('home.recommended', 'Recommended For You')}
            icon={<Sparkles size={15} className="text-amber-400/70" />}
          />
          <HorizontalScroll>
            {isLoading ? (
              <ShelfSkeleton />
            ) : (
              recommendedTracks.map((track, i) => (
                <div
                  key={track.urn}
                  className="w-[180px] shrink-0 animate-liquid-reveal"
                  style={{ animationDelay: `${Math.min(i * 45, 540)}ms` }}
                >
                  <TrackCard track={track} queue={recommendedTracks} />
                </div>
              ))
            )}
          </HorizontalScroll>
        </section>
      )}

      {/* Discover by genre */}
      {(isLoading || genres.length > 0) && (
        <section>
          <SectionHeader
            title={t('home.discover', 'Discover')}
            icon={<Compass size={15} className="text-cyan-400/70" />}
          />
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {genres.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGenre(g)}
                className={`glass-pill px-3.5 py-1.5 text-[12px] font-medium capitalize ${
                  selectedGenre === g ? 'text-white/92' : 'text-white/45 !bg-white/[0.04]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <HorizontalScroll>
            {isLoading ? (
              <ShelfSkeleton />
            ) : (
              genreTracks.map((track, i) => (
                <div
                  key={track.urn}
                  className="w-[180px] shrink-0 animate-liquid-reveal"
                  style={{ animationDelay: `${Math.min(i * 45, 540)}ms` }}
                >
                  <TrackCard track={track} queue={genreTracks} />
                </div>
              ))
            )}
          </HorizontalScroll>
        </section>
      )}
    </>
  );
});

/* ── Home Page ────────────────────────────────────────────── */

export function Home() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const likedTracksQuery = useLikedTracks(100);
  const followingQuery = useFollowingTracks(20);

  // Hydrate full metadata for liked + following tracks (may lack publisher_metadata)
  useBatchTrackHydration(likedTracksQuery.tracks ?? []);
  useBatchTrackHydration(followingQuery.data?.collection ?? []);

  const followingTracks = useMemo(
    () => followingQuery.data?.collection ?? [],
    [followingQuery.data],
  );
  const likedShelfTracks = useMemo(
    () => likedTracksQuery.tracks.slice(0, 50),
    [likedTracksQuery.tracks],
  );

  return (
    <div className="p-6 pb-4 space-y-8">
      {/* Hero Greeting — no data hooks, won't re-render */}
      <section className="pt-1 animate-fade-in-scale">
        <h1 className="hero-greeting syne text-3xl leading-tight pb-1">
          {t(greetingKey())}
          {user?.username ? `, ${user.username}` : ''}
        </h1>
      </section>

      {/* Each section is isolated — own hooks, own re-render boundary */}
      <LikedShelf likedTracks={likedShelfTracks} isLoading={likedTracksQuery.isLoading} />
      <FollowingShelf followingTracks={followingTracks} isLoading={followingQuery.isLoading} />
      <RecentlyPlayedShelf />
      <DiscoverSection likedTracks={likedTracksQuery.tracks} />
    </div>
  );
}
