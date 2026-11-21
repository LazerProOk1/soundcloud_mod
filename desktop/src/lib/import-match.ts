import type { Track } from '../stores/player';

export interface ImportItem {
  artist: string;
  title: string;
  durationMs?: number | null;
  /** Already a SoundCloud track (SoundCloud links). */
  urn?: string | null;
}

/** "Artist - Title" per line (also – and —); a line without a dash is just a title. */
export function parseTextList(text: string): ImportItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: line };
    });
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words that mark another version of a song: remixes, mashups, sped-up edits, covers. */
const VERSION_MARK =
  /\b(remix|rmx|mix(ed)?|mashup|bootleg|edit|flip|sped ?up|speed ?up|slowed|reverb|nightcore|8d|bass ?boost(ed)?|cover|karaoke|instrumental|live)\b|\s(x|vs\.?)\s/i;

/** How well a SoundCloud result matches the wanted song (higher is better, <0 = reject). */
export function matchScore(want: ImportItem, got: Pick<Track, 'title' | 'duration' | 'user'>) {
  const wt = normalize(want.title);
  const gt = normalize(got.title);
  const ga = normalize(`${got.user?.username ?? ''} ${got.title}`);
  if (!wt || !gt) return -1;
  let score = 0;
  if (gt === wt || gt.includes(wt) || wt.includes(gt)) score += 3;
  else if (wt.split(' ').filter((w) => w.length > 2 && gt.includes(w)).length >= 1) score += 1;
  else return -1;
  const artistWords = normalize(want.artist)
    .split(' ')
    .filter((w) => w.length >= 3);
  if (artistWords.some((w) => ga.includes(w))) score += 2;
  else if (artistWords.length > 0) score -= 1;
  // "Rihanna X Tame Impala - New Person (mixed)" for "New Person": another version, not the song.
  if (VERSION_MARK.test(got.title) && !VERSION_MARK.test(`${want.artist} ${want.title}`)) {
    score -= 4;
  }
  if (want.durationMs && got.duration) {
    const diff = Math.abs(want.durationMs - got.duration) / 1000;
    if (diff <= 8) score += 1;
    else if (diff > 40) score -= 2;
  }
  return score;
}
