export const BACKUP_FORMAT = 'soundcloud-mod-backup' as const;
export const BACKUP_VERSION = 1 as const;

export const SETTINGS_BACKUP_KEYS = [
  'nowPlayingPanel',
  'uiScale',
  'customFontName',
  'customFontFile',
  'accentColor',
  'bgPrimary',
  'themePreset',
  'backgroundImage',
  'backgroundOpacity',
  'backgroundBlur',
  'audioCacheLimitMB',
  'language',
  'eqEnabled',
  'eqGains',
  'eqPreset',
  'normalizeVolume',
  'highQualityStreaming',
  'sidebarCollapsed',
  'startupPage',
  'discordRpcEnabled',
  'discordRpcMode',
  'discordRpcShowButton',
  'soundwaveLanguages',
  'soundwaveMode',
  'soundwaveVibe',
  'soundwaveHideLiked',
  'soundwaveYtm',
  'lyricsVisualizer',
  'cacheListenedTracks',
  'crossfadeDuration',
  'artistWaveCollapsed',
  'panelStyle',
] as const;

export interface ProfileBackupPayload {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  settings: Record<string, unknown>;
  libraryLocal: {
    disliked: unknown[];
    likesTop: string[];
    likesBottom: string[];
  };
  playerPreferences: {
    volume?: number;
    playbackRate?: number;
    pitchSemitones?: number;
    pitchControlMode?: 'auto' | 'manual';
    shuffle?: boolean;
    repeat?: 'off' | 'all' | 'one';
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildProfileBackupPayload(input: {
  settings: Record<string, unknown>;
  libraryLocal: {
    disliked: unknown[];
    likesTop: string[];
    likesBottom: string[];
  };
  playerPreferences: ProfileBackupPayload['playerPreferences'];
}): ProfileBackupPayload {
  const settings: Record<string, unknown> = {};
  for (const key of SETTINGS_BACKUP_KEYS) {
    if (key in input.settings && typeof input.settings[key] !== 'function') {
      settings[key] = input.settings[key];
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    libraryLocal: {
      disliked: [...input.libraryLocal.disliked],
      likesTop: [...input.libraryLocal.likesTop],
      likesBottom: [...input.libraryLocal.likesBottom],
    },
    playerPreferences: { ...input.playerPreferences },
  };
}

export function parseProfileBackupPayload(raw: unknown): ProfileBackupPayload | null {
  if (!isPlainObject(raw)) return null;
  if (raw.format !== BACKUP_FORMAT || raw.version !== BACKUP_VERSION) return null;
  if (!isPlainObject(raw.settings) || !isPlainObject(raw.libraryLocal)) return null;

  const allowedKeys = new Set<string>(SETTINGS_BACKUP_KEYS);
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw.settings)) {
    if (allowedKeys.has(key) && typeof value !== 'function') {
      settings[key] = value;
    }
  }

  const lib = raw.libraryLocal;
  const isTrackEntry = (v: unknown) =>
    isPlainObject(v) && typeof v.urn === 'string' && v.urn.length > 0;
  const disliked = Array.isArray(lib.disliked) ? lib.disliked.filter(isTrackEntry) : [];
  const likesTop = Array.isArray(lib.likesTop)
    ? lib.likesTop.filter((u): u is string => typeof u === 'string')
    : [];
  const likesBottom = Array.isArray(lib.likesBottom)
    ? lib.likesBottom.filter((u): u is string => typeof u === 'string')
    : [];

  const prefsRaw = isPlainObject(raw.playerPreferences) ? raw.playerPreferences : {};
  const playerPreferences: ProfileBackupPayload['playerPreferences'] = {};
  if (typeof prefsRaw.volume === 'number' && Number.isFinite(prefsRaw.volume)) {
    playerPreferences.volume = Math.round(Math.max(0, Math.min(200, prefsRaw.volume)));
  }
  if (typeof prefsRaw.playbackRate === 'number' && Number.isFinite(prefsRaw.playbackRate)) {
    playerPreferences.playbackRate = Math.max(0.25, Math.min(3, prefsRaw.playbackRate));
  }
  if (typeof prefsRaw.pitchSemitones === 'number' && Number.isFinite(prefsRaw.pitchSemitones)) {
    playerPreferences.pitchSemitones = Math.max(-12, Math.min(12, prefsRaw.pitchSemitones));
  }
  if (prefsRaw.pitchControlMode === 'auto' || prefsRaw.pitchControlMode === 'manual') {
    playerPreferences.pitchControlMode = prefsRaw.pitchControlMode;
  }
  if (typeof prefsRaw.shuffle === 'boolean') {
    playerPreferences.shuffle = prefsRaw.shuffle;
  }
  if (prefsRaw.repeat === 'off' || prefsRaw.repeat === 'all' || prefsRaw.repeat === 'one') {
    playerPreferences.repeat = prefsRaw.repeat;
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    settings,
    libraryLocal: {
      disliked,
      likesTop,
      likesBottom,
    },
    playerPreferences,
  };
}
