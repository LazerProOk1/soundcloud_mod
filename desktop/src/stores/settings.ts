import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tauriStorage } from '../lib/tauri-storage';
import type { WaveVibeId } from '../lib/wave-vibes';

export type ThemePreset = 'soundcloud' | 'dark' | 'neon' | 'forest' | 'crimson' | 'custom';
export type StartupPage = 'home' | 'search' | 'library' | 'settings';
export type DiscordRpcMode = 'track' | 'artist' | 'activity';
export interface ThemePresetDef {
  accent: string;
  bg: string;
  name: string;
  /** [accent, bg, card] for preview swatch */
  preview: [string, string, string];
}

export const THEME_PRESETS: Record<Exclude<ThemePreset, 'custom'>, ThemePresetDef> = {
  soundcloud: {
    accent: '#ff5500',
    bg: '#08080a',
    name: 'SoundCloud',
    preview: ['#ff5500', '#08080a', '#1a1a1e'],
  },
  dark: {
    accent: '#ffffff',
    bg: '#000000',
    name: 'Тьма',
    preview: ['#ffffff', '#000000', '#111111'],
  },
  neon: {
    accent: '#bf5af2',
    bg: '#08060f',
    name: 'Неон',
    preview: ['#bf5af2', '#08060f', '#18102a'],
  },
  forest: {
    accent: '#22c55e',
    bg: '#050e08',
    name: 'Лес',
    preview: ['#22c55e', '#050e08', '#0a1f10'],
  },
  crimson: {
    accent: '#ff2d55',
    bg: '#0c0507',
    name: 'Кармин',
    preview: ['#ff2d55', '#0c0507', '#1e0a10'],
  },
};

export type CrossfadeCurve = 'equal' | 'linear' | 'scurve';
export type PanelStyle = 'flat' | 'gloss' | 'liquid';
export type MusicSourceId = 'soundcloud' | 'zaycev' | 'youtube';
export interface MusicSource {
  id: MusicSourceId;
  enabled: boolean;
}
export const DEFAULT_MUSIC_SOURCES: MusicSource[] = [
  { id: 'soundcloud', enabled: true },
  { id: 'zaycev', enabled: true },
  { id: 'youtube', enabled: true },
];

