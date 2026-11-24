export const PRESET_WALLPAPER_PREFIX = 'preset:';

export interface PresetWallpaper {
  /** Saved in settings: keep it stable even when the file changes. */
  id: string;
  file: string;
  labelKey: string;
  fallbackLabel: string;
}

export const PRESET_WALLPAPERS: readonly PresetWallpaper[] = [
  {
    id: 'preset:solar-amber.png',
    file: 'solar-amber.webp',
    labelKey: 'settings.wallpaperSolarAmber',
    fallbackLabel: 'Solar Amber',
  },
  {
    id: 'preset:indigo-prism.png',
    file: 'indigo-prism.webp',
    labelKey: 'settings.wallpaperIndigoPrism',
    fallbackLabel: 'Indigo Prism',
  },
  {
    id: 'preset:crimson-silk.png',
    file: 'crimson-silk.webp',
    labelKey: 'settings.wallpaperCrimsonSilk',
    fallbackLabel: 'Crimson Silk',
  },
  {
    id: 'preset:emerald-aurora.png',
    file: 'emerald-aurora.webp',
    labelKey: 'settings.wallpaperEmeraldAurora',
    fallbackLabel: 'Emerald Aurora',
  },
];

export function isPresetWallpaper(name: string): boolean {
  return name.startsWith(PRESET_WALLPAPER_PREFIX);
}

export function resolveWallpaperUrl(name: string, staticPort: number | null): string | null {
  if (!name) return null;
  if (isPresetWallpaper(name)) {
    // Known presets map to their current file: ids stay ".png" (saved in settings) while the
    // files are WebP now. Unknown preset names fall back to the name itself.
    const file =
      PRESET_WALLPAPERS.find((p) => p.id === name)?.file ??
      name.slice(PRESET_WALLPAPER_PREFIX.length);
    if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) {
      return null;
    }
    return `/wallpapers/${encodeURIComponent(file)}`;
  }
  if (!staticPort) return null;
  return `http://127.0.0.1:${staticPort}/wallpapers/${encodeURIComponent(name)}`;
}
