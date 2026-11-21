import { useEffect, useState } from 'react';
import { useCachedUrnsStore } from '../stores/cached-urns';
import { getCacheInfo } from './cache';

/** Where a downloaded track lives: the protected likes folder or the evictable cache. */
export type CacheKind = 'liked' | 'temp';

const kinds = new Map<string, Promise<CacheKind | null>>();
// Files move between folders (likes get cached, cache gets cleared): forget on any change.
useCachedUrnsStore.subscribe(() => kinds.clear());

function lookup(urn: string): Promise<CacheKind | null> {
  let kind = kinds.get(urn);
  if (!kind) {
    kind = getCacheInfo(urn)
      .then((info) => (info ? (/[\\/]audio_liked[\\/]/.test(info.path) ? 'liked' : 'temp') : null))
      .catch(() => null);
    kinds.set(urn, kind);
  }
  return kind;
}

/** How many of these tracks are not yet in the protected likes folder. */
export async function countNotProtected(urns: string[]): Promise<number> {
  const onDisk = useCachedUrnsStore.getState().urns;
  const kinds = await Promise.all(urns.map((u) => (onDisk.has(u) ? lookup(u) : null)));
  return kinds.filter((k) => k !== 'liked').length;
}

/** Cache kind of a track, or null when it is not on disk. One lookup per track. */
export function useCacheKind(urn: string): CacheKind | null {
  const cached = useCachedUrnsStore((s) => s.urns.has(urn));
  const [kind, setKind] = useState<CacheKind | null>(null);
  useEffect(() => {
    if (!cached) {
      setKind(null);
      return;
    }
    let alive = true;
    void lookup(urn).then((k) => {
      if (alive) setKind(k);
    });
    return () => {
      alive = false;
    };
  }, [urn, cached]);
  return cached ? (kind ?? 'temp') : null;
}
