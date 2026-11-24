/** Pure helpers for the catalog page (kept free of React and Tauri so Node tests can import them). */

export interface ReleaseLike {
  id: string;
  title: string;
  cover_url?: string;
  release_year?: number | null;
  release_month?: number | null;
  primary_artist?: { id?: string; name?: string };
}

/** Genius serves this grey cloud for releases without art: treat it as no cover at all. */
export function realImage(url: string | undefined | null): string | undefined {
  return url && !url.includes('default_cover_image') ? url : undefined;
}

/**
 * One title for every edition of a release: "Legends Never Die (5 Year Anniversary)",
 * "Death Race for Love (Deluxe)*" and "Luv Is Rage 2 - Deluxe" all count as the base title.
 */
export function releaseBaseTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+(deluxe|expanded|remaster(ed)?|anniversary|edition|reissue).*$/i, '')
    .replace(/[*\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Drops repeated releases: the same cover, or the same artist + base title (deluxe, anniversary
 * and other editions, re-uploads), keeps the first one. Without this "Fresh releases" shows one cover many times.
 */
export function dedupeReleases<T extends ReleaseLike>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const base = releaseBaseTitle(item.title) || item.title.toLowerCase().trim();
    const name = `${(item.primary_artist?.name ?? '').toLowerCase().trim()}|${base}`;
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

/** Months since year 0, for comparing release dates; a missing month counts as January. */
function releaseMonth(r: ReleaseLike): number | null {
  return r.release_year ? r.release_year * 12 + ((r.release_month ?? 1) - 1) : null;
}

/**
 * Fresh releases: out within the last `months` months (by release date, not by when the catalog
 * indexed them), newest first, one per release.
 */
export function freshReleases<T extends ReleaseLike>(items: T[], now: Date, months = 12): T[] {
  const current = now.getFullYear() * 12 + now.getMonth();
  return dedupeReleases(
    items
      .filter((r) => {
        const m = releaseMonth(r);
        return m !== null && m <= current && current - m < months;
      })
      .sort((a, b) => (releaseMonth(b) ?? 0) - (releaseMonth(a) ?? 0)),
  );
}

/**
 * True when a trending list actually ranks something. The server can return every artist with
 * the same trending score and a listener or two, which only sorts them by name (04RiCH, 1221…).
 */
export function hasTrendSignal(artists: { monthly_listeners?: number }[]): boolean {
  return artists.some((a) => (a.monthly_listeners ?? 0) >= 100);
}
