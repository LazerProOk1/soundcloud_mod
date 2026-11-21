import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import i18n from '../i18n';
import { importCounts, useImportsStore } from '../stores/imports';
import type { Track } from '../stores/player';
import { ApiError, api } from './api';
import { type ImportItem, matchScore } from './import-match';
import { queryClient } from './query-client';

export type { ImportItem };

export interface ImportList {
  source: string;
  title: string;
  tracks: ImportItem[];
}

/** Yandex Music / Spotify / SoundCloud link → track list (Rust does the fetching). */
export function fetchLinkList(url: string): Promise<ImportList> {
  return invoke<ImportList>('import_fetch_link', { url });
}

/** Best SoundCloud upload of a song (artist + title + length must agree), or null. */
export async function matchOnSoundCloud(item: ImportItem): Promise<Track | null> {
  const q = `${item.artist} ${item.title}`.trim();
  if (!q) return null;
  try {
    const res = await api<{ collection: Track[] }>(
      `/tracks?q=${encodeURIComponent(q)}&limit=6&linked_partitioning=true`,
      { silent: true },
    );
    let best: { track: Track; score: number } | null = null;
    for (const tr of res.collection ?? []) {
      const score = matchScore(item, tr);
      if (score >= 2 && (!best || score > best.score)) best = { track: tr, score };
    }
    return best?.track ?? null;
  } catch (e) {
    // SoundCloud refused (rate limit / block): stop the caller instead of hammering on.
    if (isRefusal(e)) throw e;
    return null;
  }
}

/** True when SoundCloud refused the request: too many requests or access blocked. */
export function isRefusal(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 429 || e.status === 403);
}

const PLAYLIST_LIMIT = 500;
/** Pause between searches so a big import does not look like a bot to SoundCloud. */
const SEARCH_GAP_MS = 1000;
const running = new Set<string>();

async function findOnSoundCloud(item: ImportItem): Promise<Track | null> {
  if (item.urn) {
    return api<Track>(`/tracks/${encodeURIComponent(item.urn)}`, { silent: true }).catch(
      () => null,
    );
  }
  return matchOnSoundCloud(item);
}

/** Saves tracks as private playlists ("Title", "Title (2)", … — SoundCloud holds 500 each). */
async function savePlaylists(title: string, urns: string[]): Promise<string | null> {
  let firstUrn: string | null = null;
  for (let i = 0; i * PLAYLIST_LIMIT < urns.length; i++) {
    const part = urns.slice(i * PLAYLIST_LIMIT, (i + 1) * PLAYLIST_LIMIT);
    const created = await api<{ urn?: string }>('/playlists', {
      method: 'POST',
      body: JSON.stringify({
        playlist: {
          title: i === 0 ? title : `${title} (${i + 1})`,
          sharing: 'private',
          tracks: part.map((urn) => ({ urn })),
        },
      }),
    });
    firstUrn ??= created?.urn ?? null;
  }
  queryClient.invalidateQueries({ queryKey: ['me', 'playlists'] }).catch(() => undefined);
  return firstUrn;
}

/**
 * Searches the pending rows of an import one at a time, in the background, and saves the found
 * tracks as a SoundCloud playlist at the end. A refusal from SoundCloud pauses the import.
 */
export async function runImport(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  const store = useImportsStore.getState;
  try {
    store().update(id, { status: 'running' });
    let searched = 0;
    for (;;) {
      const job = store().jobs.find((j) => j.id === id);
      if (!job) return; // removed while running
      const index = job.rows.findIndex((r) => r.state === 'pending');
      if (index < 0) break;
      const row = job.rows[index];
      if (searched > 0 && !row.urn) await new Promise((r) => setTimeout(r, SEARCH_GAP_MS));
      let track: Track | null;
      try {
        track = await findOnSoundCloud(row);
      } catch (e) {
        if (isRefusal(e)) {
          store().update(id, { status: 'paused' });
          toast.error(i18n.t('import.refused'));
          return;
        }
        track = null;
      }
      if (!row.urn) searched++;
      const taken =
        !!track &&
        (store()
          .jobs.find((j) => j.id === id)
          ?.rows.some(
            (r) => r.key !== row.key && r.state === 'found' && r.track?.urn === track.urn,
          ) ??
          false);
      store().setRow(
        id,
        row.key,
        !track ? { state: 'missing' } : taken ? { state: 'duplicate' } : { state: 'found', track },
      );
    }

    const job = store().jobs.find((j) => j.id === id);
    if (!job) return;
    const urns = [...new Set(job.rows.flatMap((r) => (r.track ? [r.track.urn] : [])))];
    const playlistUrn = urns.length > 0 ? await savePlaylists(job.title, urns) : null;
    store().update(id, { status: 'done', playlistUrn });
    const { found, total } = importCounts(job);
    toast.success(i18n.t('import.done', { found, total, title: job.title }));
  } catch (e) {
    // Saving the playlist failed: keep the found tracks, let the user retry.
    store().update(id, { status: 'paused' });
    toast.error(isRefusal(e) ? i18n.t('import.refused') : String(e));
  } finally {
    running.delete(id);
  }
}

/** Picks up imports that were still searching when the app was closed. */
export function resumeImports() {
  const go = () => {
    for (const j of useImportsStore.getState().jobs)
      if (j.status === 'running') void runImport(j.id);
  };
  if (useImportsStore.persist.hasHydrated()) go();
  else useImportsStore.persist.onFinishHydration(go);
}
