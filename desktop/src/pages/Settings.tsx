import * as Popover from '@radix-ui/react-popover';
import { listen } from '@tauri-apps/api/event';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AboutSection } from '../components/settings/AboutSection';
import { InterfaceSection } from '../components/settings/InterfaceSection';
import { TransitionsSection } from '../components/settings/TransitionsSection';
import { LiquidSwitch } from '../components/ui/LiquidSwitch.tsx';
import { RANGE_CLS } from '../components/ui/rangeClass';
import { Segmented } from '../components/ui/Segmented';
import { PILL_BTN } from '../components/ui/buttonClass';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { changeAppLanguage } from '../i18n';
import { switchAudioDevice } from '../lib/audio';
import { downloadProfileBackup, restoreProfileBackupFromText } from '../lib/backup';
import {
  cacheLikedTracks,
  cancelCacheLikes,
  clearCache,
  clearImageCache,
  clearLikedCache,
  downloadWallpaper,
  getCacheSize,
  getImageCacheSize,
  getLikedCacheSize,
  getWallpaperUrl,
  isCacheLikesRunning,
  type LikeCacheEntry,
  listWallpapers,
  removeWallpaper,
  saveWallpaperFromBuffer,
} from '../lib/cache';
import { hslToHex, hueOfHex } from '../lib/color';
import { trackedInvoke } from '../lib/diagnostics';
import { isDownloadable } from '../lib/offline-download';
import { formatBytes } from '../lib/formatters';
import {
  Check,
  Download,
  Heart,
  Link,
  Loader2,
  Pipette,
  playBlack14,
  Trash2,
  Upload,
  X,
} from '../lib/icons';
import { PRESET_WALLPAPERS } from '../lib/wallpapers';
import { useAuthStore } from '../stores/auth';
import { type DiscordRpcMode, type StartupPage, useSettingsStore } from '../stores/settings';

const PRESET_COLORS = [
  '#ff5500',
  '#ffffff',
  '#ff3366',
  '#7c3aed',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#eab308',
  '#ef4444',
];

/** Audio cache limit choices in GB (0 = no limit). */
const CACHE_LIMIT_GB = [1, 2, 5, 10, 20, 0];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;

const STARTUP_PAGES: Array<{ id: StartupPage; labelKey: string }> = [
  { id: 'home', labelKey: 'nav.home' },
  { id: 'search', labelKey: 'nav.search' },
  { id: 'library', labelKey: 'nav.library' },
  { id: 'settings', labelKey: 'nav.settings' },
];

const DISCORD_RPC_MODES: Array<{ id: DiscordRpcMode; labelKey: string }> = [
  { id: 'track', labelKey: 'settings.discordRpcModeTrack' },
  { id: 'artist', labelKey: 'settings.discordRpcModeArtist' },
  { id: 'activity', labelKey: 'settings.discordRpcModeActivity' },
];

/* ── Language Section ─────────────────────────────────────── */

const LanguageSection = React.memo(function LanguageSection() {
  const { t, i18n } = useTranslation();

  return (
    <section className="settings-section">
      <h3 className="text-[22px] font-bold text-white tracking-tight mb-4">
        {t('settings.language')}
      </h3>
      <Segmented
        value={i18n.language}
        options={LANGUAGES.map((lang) => ({ id: lang.code, label: lang.label }))}
        onChange={(code) => void changeAppLanguage(code)}
      />
    </section>
  );
});

/* ── Cache Section ──────────────────────────────────────── */

