import type { Track } from '../stores/player';

/**
 * Fan "versions" that flood SoundCloud recommendations: slowed / sped up / nightcore /
 * reverb edits, 8D, bass boosted, phonk-remix reuploads, karaoke and so on.
 * Matched as whole words in the title, the uploader name or the credited artist.
 */
const VARIANT_RE =
  /(^|[^\p{L}\p{N}])(slowed|sped[\s-]*up|speed[\s-]*up|spedup|super\s*slowed|ultra\s*slowed|reverb(?:ed)?|nightcore|daycore|8d(?:\s*audio)?|bass[\s-]*boost(?:ed)?|tiktok\s*(?:version|remix)|1\s*hour|10\s*hours?|remix(?:es)?|rmx|mashup|bootleg|karaoke|instrumental|минус|ремикс|караоке|замедл[её]н\p{L}*|ускор[её]н\p{L}*)(?=[^\p{L}\p{N}]|$)/iu;

/** Words that only mean "a version" inside brackets: "Song (Cover)" yes, "Cover Me Up" no. */
const BRACKET_RE = /[([][^)\]]*(cover|кавер)[^)\]]*[)\]]|(^|\s)cover\s+by\s/iu;

function haystack(track: Pick<Track, 'title' | 'user' | 'publisher_metadata'>) {
  return [
    track.title ?? '',
    track.user?.username ?? '',
    track.publisher_metadata?.artist ?? '',
  ].join(' \u0001 ');
}

/** Is this a fan version (slowed, sped up, remix, cover…) rather than the original? */
export function isVariant(track: Pick<Track, 'title' | 'user' | 'publisher_metadata'>): boolean {
  return VARIANT_RE.test(haystack(track)) || BRACKET_RE.test(track.title ?? '');
}

/** Title without brackets, "feat." and punctuation — the same song from different uploaders. */
export function songKey(track: Pick<Track, 'title' | 'user' | 'publisher_metadata'>): string {
  let title = (track.title ?? '').toLowerCase().replace(/ё/g, 'е');
  // "Artist - Title" uploads: keep only the title part.
  const dash = title.search(/\s[-–—]\s/);
  if (dash > 0) title = title.slice(dash + 3);
  return title
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s(feat|ft|prod)\.?\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type SongLike = Pick<Track, 'title' | 'user' | 'publisher_metadata' | 'duration'>;

function artistOf(track: SongLike): string {
  return (track.publisher_metadata?.artist || track.user?.username || '').toLowerCase().trim();
}

/** Words of the full title, brackets included: "World Cup (Champions)" → world, cup, champions. */
function titleWords(track: SongLike): Set<string> {
  const words = (track.title ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 5);
  return new Set(words);
}

/**
 * The same song under another title by the same artist: "World Cup (Champions)" and
 * "Champions" by IShowSpeed. Same artist (any case), lengths within 3 s and a shared word of
 * five or more letters. Catches what `songKey` misses because it drops the brackets.
 */
export function sameSong(a: SongLike, b: SongLike): boolean {
  const artist = artistOf(a);
  if (!artist || artist !== artistOf(b)) return false;
  if (!a.duration || !b.duration || Math.abs(a.duration - b.duration) > 3000) return false;
  const words = titleWords(a);
  for (const w of titleWords(b)) if (words.has(w)) return true;
  return false;
}

/** One record per song: keeps the most played upload (usually the official one).
 *  Very short titles ("Intro") are left alone by the key match — too many different songs
 *  share them; `sameSong` then folds retitled uploads of one artist. */
export function dedupeSongs<T extends Track>(tracks: T[]): T[] {
  const plays = (t: T) => t.playback_count ?? 0;
  const best = new Map<string, T>();
  for (const tr of tracks) {
    const key = songKey(tr);
    if (key.length < 6) continue;
    const prev = best.get(key);
    if (!prev || plays(tr) > plays(prev)) best.set(key, tr);
  }
  const keep = new Set(best.values());
  const byKey = tracks.filter((tr) => songKey(tr).length < 6 || keep.has(tr));
  // Second pass: retitled copies (same artist, same length, shared word).
  const out: T[] = [];
  for (const tr of byKey) {
    const i = out.findIndex((o) => sameSong(o, tr));
    if (i < 0) out.push(tr);
    else if (plays(tr) > plays(out[i])) out[i] = tr;
  }
  return out;
}
