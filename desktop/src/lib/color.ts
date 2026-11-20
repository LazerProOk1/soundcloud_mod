/** Colour helpers: the single place that parses and builds CSS colours. */

export type Rgb = [number, number, number];

/** "#abc" or "#aabbcc" → [r, g, b]; null when the format is not recognised. */
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

/** HSL (h 0..360, s and l 0..100) → "#rrggbb". */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return rgbToHex([f(0), f(8), f(4)]);
}

/** Hue (0..360) of a hex colour; 0 for greys and unparsable input. */
export function hueOfHex(hex: string): number {
  const rgb = hexToRgbTriplet(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}
