export const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.scdinternal.site';

/**
 * API hosts in order of preference. The upstream mirror runs the same backend (sessions are
 * shared) and answers from Russia; it takes over while the main host is unreachable. A custom
 * VITE_API_BASE means one host only.
 */
export const API_HOSTS: readonly string[] = import.meta.env.VITE_API_BASE
  ? [API_BASE]
  : [API_BASE, 'https://api.scnative.space'];

export const STREAMING_BASE =
  import.meta.env.VITE_STREAMING_BASE || 'https://stream.scdinternal.site';
export const IMAGES_BASE = import.meta.env.VITE_IMAGES_BASE || 'https://images.scdinternal.site';
export const STORAGE_BASE = import.meta.env.VITE_STORAGE_BASE || 'https://storage.scdinternal.site';

export const GITHUB_OWNER = 'LazerProOk1';
export const GITHUB_REPO = 'soundcloud_mod';
export const GITHUB_REPO_EN = 'soundcloud_mod';
export const APP_VERSION = __APP_VERSION__;

// Checks GitHub releases of this repo on start and shows the update dialog.
export const CHECK_UPDATES = true;

let _staticPort: number | null = null;
let _proxyPort: number | null = null;

export function setServerPorts(staticP: number, proxy: number) {
  _staticPort = staticP;
  _proxyPort = proxy;
}

export function getStaticPort(): number | null {
  return _staticPort;
}

export function getProxyPort(): number | null {
  return _proxyPort;
}
