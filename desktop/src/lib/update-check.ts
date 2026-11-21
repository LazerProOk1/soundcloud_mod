import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { check } from '@tauri-apps/plugin-updater';
import i18n from '../i18n';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO, GITHUB_REPO_EN } from './constants';
import { isNewerVersion } from './semver';

export interface GithubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

export function stripLeadingV(version: string) {
  return version.replace(/^v/, '');
}

function safeFetch(url: string): Promise<Response> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return tauriFetch(url);
  }
  return globalThis.fetch(url);
}

async function fetchRelease(repo: string): Promise<GithubRelease | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/releases/latest`;
  const response = await safeFetch(url);
  return response.ok ? response.json() : null;
}

export async function checkForAppUpdate(): Promise<GithubRelease | null> {
  const primaryRelease = await fetchRelease(GITHUB_REPO).catch(() => null);
  if (!primaryRelease) return null;

  const latest = stripLeadingV(primaryRelease.tag_name);
  const current = stripLeadingV(APP_VERSION);
  if (!isNewerVersion(latest, current)) return null;

  const prefersEnglishRelease = !i18n.language?.startsWith('ru');
  if (prefersEnglishRelease) {
    const englishRelease = await fetchRelease(GITHUB_REPO_EN).catch(() => null);
    if (englishRelease && stripLeadingV(englishRelease.tag_name) === latest) {
      return englishRelease;
    }
  }

  return primaryRelease;
}

/** True when this install can update in place (NSIS install or AppImage). */
export function canSelfUpdate(): Promise<boolean> {
  return invoke<boolean>('can_self_update').catch(() => false);
}

/**
 * Downloads the signed update, installs it and restarts. Resolves false when the release has
 * no updater manifest, so the caller can fall back to the release page.
 */
export async function installAppUpdate(onProgress: (fraction: number) => void): Promise<boolean> {
  const update = await check();
  if (!update) return false;
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') total = event.data.contentLength ?? 0;
    if (event.event === 'Progress' && total > 0) {
      received += event.data.chunkLength;
      onProgress(received / total);
    }
  });
  await invoke('restart_app');
  return true;
}
