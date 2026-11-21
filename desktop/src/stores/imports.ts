import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ImportItem } from '../lib/import-match';
import { tauriStorage } from '../lib/tauri-storage';
import type { Track } from './player';

export type ImportRowState = 'pending' | 'found' | 'missing';

export interface ImportRow extends ImportItem {
  state: ImportRowState;
  track?: Track;
}

/** running: searching · paused: SoundCloud refused, waits for "Continue" · done: saved. */
export type ImportStatus = 'running' | 'paused' | 'done';

export interface ImportJob {
  id: string;
  title: string;
  createdAt: number;
  status: ImportStatus;
  rows: ImportRow[];
  /** SoundCloud playlist the found tracks were saved to. */
  playlistUrn?: string | null;
}

interface ImportsState {
  jobs: ImportJob[];
  add: (title: string, items: ImportItem[]) => string;
  setRow: (id: string, index: number, row: Partial<ImportRow>) => void;
  update: (id: string, patch: Partial<ImportJob>) => void;
  remove: (id: string) => void;
}

function slim(track: Track): Track {
  // Keep only what the rows and the player need, so the persisted file stays small.
  const { id, urn, title, artwork_url, duration, user, permalink_url, access } = track;
  return { id, urn, title, artwork_url, duration, user, permalink_url, access } as Track;
}

const patchJob = (jobs: ImportJob[], id: string, fn: (j: ImportJob) => ImportJob) =>
  jobs.map((j) => (j.id === id ? fn(j) : j));

/**
 * Imports from other services, kept on this device: the playlist shows every song name right
 * away and fills in as SoundCloud matches are found in the background.
 */
export const useImportsStore = create<ImportsState>()(
  persist(
    (set) => ({
      jobs: [],
      add: (title, items) => {
        const id = `imp-${Date.now().toString(36)}`;
        const job: ImportJob = {
          id,
          title,
          createdAt: Date.now(),
          status: 'running',
          rows: items.map((it) => ({ ...it, state: 'pending' })),
        };
        set((s) => ({ jobs: [job, ...s.jobs] }));
        return id;
      },
      setRow: (id, index, row) =>
        set((s) => ({
          jobs: patchJob(s.jobs, id, (j) => {
            const rows = [...j.rows];
            const next = { ...rows[index], ...row };
            if (row.track) next.track = slim(row.track);
            rows[index] = next;
            return { ...j, rows };
          }),
        })),
      update: (id, patch) =>
        set((s) => ({ jobs: patchJob(s.jobs, id, (j) => ({ ...j, ...patch })) })),
      remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
    }),
    {
      name: 'sc-imports',
      storage: createJSONStorage(() => tauriStorage),
    },
  ),
);

export function importCounts(job: ImportJob) {
  let found = 0;
  let done = 0;
  for (const r of job.rows) {
    if (r.state !== 'pending') done++;
    if (r.state === 'found') found++;
  }
  return { found, done, total: job.rows.length };
}
