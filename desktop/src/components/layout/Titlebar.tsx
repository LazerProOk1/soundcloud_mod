import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Disc3,
  Home,
  Import,
  Minus,
  Search,
  Settings,
  Square,
  X,
} from '../../lib/icons';
import { isMac } from '../../lib/platform';
import { usePlayerStore } from '../../stores/player';

const iconBtn =
  'w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white ui-icon transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-default';

// Windows/Linux-style caption buttons: full bar height, flat, close turns red.
const capBtn =
  'w-11 h-full flex items-center justify-center text-white/60 hover:text-white ui-icon transition-colors duration-150 cursor-pointer';

function getSafeWindow() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const Brand = React.memo(() => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  return (
    <div className="pointer-events-none flex items-center gap-2 pl-2" data-tauri-drag-region>
      <Disc3 size={18} className={`text-accent ${isPlaying ? 'animate-spin-slow' : ''}`} />
      <span className="text-[14px] font-semibold tracking-tight text-white/90">SoundCloud</span>
      <span className="rounded-md bar-control px-1.5 py-px text-[10px] font-bold tracking-wide text-white/55">
        MOD
      </span>
    </div>
  );
});

const NavButtons = React.memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';

  return (
    <div className="flex items-center gap-0.5 ml-3">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
        aria-label={t('nav.back', 'Back')}
        className={iconBtn}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        onClick={() => navigate(1)}
        aria-label={t('nav.forward', 'Forward')}
        className={iconBtn}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
});

/** Spotify-style center cluster: round Home + Discover buttons and a big search field. */
const CenterNav = React.memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const shortcutLabel = isMac() ? '⌘ K' : 'Ctrl K';
  const round = (active: boolean) =>
    `w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer ${
      active ? 'bar-control is-active text-white' : 'bar-control text-white/85 hover:text-white'
    }`;

  return (
    <div className="flex items-center gap-2 w-full max-w-[560px]">
      <button
        type="button"
        title={t('titlebar.home')}
        onClick={() => navigate('/home')}
        className={round(pathname === '/home' || pathname === '/')}
      >
        <Home size={19} />
      </button>
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="bar-control flex-1 min-w-0 flex items-center gap-2.5 h-10 px-4 rounded-full text-white/65 hover:text-white transition-colors cursor-pointer"
      >
        <Search size={17} className="shrink-0" />
        <span className="truncate flex-1 text-left text-[14px]">{t('titlebar.search')}</span>
        <kbd
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('sc:open-command-palette'));
          }}
          className="hidden md:inline text-[11px] font-semibold px-2 py-0.5 rounded-md bar-control text-white/55 shrink-0"
        >
          {shortcutLabel}
        </kbd>
      </button>
      <button
        type="button"
        title={t('titlebar.discover')}
        onClick={() => navigate('/discover')}
        className={round(pathname.startsWith('/discover'))}
      >
        <Compass size={18} />
      </button>
    </div>
  );
});

const ImportDialog = React.lazy(() =>
  import('../music/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

/** White "Import" pill: move playlists in by link, from Yandex Music or as text. */
const ImportButton = React.memo(() => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-8 px-3.5 mr-1 rounded-full ui-primary text-[13px] font-bold cursor-pointer hover:scale-[1.04] transition-transform"
      >
        <Import size={15} />
        {t('import.button')}
      </button>
      {open && (
        <React.Suspense fallback={null}>
          <ImportDialog open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </>
  );
});

const SettingsButton = React.memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <button
      type="button"
      title={t('titlebar.settings')}
      onClick={() => navigate('/settings')}
      className={`${iconBtn} ${pathname.startsWith('/settings') ? '!text-accent' : ''}`}
    >
      <Settings size={17} />
    </button>
  );
});

export const Titlebar = React.memo(() => {
  const win = getSafeWindow();

  return (
    <div
      className="h-12 relative z-20 flex items-center justify-between gap-3 pl-2 select-none shrink-0"
      data-tauri-drag-region
    >
      <div className="flex items-center shrink-0" data-tauri-drag-region>
        <Brand />
        <NavButtons />
      </div>

      <div className="flex-1 flex justify-center min-w-0 px-2" data-tauri-drag-region>
        <CenterNav />
      </div>

      <div className="flex items-center h-full shrink-0">
        <ImportButton />
        <SettingsButton />
        {win && (
          <>
            <button
              type="button"
              aria-label="Minimize"
              className={capBtn}
              onClick={() => win.minimize()}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              aria-label="Maximize"
              className={capBtn}
              onClick={() => win.toggleMaximize()}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              aria-label="Close"
              className={`${capBtn} hover:!bg-[#c42b1c]`}
              onClick={() => win.close()}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
