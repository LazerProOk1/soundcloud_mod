import type { QueryClient } from '@tanstack/react-query';
import { type Track, usePlayerStore } from '../stores/player';
import { api } from './api';
import { toggleDislike } from './dislikes';
import { invalidateAllLikesCache } from './hooks';
import { optimisticToggleLike } from './likes';

/** Optimistically (un)likes a track; rolls the cache back and returns false on failure. */
export async function setTrackLiked(
  qc: QueryClient,
  track: Track,
  liked: boolean,
): Promise<boolean> {
  optimisticToggleLike(qc, track, liked);
  invalidateAllLikesCache();
  try {
    await api(`/likes/tracks/${encodeURIComponent(track.urn)}`, {
      method: liked ? 'POST' : 'DELETE',
    });
    return true;
  } catch {
    optimisticToggleLike(qc, track, !liked);
    return false;
  }
}

/** Dislikes or un-dislikes a track. Disliking also unlikes it and skips it if it is playing. */
export async function setTrackDisliked(qc: QueryClient, track: Track, disliked: boolean) {
  if (disliked && track.user_favorite) void setTrackLiked(qc, track, false);
  if (disliked) {
    const { currentTrack, next } = usePlayerStore.getState();
    if (currentTrack?.urn === track.urn) next();
  }
  await toggleDislike(qc, track, disliked);
}
