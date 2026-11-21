import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCachedUrnsStore } from '../stores/cached-urns';
import { getCacheInfo, listCachedUrns } from './cache';

/** Where a downloaded track lives: the protected likes folder or the evictable cache. */
export type CacheKind = 'liked' | 'temp';

const kinds = new Map<string, Promise<CacheKind | null>>();
// Files move between folders (likes get cached, cache gets cleared): forget on any change.
useCachedUrnsStore.subscribe(() => kinds.clear());

export interface CacheLikesProgress {
  phase: 'start' | 'progress' | 'done' | 'cancelled';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  urn?: string | null;
}

// While saving to the protected folder, re-read what is really on disk (at most once a
// second, and at the end) and forget folder lookups: files may have just moved there.
// The progress event names every processed track, failed ones too, so it can't mark them.
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunFailed = 0;
/** Tracks the last save-for-offline run could not fetch (kept until the next run ends). */
export function getLastRunFailed(): number {
  return lastRunFailed;
}
let version = 0;
const versionListeners = new Set<() => void>();
/** Bumps when folder lookups were forgotten, so badges and buttons look again. */
export function useCacheKindsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      versionListeners.add(cb);
      return () => versionListeners.delete(cb);
    },
    () => version,
  );
}
function resyncOnDisk() {
  kinds.clear();
  version++;
  for (const l of versionListeners) l();
  void listCachedUrns().then((urns) => useCachedUrnsStore.getState().markManyCached(urns));
}
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<CacheLikesProgress>('track:cache-likes-progress', ({ payload }) => {
      if (payload.phase === 'done' || payload.phase === 'cancelled') {
        lastRunFailed = payload.failed;
        if (resyncTimer) clearTimeout(resyncTimer);
        resyncTimer = null;
        resyncOnDisk();
      } else if (!resyncTimer) {
        resyncTimer = setTimeout(() => {
          resyncTimer = null;
          resyncOnDisk();
        }, 1000);
      }
    }),
  );
}

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
  const kindsVersion = useCacheKindsVersion();
  const [kind, setKind] = useState<CacheKind | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version re-runs the lookup
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
  }, [urn, cached, kindsVersion]);
  return cached ? (kind ?? 'temp') : null;
}