export interface SettingsState {
  /** Where tracks are fetched first; the other sources stay as fallbacks. */
  /** Where tracks are downloaded from, in priority order; disabled ones are skipped. */
  musicSources: MusicSource[];
  setMusicSources: (sources: MusicSource[]) => void;
  nowPlayingPanel: boolean;
  setNowPlayingPanel: (open: boolean) => void;
  uiScale: number;
  setUiScale: (scale: number) => void;
  customFontName: string;
  customFontFile: string;
  setCustomFont: (name: string, file: string) => void;
  accentColor: string;
  bgPrimary: string;
  themePreset: ThemePreset;
  backgroundImage: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  audioCacheLimitMB: number;
  language: string;
  eqEnabled: boolean;
  eqGains: number[];
  eqPreset: string;
  normalizeVolume: boolean;
  highQualityStreaming: boolean;
  sidebarCollapsed: boolean;
  startupPage: StartupPage;
  discordRpcEnabled: boolean;
  discordRpcMode: DiscordRpcMode;
  discordRpcShowButton: boolean;
  soundwaveLanguages: string[];
  soundwaveMode: 'similar' | 'diverse';
  soundwaveVibe: WaveVibeId;
  soundwaveHideLiked: boolean;
  /** Drop slowed / sped up / remix / nightcore fan versions from the wave. */
  soundwaveHideVariants: boolean;
  /** Wave picks from YouTube Music radio (matched on SoundCloud) on top of SoundCloud's own. */
  soundwaveYtm: boolean;
  setSoundwaveYtm: (v: boolean) => void;
  setSoundwaveHideVariants: (v: boolean) => void;
  lyricsVisualizer: boolean;
  /** Synced lyrics light up word by word (karaoke) instead of whole lines. */
  lyricsWordMode: boolean;
  cacheListenedTracks: boolean;
  /** Crossfade duration in seconds. 0 = disabled. */
  crossfadeDuration: number;
  /** Crossfade volume shape: equal power (no dip), linear, or S-curve. */
  crossfadeCurve: CrossfadeCurve;
  /** Manual skip: the previous track quickly fades out instead of cutting off. */
  crossfadeOnSkip: boolean;
  /** Tracks of the same album play back to back, without a crossfade. */
  crossfadeKeepAlbums: boolean;
  setCrossfadeCurve: (v: CrossfadeCurve) => void;
  setCrossfadeOnSkip: (v: boolean) => void;
  setCrossfadeKeepAlbums: (v: boolean) => void;
  artistWaveCollapsed: boolean;
  /** Liquid Glass (frosted-glass / backdrop-filter) UI effects */
  /** Panel look: flat (opaque), gloss (light frost) or liquid (see-through glass). */
  panelStyle: PanelStyle;
  /** Show liked playlists under your own in the sidebar. */
  sidebarLikedPlaylists: boolean;
  setSidebarLikedPlaylists: (v: boolean) => void;
  setAccentColor: (color: string) => void;
  setThemePreset: (id: ThemePreset) => void;
  setBackgroundImage: (url: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundBlur: (blur: number) => void;
  setAudioCacheLimitMB: (limit: number) => void;
  setLanguage: (lang: string) => void;
  setEqEnabled: (enabled: boolean) => void;
  setEqGains: (gains: number[]) => void;
  setEqPreset: (preset: string) => void;
  setEqBand: (index: number, gain: number) => void;
  setNormalizeVolume: (enabled: boolean) => void;
  setHighQualityStreaming: (enabled: boolean) => void;
  toggleSidebar: () => void;
  setStartupPage: (page: StartupPage) => void;
  setDiscordRpcEnabled: (enabled: boolean) => void;
  setDiscordRpcMode: (mode: DiscordRpcMode) => void;
  setDiscordRpcShowButton: (show: boolean) => void;
  setSoundwaveLanguages: (langs: string[]) => void;
  setSoundwaveMode: (mode: 'similar' | 'diverse') => void;
  setSoundwaveVibe: (vibe: WaveVibeId) => void;
  setSoundwaveHideLiked: (v: boolean) => void;
  setLyricsVisualizer: (v: boolean) => void;
  setLyricsWordMode: (v: boolean) => void;
  setCacheListenedTracks: (v: boolean) => void;
  setCrossfadeDuration: (secs: number) => void;
  setArtistWaveCollapsed: (v: boolean) => void;
  setPanelStyle: (v: PanelStyle) => void;
  resetTheme: () => void;
}

const DEFAULT_EQ_GAINS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Audio cache limit choices in GB (0 = no limit). */
export const CACHE_LIMIT_GB = [1, 2, 5, 10, 20, 0];

/** Snaps a limit in MB to the closest preset, so the settings picker always shows a choice. */
export function nearestCacheLimitMB(mb: number): number {
  if (mb <= 0) return 0;
  const presets = CACHE_LIMIT_GB.filter((gb) => gb > 0).map((gb) => gb * 1024);
  return presets.reduce((best, p) => (Math.abs(p - mb) < Math.abs(best - mb) ? p : best));
}

const DEFAULTS = {
  accentColor: '#ff5500',
  bgPrimary: '#08080a',
  themePreset: 'soundcloud' as ThemePreset,
  backgroundImage: '',
  backgroundOpacity: 0.15,
  backgroundBlur: 0,
  uiScale: 100,
  musicSources: DEFAULT_MUSIC_SOURCES,
  nowPlayingPanel: true,
  customFontName: '',
  customFontFile: '',
  audioCacheLimitMB: 1024,
  language: navigator.language?.split('-')[0] || 'en',
  eqEnabled: false,
  eqGains: DEFAULT_EQ_GAINS,
  eqPreset: 'flat',
  normalizeVolume: true,
  highQualityStreaming: false,
  sidebarCollapsed: false,
  startupPage: 'home' as StartupPage,
  discordRpcEnabled: true,
  discordRpcMode: 'track' as DiscordRpcMode,
  discordRpcShowButton: true,
  soundwaveLanguages: [] as string[],
  soundwaveMode: 'similar' as 'similar' | 'diverse',
  soundwaveVibe: 'all' as WaveVibeId,
  // Liked tracks don't belong in a discovery wave.
  soundwaveHideLiked: true,
  soundwaveHideVariants: true,
  soundwaveYtm: true,
  lyricsVisualizer: false,
  lyricsWordMode: true,
  cacheListenedTracks: true,
  crossfadeDuration: 0,
  crossfadeCurve: 'equal' as CrossfadeCurve,
  crossfadeOnSkip: true,
  crossfadeKeepAlbums: true,
  artistWaveCollapsed: false,
  // Frosted glass by default; Plain and Liquid Glass are opt-in.
  panelStyle: 'gloss' as PanelStyle,
  sidebarLikedPlaylists: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAccentColor: (accentColor) => set({ accentColor, themePreset: 'custom' }),
      setUiScale: (uiScale) => set({ uiScale }),
      setMusicSources: (musicSources) => set({ musicSources }),
      setNowPlayingPanel: (nowPlayingPanel) => set({ nowPlayingPanel }),
      setCustomFont: (customFontName, customFontFile) => set({ customFontName, customFontFile }),
      setThemePreset: (id) => {
        if (id === 'custom') {
          set({ themePreset: 'custom' });
        } else {
          const preset = THEME_PRESETS[id];
          set({ themePreset: id, accentColor: preset.accent, bgPrimary: preset.bg });
        }
      },
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      setBackgroundOpacity: (backgroundOpacity) => set({ backgroundOpacity }),
      setBackgroundBlur: (backgroundBlur) => set({ backgroundBlur }),
      setAudioCacheLimitMB: (audioCacheLimitMB) => set({ audioCacheLimitMB }),
      setLanguage: (language) => set({ language }),
      setEqEnabled: (eqEnabled) => set({ eqEnabled }),
      setEqGains: (eqGains) => set({ eqGains, eqPreset: 'custom' }),
      setEqPreset: (eqPreset) => set({ eqPreset }),
      setEqBand: (index, gain) =>
        set((s) => {
          const eqGains = [...s.eqGains];
          eqGains[index] = gain;
          return { eqGains, eqPreset: 'custom' };
        }),
      setNormalizeVolume: (normalizeVolume) => set({ normalizeVolume }),
      setHighQualityStreaming: (highQualityStreaming) => set({ highQualityStreaming }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setStartupPage: (startupPage) => set({ startupPage }),
      setDiscordRpcEnabled: (discordRpcEnabled) => set({ discordRpcEnabled }),
      setDiscordRpcMode: (discordRpcMode) => set({ discordRpcMode }),
      setDiscordRpcShowButton: (discordRpcShowButton) => set({ discordRpcShowButton }),
      setSoundwaveLanguages: (soundwaveLanguages) => set({ soundwaveLanguages }),
      setSoundwaveMode: (soundwaveMode) => set({ soundwaveMode }),
      setSoundwaveVibe: (soundwaveVibe) => set({ soundwaveVibe }),
      setSoundwaveHideLiked: (soundwaveHideLiked) => set({ soundwaveHideLiked }),
      setSoundwaveHideVariants: (soundwaveHideVariants) => set({ soundwaveHideVariants }),
      setSoundwaveYtm: (soundwaveYtm) => set({ soundwaveYtm }),
      setLyricsVisualizer: (lyricsVisualizer) => set({ lyricsVisualizer }),
      setLyricsWordMode: (lyricsWordMode) => set({ lyricsWordMode }),
      setCrossfadeCurve: (crossfadeCurve) => set({ crossfadeCurve }),
      setCrossfadeOnSkip: (crossfadeOnSkip) => set({ crossfadeOnSkip }),
      setCrossfadeKeepAlbums: (crossfadeKeepAlbums) => set({ crossfadeKeepAlbums }),
      setCacheListenedTracks: (cacheListenedTracks) => set({ cacheListenedTracks }),
      setCrossfadeDuration: (crossfadeDuration) => set({ crossfadeDuration }),
      setArtistWaveCollapsed: (artistWaveCollapsed) => set({ artistWaveCollapsed }),
      setPanelStyle: (panelStyle) => set({ panelStyle }),
      setSidebarLikedPlaylists: (sidebarLikedPlaylists) => set({ sidebarLikedPlaylists }),
      resetTheme: () =>
        set({
          accentColor: DEFAULTS.accentColor,
          bgPrimary: DEFAULTS.bgPrimary,
          themePreset: DEFAULTS.themePreset,
          backgroundImage: DEFAULTS.backgroundImage,
          backgroundOpacity: DEFAULTS.backgroundOpacity,
          backgroundBlur: DEFAULTS.backgroundBlur,
        }),
    }),
    {
      name: 'sc-settings',
      storage: createJSONStorage(() => tauriStorage),
      version: 22,
      migrate: (persistedState) => {
        const prev = (persistedState ?? {}) as Partial<SettingsState> & {
          soundwaveDiversity?: number;
          primarySource?: 'soundcloud' | 'zaycev';
          liquidGlass?: boolean;
        };
        // v18 → v19: single "primary source" → ordered source list.
        // v19 → v20: Audius removed — drop sources that no longer exist.
        const known = new Set(DEFAULT_MUSIC_SOURCES.map((s) => s.id));
        const musicSources = (
          prev.musicSources ??
          (prev.primarySource === 'zaycev'
            ? [
                DEFAULT_MUSIC_SOURCES[1],
                DEFAULT_MUSIC_SOURCES[0],
                ...DEFAULT_MUSIC_SOURCES.slice(2),
              ]
            : DEFAULT_MUSIC_SOURCES)
        ).filter((s) => known.has(s.id));
        // v13 → v14: diversity-slider (0..1) → toggle ('similar' | 'diverse').
        // > 0.5 трактуем как 'diverse', иначе 'similar'.
        const inferredMode: 'similar' | 'diverse' =
          typeof prev.soundwaveDiversity === 'number' && prev.soundwaveDiversity > 0.5
            ? 'diverse'
            : 'similar';
        return {
          ...DEFAULTS,
          ...prev,
          soundwaveMode: prev.soundwaveMode ?? inferredMode,
          musicSources,
          // v20 → v21: on/off glass toggle → three panel styles.
          panelStyle: prev.panelStyle ?? (prev.liquidGlass ? 'gloss' : 'flat'),
          // v21 → v22: limits outside the presets (old 8 GB) → nearest preset.
          audioCacheLimitMB: nearestCacheLimitMB(
            prev.audioCacheLimitMB ?? DEFAULTS.audioCacheLimitMB,
          ),
        } as SettingsState;
      },
      partialize: (s) => ({
        uiScale: s.uiScale,
        musicSources: s.musicSources,
        nowPlayingPanel: s.nowPlayingPanel,
        customFontName: s.customFontName,
        customFontFile: s.customFontFile,
        accentColor: s.accentColor,
        bgPrimary: s.bgPrimary,
        themePreset: s.themePreset,
        backgroundImage: s.backgroundImage,
        backgroundOpacity: s.backgroundOpacity,
        backgroundBlur: s.backgroundBlur,
        audioCacheLimitMB: s.audioCacheLimitMB,
        language: s.language,
        eqEnabled: s.eqEnabled,
        eqGains: s.eqGains,
        eqPreset: s.eqPreset,
        normalizeVolume: s.normalizeVolume,
        highQualityStreaming: s.highQualityStreaming,
        sidebarCollapsed: s.sidebarCollapsed,
        startupPage: s.startupPage,
        discordRpcEnabled: s.discordRpcEnabled,
        discordRpcMode: s.discordRpcMode,
        discordRpcShowButton: s.discordRpcShowButton,
        soundwaveLanguages: s.soundwaveLanguages,
        soundwaveMode: s.soundwaveMode,
        soundwaveVibe: s.soundwaveVibe,
        soundwaveHideLiked: s.soundwaveHideLiked,
        soundwaveHideVariants: s.soundwaveHideVariants,
        soundwaveYtm: s.soundwaveYtm,
        lyricsVisualizer: s.lyricsVisualizer,
        lyricsWordMode: s.lyricsWordMode,
        cacheListenedTracks: s.cacheListenedTracks,
        crossfadeDuration: s.crossfadeDuration,
        crossfadeCurve: s.crossfadeCurve,
        crossfadeOnSkip: s.crossfadeOnSkip,
        crossfadeKeepAlbums: s.crossfadeKeepAlbums,
        artistWaveCollapsed: s.artistWaveCollapsed,
        panelStyle: s.panelStyle,
        sidebarLikedPlaylists: s.sidebarLikedPlaylists,
      }),
    },
  ),
);
