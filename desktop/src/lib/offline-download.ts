import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Track } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { cacheLikedTracks, type LikeCacheEntry, listCachedUrns } from './cache';
import type { CacheLikesProgress } from './cache-kind';
import { getArtistDisplay, getDisplayTitle } from './track-display';

/** Resolves when the engine's current save-for-offline run ends. Subscribe before starting it. */
function nextRunEnd(): Promise<CacheLikesProgress> {
  return new Promise((resolve) => {
    const off = listen<CacheLikesProgress>('track:cache-likes-progress', ({ payload }) => {
      if (payload.phase === 'done' || payload.phase === 'cancelled') {
        void off.then((fn) => fn());
        resolve(payload);
      }
    });
  });
}

async function saveToProtected(tracks: Track[]): Promise<CacheLikesProgress> {
  const { buildStorageUrls, streamFallbackUrls, getSessionId } = await import('./api');
  const hq = useSettingsStore.getState().highQualityStreaming;
  const sessionId = getSessionId();
  const entries: LikeCacheEntry[] = tracks.map((track) => ({
    urn: track.urn,
    urls: streamFallbackUrls(track.urn, hq),
    storageUrls: buildStorageUrls(track.urn),
    sessionId,
  }));
  const end = nextRunEnd();
  await cacheLikedTracks(entries);
  return end;
}

/**
 * Saves tracks (and their lyrics) into the protected likes folder, which the cache limit never
 * cleans. The engine skips files it already has and only moves ones from the regular cache.
 * Tracks SoundCloud no longer serves (deleted, 404) are then looked up by artist and title in
 * the fallback sources from Settings, like playback does, and moved in with a second run.
 */
export async function downloadTracksForOffline(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  const lyrics = await import('./lyrics-fetch');
  void lyrics.cacheLyricsForTracks(tracks, 3);

  const end = await saveToProtected(tracks);
  if (end.phase !== 'done' || end.failed === 0) return;
  console.warn(`[Offline] ${end.failed} track(s) failed on SoundCloud, trying fallback sources`);

  const sources = useSettingsStore
    .getState()
    .musicSources.filter((s) => s.enabled && s.id !== 'soundcloud')
    .map((s) => s.id);
  if (sources.length === 0) return;
  const onDisk = new Set(await listCachedUrns());
  const recovered: Track[] = [];
  for (const track of tracks.filter((t) => !onDisk.has(t.urn))) {
    try {
      await invoke('track_cache_from_fallback', {
        urn: track.urn,
        artist: getArtistDisplay(track).primary,
        title: getDisplayTitle(track),
        durationMs: track.duration || null,
        sources,
      });
      recovered.push(track);
      console.warn(`[Offline] ${track.urn} found in fallback sources`);
    } catch (e) {
      // Not found anywhere: stays counted as unavailable.
      console.warn(`[Offline] ${track.urn} not found in fallback sources: ${String(e)}`);
    }
  }
  if (recovered.length > 0) await saveToProtected(recovered);
}
