import { invoke } from '@tauri-apps/api/core';
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

async function findOnSoundCloud(item: ImportItem): Promise<string | null> {
  if (item.urn) return item.urn;
  return (await matchOnSoundCloud(item))?.urn ?? null;
}

export interface ImportProgress {
  done: number;
  total: number;
  found: number;
}

const PLAYLIST_LIMIT = 500;
/** Pause between searches so a big import does not look like a bot to SoundCloud. */
const SEARCH_GAP_MS = 1000;

/**
 * Finds every item on SoundCloud (one at a time, paced) and saves the hits as a new private
 * playlist. Returns the playlist URN and how many tracks were found.
 */
export async function importToPlaylist(
  title: string,
  items: ImportItem[],
  onProgress: (p: ImportProgress) => void,
  signal: { cancelled: boolean },
): Promise<{ urn: string | null; found: number; missing: ImportItem[] }> {
  const urns: (string | null)[] = new Array(items.length).fill(null);
  let found = 0;
  // A refusal from SoundCloud throws out of here and aborts the whole import.
  for (let i = 0; i < items.length && !signal.cancelled; i++) {
    if (i > 0 && !items[i].urn) await new Promise((r) => setTimeout(r, SEARCH_GAP_MS));
    urns[i] = await findOnSoundCloud(items[i]);
    if (urns[i]) found++;
    onProgress({ done: i + 1, total: items.length, found });
  }

  const unique = [...new Set(urns.filter((u): u is string => !!u))];
  const missing = items.filter((_, i) => !urns[i]);
  if (signal.cancelled || unique.length === 0) return { urn: null, found, missing };

  // SoundCloud playlists hold up to 500 tracks: big imports become "Title", "Title (2)", …
  let firstUrn: string | null = null;
  for (let i = 0; i * PLAYLIST_LIMIT < unique.length; i++) {
    const part = unique.slice(i * PLAYLIST_LIMIT, (i + 1) * PLAYLIST_LIMIT);
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
  return { urn: firstUrn, found, missing };
}
