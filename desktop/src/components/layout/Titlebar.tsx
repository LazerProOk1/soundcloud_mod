import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Disc3,
  Fullscreen,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PictureInPicture2,
  Square,
  X,
} from '../../lib/icons';
import { toggleWindowFullscreen } from '../../lib/window';
import { useMiniPlayerStore } from '../../stores/mini-player';
import { useSettingsStore } from '../../stores/settings';

const iconBtn =
  'w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default';

// Windows-style caption buttons: full bar height, flat, close turns red.
const capBtn =
  'w-11 h-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors duration-150 cursor-pointer';

const Brand = React.memo(() => {
  const { t } = useTranslation();
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  return (
    <div className="flex items-center gap-1.5" data-tauri-drag-region>
      <button
        type="button"
        onClick={toggleSidebar}
        title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
        className={iconBtn}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <Disc3 size={16} className="text-accent pointer-events-none" />
      <span
        className="text-[13px] text-white/90 pointer-events-none"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em' }}
      >
        SoundCloud
      </span>
    </div>
  );
});

const NavButtons = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';

  return (
    <div className="flex items-center gap-0.5 ml-3">
      <button type="button" disabled={!canGoBack} onClick={() => navigate(-1)} className={iconBtn}>
        <ChevronLeft size={18} />
      </button>
      <button type="button" onClick={() => navigate(1)} className={iconBtn}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
});

export const Titlebar = React.memo(() => {
  const { t } = useTranslation();
  const win = getCurrentWindow();
  const enterMini = useMiniPlayerStore((s) => s.enter);

  return (
    <div
      className="h-10 flex items-center justify-between pl-2 select-none shrink-0 border-b border-white/[0.06]"
      data-tauri-drag-region
    >
      <div className="flex items-center" data-tauri-drag-region>
        <Brand />
        <NavButtons />
      </div>

      <div className="flex items-center h-full">
        <button
          type="button"
          title={t('player.miniPlayer')}
          aria-label={t('player.miniPlayer')}
          className={iconBtn}
          onClick={() => void enterMini()}
        >
          <PictureInPicture2 size={15} />
        </button>
        <button
          type="button"
          title={t('kb.fullscreen')}
          aria-label={t('kb.fullscreen')}
          className={`${iconBtn} mr-2`}
          onClick={() => void toggleWindowFullscreen()}
        >
          <Fullscreen size={15} />
        </button>
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
      </div>
    </div>
  );
});
