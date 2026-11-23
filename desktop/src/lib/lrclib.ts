import { fetch } from '@tauri-apps/plugin-http';
import { type LyricsResult, parseLRC } from './lyrics';
import { pickByDuration } from './lyrics-pick';

const BASE = 'https://lrclib.net/api';

interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

function toResult(track: LrclibTrack | null): LyricsResult | null {
  if (!track) return null;
  const synced = track.syncedLyrics ? parseLRC(track.syncedLyrics) : null;
  return {
    plain: track.plainLyrics ?? null,
    synced: synced && synced.length > 0 ? synced : null,
    source: 'lrclib',
    language: null,
  };
}

/** Exact-match lookup (best for known artist/title/duration). Returns null on miss or error. */
export async function lrclibGet(
  artist: string,
  title: string,
  durationSec?: number,
): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (durationSec != null && durationSec > 0) {
      params.set('duration', String(Math.round(durationSec)));
    }
    const res = await fetch(`${BASE}/get?${params}`, {
      method: 'GET',
      headers: { 'Lrclib-Client': 'SoundCloud-Mod/1.3' },
      connectTimeout: 5000,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LrclibTrack;
    return toResult(data);
  } catch {
    return null;
  }
}

/** Fuzzy search: the synced hit closest in length to the track, or null.
 *  With a known duration, hits more than `maxDiff` seconds off are covers, remixes or
 *  other songs; they are used only when nothing closer exists and `maxDiff` is the default.
 *  Title-only searches pass a tight `maxDiff`: the length is then the only sign it is the
 *  same song by another uploader. */
export async function lrclibSearch(
  artist: string,
  title: string,
  durationSec?: number,
  maxDiff = 20,
): Promise<LyricsResult | null> {
  try {
    const q = `${artist} ${title}`.trim();
    const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`, {
      method: 'GET',
      headers: { 'Lrclib-Client': 'SoundCloud-Mod/1.3' },
      connectTimeout: 5000,
    });
    if (!res.ok) return null;
    const list = (await res.json()) as LrclibTrack[];
    return toResult(pickByDuration(list, durationSec, maxDiff, maxDiff === 20));
  } catch {
    return null;
  }
}
