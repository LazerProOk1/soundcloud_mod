import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Heart, Pause, Play, Power, SkipBack, SkipForward } from '../lib/icons';

/** Mirrors `TrayState` in `src-tauri/src/app/tray.rs`. */
interface TrayState {
  title: string | null;
  artist: string | null;
  artwork: string | null;
  playing: boolean;
  liked: boolean;
  play: string;
  pause: string;
  previous: string;
  next: string;
  like: string;
  unlike: string;
  open: string;
  quit: string;
  report: string;
}

const act = (id: string) => void invoke('tray_menu_action', { id });

/** The tray popup: its own small window, so it can look like the app instead of a Win32 menu. */
export function TrayMenu() {
  const [s, setS] = useState<TrayState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke<TrayState>('tray_state').then(setS);
    const off = listen<TrayState>('tray-state', (e) => setS(e.payload));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && act('close');
    window.addEventListener('keydown', onKey);
    return () => {
      void off.then((f) => f());
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // The window takes the size of its content.
  useEffect(() => {
    const el = ref.current;
    if (!el || !s) return;
    const report = () =>
      void invoke('tray_menu_size', { width: el.offsetWidth, height: el.offsetHeight });
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [s]);

  if (!s) return null;
  const hasTrack = !!s.title;
  const icon =
    'flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white cursor-pointer';
  const row =
    'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white cursor-pointer';

  return (
    <div ref={ref} className="w-[288px] p-2 select-none">
      <div className="tray-pop rounded-2xl border border-white/10 bg-[rgb(22,22,26)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
        {hasTrack && (
          <>
            <button
              type="button"
              onClick={() => act('show')}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.06] cursor-pointer"
            >
              {s.artwork ? (
                <img
                  src={s.artwork}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-lg bg-white/10" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{s.title}</p>
                {s.artist && <p className="truncate text-[12px] text-white/50">{s.artist}</p>}
              </div>
            </button>
            <div className="flex items-center justify-center gap-2 pb-1.5 pt-1">
              <button
                type="button"
                aria-label={s.previous}
                onClick={() => act('prev')}
                className={icon}
              >
                <SkipBack size={16} fill="currentColor" />
              </button>
              <button
                type="button"
                aria-label={s.playing ? s.pause : s.play}
                onClick={() => act('play_pause')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform cursor-pointer"
              >
                {s.playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" className="ml-0.5" />
                )}
              </button>
              <button
                type="button"
                aria-label={s.next}
                onClick={() => act('next')}
                className={icon}
              >
                <SkipForward size={16} fill="currentColor" />
              </button>
              <button
                type="button"
                aria-label={s.liked ? s.unlike : s.like}
                onClick={() => act('like')}
                className={`${icon} ${s.liked ? 'text-[var(--color-accent)]' : ''}`}
              >
                <Heart size={16} fill={s.liked ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="mx-2 my-1 h-px bg-white/10" />
          </>
        )}
        {!hasTrack && (
          <button type="button" onClick={() => act('show')} className={row}>
            {s.open}
          </button>
        )}
        <button type="button" onClick={() => act('report')} className={row}>
          <AlertCircle size={14} className="text-white/45" />
          {s.report}
        </button>
        <button type="button" onClick={() => act('quit')} className={row}>
          <Power size={14} className="text-white/45" />
          {s.quit}
        </button>
      </div>
    </div>
  );
}
