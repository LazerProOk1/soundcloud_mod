/**
 * Tracks SoundCloud refused, remembered for a week (at most 2000 each), so the next play skips
 * the attempt that will fail again:
 *  - direct: refused anonymously (404/403: Go+, region, takedown) → straight to the mirror;
 *  - mirror: the mirror has no stream either → straight to the fallback sources.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX = 2000;

function refusedList(key: string) {
  let cache: Record<string, number> | null = null;
  const load = () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
    } catch {
      cache = {};
    }
    return cache;
  };
  return {
    has(urn: string): boolean {
      const at = load()[urn];
      return !!at && Date.now() - at < TTL_MS;
    },
    remember(urn: string) {
      const map = load();
      map[urn] = Date.now();
      const entries = Object.entries(map);
      if (entries.length > MAX) {
        entries.sort((a, b) => b[1] - a[1]);
        cache = Object.fromEntries(entries.slice(0, MAX));
      }
      try {
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {
        /* storage full or unavailable: just don't remember */
      }
    },
  };
}

const direct = refusedList('sc-refused-direct');
const mirror = refusedList('sc-refused-mirror');

export const isRefusedDirect = direct.has;
export const rememberRefusedDirect = direct.remember;
export const isRefusedMirror = mirror.has;
export const rememberRefusedMirror = mirror.remember;

/** Is this error SoundCloud saying "not available to you" (not a network hiccup)? */
export function isRefusal(error: unknown): boolean {
  return /HTTP (403|404)\b/.test(String(error));
}
