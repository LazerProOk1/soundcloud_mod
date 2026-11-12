import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';

// Custom interface font from a file or an installed font.

export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2';
const FONTS_DIR = 'fonts';
const DEFAULT_STACK =
  '"Manrope", "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export function sanitizeFontName(name: string): string {
  return name
    .replace(/["'`;{}()<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

async function fontsDir(): Promise<string> {
  const dir = await join(await appDataDir(), FONTS_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function registerFace(family: string, data: ArrayBuffer): Promise<boolean> {
  try {
    const face = new FontFace(family, data);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

/** Copies a font file into app data and registers it. Returns the family name. */
export async function importFontFile(
  file: File,
): Promise<{ family: string; fileName: string } | null> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!FONT_FILE_ACCEPT.split(',').includes(ext)) return null;
  const family = sanitizeFontName(file.name.slice(0, dot).replace(/[-_]+/g, ' '));
  if (!family) return null;
  const data = new Uint8Array(await file.arrayBuffer());
  if (!(await registerFace(family, data.slice().buffer))) return null;
  const fileName = `${family.replace(/\s+/g, '-')}${ext}`;
  await writeFile(await join(await fontsDir(), fileName), data);
  return { family, fileName };
}

export async function removeFontFile(fileName: string): Promise<void> {
  if (!fileName) return;
  await remove(await join(await fontsDir(), fileName)).catch(() => undefined);
}

/** Applies the font to --font-sans; empty name restores the default. */
export async function applyInterfaceFont(name: string, fileName: string) {
  const root = document.documentElement;
  const family = sanitizeFontName(name);
  if (!family) {
    root.style.removeProperty('--font-sans');
    return;
  }
  if (fileName) {
    try {
      const data = await readFile(await join(await fontsDir(), fileName));
      await registerFace(family, data.slice().buffer);
    } catch {}
  }
  root.style.setProperty('--font-sans', `"${family}", ${DEFAULT_STACK}`);
}

/** True if the browser can render `name` (installed system font or registered face). */
export function isFontInstalled(name: string): boolean {
  const clean = sanitizeFontName(name);
  const ctx = clean ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return !!clean;
  const probe = 'mmmmmmmmmmlli WQ Жжщ 0123';
  const width = (family: string) => {
    ctx.font = `32px ${family}`;
    return ctx.measureText(probe).width;
  };
  return ['monospace', 'serif', 'sans-serif'].some((g) => width(`"${clean}", ${g}`) !== width(g));
}