function CacheRow({
  label,
  size,
  clearing,
  onClear,
  t,
}: {
  label: string;
  size: number | null;
  clearing: boolean;
  onClear: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[13px] text-white/60 font-medium">{label}</p>

          <div className="h-[25px] flex items-center">
            {size === null ? (
              <Skeleton className="w-25 h-[20px]" />
            ) : (
              <p className="text-[17px] font-bold text-white/90 tabular-nums">
                {formatBytes(size)}
              </p>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={clearing || size === 0}
        className="press flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/80 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
      >
        {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        {t('settings.clearCache')}
      </button>
    </div>
  );
}

function CacheListenedToggle() {
  const { t } = useTranslation();
  const cacheListenedTracks = useSettingsStore((s) => s.cacheListenedTracks);
  const setCacheListenedTracks = useSettingsStore((s) => s.setCacheListenedTracks);
  return (
    <div className="flex items-center justify-between pt-1">
      <div>
        <p className="text-[13px] text-white/60 font-medium">
          {t('settings.cacheListenedTracks', 'Кэш прослушанных треков')}
        </p>
        <p className="text-[11px] text-white/30 mt-0.5">
          {t(
            'settings.cacheListenedTracksDesc',
            'Сохранять метаданные и обложки в офлайн-хранилище при прослушивании',
          )}
        </p>
      </div>
      <LiquidSwitch checked={cacheListenedTracks} onChange={setCacheListenedTracks} />
    </div>
  );
}

const CacheSection = React.memo(function CacheSection() {
  const { t } = useTranslation();
  const audioCacheLimitMB = useSettingsStore((s) => s.audioCacheLimitMB);
  const setAudioCacheLimitMB = useSettingsStore((s) => s.setAudioCacheLimitMB);
  const [audioSize, setAudioSize] = useState<number | null>(null);
  const [imagesSize, setImagesSize] = useState<number | null>(null);
  const [likedSize, setLikedSize] = useState<number | null>(null);
  const [clearingAudio, setClearingAudio] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);
  const [clearingLiked, setClearingLiked] = useState(false);
  const [clearingTemp, setClearingTemp] = useState(false);
  const [cachingLikes, setCachingLikes] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    failed: number;
    skipped: number;
  } | null>(null);

  const refreshLikedSize = useCallback(() => {
    void getLikedCacheSize().then(setLikedSize);
  }, []);

  useEffect(() => {
    void getCacheSize().then(setAudioSize);
    void getImageCacheSize().then(setImagesSize);
    refreshLikedSize();
    void isCacheLikesRunning().then((running) => {
      if (running) setCachingLikes(true);
    });
  }, [refreshLikedSize]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<{
      phase: 'start' | 'progress' | 'done' | 'cancelled';
      total: number;
      done: number;
      failed: number;
      skipped: number;
    }>('track:cache-likes-progress', (event) => {
      const p = event.payload;
      if (p.phase === 'start') {
        setCachingLikes(true);
        setProgress({ done: 0, total: p.total, failed: 0, skipped: 0 });
      } else if (p.phase === 'progress') {
        setProgress({
          done: p.done,
          total: p.total,
          failed: p.failed,
          skipped: p.skipped,
        });
      } else {
        setCachingLikes(false);
        setProgress(null);
        refreshLikedSize();
        if (p.phase === 'done') {
          toast.success(
            t('settings.cacheLikesDone', {
              done: p.done - p.failed,
              total: p.total,
            }),
          );
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refreshLikedSize, t]);

  const handleClearAudio = useCallback(async () => {
    setClearingAudio(true);
    try {
      await clearCache();
      setAudioSize(0);
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingAudio(false);
    }
  }, [t]);

  const handleClearImages = useCallback(async () => {
    setClearingImages(true);
    try {
      await clearImageCache();
      setImagesSize(0);
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingImages(false);
    }
  }, [t]);

  const handleClearLiked = useCallback(async () => {
    setClearingLiked(true);
    try {
      await clearLikedCache();
      setLikedSize(0);
      toast.success(t('settings.cacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingLiked(false);
    }
  }, [t]);

  const handleClearTempCache = useCallback(async () => {
    setClearingTemp(true);
    try {
      await Promise.all([clearCache(), clearImageCache()]);
      setAudioSize(0);
      setImagesSize(0);
      toast.success(t('settings.tempCacheCleared'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setClearingTemp(false);
    }
  }, [t]);

  const handleCacheLikes = useCallback(async () => {
    setCachingLikes(true);
    try {
      const [
        { fetchAllLikedTracks },
        { buildStorageUrls, streamFallbackUrls, getSessionId },
        { cacheLyricsForTracks },
      ] = await Promise.all([
        import('../lib/hooks'),
        import('../lib/api'),
        import('../lib/lyrics-fetch'),
      ]);
      const hq = useSettingsStore.getState().highQualityStreaming;
      const sessionId = getSessionId();
      // Previews and blocked tracks can't be downloaded: leaving them in kept the run at N-1 of N.
      const tracks = (await fetchAllLikedTracks(200)).filter(isDownloadable);
      const entries: LikeCacheEntry[] = tracks.map((track) => ({
        urn: track.urn,
        urls: streamFallbackUrls(track.urn, hq),
        storageUrls: buildStorageUrls(track.urn),
        sessionId,
      }));
      if (entries.length === 0) {
        setCachingLikes(false);
        toast(t('settings.cacheLikesEmpty'));
        return;
      }
      // Start audio caching (Rust) and lyrics caching (TS) in parallel
      void cacheLyricsForTracks(tracks, 3);
      await cacheLikedTracks(entries);
    } catch (err) {
      setCachingLikes(false);
      setProgress(null);
      toast.error(String(err));
    }
  }, [t]);

  const handleCancelCacheLikes = useCallback(() => {
    void cancelCacheLikes();
  }, []);

  const totalSize = (audioSize ?? 0) + (imagesSize ?? 0) + (likedSize ?? 0);

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  const tempSize = (audioSize ?? 0) + (imagesSize ?? 0);

  return (
    <section className="settings-section space-y-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-[22px] font-bold text-white tracking-tight">{t('settings.cache')}</h3>

        <div className="flex items-center gap-3 min-w-[80px] justify-end">
          {tempSize > 0 && (
            <button
              type="button"
              onClick={handleClearTempCache}
              disabled={clearingTemp || clearingAudio || clearingImages}
              className={PILL_BTN}
            >
              {clearingTemp ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('settings.clearTempCache')}
            </button>
          )}
          {audioSize !== null && imagesSize !== null && likedSize !== null ? (
            <span className="text-[12px] text-white/30 tabular-nums">
              {t('settings.total')}: {formatBytes(totalSize)}
            </span>
          ) : (
            <Skeleton className="h-[12px] w-[80px]" />
          )}
        </div>
      </div>
      <CacheRow
        label={t('settings.audioCacheSize')}
        size={audioSize}
        clearing={clearingAudio}
        onClear={handleClearAudio}
        t={t}
      />
      <div className="border-t border-white/[0.04]" />
      <CacheRow
        label={t('settings.assetsCacheSize')}
        size={imagesSize}
        clearing={clearingImages}
        onClear={handleClearImages}
        t={t}
      />
      <div className="border-t border-white/[0.04]" />
      <CacheRow
        label={t('settings.likedCacheSize')}
        size={likedSize}
        clearing={clearingLiked}
        onClear={handleClearLiked}
        t={t}
      />

      <div className="pt-2 space-y-2">
        <p className="text-[11px] text-white/30">{t('settings.cacheLikesDesc')}</p>
        {cachingLikes ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px] text-white/60">
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                {progress
                  ? t('settings.cacheLikesProgress', {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t('settings.cacheLikesStarting')}
              </span>
              {progress && progress.failed > 0 && (
                <span className="text-red-400/80 tabular-nums">
                  {t('settings.cacheLikesFailed', { count: progress.failed })}
                </span>
              )}
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <button
              type="button"
              onClick={handleCancelCacheLikes}
              className="press flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/80 hover:bg-white/[0.12] hover:text-white cursor-pointer"
            >
              <X size={12} />
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCacheLikes}
            className="press flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/80 hover:bg-white/[0.12] hover:text-white cursor-pointer"
          >
            <Download size={12} />
            {t('settings.cacheLikes')}
          </button>
        )}
      </div>

      <div className="border-t border-white/[0.04]" />
      <div className="pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-white/60 font-medium">{t('settings.audioCacheLimit')}</p>
            <p className="text-[11px] text-white/30 mt-0.5">{t('settings.audioCacheLimitDesc')}</p>
          </div>
        </div>
        <Segmented
          value={String(audioCacheLimitMB)}
          options={CACHE_LIMIT_GB.map((gb) => ({
            id: String(gb * 1024),
            label: gb === 0 ? t('settings.unlimited') : `${gb} GB`,
          }))}
          onChange={(mb) => setAudioCacheLimitMB(Number(mb))}
        />
      </div>

      <div className="border-t border-white/[0.04]" />
      <CacheListenedToggle />
    </section>
  );
});

/* ── Wallpaper Picker ───────────────────────────────────── */

const WallpaperPicker = React.memo(function WallpaperPicker() {
  const { t } = useTranslation();
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const setBackgroundImage = useSettingsStore((s) => s.setBackgroundImage);

  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listWallpapers().then((names) => {
      setWallpapers(names);
      setLoading(false);
    });
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const name = await saveWallpaperFromBuffer(buffer, file.name);
        setWallpapers((prev) => [...prev, name]);
        setBackgroundImage(name);
        toast.success(t('settings.wallpaperAdded'));
      } catch {
        toast.error(t('common.error'));
      }
      e.target.value = '';
    },
    [setBackgroundImage, t],
  );

  const handleDownloadUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setDownloading(true);
    try {
      const name = await downloadWallpaper(url);
      setWallpapers((prev) => [...prev, name]);
      setBackgroundImage(name);
      setUrlInput('');
      setShowUrlInput(false);
      toast.success(t('settings.wallpaperAdded'));
    } catch {
      toast.error(t('settings.bgLoadError'));
    } finally {
      setDownloading(false);
    }
  }, [urlInput, setBackgroundImage, t]);

  const handleRemove = useCallback(
    async (name: string) => {
      await removeWallpaper(name);
      setWallpapers((prev) => prev.filter((w) => w !== name));
      if (backgroundImage === name) {
        setBackgroundImage('');
      }
    },
    [backgroundImage, setBackgroundImage],
  );

  const handleSelect = useCallback(
    (name: string) => {
      setBackgroundImage(backgroundImage === name ? '' : name);
    },
    [backgroundImage, setBackgroundImage],
  );

  return (
    <div className="space-y-3">
      <label className="text-[13px] text-white/50 font-medium">
        {t('settings.backgroundImage')}
      </label>

      {/* Wallpaper grid */}
      <div className="grid grid-cols-5 gap-2.5">
        {/* "None" option */}
        <button
          type="button"
          onClick={() => setBackgroundImage('')}
          className={`press-soft relative flex aspect-video items-center justify-center rounded-xl bg-white/[0.04] cursor-pointer ${optionRing(!backgroundImage)}`}
        >
          <span className="text-[12px] font-semibold text-white/60">{t('settings.none')}</span>
          {!backgroundImage && <SelectedCheck />}
        </button>

        {/* Built-in Liquid Glass preset wallpapers */}
        {PRESET_WALLPAPERS.map((preset) => {
          const url = getWallpaperUrl(preset.id);
          const selected = backgroundImage === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={t(preset.labelKey, preset.fallbackLabel)}
              onClick={() => handleSelect(preset.id)}
              className={`press-soft relative aspect-video overflow-hidden rounded-xl cursor-pointer ${optionRing(selected)}`}
            >
              {url && <img src={url} alt="" className="h-full w-full object-cover" />}
              {selected && <SelectedCheck />}
            </button>
          );
        })}

        {/* Saved wallpapers */}
        {wallpapers.map((name) => {
          const url = getWallpaperUrl(name);
          const selected = backgroundImage === name;
          return (
            <div
              key={name}
              className={`press-soft group relative aspect-video overflow-hidden rounded-xl cursor-pointer ${optionRing(selected)}`}
              onClick={() => handleSelect(name)}
            >
              {url && <img src={url} alt="" className="h-full w-full object-cover" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(name);
                }}
                className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/80 cursor-pointer"
              >
                <X size={10} className="text-white" />
              </button>
              {selected && <SelectedCheck />}
            </div>
          );
        })}

        {loading && (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-white/[0.04]">
            <Loader2 size={14} className="animate-spin text-white/30" />
          </div>
        )}

        {/* Add from file */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="press flex aspect-video flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white cursor-pointer"
        >
          <Upload size={15} />
          <span className="text-[11px] font-semibold">{t('settings.addFile')}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Add from URL */}
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className={`press flex aspect-video flex-col items-center justify-center gap-1 rounded-xl cursor-pointer ${
            showUrlInput
              ? 'bg-white/[0.10] text-white'
              : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <Link size={15} />
          <span className="text-[11px] font-semibold">URL</span>
        </button>
      </div>

      {/* URL download input */}
      {showUrlInput && (
        <div className="flex gap-2 animate-fade-in-up">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDownloadUrl()}
            placeholder={t('settings.bgUrlPlaceholder')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] text-white/80 placeholder:text-white/20 focus:border-white/[0.12] focus:bg-white/[0.06] transition-all duration-200 outline-none"
            autoFocus
          />
          <button
            onClick={handleDownloadUrl}
            disabled={downloading || !urlInput.trim()}
            className={PILL_BTN}
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : t('settings.download')}
          </button>
        </div>
      )}
    </div>
  );
});

/* ── Accent From Wallpaper ──────────────────────────────── */

function AccentFromWallpaperBtn({
  backgroundImage,
  onColor,
}: {
  backgroundImage: string;
  onColor: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const extract = useCallback(async () => {
    setLoading(true);
    try {
      const { getWallpaperUrl } = await import('../lib/cache');
      const url = getWallpaperUrl(backgroundImage);
      if (!url) return;

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const SIZE = 80; // downsample for speed
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('no ctx'));
            return;
          }
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

          // Collect saturated pixels with decent brightness
          const colors: [number, number, number][] = [];
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i],
              g = data[i + 1],
              b = data[i + 2];
            const max = Math.max(r, g, b),
              min = Math.min(r, g, b);
            const lightness = (max + min) / 510; // 0..1
            const saturation = max === 0 ? 0 : (max - min) / max;
            // Skip near-white, near-black, near-grey
            if (saturation > 0.3 && lightness > 0.1 && lightness < 0.9) {
              colors.push([r, g, b]);
            }
          }

          if (colors.length === 0) {
            // Fallback: just take the average of all pixels
            let sr = 0,
              sg = 0,
              sb = 0;
            const total = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
              sr += data[i];
              sg += data[i + 1];
              sb += data[i + 2];
            }
            const hex =
              '#' +
              [sr, sg, sb]
                .map((c) =>
                  Math.round(c / total)
                    .toString(16)
                    .padStart(2, '0'),
                )
                .join('');
            onColor(hex);
            resolve();
            return;
          }

          // Pick the most vibrant (highest saturation * brightness) color from clusters
          let best: [number, number, number] = colors[0];
          let bestScore = 0;
          for (const [r, g, b] of colors) {
            const max = Math.max(r, g, b),
              min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const bright = max / 255;
            const score = sat * bright;
            if (score > bestScore) {
              bestScore = score;
              best = [r, g, b];
            }
          }

          const hex = `#${best.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          onColor(hex);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [backgroundImage, onColor]);

  return (
    <button
      type="button"
      onClick={extract}
      disabled={loading}
      className="press flex h-8 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 text-[13px] font-semibold text-white/80 hover:bg-white/[0.13] hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Pipette size={14} />}
      {t('settings.accentFromWallpaper', 'Цвет акцента из обоев')}
    </button>
  );
}

/* ── Option tiles (themes, wallpapers) ──────────────────── */

/** Idle options get a hairline ring; the selected one an accent ring plus a check badge. */
function optionRing(selected: boolean) {
  return selected
    ? 'ring-2 ring-[var(--color-accent)]'
    : 'ring-1 ring-white/[0.08] hover:ring-white/25';
}

function SelectedCheck() {
  return (
    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-md">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** Light in-app colour picker: a hue strip plus a hex field (the native one is a white OS box). */
function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={t('settings.accentPick')}
          className="press flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white cursor-pointer"
        >
          <Pipette size={13} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[200] w-[240px] space-y-3 rounded-2xl border border-white/[0.08] bg-[#141416]/95 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl outline-none data-[state=open]:animate-fade-in-up"
        >
          <input
            type="range"
            min={0}
            max={359}
            value={hueOfHex(value)}
            onChange={(e) => onChange(hslToHex(Number(e.target.value), 90, 55))}
            aria-label={t('settings.accentPick')}
            className="hue-range w-full"
          />
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: value }} />
            <input
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value);
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
              }}
              className="h-8 min-w-0 flex-1 rounded-full border border-transparent bg-white/[0.06] px-3 text-[13px] tabular-nums text-white outline-none focus:border-white/25"
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Mini player on the current background, so accent and wallpaper changes show at once. */
function AppearancePreview({
  accent,
  backgroundImage,
}: {
  accent: string;
  backgroundImage: string;
}) {
  const url = backgroundImage ? getWallpaperUrl(backgroundImage) : null;
  return (
    <div
      aria-hidden
      className="relative h-36 overflow-hidden rounded-2xl bg-[#101012] bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-xl bg-black/45 p-3 backdrop-blur-md">
        <div
          className="h-11 w-11 shrink-0 rounded-lg"
          style={{ background: `linear-gradient(135deg, ${accent}, #1d1d22)` }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-2 w-28 rounded-full bg-white/80" />
          <div className="h-1.5 w-20 rounded-full bg-white/35" />
          <div className="h-1 w-full rounded-full bg-white/15">
            <div className="h-full w-2/5 rounded-full" style={{ background: accent }} />
          </div>
        </div>
        <Heart size={18} fill={accent} stroke="none" />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
          {playBlack14}
        </span>
      </div>
    </div>
  );
}

/* ── Theme Section ──────────────────────────────────────── */

const ThemeSection = React.memo(function ThemeSection() {
  const { t } = useTranslation();
  const accentColor = useSettingsStore((s) => s.accentColor);
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const backgroundOpacity = useSettingsStore((s) => s.backgroundOpacity);
  const backgroundBlur = useSettingsStore((s) => s.backgroundBlur);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const setBackgroundOpacity = useSettingsStore((s) => s.setBackgroundOpacity);
  const setBackgroundBlur = useSettingsStore((s) => s.setBackgroundBlur);
  const resetTheme = useSettingsStore((s) => s.resetTheme);

  return (
    <section className="settings-section space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[22px] font-bold text-white tracking-tight">
          {t('settings.appearance')}
        </h3>
        <button
          onClick={resetTheme}
          className="text-[12px] text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        >
          {t('settings.resetDefaults')}
        </button>
      </div>

      {/* Live preview: a mini player on the chosen background, painted with the accent. */}
      <AppearancePreview accent={accentColor} backgroundImage={backgroundImage} />

      <div className="space-y-3">
        <p className="text-[13px] font-medium text-white/50">{t('settings.accentColor')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {PRESET_COLORS.map((color) => {
            const isActive = accentColor.toLowerCase() === color;
            return (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setAccentColor(color)}
                className={`press h-8 w-8 rounded-full cursor-pointer shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] ${
                  isActive ? 'ring-2 ring-white ring-offset-[3px] ring-offset-[#121214]' : ''
                }`}
                style={{ background: color }}
              />
            );
          })}
          <AccentPicker value={accentColor} onChange={setAccentColor} />
          {backgroundImage && (
            <AccentFromWallpaperBtn backgroundImage={backgroundImage} onColor={setAccentColor} />
          )}
        </div>
      </div>

      {/* Background Image */}
      <WallpaperPicker />

      {/* Background Darkness */}
      {backgroundImage && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] text-white/50 font-medium">
              {t('settings.bgOpacity')}
            </label>
            <span className="text-[12px] text-white/30 tabular-nums">
              {Math.round(backgroundOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={backgroundOpacity}
            onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
            className={RANGE_CLS}
          />
        </div>
      )}

      {backgroundImage && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] text-white/50 font-medium">{t('settings.bgBlur')}</label>
            <span className="text-[12px] text-white/30 tabular-nums">{backgroundBlur}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={backgroundBlur}
            onChange={(e) => setBackgroundBlur(Number(e.target.value))}
            className={RANGE_CLS}
          />
        </div>
      )}
    </section>
  );
});

