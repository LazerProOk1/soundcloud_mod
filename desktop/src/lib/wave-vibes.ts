export type WaveVibeId = 'all' | 'focus' | 'energy' | 'chill' | 'night' | 'workout';
export type WaveMode = 'similar' | 'diverse';

export interface WaveTrackLike {
  urn: string;
  title?: string | null;
  genre?: string | null;
  tag_list?: string | null;
  duration?: number | null;
  user?: {
    urn?: string | null;
    username?: string | null;
  } | null;
}

export interface WaveVibeMeta {
  id: WaveVibeId;
  tint: string;
}

export const WAVE_VIBES: readonly WaveVibeMeta[] = [
  { id: 'all', tint: 'var(--color-accent)' },
  { id: 'focus', tint: '#38bdf8' },
  { id: 'energy', tint: '#f97316' },
  { id: 'chill', tint: '#34d399' },
  { id: 'night', tint: '#a855f7' },
  { id: 'workout', tint: '#f43f5e' },
] as const;

const VIBE_KEYWORDS: Record<Exclude<WaveVibeId, 'all'>, readonly string[]> = {
  focus: [
    'ambient',
    'lofi',
    'lo-fi',
    'instrumental',
    'study',
    'focus',
    'minimal',
    'piano',
    'classical',
    'synthwave',
    'drone',
    'chillout',
    'meditation',
    'soundtrack',
    'score',
  ],
  energy: [
    'phonk',
    'hyperpop',
    'dnb',
    'drum & bass',
    'drum and bass',
    'dubstep',
    'edm',
    'trap',
    'rave',
    'techno',
    'hardstyle',
    'electro',
    'rock',
    'punk',
    'metal',
    'rage',
    'dance',
  ],
  chill: [
    'chill',
    'acoustic',
    'soul',
    'r&b',
    'rnb',
    'jazz',
    'indie',
    'folk',
    'dream',
    'downtempo',
    'mellow',
    'bossa',
    'sunset',
    'warm',
    'relax',
  ],
  night: [
    'night',
    'midnight',
    'dark',
    'deep',
    'deep house',
    'witch house',
    'darkwave',
    'post-punk',
    'atmospheric',
    'underground',
    'moody',
    'noir',
    'late',
    'shadow',
  ],
  workout: [
    'workout',
    'gym',
    'cardio',
    'pump',
    'phonk',
    'hard',
    'bass',
    'fitness',
    'sprint',
    'training',
    'motivation',
    'hype',
    'power',
    'run',
  ],
};

function tokenizeMetadata(track: WaveTrackLike): string {
  return [track.genre ?? '', track.tag_list ?? '', track.title ?? ''].join(' ').toLowerCase();
}

export function scoreTrackForVibe(track: WaveTrackLike, vibe: WaveVibeId): number {
  if (vibe === 'all') return 0;
  const hay = tokenizeMetadata(track);
  const genre = (track.genre ?? '').toLowerCase();
  const keywords = VIBE_KEYWORDS[vibe];

  let score = 0;
  for (const kw of keywords) {
    if (genre.includes(kw)) {
      score += 3;
    } else if (hay.includes(kw)) {
      score += 1.5;
    }
  }

  // Subtle duration affinity only refines tracks that already match the vibe
  if (score > 0) {
    const mins = (track.duration ?? 0) / 60_000;
    if (vibe === 'focus' && mins >= 3.2) score += 0.5;
    if (vibe === 'workout' && mins > 1.2 && mins <= 3.6) score += 0.5;
  }

  return score;
}

export function interleaveByArtist<T extends WaveTrackLike>(tracks: readonly T[]): T[] {
  if (tracks.length <= 2) return [...tracks];

  const buckets = new Map<string, T[]>();
  const order: string[] = [];

  for (const track of tracks) {
    const key = (track.user?.urn || track.user?.username || track.urn).toLowerCase();
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
      order.push(key);
    }
    list.push(track);
  }

  const out: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const key of order) {
      const list = buckets.get(key);
      if (list && list.length > 0) {
        const next = list.shift();
        if (next) {
          out.push(next);
          added = true;
        }
      }
    }
  }
  return out;
}

export function tuneWaveTracks<T extends WaveTrackLike>(
  tracks: readonly T[],
  vibe: WaveVibeId,
  mode: WaveMode,
): T[] {
  if (tracks.length === 0) return [];

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const tr of tracks) {
    if (!tr.urn || seen.has(tr.urn)) continue;
    seen.add(tr.urn);
    unique.push(tr);
  }

  if (vibe === 'all') {
    return mode === 'diverse' ? interleaveByArtist(unique) : unique;
  }

  const scored = unique.map((track, idx) => ({
    track,
    idx,
    score: scoreTrackForVibe(track, vibe),
  }));

  const matched = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((entry) => entry.track);

  const rest = scored.filter((entry) => entry.score <= 0).map((entry) => entry.track);

  if (mode === 'diverse') {
    return [...interleaveByArtist(matched), ...interleaveByArtist(rest)];
  }

  return [...matched, ...rest];
}
