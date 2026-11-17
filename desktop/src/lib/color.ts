/** Цветовые хелперы: единственная точка парсинга/сборки CSS-цветов. */

export type Rgb = [number, number, number];

/** "#abc" или "#aabbcc" → [r, g, b]; null, если формат не распознан. */
export function hexToRgbTriplet(hex: string, allowShort = true): Rgb | null {
  const h = hex.trim().replace('#', '');
  const full = allowShort && h.length === 3 ? h.replace(/./g, '$&$&') : h;
  const m = full.match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
  if (alpha === 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgbTriplet(hex);
  return rgb ? rgbToCss(rgb, alpha) : `rgba(255,255,255,${alpha})`;
}

export function lightenRgb([r, g, b]: Rgb, amount: number): Rgb {
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return [mix(r), mix(g), mix(b)];
}

export function darkenRgb([r, g, b]: Rgb, amount: number): Rgb {
  const mix = (c: number) => Math.round(c * (1 - amount));
  return [mix(r), mix(g), mix(b)];
}

export function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgbTriplet(hex);
  return rgb ? rgbToHex(lightenRgb(rgb, amount)) : hex;
}