/* ── Audio Device Section ──────────────────────────────── */

interface AudioSink {
  name: string;
  description: string;
  is_default: boolean;
}

const AudioDeviceSection = React.memo(function AudioDeviceSection() {
  const { t } = useTranslation();
  const [sinks, setSinks] = useState<AudioSink[]>([]);
  const [switching, setSwitching] = useState(false);

  const refreshSinks = React.useCallback(() => {
    trackedInvoke<AudioSink[]>('audio_list_devices').then(setSinks).catch(console.error);
  }, []);

  // Refresh on mount + when window regains focus (device may have changed)
  useEffect(() => {
    refreshSinks();
    const onFocus = () => refreshSinks();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSinks]);

  const handleSwitch = async (sinkName: string) => {
    const current = sinks.find((s) => s.is_default);
    if (switching || current?.name === sinkName) return;
    setSwitching(true);
    try {
      await switchAudioDevice(sinkName, true);
      setSinks((prev) => prev.map((s) => ({ ...s, is_default: s.name === sinkName })));
      toast.success(t('settings.audioDeviceSwitched'));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSwitching(false);
    }
  };

  if (sinks.length === 0) return null;

  return (
    <section className="settings-section">
      <h3 className="text-[22px] font-bold text-white tracking-tight mb-4">
        {t('settings.audioDevice')}
      </h3>
      <Segmented
        value={sinks.find((s) => s.is_default)?.name ?? ''}
        options={sinks.map((sink) => ({ id: sink.name, label: sink.description }))}
        onChange={(name) => void handleSwitch(name)}
      />
    </section>
  );
});

