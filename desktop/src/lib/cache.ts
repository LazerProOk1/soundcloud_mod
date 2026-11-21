import { appCacheDir, join } from '@tauri-apps/api/path';
import { mkdir, readDir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useCachedUrnsStore } from '../stores/cached-urns';
import { type PlaybackQuality, type PlaybackSource, usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { getStaticPort } from './constants';
import { trackedInvoke as invoke } from './diagnostics';
import { resolveWallpaperUrl } from './wallpapers';

const WALLPAPERS_DIR = 'wallpapers';
// Enforcing the cache limit walks the whole audio directory in Rust (and it is a
// synchronous command), so once a minute was far too often; a hidden window has
// nothing to enforce either.
const CACHE_MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

let cacheMaintenanceStarted = false;

/* ── Track cache (Rust) ─────────────────────────────────── */

export interface TrackCacheInfo {
  path: string;
  quality: PlaybackQuality | null;
  source: PlaybackSource | null;
}

export function getCacheInfo(urn: string): Promise<TrackCacheInfo | null> {
  return invoke<TrackCacheInfo | null>('track_get_cache_info', { urn });
}

/**
 * `direct: true` tries only SoundCloud itself (fast); the legacy streaming server is
 * then a last resort, after the Zaycev/YouTube fallbacks.
 */
export async function ensureTrackCached(
  urn: string,
  highQualityStreaming = useSettingsStore.getState().highQualityStreaming,
  direct = false,
): Promise<TrackCacheInfo> {
  const cached = await getCacheInfo(urn);
  if (cached) {
    useCachedUrnsStore.getState().markCached(urn);
    return cached;
  }

  const { buildStorageUrls, streamFallbackUrls, getSessionId } = await import('./api');
  const sessionId = getSessionId();
  const urls = direct ? [] : streamFallbackUrls(urn, highQualityStreaming);
  const storageUrls = direct ? [] : buildStorageUrls(urn);

  const info = await invoke<TrackCacheInfo>('track_ensure_cached', {
    urn,
    urls,
    storageUrls,
    sessionId,
  });
  useCachedUrnsStore.getState().markCached(urn);
  return info;
}

export function getCacheSize(): Promise<number> {
  return invoke<number>('track_cache_size');
}

export function getLikedCacheSize(): Promise<number> {
  return invoke<number>('track_liked_cache_size');
}

export async function clearCache(): Promise<void> {
  await invoke('track_clear_cache');
  const remaining = await listCachedUrns().catch(() => []);
  useCachedUrnsStore.setState({ urns: new Set(remaining), hydrated: true });
}

export async function clearLikedCache(): Promise<void> {
  await invoke('track_clear_liked_cache');
  const remaining = await listCachedUrns().catch(() => []);
  useCachedUrnsStore.setState({ urns: new Set(remaining), hydrated: true });
}

export function listCachedUrns(): Promise<string[]> {
  return invoke<string[]>('track_list_cached');
}

export async function removeCachedTrack(urn: string): Promise<boolean> {
  const removed = await invoke<boolean>('track_remove_cached', { urn });
  if (removed) {
    useCachedUrnsStore.getState().removeCached(urn);
  }
  return removed;
}

export function markTrackPlayed(urn: string): Promise<void> {
  return invoke('track_mark_played', { urn });
}

export interface LikeCacheEntry {
  urn: string;
  urls: string[];
  storageUrls: string[];
  sessionId: string | null;
}

export function cacheLikedTracks(entries: LikeCacheEntry[]): Promise<void> {
  return invoke('track_cache_likes', { entries });
}

export function isCacheLikesRunning(): Promise<boolean> {
  return invoke<boolean>('track_cache_likes_running');
}

export function cancelCacheLikes(): Promise<void> {
  return invoke('track_cancel_cache_likes');
}

export function enforceAudioCacheLimit(
  limitMb = useSettingsStore.getState().audioCacheLimitMB,
): Promise<void> {
  if (!limitMb || limitMb <= 0) return Promise.resolve();
  const { currentTrack, queue, queueIndex } = usePlayerStore.getState();
  const protectedSet = new Set<string>();
  if (currentTrack?.urn) protectedSet.add(currentTrack.urn);
  for (let i = Math.max(0, queueIndex); i <= Math.min(queue.length - 1, queueIndex + 3); i++) {
    const u = queue[i]?.urn;
    if (u) protectedSet.add(u);
  }
  return invoke('track_enforce_cache_limit', {
    limitMb,
    protectedUrns: Array.from(protectedSet),
  });
}

/* ── Cache maintenance ───────────────────────────────────── */

export function setupCacheMaintenance() {
  if (cacheMaintenanceStarted) return;
  cacheMaintenanceStarted = true;

  void enforceAudioCacheLimit();

  useSettingsStore.subscribe((state, prev) => {
    if (state.audioCacheLimitMB !== prev.audioCacheLimitMB) {
      void enforceAudioCacheLimit(state.audioCacheLimitMB);
    }
  });

  window.setInterval(() => {
    if (document.hidden) return;
    void enforceAudioCacheLimit();
  }, CACHE_MAINTENANCE_INTERVAL_MS);
}

/* ── Image cache (permanent, Rust) ───────────────────────── */

export function getImageCacheSize(): Promise<number> {
  return invoke<number>('image_cache_size');
}

export function clearImageCache(): Promise<void> {
  return invoke('image_cache_clear');
}

/* ── Wallpapers ──────────────────────────────────────────── */

let wallpapersBasePath: string | null = null;

async function getWallpapersDir(): Promise<string> {
  if (wallpapersBasePath) return wallpapersBasePath;
  const base = await appCacheDir();
  wallpapersBasePath = await join(base, WALLPAPERS_DIR);
  await mkdir(wallpapersBasePath, { recursive: true });
  return wallpapersBasePath;
}

function extensionFromType(mime: string): string {
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('svg')) return '.svg';
  return '.jpg';
}

