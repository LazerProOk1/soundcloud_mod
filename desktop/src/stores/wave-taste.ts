import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tauriStorage } from '../lib/tauri-storage';
import {
  EMPTY_TASTE,
  onFinished,
  onMoreLikeThis,
  onNotThis,
  onPlayed,
  onSkip,
  type Taste,
} from '../lib/wave-rank';
import type { Track } from './player';

const MAX_SEEDS = 6;

interface WaveTasteState extends Taste {
  /** "More like this" tracks: their related tracks lead the wave. */
  seeds: Track[];
  played: (track: Track) => void;
  skipped: (track: Track, playedSecs: number) => void;
  finished: (track: Track) => void;
  notThis: (track: Track) => void;
  moreLikeThis: (track: Track) => void;
  reset: () => void;
}

const taste = (s: WaveTasteState): Taste => ({
  artists: s.artists,
  banned: s.banned,
  recent: s.recent,
});

/** What the wave learned about the listener. Persisted between sessions. */
export const useWaveTasteStore = create<WaveTasteState>()(
  persist(
    (set) => ({
      ...EMPTY_TASTE,
      seeds: [],
      played: (track) => set((s) => onPlayed(taste(s), track)),
      skipped: (track, secs) => set((s) => onSkip(taste(s), track, secs)),
      finished: (track) => set((s) => onFinished(taste(s), track)),
      notThis: (track) => set((s) => onNotThis(taste(s), track)),
      moreLikeThis: (track) =>
        set((s) => ({
          ...onMoreLikeThis(taste(s), track),
          seeds: [track, ...s.seeds.filter((x) => x.urn !== track.urn)].slice(0, MAX_SEEDS),
        })),
      reset: () => set({ ...EMPTY_TASTE, seeds: [] }),
    }),
    {
      name: 'sc-wave-taste',
      storage: createJSONStorage(() => tauriStorage),
      version: 1,
      partialize: (s) => ({
        artists: s.artists,
        banned: s.banned,
        recent: s.recent,
        // Only what's needed to fetch related tracks for the seeds.
        seeds: s.seeds.map((t) => ({ urn: t.urn, title: t.title, user: t.user }) as Track),
      }),
    },
  ),
);
