/** Pure helpers for the catalog page (kept free of React and Tauri so Node tests can import them). */

export interface ReleaseLike {
  id: string;
  title: string;
  cover_url?: string;
  primary_artist?: { id?: string; name?: string };
}

/**
 * Drops repeated releases: the same cover, or the same artist + title (deluxe/re-uploads),
 * keeps the first one. Without this "Fresh releases" shows one cover many times.
 */
export function dedupeReleases<T extends ReleaseLike>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const name = `${item.primary_artist?.name ?? ''}|${item.title}`.toLowerCase().trim();
    const keys = [`id:${item.id}`, `name:${name}`];
    if (item.cover_url) keys.push(`cover:${item.cover_url}`);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(item);
  }
  return out;
}

export interface ChartTrackLike {
  urn: string;
  duration?: number;
  playback_count?: number;
  likes_count?: number;
  favoritings_count?: number;
}

/**
 * Turns a genre search page into a chart: full-length tracks only, most played first,
 * likes as the tie-breaker.
 */
export function rankChart<T extends ChartTrackLike>(tracks: T[], limit: number): T[] {
  const likes = (t: T) => t.likes_count ?? t.favoritings_count ?? 0;
  const seen = new Set<string>();
  return tracks
    .filter((t) => {
      if (seen.has(t.urn)) return false;
      seen.add(t.urn);
      return (t.duration ?? 0) >= 60_000;
    })
    .sort((a, b) => (b.playback_count ?? 0) - (a.playback_count ?? 0) || likes(b) - likes(a))
    .slice(0, limit);
}

/** Genres for the chart pills: stable search words, label shown as is. */
export const CHART_GENRES = [
  'hip-hop',
  'phonk',
  'electronic',
  'house',
  'techno',
  'drum & bass',
  'pop',
  'r&b',
  'rock',
  'indie',
  'lo-fi',
  'ambient',
] as const;
