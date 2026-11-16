export const PRESET_WALLPAPER_PREFIX = 'preset:';

export interface PresetWallpaper {
  id: string;
  file: string;
  labelKey: string;
  fallbackLabel: string;
}

export const PRESET_WALLPAPERS: readonly PresetWallpaper[] = [
  {
    id: 'preset:solar-amber.png',
    file: 'solar-amber.png',
    labelKey: 'settings.wallpaperSolarAmber',
    fallbackLabel: 'Solar Amber',
  },
  {
    id: 'preset:indigo-prism.png',
    file: 'indigo-prism.png',
    labelKey: 'settings.wallpaperIndigoPrism',
    fallbackLabel: 'Indigo Prism',
  },
  {
    id: 'preset:crimson-silk.png',
    file: 'crimson-silk.png',
    labelKey: 'settings.wallpaperCrimsonSilk',
    fallbackLabel: 'Crimson Silk',
  },
  {
    id: 'preset:emerald-aurora.png',
    file: 'emerald-aurora.png',
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
    const file = name.slice(PRESET_WALLPAPER_PREFIX.length);
    if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) {
      return null;
    }
    return `/wallpapers/${encodeURIComponent(file)}`;
  }
  if (!staticPort) return null;
  return `http://127.0.0.1:${staticPort}/wallpapers/${encodeURIComponent(name)}`;
}
