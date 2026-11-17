import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrackCard } from '../components/music/TrackCard';
import { HorizontalScroll } from '../components/ui/HorizontalScroll';
import { Skeleton } from '../components/ui/Skeleton';
import { art } from '../lib/formatters';
import {
  useBatchTrackHydration,
  useFollowingTracks,
  useLikedTracks,
  useMyPlaylists,
} from '../lib/hooks';
import { Clock, Headphones, Heart, ListMusic, Music } from '../lib/icons';
import {
  getOfflineFollowingTracks,
  getOfflineLikedTracks,
  getRecentlyPlayed,
} from '../lib/offline-index';
import type { Track } from '../stores/player';
import { SoundWavePage } from './SoundWavePage';

/* ── Helpers ──────────────────────────────────────────────── */

/* ── Section Header ───────────────────────────────────────── */

function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  icon?: React.ReactNode;
  onSeeAll?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-end justify-between mb-4">
      <h2 className="text-[24px] font-bold tracking-tight text-white">{title}</h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-[13px] font-semibold text-white/55 hover:text-white hover:underline cursor-pointer"
        >
          {t('common.seeAll')}
        </button>
      )}
    </div>
  );
}

/* ── Quick access tiles (liked, history, own playlists) ──── */

const QuickTiles = React.memo(function QuickTiles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playlists } = useMyPlaylists(50);
  const gradient = (from: string, to: string, icon: React.ReactNode) => (
    <div
      className="w-full h-full flex items-center justify-center text-white"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {icon}
    </div>
  );
  const tiles: { key: string; title: string; to: string; tile: React.ReactNode }[] = [
    {
      key: 'liked',
      title: t('library.likedTracks'),
      to: '/liked',
      tile: gradient('#4f46e5', '#a5b4fc', <Heart size={22} fill="currentColor" />),
    },
    ...playlists.slice(0, 4).map((p) => {
      const cover = art(p.artwork_url ?? p.tracks?.[0]?.artwork_url, 't200x200');
      return {
        key: p.urn,
        title: p.title,
        to: `/playlist/${encodeURIComponent(p.urn)}`,
        tile: cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.08] text-white/50">
            <ListMusic size={22} />
          </div>
        ),
      };
    }),
    {
      key: 'history',
      title: t('home.recentlyPlayed', 'Recently Played'),
      to: '/history',
      tile: gradient('#86198f', '#e879f9', <Clock size={22} />),
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
      {tiles.map((tile, i) => (
        <button
          key={tile.key}
          type="button"
          onClick={() => navigate(tile.to)}
          className="quick-tile group flex items-center gap-3 h-16 rounded-md overflow-hidden bg-white/[0.07] hover:bg-white/[0.14] text-left cursor-pointer"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="w-16 h-16 shrink-0">{tile.tile}</div>
          <span className="flex-1 min-w-0 truncate text-[14px] font-bold text-white pr-3">
            {tile.title}
          </span>
        </button>
      ))}
    </div>
  );
});

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

/* ── Recently played ──────────────────────────────────────── */

const RecentlyPlayedShelf = React.memo(function RecentlyPlayedShelf() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        icon={<Headphones size={15} className="text-white/60" />}
        onSeeAll={() => navigate('/history')}
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

/* ── Liked tracks ─────────────────────────────────────────── */

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
        onSeeAll={() => navigate('/liked')}
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

/* ── Following releases ───────────────────────────────────── */

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
        icon={<Music size={15} className="text-white/55" />}
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

/* ── Home Page ────────────────────────────────────────────── */

export function Home() {
  const likedTracksQuery = useLikedTracks(100);
  const followingQuery = useFollowingTracks(20);

  // Stable array identities: the hydration hook compares URN lists, but a brand-new
  // array on every render still rebuilds that comparison key.
  const likedTracks = useMemo(() => likedTracksQuery.tracks ?? [], [likedTracksQuery.tracks]);
  const followingTracks = useMemo(
    () => followingQuery.data?.collection ?? [],
    [followingQuery.data],
  );

  // Hydrate full metadata for liked + following tracks (may lack publisher_metadata)
  useBatchTrackHydration(likedTracks);
  useBatchTrackHydration(followingTracks);

  const likedShelfTracks = useMemo(() => likedTracks.slice(0, 50), [likedTracks]);

  return (
    <div className="page-enter">
      {/* One SoundWave: the full wave page is the top of Home (no separate home block). */}
      <SoundWavePage />

      <div className="px-8 pt-2 pb-6 space-y-9">
        <QuickTiles />
        {/* Personal shelves: Recently Played -> Liked -> Fresh Releases */}
        <RecentlyPlayedShelf />
        <LikedShelf likedTracks={likedShelfTracks} isLoading={likedTracksQuery.isLoading} />
        <FollowingShelf followingTracks={followingTracks} isLoading={followingQuery.isLoading} />
      </div>
    </div>
  );
}
