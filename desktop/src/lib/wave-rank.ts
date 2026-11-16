/**
 * "My wave" taste: what the listener showed us by skipping, finishing, "Not this" and
 * "More like this". Pure functions (unit-tested); the persisted store lives in
 * stores/wave-taste.ts.
 */

export interface RankableTrack {
  urn: string;
  user?: { urn?: string | null; username?: string | null } | null;
}

export interface Taste {
  /** Artist key → score. Up for finished tracks and "more like this", down for skips. */
  artists: Record<string, number>;
  /** Tracks marked "Not this": never again. */
  banned: string[];
  /** Recently played, newest first: they rest for a while. */
  recent: string[];
  /** Skipped early: that song isn't wanted now (the artist is only nudged down). */
  skippedSongs?: string[];
}

export const EMPTY_TASTE: Taste = { artists: {}, banned: [], recent: [], skippedSongs: [] };
const MAX_SKIPPED = 500;

const MAX_BANNED = 1000;
const MAX_RECENT = 300;
const MIN_SCORE = -6;
const MAX_SCORE = 6;
/** Artists at or below this score are left out of the wave. */
export const ARTIST_BLOCK_SCORE = -4;

export function artistKey(track: RankableTrack): string {
  return (track.user?.urn || track.user?.username || '').toLowerCase();
}

function bump(taste: Taste, track: RankableTrack, delta: number): Taste {
  const key = artistKey(track);
  if (!key) return taste;
  const next = Math.min(MAX_SCORE, Math.max(MIN_SCORE, (taste.artists[key] ?? 0) + delta));
  return { ...taste, artists: { ...taste.artists, [key]: Math.round(next * 100) / 100 } };
}

/**
 * Skipped after `playedSecs`. A skip is mostly about this song ("not now"), so the song
 * goes away for a long while and the artist only gets a small nudge down — it takes many
 * skips of the same artist before the artist itself drops out.
 */
export function onSkip(taste: Taste, track: RankableTrack, playedSecs: number): Taste {
  if (playedSecs >= 30) return taste;
  const skipped = [track.urn, ...(taste.skippedSongs ?? []).filter((u) => u !== track.urn)].slice(
    0,
    MAX_SKIPPED,
  );
  return bump({ ...taste, skippedSongs: skipped }, track, playedSecs < 10 ? -0.3 : -0.1);
}

export function onFinished(taste: Taste, track: RankableTrack): Taste {
  return bump(taste, track, 0.5);
}

export function onNotThis(taste: Taste, track: RankableTrack): Taste {
  const banned = [track.urn, ...taste.banned.filter((u) => u !== track.urn)].slice(0, MAX_BANNED);
  return bump({ ...taste, banned }, track, -2);
}

export function onMoreLikeThis(taste: Taste, track: RankableTrack): Taste {
  return bump(taste, track, 2);
}

export function onPlayed(taste: Taste, track: RankableTrack): Taste {
  const recent = [track.urn, ...taste.recent.filter((u) => u !== track.urn)].slice(0, MAX_RECENT);
  return { ...taste, recent };
}

/**
 * Orders the wave by taste: drops "Not this" tracks and disliked artists, lets recently
 * played tracks rest (unless the pool would get too small), moves liked artists forward
 * and never plays the same artist twice in a row when it can be avoided.
 */
export function rankWave<T extends RankableTrack>(tracks: readonly T[], taste: Taste): T[] {
  const banned = new Set(taste.banned);
  const score = (t: T) => taste.artists[artistKey(t)] ?? 0;
  let pool = tracks.filter((t) => !banned.has(t.urn) && score(t) > ARTIST_BLOCK_SCORE);

  // Recently played and skipped songs rest, unless that would leave too little.
  const resting = new Set([...taste.recent.slice(0, 120), ...(taste.skippedSongs ?? [])]);
  const fresh = pool.filter((t) => !resting.has(t.urn));
  if (fresh.length >= 12) pool = fresh;

  // Stable: original order (vibe / source) stays the base, taste shifts tracks by a few places.
  const ordered = pool
    .map((t, i) => ({ t, key: i - score(t) * 3 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.t);

  // Same artist back to back → pull the next different artist forward.
  const out: T[] = [];
  const rest = [...ordered];
  while (rest.length > 0) {
    const last = out.length > 0 ? artistKey(out[out.length - 1]) : null;
    const idx = rest.findIndex((t) => !last || artistKey(t) !== last);
    out.push(rest.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

/** Familiar tracks mixed into the stream: one liked track after every `every` others. */
export function mixIn<T extends RankableTrack>(
  base: readonly T[],
  extra: readonly T[],
  every = 2,
): T[] {
  const seen = new Set(base.map((t) => t.urn));
  const add = extra.filter((t) => !seen.has(t.urn));
  const out: T[] = [];
  let j = 0;
  base.forEach((t, i) => {
    out.push(t);
    if ((i + 1) % every === 0 && j < add.length) out.push(add[j++]);
  });
  return out;
}
