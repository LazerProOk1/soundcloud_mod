/** Synced before plain, then closest in length; null when nothing is within `maxDiff`. */
export function pickByDuration<T extends { duration: number; syncedLyrics: string | null }>(
  list: T[],
  durationSec: number | undefined,
  maxDiff: number,
  looseFallback: boolean,
): T | null {
  if (!list.length) return null;
  if (durationSec == null || durationSec <= 0) {
    return list.find((t) => t.syncedLyrics) ?? list[0];
  }
  const diff = (t: T) => (t.duration > 0 ? Math.abs(t.duration - durationSec) : Infinity);
  const near = list.filter((t) => diff(t) <= maxDiff).sort((a, b) => diff(a) - diff(b));
  if (near.length === 0)
    return looseFallback ? (list.find((t) => t.syncedLyrics) ?? list[0]) : null;
  return near.find((t) => t.syncedLyrics) ?? near[0];
}
