import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SoundWaveBlock } from '../components/music/soundwave';
import { TrackCard } from '../components/music/TrackCard';
import { HorizontalScroll } from '../components/ui/HorizontalScroll';
import { Skeleton } from '../components/ui/Skeleton';
import { useBatchTrackHydration, useFollowingTracks, useLikedTracks } from '../lib/hooks';
import {
  AudioLines,
  ChevronRight,
  Compass,
  Download,
  Headphones,
  Heart,
  Library,
  Music,
} from '../lib/icons';
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
        onSeeAll={() => navigate('/library?tab=history')}
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
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    <div className="p-6 pb-4 space-y-8 page-enter">
      {/* Hero Greeting + Quick Navigation Pills */}
      <section className="pt-1 flex flex-wrap items-center justify-between gap-4 animate-fade-in-scale">
        <h1 className="hero-greeting syne text-3xl leading-tight pb-1">
          {t(greetingKey())}
          {user?.username ? `, ${user.username}` : ''}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/soundwave')}
            className="glass-pill px-3.5 py-1.5 text-[12px] font-semibold text-white/90 inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              background:
                'linear-gradient(135deg, var(--color-accent-glow), rgba(255,255,255,0.06))',
              borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <AudioLines size={13} style={{ color: 'var(--color-accent)' }} />
            {t('nav.soundwave')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/discover')}
            className="glass-pill px-3.5 py-1.5 text-[12px] font-medium text-white/65 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Compass size={13} />
            {t('nav.discover')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="glass-pill px-3.5 py-1.5 text-[12px] font-medium text-white/65 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Library size={13} />
            {t('nav.library')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/offline')}
            className="glass-pill px-3.5 py-1.5 text-[12px] font-medium text-white/65 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={13} />
            {t('nav.offline')}
          </button>
        </div>
      </section>

      {/* Personal SoundWave Block right on the Home screen */}
      <SoundWaveBlock />

      {/* Personal shelves: Recently Played -> Liked -> Fresh Releases */}
      <RecentlyPlayedShelf />
      <LikedShelf likedTracks={likedShelfTracks} isLoading={likedTracksQuery.isLoading} />
      <FollowingShelf followingTracks={followingTracks} isLoading={followingQuery.isLoading} />
    </div>
  );
}
