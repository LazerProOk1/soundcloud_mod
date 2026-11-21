import type { Track } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { cacheLikedTracks, type LikeCacheEntry } from './cache';

/** Tracks SoundCloud streams in full; previews and blocked ones can't be downloaded. */
export function isDownloadable(track: Track): boolean {
  return !track.access || track.access === 'playable';
}

/**
 * Saves tracks (and their lyrics) into the protected likes folder, which the cache limit never
 * cleans. The engine skips files it already has and only moves ones from the regular cache.
 */
export async function downloadTracksForOffline(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  const [{ buildStorageUrls, streamFallbackUrls, getSessionId }, lyrics] = await Promise.all([
    import('./api'),
    import('./lyrics-fetch'),
  ]);
  const hq = useSettingsStore.getState().highQualityStreaming;
  const sessionId = getSessionId();
  const entries: LikeCacheEntry[] = tracks.map((track) => ({
    urn: track.urn,
    urls: streamFallbackUrls(track.urn, hq),
    storageUrls: buildStorageUrls(track.urn),
    sessionId,
  }));
  void lyrics.cacheLyricsForTracks(tracks, 3);
  void cacheLikedTracks(entries);
}
