import { changeAppLanguage } from '../i18n';
import { useLibraryLocalStore } from '../stores/library-local';
import { type Track, usePlayerStore } from '../stores/player';
import { nearestCacheLimitMB, type SettingsState, useSettingsStore } from '../stores/settings';
import {
  buildProfileBackupPayload,
  type ProfileBackupPayload,
  parseProfileBackupPayload,
} from './backup-schema';

export function createProfileBackup(): ProfileBackupPayload {
  const settings = useSettingsStore.getState();
  const libraryLocal = useLibraryLocalStore.getState();
  const player = usePlayerStore.getState();

  return buildProfileBackupPayload({
    settings: settings as unknown as Record<string, unknown>,
    libraryLocal: {
      disliked: libraryLocal.disliked,
      likesTop: libraryLocal.likesTop,
      likesBottom: libraryLocal.likesBottom,
    },
    playerPreferences: {
      volume: player.volume,
      playbackRate: player.playbackRate,
      pitchSemitones: player.pitchSemitones,
      pitchControlMode: player.pitchControlMode,
      shuffle: player.shuffle,
      repeat: player.repeat,
    },
  });
}

export function downloadProfileBackup(): void {
  const payload = createProfileBackup();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = payload.exportedAt.slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soundcloud-mod-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download before WebView2 reads the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function restoreProfileBackupFromText(jsonText: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return false;
  }

  const backup = parseProfileBackupPayload(parsed);
  if (!backup) return false;

  if (Object.keys(backup.settings).length > 0) {
    const settings = backup.settings as Partial<SettingsState>;
    if (typeof settings.audioCacheLimitMB === 'number') {
      settings.audioCacheLimitMB = nearestCacheLimitMB(settings.audioCacheLimitMB);
    }
    useSettingsStore.setState(settings);
    const nextLang = backup.settings.language;
    if (typeof nextLang === 'string' && nextLang.length > 0) {
      void changeAppLanguage(nextLang);
    }
  }

  useLibraryLocalStore.setState({
    disliked: backup.libraryLocal.disliked as Track[],
    likesTop: backup.libraryLocal.likesTop,
    likesBottom: backup.libraryLocal.likesBottom,
  });

  if (Object.keys(backup.playerPreferences).length > 0) {
    usePlayerStore.setState(backup.playerPreferences);
  }

  return true;
}
