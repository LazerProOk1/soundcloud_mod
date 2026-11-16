/**
 * Tracks that SoundCloud refused to give anonymously (404/403: Go+, region, takedown).
 * Next time they go straight to the mirror (the account path) instead of waiting for
 * the same refusal again. Remembered for a week, at most 2000 tracks.
 */
const KEY = 'sc-refused-direct';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX = 2000;

let cache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    cache = {};
  }
  return cache;
}

export function isRefusedDirect(urn: string): boolean {
  const at = load()[urn];
  return !!at && Date.now() - at < TTL_MS;
}

export function rememberRefusedDirect(urn: string) {
  const map = load();
  map[urn] = Date.now();
  const entries = Object.entries(map);
  if (entries.length > MAX) {
    entries.sort((a, b) => b[1] - a[1]);
    cache = Object.fromEntries(entries.slice(0, MAX));
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable: just don't remember */
  }
}

/** Is this error SoundCloud saying "not available to you" (not a network hiccup)? */
export function isRefusal(error: unknown): boolean {
  return /HTTP (403|404)\b/.test(String(error));
}