/** Скачивает картинку по URL и сохраняет в wallpapers/. Возвращает имя файла. */
export async function downloadWallpaper(url: string): Promise<string> {
  const res = await tauriFetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const ct = res.headers.get('content-type') ?? 'image/jpeg';
  const ext = extensionFromType(ct);
  const name = `wallpaper_${Date.now()}${ext}`;
  const dir = await getWallpapersDir();
  const path = await join(dir, name);
  const buffer = await res.arrayBuffer();
  await writeFile(path, new Uint8Array(buffer));
  return name;
}

/** Сохраняет ArrayBuffer (из input type=file) как wallpaper. Возвращает имя файла. */
export async function saveWallpaperFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<string> {
  const dir = await getWallpapersDir();
  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.jpg';
  const name = `wallpaper_${Date.now()}${ext}`;
  const path = await join(dir, name);
  await writeFile(path, new Uint8Array(buffer));
  return name;
}

/** Получить имена всех сохранённых wallpapers */
export async function listWallpapers(): Promise<string[]> {
  try {
    const dir = await getWallpapersDir();
    const entries = await readDir(dir);
    const names: string[] = [];
    for (const entry of entries) {
      if (entry.name && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(entry.name)) {
        names.push(entry.name);
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** Удалить wallpaper по имени файла */
export async function removeWallpaper(name: string): Promise<void> {
  const dir = await getWallpapersDir();
  const path = await join(dir, name);
  await remove(path).catch(() => {});
}

/** HTTP / asset URL для wallpaper по имени файла (поддерживает preset:*) */
export function getWallpaperUrl(name: string): string | null {
  return resolveWallpaperUrl(name, getStaticPort());
}

/* ── Track Download ──────────────────────────────────────── */

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function downloadTrack(urn: string, artist: string, title: string): Promise<string> {
  const { save } = await import('@tauri-apps/plugin-dialog');

  const filename = sanitizeFilename(`${artist} - ${title}.mp3`);

  const dest = await save({
    defaultPath: filename,
    filters: [{ name: 'Audio', extensions: ['mp3'] }],
  });
  if (!dest) throw new Error('cancelled');

  const cachedPath = (await ensureTrackCached(urn)).path;
  if (!cachedPath) throw new Error('Failed to cache track');

  return invoke<string>('save_track_to_path', { cachePath: cachedPath, destPath: dest });
}
