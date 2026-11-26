import { EQ_BAND_COUNT, EQ_MAX_GAIN, EQ_MIN_GAIN } from './equalizer.ts';

export interface CustomEqPreset {
  id: string;
  name: string;
  gains: number[];
}

const CUSTOM_PRESET_PREFIX = 'custom:';
const MAX_NAME_LENGTH = 40;

/** Id for a saved preset; the prefix keeps it apart from the built-in preset ids. */
export function customPresetId(now = Date.now()): string {
  return `${CUSTOM_PRESET_PREFIX}${now.toString(36)}`;
}

/** A name ready to store, or null when there is nothing worth saving. */
export function normalizePresetName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** Gains clamped to the EQ range with exactly one value per band. */
export function clampPresetGains(gains: readonly number[]): number[] {
  return Array.from({ length: EQ_BAND_COUNT }, (_, index) => {
    const value = Number(gains[index]);
    return Number.isFinite(value) ? Math.max(EQ_MIN_GAIN, Math.min(EQ_MAX_GAIN, value)) : 0;
  });
}
