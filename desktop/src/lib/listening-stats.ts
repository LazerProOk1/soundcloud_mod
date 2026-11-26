import type { HistoryEntry } from './hooks';

export interface ListeningArtist {
  name: string;
  urn: string | null;
  plays: number;
  minutes: number;
}

export interface ListeningTrack {
  urn: string;
  title: string;
  artist: string;
  plays: number;
  minutes: number;
}

export interface ListeningStats {
  plays: number;
  minutes: number;
  artists: number;
  topArtists: ListeningArtist[];
  topTracks: ListeningTrack[];
}

const DAY_MS = 86_400_000;

/**
 * Totals and leaders over the listening history. `days` limits the window (0 = everything),
 * `top` is how many leaders each list keeps. Durations are milliseconds, as in `Track`.
 */
export function summarizeListening(
  entries: HistoryEntry[],
  { now = Date.now(), days = 30, top = 3 }: { now?: number; days?: number; top?: number } = {},
): ListeningStats {
  const cutoff = days > 0 ? now - days * DAY_MS : Number.NEGATIVE_INFINITY;
  const recent = entries.filter((entry) => {
    const playedAt = Date.parse(entry.playedAt);
    return Number.isFinite(playedAt) && playedAt >= cutoff;
  });

  const artists = new Map<string, ListeningArtist>();
  const tracks = new Map<string, ListeningTrack>();
  let playedMs = 0;

  for (const entry of recent) {
    const duration = Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : 0;
    playedMs += duration;

    const artistKey = (entry.artistUrn || entry.artistName || '').toLowerCase();
    if (artistKey) {
      const artist = artists.get(artistKey) ?? {
        name: entry.artistName,
        urn: entry.artistUrn,
        plays: 0,
        minutes: 0,
      };
      artist.plays += 1;
      artist.minutes += duration;
      artists.set(artistKey, artist);
    }

    const track = tracks.get(entry.scTrackId) ?? {
      urn: entry.scTrackId,
      title: entry.title,
      artist: entry.artistName,
      plays: 0,
      minutes: 0,
    };
    track.plays += 1;
    track.minutes += duration;
    tracks.set(entry.scTrackId, track);
  }

  const byMinutes = (
    a: { plays: number; minutes: number },
    b: { plays: number; minutes: number },
  ) => b.minutes - a.minutes || b.plays - a.plays;

  return {
    plays: recent.length,
    minutes: Math.round(playedMs / 60_000),
    artists: artists.size,
    topArtists: [...artists.values()].sort(byMinutes).slice(0, top),
    topTracks: [...tracks.values()].sort(byMinutes).slice(0, top),
  };
}
