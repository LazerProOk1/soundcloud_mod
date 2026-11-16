import { fetch } from '@tauri-apps/plugin-http';
import type { Track } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { ApiError, getSessionId } from './api-client';
import { STORAGE_BASE, STREAMING_BASE, STREAMING_PREMIUM_BASE } from './constants';
import { logHttpError, logHttpFailure, trackAsync } from './diagnostics';
import { isHealthy, markHealthy, markUnhealthy } from './host-health';

// ─── Types ──────────────────────────────────────────────────

export type ResolvedStreamingTrack = Partial<Track> & {
  full_duration?: number;
};

// ─── Host resolution ────────────────────────────────────────

function resolveStreamingBases(): string[] {
  const unique = [...new Set([STREAMING_PREMIUM_BASE, STREAMING_BASE])];
  return unique.sort((a, b) => Number(isHealthy(b)) - Number(isHealthy(a)));
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

function buildStreamUrl(base: string, trackUrn: string, premium: boolean, hq: boolean) {
  const params = new URLSearchParams();
  if (hq) params.set('hq', 'true');
  const sid = getSessionId();
  if (sid) params.set('session_id', sid);
  const path = premium ? '/premium' : '';
  return `${base}/stream/${encodeURIComponent(trackUrn)}${path}?${params.toString()}`;
}

export function buildStorageUrls(trackUrn: string): string[] {
  const file = `${trackUrn.replace(/:/g, '_')}.m4a`;
  return [`${STORAGE_BASE}/${file}`];
}

export function streamFallbackUrls(
  trackUrn: string,
  hq = useSettingsStore.getState().highQualityStreaming,
): string[] {
  const bases = resolveStreamingBases();
  const urls: string[] = [];
  const seen = new Set<string>();
  const qualities = hq ? [true, false] : [false];

  for (const useHq of qualities) {
    for (const base of bases) {
      // premium endpoint first, then standard
      for (const premium of [true, false]) {
        const url = buildStreamUrl(base, trackUrn, premium, useHq);
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    }
  }

  return urls;
}
