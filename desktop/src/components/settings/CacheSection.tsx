import { listen } from '@tauri-apps/api/event';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  cancelCacheLikes,
  clearCache,
  clearImageCache,
  clearLikedCache,
  getCacheSize,
  getImageCacheSize,
  getLikedCacheSize,
  isCacheLikesRunning,
} from '../../lib/cache';
import { formatBytes } from '../../lib/formatters';
import { Download, Loader2, Trash2, X } from '../../lib/icons';
import { downloadTracksForOffline, isDownloadable } from '../../lib/offline-download';
import { CACHE_LIMIT_GB, useSettingsStore } from '../../stores/settings';
import { PILL_BTN } from '../ui/buttonClass';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { Segmented } from '../ui/Segmented';
import { Skeleton } from '../ui/Skeleton';
import { SettingRow, SettingsDivider, SettingsSection } from './SettingsKit';

const CLEAR_BTN =
  'press flex h-9 items-center gap-2 rounded-full bar-control ui-danger px-4 text-[13px] font-semibold text-white/80 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed';

function CacheRow({
  label,
  size,
  clearing,
  onClear,
}: {
  label: string;
  size: number | null;
  clearing: boolean;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-white/55">{label}</p>
        <div className="flex h-[25px] items-center">
          {size === null ? (
            <Skeleton className="h-[20px] w-25" />
          ) : (
            <p className="text-[17px] font-bold tabular-nums text-white/90">{formatBytes(size)}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={clearing || size === 0}
        className={CLEAR_BTN}
      >
        {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        {t('settings.clearCache')}
      </button>
    </div>
  );
}

type Progress = { done: number; total: number; failed: number; skipped: number };

/** Downloads every like into the protected folder, with live progress from the engine. */
function CacheLikesRow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    void isCacheLikesRunning().then((r) => {
      if (r) setRunning(true);
    });
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<Progress & { phase: 'start' | 'progress' | 'done' | 'cancelled' }>(
      'track:cache-likes-progress',
      (event) => {
        const p = event.payload;
        if (p.phase === 'start') {
          setRunning(true);
          setProgress({ done: 0, total: p.total, failed: 0, skipped: 0 });
        } else if (p.phase === 'progress') {
          setProgress({ done: p.done, total: p.total, failed: p.failed, skipped: p.skipped });
        } else {
          setRunning(false);
          setProgress(null);
          onDone();
          if (p.phase === 'done') {
            toast.success(
              t('settings.cacheLikesDone', { done: p.done - p.failed, total: p.total }),
            );
          }
        }
      },
    ).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDone, t]);

  const start = useCallback(async () => {
    setRunning(true);
    try {
      const { fetchAllLikedTracks } = await import('../../lib/hooks');
      // Previews and blocked tracks can't be downloaded: leaving them in kept the run at N-1 of N.
      const tracks = (await fetchAllLikedTracks(200)).filter(isDownloadable);
      if (tracks.length === 0) {
        setRunning(false);
        toast(t('settings.cacheLikesEmpty'));
        return;
      }
      // Same path as the list buttons: protected folder, then fallback sources for tracks
      // SoundCloud no longer serves. Progress comes back through the engine events.
      await downloadTracksForOffline(tracks);
    } catch (err) {
      setRunning(false);
      setProgress(null);
      toast.error(String(err));
    }
  }, [t]);

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <SettingRow title={t('settings.cacheLikes')} desc={t('settings.cacheLikesDesc')} stacked>
      {running ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-white/60">
            <span className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {progress
                ? t('settings.cacheLikesProgress', { done: progress.done, total: progress.total })
                : t('settings.cacheLikesStarting')}
            </span>
            {progress && progress.failed > 0 && (
              <span className="tabular-nums text-red-400/80">
                {t('settings.cacheLikesFailed', { count: progress.failed })}
              </span>
            )}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button type="button" onClick={() => void cancelCacheLikes()} className={PILL_BTN}>
            <X size={12} />
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void start()} className={PILL_BTN}>
          <Download size={12} />
          {t('settings.cacheLikes')}
        </button>
      )}
    </SettingRow>
  );
}

