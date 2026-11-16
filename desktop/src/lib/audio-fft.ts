import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const FFT_BIN_COUNT = 64;

type FftListener = (bins: readonly number[]) => void;

const listeners = new Set<FftListener>();
let unlisten: UnlistenFn | null = null;
let startPromise: Promise<void> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function readAccentRgb(): [number, number, number] {
  if (typeof window === 'undefined') return [255, 85, 0];
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    const v =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    return [
      Number.parseInt(v.slice(0, 2), 16) || 255,
      Number.parseInt(v.slice(2, 4), 16) || 85,
      Number.parseInt(v.slice(4, 6), 16) || 0,
    ];
  }
  const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [255, 85, 0];
}

async function startBridge() {
  if (!isTauriRuntime()) return;
  try {
    await invoke('audio_set_analyser', { enabled: true });
    unlisten = await listen<number[]>('audio:fft', (event) => {
      const bins = event.payload;
      if (!bins || bins.length === 0) return;
      for (const fn of listeners) fn(bins);
    });
  } catch {
    // Web preview or audio bridge unavailable — silent no-op
  }
}

function stopBridge() {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  startPromise = null;
  if (isTauriRuntime()) {
    invoke('audio_set_analyser', { enabled: false }).catch(() => {});
  }
}

/**
 * Subscribe to Rust 64-bin `audio:fft` stream with reference counting so
 * multiple mounted visualizers never toggle off the analyser prematurely.
 */
export function subscribeAudioFft(listener: FftListener): () => void {
  const wasEmpty = listeners.size === 0;
  listeners.add(listener);

  if (wasEmpty && !startPromise) {
    startPromise = startBridge();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopBridge();
    }
  };
}
