import { useEffect } from 'react';
import { hexToRgbTriplet } from '../lib/color';
import { applyInterfaceFont } from '../lib/interface-font';
import { useSettingsStore } from '../stores/settings';

const DEFAULT_ACCENT: [number, number, number] = [255, 85, 0];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const accentColor = useSettingsStore((s) => s.accentColor);
  const bgPrimary = useSettingsStore((s) => s.bgPrimary);

  useEffect(() => {
    const root = document.documentElement;
    const [r, g, b] = hexToRgbTriplet(accentColor) ?? DEFAULT_ACCENT;
    const rgb = `${r}, ${g}, ${b}`;
    root.style.setProperty('--color-accent', accentColor);
    const hover = `rgb(${Math.min(255, r + 26)}, ${Math.min(255, g + 26)}, ${Math.min(255, b + 26)})`;
    root.style.setProperty('--color-accent-hover', hover);
    root.style.setProperty('--color-accent-glow', `rgba(${rgb}, 0.2)`);
    root.style.setProperty('--color-accent-selection', `rgba(${rgb}, 0.3)`);
    // Contrast: black text on light accent, white on dark
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    root.style.setProperty('--color-accent-contrast', lum > 160 ? '#000000' : '#ffffff');
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', bgPrimary);
    const bgRgb = (hexToRgbTriplet(bgPrimary) ?? DEFAULT_ACCENT).join(', ');
    root.style.setProperty('--bg-titlebar', `rgba(${bgRgb}, 0.95)`);
    root.style.backgroundColor = bgPrimary;
  }, [bgPrimary]);

  const customCss = useSettingsStore((s) => s.customCss);
  const customCssEnabled = useSettingsStore((s) => s.customCssEnabled);
  useEffect(() => {
    let style = document.getElementById('user-custom-css') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'user-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = customCssEnabled ? customCss : '';
  }, [customCss, customCssEnabled]);

  const fontName = useSettingsStore((s) => s.customFontName);
  const fontFile = useSettingsStore((s) => s.customFontFile);
  useEffect(() => {
    void applyInterfaceFont(fontName, fontFile);
  }, [fontName, fontFile]);

  return <>{children}</>;
}
