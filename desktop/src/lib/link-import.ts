import { invoke } from '@tauri-apps/api/core';
import type { Track } from '../stores/player';
import { api } from './api';
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

async function findOnSoundCloud(item: ImportItem): Promise<string | null> {
  if (item.urn) return item.urn;
  const q = `${item.artist} ${item.title}`.trim();
  if (!q) return null;
  try {
    const res = await api<{ collection: Track[] }>(
      `/tracks?q=${encodeURIComponent(q)}&limit=6&linked_partitioning=true`,
    );
    let best: { urn: string; score: number } | null = null;
    for (const tr of res.collection ?? []) {
      const score = matchScore(item, tr);
      if (score >= 2 && (!best || score > best.score)) best = { urn: tr.urn, score };
    }
    return best?.urn ?? null;
  } catch {
    return null;
  }
}

export interface ImportProgress {
  done: number;
  total: number;
  found: number;
}

const PLAYLIST_LIMIT = 500;

/**
 * Finds every item on SoundCloud (4 at a time) and saves the hits as a new private
 * playlist. Returns the playlist URN and how many tracks were found.
 */
export async function importToPlaylist(
  title: string,
  items: ImportItem[],
  onProgress: (p: ImportProgress) => void,
  signal: { cancelled: boolean },
): Promise<{ urn: string | null; found: number; missing: ImportItem[] }> {
  const urns: (string | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  let found = 0;
  const worker = async () => {
    while (!signal.cancelled && next < items.length) {
      const i = next++;
      urns[i] = await findOnSoundCloud(items[i]);
      done++;
      if (urns[i]) found++;
      onProgress({ done, total: items.length, found });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const unique = [...new Set(urns.filter((u): u is string => !!u))].slice(0, PLAYLIST_LIMIT);
  const missing = items.filter((_, i) => !urns[i]);
  if (signal.cancelled || unique.length === 0) return { urn: null, found, missing };

  const created = await api<{ urn?: string }>('/playlists', {
    method: 'POST',
    body: JSON.stringify({
      playlist: { title, sharing: 'private', tracks: unique.map((urn) => ({ urn })) },
    }),
  });
  queryClient.invalidateQueries({ queryKey: ['me', 'playlists'] }).catch(() => undefined);
  return { urn: created?.urn ?? null, found, missing };
}
