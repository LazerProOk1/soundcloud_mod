import { useEffect, useRef } from 'react';
import { fetchSmartWave, type SmartWaveSeedKind, sendWaveFeedback } from '../../../lib/soundwave';
import { songKey } from '../../../lib/track-variants';
import type { Track } from '../../../stores/player';
import { usePlayerStore } from '../../../stores/player';

/**
 * Refill subscriptions by wave key. They outlive the component on purpose: the wave keeps
 * going after the listener leaves its page. A new mount for the same key replaces the old one.
 * ponytail: one live subscription per wave ever opened (user + each artist); each is a cheap
 * check on player updates. Drop the oldest ones if this ever grows large.
 */
const liveRefills = new Map<string, () => void>();

/**
 * Endless SmartWave on the client.
 *
 * 1. The hook owns the cursor: a server token that remembers what was served and the adaptive
 *    arm weights. It is updated after every refill; if the server lost it, a new session starts.
 * 2. A refill runs only while one of our tracks plays and fewer than `minTail` remain in the
 *    queue. Other queues (playlists, likes) never trigger it.
 * 3. Feedback (negative / positive) piles up between refills and is sent before the next fetch.
 */
export function useInfiniteWave(opts: {
  enabled: boolean;
  seedKind: SmartWaveSeedKind;
  seedId?: string;
  initialTracks: Track[];
  initialCursor: string | null;
  languages?: string[];
  filterTrack?: (t: Track) => boolean;
  minTail?: number;
  batchLimit?: number;
  /** Called whenever new tracks are appended to the queue (refill batches). */
  onTracksAdded?: (tracks: Track[]) => void;
  /** Is this queue ours? (The wave mixes in liked / "more like this" tracks too.) */
  ownsTrack?: (urn: string) => boolean;
  /** Order a refill batch (dedupe, taste). */
  rank?: (tracks: Track[]) => Track[];
  /** Local tracks to fall back on when the server has nothing new. */
  fallback?: () => Track[];
}) {
  const {
    enabled,
    seedKind,
    seedId,
    initialTracks,
    initialCursor,
    languages,
    filterTrack,
    minTail = 8,
    batchLimit = 20,
    onTracksAdded,
  } = opts;
  const ownsRef = useRef(opts.ownsTrack);
  const rankRef = useRef(opts.rank);
  const fallbackRef = useRef(opts.fallback);
  ownsRef.current = opts.ownsTrack;
  rankRef.current = opts.rank;
  fallbackRef.current = opts.fallback;
  const onTracksAddedRef = useRef(onTracksAdded);
  useEffect(() => {
    onTracksAddedRef.current = onTracksAdded;
  }, [onTracksAdded]);

  const ownedRef = useRef<Set<string>>(new Set());
  const cursorRef = useRef<string>(initialCursor ?? '');
  const fetchingRef = useRef(false);
  const negCountRef = useRef(0);
  const posCountRef = useRef(0);
  const languagesRef = useRef(languages);
  const filterRef = useRef(filterTrack);

  useEffect(() => {
    languagesRef.current = languages;
  }, [languages]);
  useEffect(() => {
    filterRef.current = filterTrack;
  }, [filterTrack]);

  useEffect(() => {
    if (initialCursor) cursorRef.current = initialCursor;
  }, [initialCursor]);

  useEffect(() => {
    for (const t of initialTracks) ownedRef.current.add(t.urn);
  }, [initialTracks]);

  useEffect(() => {
    const key = `${seedKind}:${seedId ?? ''}`;
    liveRefills.get(key)?.();
    liveRefills.delete(key);
    if (!enabled) return;

    const unsubscribe = usePlayerStore.subscribe((state) => {
      const { queue, queueIndex, currentTrack, isPlaying } = state;
      if (!currentTrack) return;
      if (!ownedRef.current.has(currentTrack.urn) && !ownsRef.current?.(currentTrack.urn)) return;

      const remaining = queue.length - queueIndex - 1;
      if (remaining > minTail) return;
      if (!isPlaying && remaining > 0) return;
      if (fetchingRef.current) return;

      fetchingRef.current = true;
      (async () => {
        try {
          if (cursorRef.current && (negCountRef.current > 0 || posCountRef.current > 0)) {
            const updated = await sendWaveFeedback({
              cursor: cursorRef.current,
              negatives: negCountRef.current,
              positives: posCountRef.current,
            });
            negCountRef.current = 0;
            posCountRef.current = 0;
            if (updated) cursorRef.current = updated;
          }
          const batch = await fetchSmartWave({
            seedKind,
            seedId,
            cursor: cursorRef.current || undefined,
            limit: batchLimit,
            languages: languagesRef.current,
          });
          if (batch.cursor) cursorRef.current = batch.cursor;
          const filterFn = filterRef.current;
          const queued = usePlayerStore.getState().queue;
          const existing = new Set(queued.map((t) => t.urn));
          // Another upload of a song already in the queue is a repeat too.
          const songs = new Set(queued.map(songKey).filter((k) => k.length >= 6));
          const pick = (list: Track[]) =>
            list.filter(
              (t) => !existing.has(t.urn) && !songs.has(songKey(t)) && (!filterFn || filterFn(t)),
            );
          // The local pool (YouTube Music radio, "more like this", liked) comes first:
          // it's what the listener's taste picked. The server batch only fills the gaps.
          let fresh = pick(fallbackRef.current?.() ?? []).slice(0, batchLimit);
          if (fresh.length < batchLimit / 2) {
            const have = new Set(fresh.map((t) => t.urn));
            fresh = [...fresh, ...pick(batch.tracks).filter((t) => !have.has(t.urn))];
          }
          fresh = rankRef.current ? rankRef.current(fresh) : fresh;
          if (fresh.length > 0) {
            usePlayerStore.getState().addToQueue(fresh);
            for (const t of fresh) ownedRef.current.add(t.urn);
            onTracksAddedRef.current?.(fresh);
          }
        } catch (e) {
          console.debug('[soundwave] infinite refill failed:', e);
        } finally {
          fetchingRef.current = false;
        }
      })();
    });
    liveRefills.set(key, unsubscribe);
    // No cleanup: the subscription stays alive after unmount (see liveRefills).
  }, [enabled, seedKind, seedId, minTail, batchLimit]);

  return {
    recordNegative: () => {
      negCountRef.current += 1;
    },
    recordPositive: () => {
      posCountRef.current += 1;
    },
    isOwned: (urn: string) => ownedRef.current.has(urn),
  };
}
