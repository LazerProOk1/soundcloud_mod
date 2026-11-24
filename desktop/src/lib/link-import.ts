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
export async function matchOnSoundCloud(
  item: ImportItem,
  /** Throw network errors instead of returning null (the import retries them). */
  { throwOnError = false } = {},
): Promise<Track | null> {
  const q = `${item.artist} ${item.title}`.trim();
  if (!q) return null;
  try {
    const res = await api<{ collection: Track[] }>(
      `/tracks?q=${encodeURIComponent(q)}&limit=6&linked_partitioning=true&access=playable,preview,blocked`,
      { silent: true },
    );
    let best: { track: Track; score: number } | null = null;
    for (const tr of res.collection ?? []) {
      const score = matchScore(item, tr);
      if (score < 2) continue;
      // Same score: the more played upload is usually the official one, not a re-upload.
      const plays = (t: Track) => t.playback_count ?? 0;
      if (!best || score > best.score || (score === best.score && plays(tr) > plays(best.track))) {
        best = { track: tr, score };
      }
    }
    return best?.track ?? null;
  } catch (e) {
    // A refusal stops the caller; a network error is thrown too, so the import can retry
    // instead of marking a song "not found" that was never really searched.
    if (isRefusal(e) || throwOnError) throw e;
    return null;
  }
}

const RETRY_DELAYS_MS = [3000, 8000];

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
  return matchOnSoundCloud(item, { throwOnError: true });
}

async function createPlaylist(title: string, urns: string[]): Promise<string | null> {
  const created = await api<{ urn?: string }>('/playlists', {
    method: 'POST',
    body: JSON.stringify({
      playlist: { title, sharing: 'private', tracks: urns.map((urn) => ({ urn })) },
    }),
  });
  return created?.urn ?? null;
}

async function playlistTrackUrns(playlistUrn: string): Promise<string[]> {
  const urns: string[] = [];
  for (let page = 0; ; page++) {
    const res = await api<{ collection?: Track[]; has_more?: boolean }>(
      `/playlists/${encodeURIComponent(playlistUrn)}/tracks?page=${page}&limit=200&access=playable,preview,blocked`,
      { silent: true },
    );
    urns.push(...(res.collection ?? []).map((t) => t.urn));
    if (!res.has_more) return urns;
  }
}

/**
 * Saves the found tracks into the import's private playlists: "Title", then "Title (2)",
 * "Title (3)"… since SoundCloud holds 500 tracks per playlist. On a repeat run the playlists are
 * read first and only missing tracks are added (filling free room, then new playlists), so
 * tracks removed by hand don't come back.
 */
async function saveToPlaylists(title: string, owned: string[], urns: string[]): Promise<string[]> {
  const contents = await Promise.all(owned.map(playlistTrackUrns));
  const have = new Set(contents.flat());
  let left = urns.filter((u) => !have.has(u));
  for (const [i, urn] of owned.entries()) {
    const room = PLAYLIST_LIMIT - contents[i].length;
    if (left.length === 0 || room <= 0) continue;
    await api(`/playlists/${encodeURIComponent(urn)}`, {
      method: 'PUT',
      body: JSON.stringify({
        playlist: { tracks: [...contents[i], ...left.slice(0, room)].map((u) => ({ urn: u })) },
      }),
    });
    left = left.slice(room);
    queryClient.invalidateQueries({ queryKey: ['playlist', urn] }).catch(() => undefined);
  }
  const result = [...owned];
  while (left.length > 0) {
    const n = result.length;
    const created = await createPlaylist(
      n === 0 ? title : `${title} (${n + 1})`,
      left.slice(0, PLAYLIST_LIMIT),
    );
    if (created) result.push(created);
    left = left.slice(PLAYLIST_LIMIT);
  }
  queryClient.invalidateQueries({ queryKey: ['me', 'playlists'] }).catch(() => undefined);
  return result;
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
      let track: Track | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          track = await findOnSoundCloud(row);
          break;
        } catch (e) {
          if (isRefusal(e)) {
            store().update(id, { status: 'paused' });
            toast.error(i18n.t('import.refused'));
            return;
          }
          // Network trouble: try again a bit later; after the last try it counts as not found.
          if (attempt >= RETRY_DELAYS_MS.length) break;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
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
    // A search run again on a saved import adds to its playlists instead of making new ones.
    const owned = [job.playlistUrn, ...(job.extraPlaylistUrns ?? [])].filter(
      (u): u is string => !!u,
    );
    const saved = urns.length > 0 ? await saveToPlaylists(job.title, owned, urns) : owned;
    store().update(id, {
      status: 'done',
      playlistUrn: saved[0] ?? null,
      extraPlaylistUrns: saved.slice(1),
    });
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
