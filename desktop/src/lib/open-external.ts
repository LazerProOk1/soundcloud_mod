import { openUrl } from '@tauri-apps/plugin-opener';

/** Открывает ссылку в системном браузере: Tauri-opener в приложении, window.open в вебе. */
export function openExternalUrl(url: string): void {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void openUrl(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
