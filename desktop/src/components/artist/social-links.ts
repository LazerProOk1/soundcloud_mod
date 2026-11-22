import type { ArtistSocial } from './types';

/** Most useful first; kinds not listed keep their order after these. */
const ORDER = [
  'spotify',
  'apple_music',
  'youtube',
  'instagram',
  'tiktok',
  'twitter',
  'bandcamp',
  'facebook',
  'personal',
];

/**
 * One link per service: the API often lists the same Apple Music / Facebook page from several
 * sources. A SoundCloud link is dropped when the artist's SoundCloud accounts are shown anyway.
 */
export function uniqueSocials(socials: ArtistSocial[], hasScAccount: boolean): ArtistSocial[] {
  const byKind = new Map<string, ArtistSocial>();
  for (const s of socials) {
    let kind = s.kind.toLowerCase();
    if (kind === 'x') kind = 'twitter';
    if (kind === 'soundcloud' && hasScAccount) continue;
    const prev = byKind.get(kind);
    if (!prev || (s.verified && !prev.verified)) byKind.set(kind, { ...s, kind });
  }
  const rank = (k: string) => {
    const i = ORDER.indexOf(k);
    return i < 0 ? ORDER.length : i;
  };
  return [...byKind.values()].sort((a, b) => rank(a.kind) - rank(b.kind));
}
