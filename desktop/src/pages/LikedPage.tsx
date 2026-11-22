import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackListPage } from '../components/music/TrackListPage';
import { ALL_LIKES_PAGE_SIZE, useLikedTracks } from '../lib/hooks';
import { Heart, Loader2 } from '../lib/icons';
import { useAuthStore } from '../stores/auth';
import { orderLikes, useLibraryLocalStore } from '../stores/library-local';

export function LikedPage() {
  const { t } = useTranslation();
  const total = useAuthStore((s) => s.user?.public_favorites_count);
  // Every page loads in the background: shuffle covers all likes and scrolling never waits.
  const likes = useLikedTracks(ALL_LIKES_PAGE_SIZE, true);
  const likesTop = useLibraryLocalStore((s) => s.likesTop);
  const likesBottom = useLibraryLocalStore((s) => s.likesBottom);
  const tracks = useMemo(
    () => orderLikes(likes.tracks, likesTop, likesBottom),
    [likes.tracks, likesTop, likesBottom],
  );

  return (
    <TrackListPage
      kind={t('sidebar.playlist')}
      title={t('library.likedTracks')}
      tile={
        <div
          className="w-full h-full flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #a5b4fc)' }}
        >
          <Heart size={72} fill="currentColor" />
        </div>
      }
      tracks={tracks}
      // SoundCloud's profile count skips private and removed uploads that the likes list
      // still returns: once every page is in, the real list length is the count.
      totalCount={
        likes.hasNextPage || likes.isLoading
          ? Math.max(total ?? 0, likes.tracks.length)
          : likes.tracks.length
      }
      isLoading={likes.isLoading}
      downloadable
      footer={
        <div className="h-12 flex items-center justify-center">
          {likes.isFetchingNextPage && <Loader2 size={20} className="text-white/30 animate-spin" />}
        </div>
      }
    />
  );
}
