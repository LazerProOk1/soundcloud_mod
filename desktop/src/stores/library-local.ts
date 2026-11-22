import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tauriStorage } from '../lib/tauri-storage';
import type { Track } from './player';

/**
 * Library state kept on this device only (the backend has no API for it):
 * the list of disliked tracks and a custom order for liked tracks.
 */
interface LibraryLocalState {
  disliked: Track[];
  likesTop: string[];
  likesBottom: string[];
  rememberDislike: (track: Track, disliked: boolean) => void;
  moveLiked: (urn: string, where: 'top' | 'bottom') => void;
  resetLikesOrder: () => void;
}

const MAX_DISLIKED = 2000;

function slim(track: Track): Track {
  // Keep only what the rows need, so the persisted file stays small.
  const { urn, title, artwork_url, duration, user, permalink_url, publisher_metadata } = track;
  return { urn, title, artwork_url, duration, user, permalink_url, publisher_metadata } as Track;
}

export const useLibraryLocalStore = create<LibraryLocalState>()(
  persist(
    (set) => ({
      disliked: [],
      likesTop: [],
      likesBottom: [],
      rememberDislike: (track, disliked) =>
        set((s) => {
          const rest = s.disliked.filter((t) => t.urn !== track.urn);
          return { disliked: disliked ? [slim(track), ...rest].slice(0, MAX_DISLIKED) : rest };
        }),
      moveLiked: (urn, where) =>
        set((s) => {
          const top = s.likesTop.filter((u) => u !== urn);
          const bottom = s.likesBottom.filter((u) => u !== urn);
          return where === 'top'
            ? { likesTop: [urn, ...top], likesBottom: bottom }
            : { likesTop: top, likesBottom: [...bottom, urn] };
        }),
      resetLikesOrder: () => set({ likesTop: [], likesBottom: [] }),
    }),
    {
      name: 'sc-library-local',
      storage: createJSONStorage(() => tauriStorage),
    },
  ),
);

/** Applies the user's "move to top / bottom" order on top of the server order. */
export function orderLikes(tracks: Track[], top: string[], bottom: string[]): Track[] {
  if (top.length === 0 && bottom.length === 0) return tracks;
  const rank = new Map<string, number>();
  top.forEach((u, i) => {
    rank.set(u, i - top.length);
  });
  bottom.forEach((u, i) => {
    rank.set(u, tracks.length + i);
  });
  return tracks
    .map((t, i) => ({ t, r: rank.get(t.urn) ?? i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.t);
}
