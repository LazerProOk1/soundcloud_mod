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

/** Longer than this is a set or a mix, not a song for a chart. */
const CHART_MAX_MS = 10 * 60_000;

export interface ChartTrackLike {
  urn: string;
  user?: { urn?: string; username?: string } | null;
  publisher_metadata?: { artist?: string | null } | null;
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
  const artists = new Set<string>();
  return tracks
    .filter((t) => {
      if (seen.has(t.urn)) return false;
      seen.add(t.urn);
      const d = t.duration ?? 0;
      // Songs only: no previews, no hour-long sets and mixes.
      return d >= 60_000 && d <= CHART_MAX_MS;
    })
    .sort((a, b) => (b.playback_count ?? 0) - (a.playback_count ?? 0) || likes(b) - likes(a))
    .filter((t) => {
      // One track per artist: a search for "hip-hop" otherwise fills up with one uploader
      // who has the word in every title.
      // By the shown artist name: the same artist is often uploaded from several accounts.
      const who = (t.publisher_metadata?.artist || t.user?.username || t.user?.urn || '')
        .trim()
        .toLowerCase();
      if (!who) return true;
      if (artists.has(who)) return false;
      artists.add(who);
      return true;
    })
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

export interface ShelfTrackLike {
  urn: string;
  artwork_url?: string | null;
  user?: { urn?: string; username?: string } | null;
}

/**
 * Orders a track shelf so it doesn't repeat itself: not yet played tracks first, played ones at
 * the end (still there for someone who wants to see everything), and within each group the same
 * artist or the same cover never sits next to itself while something else can go there.
 */
export function spreadShelf<T extends ShelfTrackLike>(tracks: T[], played: Set<string>): T[] {
  const artist = (t: T) => t.user?.urn ?? t.user?.username ?? '';
  const spread = (list: T[]) => {
    const left = [...list];
    const out: T[] = [];
    while (left.length > 0) {
      const prev = out[out.length - 1];
      const i = prev
        ? left.findIndex(
            (t) =>
              artist(t) !== artist(prev) && (!t.artwork_url || t.artwork_url !== prev.artwork_url),
          )
        : 0;
      out.push(...left.splice(i < 0 ? 0 : i, 1));
    }
    return out;
  };
  return [
    ...spread(tracks.filter((t) => !played.has(t.urn))),
    ...spread(tracks.filter((t) => played.has(t.urn))),
  ];
}