/** Wraps a clear action: spinner flag, success toast, error toast. */
function useClear(action: () => Promise<unknown>, after: () => void, okKey: string) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      await action();
      after();
      toast.success(t(okKey));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  }, [action, after, okKey, t]);
  return [busy, run] as const;
}

export const CacheSection = React.memo(function CacheSection() {
  const { t } = useTranslation();
  const audioCacheLimitMB = useSettingsStore((s) => s.audioCacheLimitMB);
  const setAudioCacheLimitMB = useSettingsStore((s) => s.setAudioCacheLimitMB);
  const cacheListenedTracks = useSettingsStore((s) => s.cacheListenedTracks);
  const setCacheListenedTracks = useSettingsStore((s) => s.setCacheListenedTracks);
  const [audioSize, setAudioSize] = useState<number | null>(null);
  const [imagesSize, setImagesSize] = useState<number | null>(null);
  const [likedSize, setLikedSize] = useState<number | null>(null);

  const refreshLikedSize = useCallback(() => {
    void getLikedCacheSize().then(setLikedSize);
  }, []);

  useEffect(() => {
    void getCacheSize().then(setAudioSize);
    void getImageCacheSize().then(setImagesSize);
    refreshLikedSize();
  }, [refreshLikedSize]);

  const [clearingAudio, clearAudio] = useClear(
    clearCache,
    useCallback(() => setAudioSize(0), []),
    'settings.cacheCleared',
  );
  const [clearingImages, clearImages] = useClear(
    clearImageCache,
    useCallback(() => setImagesSize(0), []),
    'settings.cacheCleared',
  );
  const [clearingLiked, clearLiked] = useClear(
    clearLikedCache,
    useCallback(() => setLikedSize(0), []),
    'settings.cacheCleared',
  );
  const [clearingTemp, clearTemp] = useClear(
    useCallback(() => Promise.all([clearCache(), clearImageCache()]), []),
    useCallback(() => {
      setAudioSize(0);
      setImagesSize(0);
    }, []),
    'settings.tempCacheCleared',
  );

  const loaded = audioSize !== null && imagesSize !== null && likedSize !== null;
  const tempSize = (audioSize ?? 0) + (imagesSize ?? 0);
  const totalSize = tempSize + (likedSize ?? 0);

  return (
    <SettingsSection
      id="cache"
      title={t('settings.cache')}
      desc={
        loaded ? (
          `${t('settings.total')}: ${formatBytes(totalSize)}`
        ) : (
          <Skeleton className="inline-block h-[12px] w-[80px]" />
        )
      }
      action={
        tempSize > 0 && (
          <button
            type="button"
            onClick={() => void clearTemp()}
            disabled={clearingTemp || clearingAudio || clearingImages}
            className={PILL_BTN}
          >
            {clearingTemp ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {t('settings.clearTempCache')}
          </button>
        )
      }
    >
      <CacheRow
        label={t('settings.audioCacheSize')}
        size={audioSize}
        clearing={clearingAudio}
        onClear={() => void clearAudio()}
      />
      <CacheRow
        label={t('settings.assetsCacheSize')}
        size={imagesSize}
        clearing={clearingImages}
        onClear={() => void clearImages()}
      />
      <CacheRow
        label={t('settings.likedCacheSize')}
        size={likedSize}
        clearing={clearingLiked}
        onClear={() => void clearLiked()}
      />
      <SettingsDivider />
      <CacheLikesRow onDone={refreshLikedSize} />
      <SettingsDivider />
      <SettingRow
        title={t('settings.audioCacheLimit')}
        desc={t('settings.audioCacheLimitDesc')}
        stacked
      >
        <Segmented
          value={String(audioCacheLimitMB)}
          options={CACHE_LIMIT_GB.map((gb) => ({
            id: String(gb * 1024),
            label: gb === 0 ? t('settings.unlimited') : `${gb} GB`,
          }))}
          onChange={(mb) => setAudioCacheLimitMB(Number(mb))}
        />
      </SettingRow>
      <SettingRow
        title={t('settings.cacheListenedTracks', 'Cache listened tracks')}
        desc={t(
          'settings.cacheListenedTracksDesc',
          'Save metadata and artwork to offline storage while listening',
        )}
      >
        <LiquidSwitch checked={cacheListenedTracks} onChange={setCacheListenedTracks} />
      </SettingRow>
    </SettingsSection>
  );
});
