import { fetch } from '@tauri-apps/plugin-http';
import type { Track } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { ApiError } from './api-client';
import { API_BASE, STORAGE_BASE, STREAMING_BASE } from './constants';
import { logHttpError, logHttpFailure, trackAsync } from './diagnostics';
import { markHealthy, markUnhealthy } from './host-health';

// ─── Types ──────────────────────────────────────────────────

export type ResolvedStreamingTrack = Partial<Track> & {
  full_duration?: number;
};

// ─── Host resolution ────────────────────────────────────────

// The stream-premium host is gone (TLS handshakes fail), so only the main one is left.
function resolveStreamingBases(): string[] {
  return [STREAMING_BASE];
}

// ─── Streaming JSON ─────────────────────────────────────────

async function streamingJson<T = unknown>(path: string): Promise<T> {
  let lastError: unknown = null;

  const label = `GET ${path}`;

  for (const base of resolveStreamingBases()) {
    const url = `${base}${path}`;
    try {
      const res = await trackAsync(
        `streaming:${label}`,
        fetch(url, { signal: AbortSignal.timeout(10_000) }),
      );

      if (!res.ok) {
        const body = await res.text();
        logHttpError(`streaming:${label}`, res.status, url, body);
        markUnhealthy(base);
        lastError = new ApiError(res.status, body);
        continue;
      }

      markHealthy(base);

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`Unexpected content-type: ${contentType ?? 'unknown'}`);
      }

      return res.json();
    } catch (error) {
      if (error instanceof ApiError) {
        lastError = error;
        continue;
      }
      logHttpFailure(`streaming:${label}`, url, error);
      markUnhealthy(base);
      lastError = error;
    }
  }

  throw lastError ?? new Error('Streaming request failed');
}

// ─── Public API ─────────────────────────────────────────────

export function resolveTrackFromStreaming(url: string) {
  return streamingJson<ResolvedStreamingTrack>(`/resolve?url=${encodeURIComponent(url)}`);
}

export function buildStorageUrls(trackUrn: string): string[] {
  const file = `${trackUrn.replace(/:/g, '_')}.m4a`;
  return [`${STORAGE_BASE}/${file}`];
}

/** The API's own stream endpoint (what the upstream client uses now); the session goes in the
 *  `x-session-id` header the engine adds. */
function buildApiStreamUrl(trackUrn: string, hq: boolean) {
  const quality = hq ? 'hq=true&quality=hq' : 'quality=sq';
  return `${API_BASE}/tracks/${encodeURIComponent(trackUrn)}/stream?${quality}`;
}

/**
 * Where the engine fetches a track from: the API's stream endpoint, high quality first. The old
 * `stream.` host's `/stream/{urn}` answers only 401/404 now, so it is no longer tried.
 */
export function streamFallbackUrls(
  trackUrn: string,
  hq = useSettingsStore.getState().highQualityStreaming,
): string[] {
  return (hq ? [true, false] : [false]).map((q) => buildApiStreamUrl(trackUrn, q));
}
