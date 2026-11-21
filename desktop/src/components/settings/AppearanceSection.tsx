import * as Popover from '@radix-ui/react-popover';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  downloadWallpaper,
  getWallpaperUrl,
  listWallpapers,
  removeWallpaper,
  saveWallpaperFromBuffer,
} from '../../lib/cache';
import { hslToHex, hueOfHex } from '../../lib/color';
import { Check, Heart, Link, Loader2, Pipette, playBlack14, Upload, X } from '../../lib/icons';
import { PRESET_WALLPAPERS } from '../../lib/wallpapers';
import { useSettingsStore } from '../../stores/settings';
import { PILL_BTN } from '../ui/buttonClass';
import { RANGE_CLS } from '../ui/rangeClass';
import { SettingRow, SettingsSection } from './SettingsKit';

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
    <SettingRow title={t('settings.backgroundImage')} stacked>
      {/* Wallpaper grid */}
      <div className="grid grid-cols-5 gap-2.5">
        {/* "None" option */}
        <button
          type="button"
          onClick={() => setBackgroundImage('')}
          className={`press-soft relative flex aspect-video items-center justify-center rounded-xl ui-card cursor-pointer ${optionRing(!backgroundImage)}`}
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
          <div className="flex aspect-video items-center justify-center rounded-xl ui-card">
            <Loader2 size={14} className="animate-spin text-white/30" />
          </div>
        )}

        {/* Add from file */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="press flex aspect-video flex-col items-center justify-center gap-1 rounded-xl bar-control text-white/55 hover:text-white cursor-pointer"
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
              ? 'bar-control is-active text-white'
              : 'bar-control text-white/55 hover:text-white'
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
            className="flex-1 px-4 py-2.5 rounded-xl bar-control border border-transparent text-[13px] text-white/80 placeholder:text-white/20 focus:border-white/25 outline-none"
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
    </SettingRow>
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
      const { getWallpaperUrl } = await import('../../lib/cache');
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
      className="press flex h-8 items-center gap-2 rounded-full bar-control px-3.5 text-[13px] font-semibold text-white/80 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
          className="press flex h-7 w-7 items-center justify-center rounded-full bar-control text-white/70 hover:text-white cursor-pointer"
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
          className="z-[200] w-[240px] space-y-3 rounded-2xl app-surface p-3 outline-none data-[state=open]:animate-fade-in-up"
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
              className="h-8 min-w-0 flex-1 rounded-full bar-control border border-transparent px-3 text-[13px] tabular-nums text-white outline-none focus:border-white/25"
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

/* ── Appearance Section ─────────────────────────────────── */

export const AppearanceSection = React.memo(function AppearanceSection() {
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
    <SettingsSection
      id="appearance"
      title={t('settings.appearance')}
      action={
        <button
          type="button"
          onClick={resetTheme}
          className="text-[12px] text-white/35 hover:text-white/70 transition-colors cursor-pointer"
        >
          {t('settings.resetDefaults')}
        </button>
      }
    >
      {/* Live preview: a mini player on the chosen background, painted with the accent. */}
      <AppearancePreview accent={accentColor} backgroundImage={backgroundImage} />

      <SettingRow title={t('settings.accentColor')} stacked>
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
      </SettingRow>

      <WallpaperPicker />

      {backgroundImage && (
        <SettingRow
          title={t('settings.bgOpacity')}
          value={`${Math.round(backgroundOpacity * 100)}%`}
          stacked
        >
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={backgroundOpacity}
            onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
            className={RANGE_CLS}
          />
        </SettingRow>
      )}

      {backgroundImage && (
        <SettingRow title={t('settings.bgBlur')} value={`${backgroundBlur}px`} stacked>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={backgroundBlur}
            onChange={(e) => setBackgroundBlur(Number(e.target.value))}
            className={RANGE_CLS}
          />
        </SettingRow>
      )}
    </SettingsSection>
  );
});
