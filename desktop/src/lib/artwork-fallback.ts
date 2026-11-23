import { fetch } from '@tauri-apps/plugin-http';
import { useAppStatusStore } from '../stores/app-status';
import type { Track } from '../stores/player';
import { splitArtistTitle } from './lyrics';
import { pickByDuration } from './lyrics-pick';
import { getArtistDisplay } from './track-display';

interface ItunesSong {
  trackTimeMillis?: number;
  artworkUrl100?: string;
}

// ponytail: in-memory only, so a missing cover is looked up again after a restart.
const found = new Map<string, string | null>();

/** A cover from the Apple Music catalogue for a track uploaded without one, or null.
 *  Only a song whose length is within 10 s counts, so a different song is not shown. */
export async function findMissingArtwork(track: Track): Promise<string | null> {
  if (track.artwork_url || useAppStatusStore.getState().offlineBypass) return null;
  if (found.has(track.urn)) return found.get(track.urn) ?? null;
  const parsed = splitArtistTitle(track.title);
  const term = `${parsed?.[0] ?? getArtistDisplay(track).primary} ${parsed?.[1] ?? track.title}`;
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?entity=song&limit=10&term=${encodeURIComponent(term)}`,
      { method: 'GET', connectTimeout: 5000 },
    );
    if (!res.ok) return null;
    const { results } = (await res.json()) as { results: ItunesSong[] };
    const songs = results
      .filter((r) => r.artworkUrl100)
      .map((r) => ({ ...r, duration: (r.trackTimeMillis ?? 0) / 1000, syncedLyrics: '' }));
    const hit = pickByDuration(songs, track.duration / 1000, 10, false);
    const url = hit?.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null;
    found.set(track.urn, url);
    return url;
  } catch {
    return null;
  }
}