const StartupSection = React.memo(function StartupSection() {
  const { t } = useTranslation();
  const startupPage = useSettingsStore((s) => s.startupPage);
  const setStartupPage = useSettingsStore((s) => s.setStartupPage);

  return (
    <section className="settings-section space-y-4">
      <div>
        <h3 className="text-[22px] font-bold text-white tracking-tight">{t('settings.startup')}</h3>
        <p className="text-[12px] text-white/35 mt-1">{t('settings.startupPageDesc')}</p>
      </div>
      <Segmented
        value={startupPage}
        options={STARTUP_PAGES.map((page) => ({ id: page.id, label: t(page.labelKey) }))}
        onChange={setStartupPage}
      />
    </section>
  );
});

/* ── Playback Section ─────────────────────────────────── */

const PlaybackSection = React.memo(function PlaybackSection() {
  const { t } = useTranslation();
  const lyricsVisualizer = useSettingsStore((s) => s.lyricsVisualizer);
  const setLyricsVisualizer = useSettingsStore((s) => s.setLyricsVisualizer);
  const normalizeVolume = useSettingsStore((s) => s.normalizeVolume);
  const setNormalizeVolume = useSettingsStore((s) => s.setNormalizeVolume);
  const highQualityStreaming = useSettingsStore((s) => s.highQualityStreaming);
  const setHighQualityStreaming = useSettingsStore((s) => s.setHighQualityStreaming);
  const discordRpcEnabled = useSettingsStore((s) => s.discordRpcEnabled);
  const setDiscordRpcEnabled = useSettingsStore((s) => s.setDiscordRpcEnabled);
  const discordRpcMode = useSettingsStore((s) => s.discordRpcMode);
  const setDiscordRpcMode = useSettingsStore((s) => s.setDiscordRpcMode);
  const discordRpcShowButton = useSettingsStore((s) => s.discordRpcShowButton);
  const setDiscordRpcShowButton = useSettingsStore((s) => s.setDiscordRpcShowButton);
  return (
    <section className="settings-section space-y-5">
      <h3 className="text-[22px] font-bold text-white tracking-tight">{t('settings.playback')}</h3>

      {/* Lyrics visualizer */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-white/70 font-medium">{t('settings.lyricsVisualizer')}</p>
          <p className="text-[11px] text-white/30 mt-0.5">{t('settings.lyricsVisualizerDesc')}</p>
        </div>
        <LiquidSwitch checked={lyricsVisualizer} onChange={setLyricsVisualizer} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-white/70 font-medium">{t('settings.normalizeVolume')}</p>
          <p className="text-[11px] text-white/30 mt-0.5">{t('settings.normalizeVolumeDesc')}</p>
        </div>
        <LiquidSwitch checked={normalizeVolume} onChange={setNormalizeVolume} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-white/70 font-medium">
            {t('settings.highQualityStreaming')}
          </p>
          <p className="text-[11px] text-white/30 mt-0.5">
            {t('settings.highQualityStreamingDesc')}
          </p>
        </div>
        <LiquidSwitch checked={highQualityStreaming} onChange={setHighQualityStreaming} />
      </div>

      {/* Bypass Whitelists */}

      {/* Track transitions */}
      <div className="space-y-3 pt-2">
        <p className="text-[17px] text-white font-bold">{t('transitions.title')}</p>
        <TransitionsSection />
      </div>

      <div className="border-t border-white/[0.04]" />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-white/70 font-medium">{t('settings.discordRpc')}</p>
            <p className="text-[11px] text-white/30 mt-0.5">{t('settings.discordRpcDesc')}</p>
          </div>
          <LiquidSwitch checked={discordRpcEnabled} onChange={setDiscordRpcEnabled} />
        </div>

        {discordRpcEnabled && (
          <>
            <div className="space-y-2">
              <p className="text-[13px] text-white/50 font-medium">
                {t('settings.discordRpcMode')}
              </p>
              <Segmented
                value={discordRpcMode}
                options={DISCORD_RPC_MODES.map((mode) => ({
                  id: mode.id,
                  label: t(mode.labelKey),
                }))}
                onChange={setDiscordRpcMode}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-white/70 font-medium">
                  {t('settings.discordRpcButton')}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {t('settings.discordRpcButtonDesc')}
                </p>
              </div>
              <LiquidSwitch checked={discordRpcShowButton} onChange={setDiscordRpcShowButton} />
            </div>
          </>
        )}
      </div>
    </section>
  );
});

/* ── Backup Section ─────────────────────────────────────── */

const BackupSection = React.memo(function BackupSection() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    try {
      downloadProfileBackup();
      toast.success(t('settings.backupExported'));
    } catch {
      toast.error(t('common.error'));
    }
  }, [t]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        if (restoreProfileBackupFromText(text)) {
          toast.success(t('settings.backupImported'));
        } else {
          toast.error(t('settings.backupInvalid'));
        }
      } catch {
        toast.error(t('settings.backupInvalid'));
      }
    },
    [t],
  );

  return (
    <section className="settings-section space-y-4">
      <div>
        <h3 className="text-[22px] font-bold text-white tracking-tight">{t('settings.backup')}</h3>
        <p className="text-[11px] text-white/30 mt-1">{t('settings.backupDesc')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleExport} className={PILL_BTN}>
          <Download size={13} />
          {t('settings.exportBackup')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={PILL_BTN}>
          <Upload size={13} />
          {t('settings.importBackup')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </section>
  );
});

