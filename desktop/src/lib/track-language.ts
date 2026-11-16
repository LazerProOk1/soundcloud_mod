import type { Track } from '../stores/player';

/**
 * Client-side language filter for the wave. The backend ignores most `languages`
 * values, so we guess from the scripts used in the track's text fields. Russian
 * uploads often have Latin titles (kizaru, Big Baby Tape) but Cyrillic in the
 * description/tags, so those fields count too.
 */

type Script = 'cyrillic' | 'latin' | 'hangul' | 'kana';

const LANG_SCRIPT: Record<string, Script> = {
  ru: 'cyrillic',
  uk: 'cyrillic',
  en: 'latin',
  es: 'latin',
  de: 'latin',
  fr: 'latin',
  it: 'latin',
  pt: 'latin',
  pl: 'latin',
  ko: 'hangul',
  ja: 'kana',
};

const RE: Record<Script, RegExp> = {
  cyrillic: /[Ѐ-ӿ]/,
  hangul: /[가-힯ᄀ-ᇿ]/,
  kana: /[぀-ヿ]/,
  latin: /[A-Za-zÀ-ɏ]/,
};

type TrackText = Pick<Track, 'title' | 'user'> & {
  description?: string | null;
  tag_list?: string | null;
  label_name?: string | null;
  publisher_metadata?: { artist?: string | null } | null;
};

export function trackScripts(track: TrackText): Set<Script> {
  const name = `${track.title ?? ''} ${track.user?.username ?? ''} ${track.publisher_metadata?.artist ?? ''}`;
  const extra = `${track.description ?? ''} ${track.tag_list ?? ''} ${track.label_name ?? ''}`;
  const found = new Set<Script>();
  for (const s of ['cyrillic', 'hangul', 'kana'] as const) {
    if (RE[s].test(name) || RE[s].test(extra)) found.add(s);
  }
  // "Latin" means the track itself is Latin-only (an English title with a Cyrillic
  // description is still most likely a Russian upload).
  if (found.size === 0 && RE.latin.test(name)) found.add('latin');
  return found;
}

/** True when the track matches one of the selected language codes (empty = all). */
export function matchesLanguages(track: TrackText, langs: readonly string[]): boolean {
  if (langs.length === 0) return true;
  const scripts = trackScripts(track);
  return langs.some((l) => {
    const s = LANG_SCRIPT[l];
    return s ? scripts.has(s) : true;
  });
}
