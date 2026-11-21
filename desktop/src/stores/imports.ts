import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ImportItem } from '../lib/import-match';
import { tauriStorage } from '../lib/tauri-storage';
import type { Track } from './player';

/** duplicate: the SoundCloud match is already in this import under another row. */
export type ImportRowState = 'pending' | 'found' | 'missing' | 'duplicate';

export interface ImportRow extends ImportItem {
  /** Stable id inside the job: rows can be removed while the search runs. */
  key: number;
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
  setRow: (id: string, key: number, row: Partial<ImportRow>) => void;
  removeRow: (id: string, key: number) => void;
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
        // The same song listed twice in the source is imported once.
        const seen = new Set<string>();
        items = items.filter((it) => {
          const k = it.urn ?? `${it.artist}|${it.title}`.toLowerCase().replace(/\s+/g, ' ').trim();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const job: ImportJob = {
          id,
          title,
          createdAt: Date.now(),
          status: 'running',
          rows: items.map((it, key) => ({ ...it, key, state: 'pending' })),
        };
        set((s) => ({ jobs: [job, ...s.jobs] }));
        return id;
      },
      setRow: (id, key, row) =>
        set((s) => ({
          jobs: patchJob(s.jobs, id, (j) => ({
            ...j,
            rows: j.rows.map((r) =>
              r.key === key
                ? { ...r, ...row, ...(row.track ? { track: slim(row.track) } : {}) }
                : r,
            ),
          })),
        })),
      removeRow: (id, key) =>
        set((s) => ({
          jobs: patchJob(s.jobs, id, (j) => ({ ...j, rows: j.rows.filter((r) => r.key !== key) })),
        })),
      update: (id, patch) =>
        set((s) => ({ jobs: patchJob(s.jobs, id, (j) => ({ ...j, ...patch })) })),
      remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
    }),
    {
      name: 'sc-imports',
      storage: createJSONStorage(() => tauriStorage),
      version: 1,
      // v0 rows had no key: number them in order.
      migrate: (state, version) => {
        const st = state as { jobs: ImportJob[] };
        if (version < 1) {
          st.jobs = st.jobs.map((j) => ({ ...j, rows: j.rows.map((r, key) => ({ ...r, key })) }));
        }
        return st as ImportsState;
      },
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