/* ── Account Section ────────────────────────────────────── */

const QrLinkSheetLazy = React.lazy(() =>
  import('../components/auth/QrLinkSheet').then((m) => ({ default: m.QrLinkSheet })),
);

const AccountSection = React.memo(function AccountSection() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <section className="settings-section">
      <h3 className="text-[22px] font-bold text-white tracking-tight mb-5">
        {t('settings.account')}
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setTransferOpen(true)}
          className="h-10 px-5 rounded-full text-[14px] font-semibold bg-white text-black hover:scale-[1.03] transition-transform cursor-pointer"
        >
          {t('qrLink.transferSession')}
        </button>
        <button
          type="button"
          onClick={logout}
          className="h-10 px-5 rounded-full text-[14px] font-semibold text-white/80 border border-white/25 hover:border-red-400 hover:text-red-400 transition-colors cursor-pointer"
        >
          {t('auth.signOut')}
        </button>
      </div>
      {transferOpen && (
        <React.Suspense fallback={null}>
          <QrLinkSheetLazy open={transferOpen} onOpenChange={setTransferOpen} mode="push" />
        </React.Suspense>
      )}
    </section>
  );
});

/* ── Main ───────────────────────────────────────────────── */

export function Settings() {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [nothingFound, setNothingFound] = useState(false);

  // Settings search: hide every section whose text doesn't contain all the typed words.
  useEffect(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const section of rootRef.current?.querySelectorAll('section') ?? []) {
      const text = section.textContent?.toLowerCase() ?? '';
      const match = words.every((w) => text.includes(w));
      section.hidden = !match;
      if (match) shown++;
    }
    setNothingFound(words.length > 0 && shown === 0);
  }, [query]);

  return (
    <div ref={rootRef} className="p-6 pb-4 max-w-2xl mx-auto space-y-6">
      <h1 className="syne text-3xl text-white">{t('settings.title')}</h1>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('settings.searchPlaceholder')}
        className="w-full px-4 py-2.5 rounded-xl text-[13px] text-white/85 bg-white/[0.04] border border-white/[0.08] outline-none focus:border-white/25"
      />
      {nothingFound && (
        <p className="py-10 text-center text-[13px] text-white/30">{t('settings.searchEmpty')}</p>
      )}
      <LanguageSection />
      <CacheSection />
      <ThemeSection />
      <InterfaceSection />
      <StartupSection />
      <PlaybackSection />
      <AudioDeviceSection />
      <BackupSection />
      <AccountSection />
      <AboutSection />
    </div>
  );
}
