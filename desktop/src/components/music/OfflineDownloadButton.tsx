import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cancelCacheLikes, isCacheLikesRunning } from '../../lib/cache';
import {
  type CacheLikesProgress,
  countNotProtected,
  getLastRunFailed,
  useCacheKindsVersion,
} from '../../lib/cache-kind';
import { CheckCircle2, Download, X } from '../../lib/icons';
import { downloadTracksForOffline } from '../../lib/offline-download';
import type { Track } from '../../stores/player';

/**
 * "Save for offline" for a list. States: something to download, downloading (progress ring;
 * a click cancels) and done. "Done" means every track is saved with the likes, previews
 * included (SoundCloud often streams them in full, and the run falls back to other sources).
 * Tracks the last run could not fetch keep the download button (its tooltip says how many),
 * and a click tries them again.
 */
export function OfflineDownloadButton({ tracks }: { tracks: Track[] }) {
  const { t } = useTranslation();
  const kindsVersion = useCacheKindsVersion();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [missing, setMissing] = useState<number | null>(null);
  const running = progress !== null;

  useEffect(() => {
    void isCacheLikesRunning()
      .then((r) => r && setProgress({ done: 0, total: 0 }))
      .catch(() => {});
    const off = listen<CacheLikesProgress>('track:cache-likes-progress', ({ payload: p }) => {
      if (p.phase === 'done' || p.phase === 'cancelled') {
        setProgress(null);
      } else setProgress({ done: p.done, total: p.total });
    });
    return () => {
      void off.then((fn) => fn());
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recount when files land
  useEffect(() => {
    let alive = true;
    void countNotProtected(tracks.map((tr) => tr.urn)).then((n) => {
      if (alive) setMissing(n);
    });
    return () => {
      alive = false;
    };
  }, [tracks, kindsVersion]);

  const lastFailed = getLastRunFailed();
  const done = !running && missing === 0 && tracks.length > 0;
  const partly = !running && !!missing && lastFailed > 0 && missing <= lastFailed;
  const start = () => {
    if (running) {
      void cancelCacheLikes().catch(() => {});
      return;
    }
    if (done) return;
    setProgress({ done: 0, total: 0 });
    toast.success(t('trackList.downloadQueued', { count: missing ?? tracks.length }));
    void downloadTracksForOffline(tracks).catch((e) => {
      setProgress(null);
      toast.error(String(e));
    });
  };

  const label = running
    ? t('trackList.cancelDownload')
    : done
      ? t('trackList.downloaded')
      : partly
        ? t('trackList.downloadedExcept', { count: missing })
        : t('trackList.download');
  const pct = progress && progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <button
      type="button"
      onClick={start}
      disabled={done}
      title={label}
      aria-label={label}
      className={`group ui-icon press relative flex h-10 w-10 items-center justify-center rounded-full cursor-pointer disabled:cursor-default ${
        done ? 'text-emerald-400' : running ? 'text-white' : 'text-white/60 hover:text-white'
      }`}
    >
      {done ? (
        <CheckCircle2 size={24} />
      ) : running ? (
        // Progress ring: a faint track and an accent arc that fills as tracks land.
        <>
          <X size={14} className="absolute opacity-0 group-hover:opacity-100 transition-opacity" />
          <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90" aria-hidden>
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
            />
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 11}
              strokeDashoffset={2 * Math.PI * 11 * (1 - Math.max(pct, 0.06))}
              className={
                pct === 0
                  ? 'origin-center animate-spin'
                  : 'transition-[stroke-dashoffset] duration-300'
              }
            />
          </svg>
        </>
      ) : (
        <Download size={24} />
      )}
    </button>
  );
}
