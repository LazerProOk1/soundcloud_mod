import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isCacheLikesRunning } from '../../lib/cache';
import { countNotProtected } from '../../lib/cache-kind';
import { CheckCircle2, Download } from '../../lib/icons';
import { downloadTracksForOffline, isDownloadable } from '../../lib/offline-download';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import type { Track } from '../../stores/player';

/**
 * "Save for offline" for a list. Three states: something to download, downloading (animated,
 * not clickable), and done (nothing left to download). Previews and blocked tracks are
 * ignored, otherwise the button would never reach "done".
 */
export function OfflineDownloadButton({ tracks }: { tracks: Track[] }) {
  const { t } = useTranslation();
  const onDisk = useCachedUrnsStore((s) => s.urns);
  const [running, setRunning] = useState(false);
  const [missing, setMissing] = useState<number | null>(null);
  const wanted = useMemo(() => tracks.filter(isDownloadable), [tracks]);

  useEffect(() => {
    void isCacheLikesRunning()
      .then(setRunning)
      .catch(() => {});
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recount when files land or a run ends
  useEffect(() => {
    let alive = true;
    void countNotProtected(wanted.map((tr) => tr.urn)).then((n) => {
      if (alive) setMissing(n);
    });
    return () => {
      alive = false;
    };
  }, [wanted, onDisk, running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      void isCacheLikesRunning()
        .then((r) => {
          if (!r) setRunning(false);
        })
        .catch(() => setRunning(false));
    }, 1500);
    return () => window.clearInterval(id);
  }, [running]);

  const done = !running && missing === 0 && wanted.length > 0;
  const start = () => {
    if (running || done) return;
    setRunning(true);
    toast.success(t('trackList.downloadQueued', { count: missing ?? wanted.length }));
    void downloadTracksForOffline(wanted).catch((e) => {
      setRunning(false);
      toast.error(String(e));
    });
  };

  const label = running
    ? t('trackList.downloading')
    : done
      ? t('trackList.downloaded')
      : t('trackList.download');

  return (
    <button
      type="button"
      onClick={start}
      disabled={running || done}
      title={label}
      aria-label={label}
      className={`press flex h-10 w-10 items-center justify-center rounded-full cursor-pointer disabled:cursor-default ${
        done ? 'text-emerald-400' : running ? 'text-accent' : 'text-white/60 hover:text-white'
      }`}
    >
      {done ? (
        <CheckCircle2 size={24} />
      ) : (
        <Download size={24} className={running ? 'download-nudge' : ''} />
      )}
    </button>
  );
}
