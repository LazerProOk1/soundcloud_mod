import * as Dialog from '@radix-ui/react-dialog';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Cloud, LinkIcon, ListMusic, Loader2, X } from '../../lib/icons';
import { parseTextList } from '../../lib/import-match';
import {
  fetchLinkList,
  type ImportItem,
  type ImportProgress,
  importToPlaylist,
} from '../../lib/link-import';

const YMImportDialog = React.lazy(() => import('./YMImportDialog'));

type Tab = 'link' | 'yandex' | 'text';

const SOURCES = [
  { label: 'Яндекс Музыка', dot: '#facc15' },
  { label: 'Spotify', dot: '#22c55e' },
  { label: 'SoundCloud', dot: '#ff5500' },
];

/** Move music in: by link (Yandex / Spotify / SoundCloud), Yandex Music likes, or a text list. */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<{ title: string; tracks: ImportItem[] } | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [ymOpen, setYmOpen] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const running = progress != null && progress.done < progress.total;

  const load = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setList(null);
    try {
      const res = await fetchLinkList(url.trim());
      setList({ title: res.title || t('import.untitled'), tracks: res.tracks });
    } catch (e) {
      toast.error(t('import.loadFailed'), { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const items: ImportItem[] =
    tab === 'text' ? parseTextList(text) : tab === 'link' ? (list?.tracks ?? []) : [];
  const title = tab === 'text' ? t('import.textPlaylist') : (list?.title ?? '');

  const run = async () => {
    if (items.length === 0) return;
    cancelRef.current = { cancelled: false };
    setProgress({ done: 0, total: items.length, found: 0 });
    try {
      const res = await importToPlaylist(title, items, setProgress, cancelRef.current);
      if (res.urn) {
        toast.success(t('import.done', { found: res.found, total: items.length }));
        onOpenChange(false);
        navigate(`/playlist/${encodeURIComponent(res.urn)}`);
      } else if (!cancelRef.current.cancelled) {
        toast.error(t('import.nothingFound'));
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setProgress(null);
    }
  };

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => (id === 'yandex' ? setYmOpen(true) : setTab(id))}
      className={`flex items-center gap-2 h-10 px-4 rounded-full text-[14px] font-semibold cursor-pointer transition-colors ${
        tab === id ? 'bg-white text-black' : 'bg-white/[0.08] text-white hover:bg-white/[0.14]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65" />
          <Dialog.Content className="fixed z-[80] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[94vw] rounded-2xl bg-[#282828] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-7 outline-none">
            <div className="flex items-start justify-between mb-5">
              <Dialog.Title className="text-[26px] font-bold text-white tracking-tight">
                {t('import.title')}
              </Dialog.Title>
              <Dialog.Close className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] cursor-pointer">
                <X size={20} />
              </Dialog.Close>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {tabBtn('link', <LinkIcon size={17} />, t('import.byLink'))}
              {tabBtn('yandex', <Cloud size={17} />, 'Яндекс Музыка')}
              {tabBtn('text', <ListMusic size={17} />, t('import.byText'))}
            </div>

            {tab === 'link' ? (
              <div className="space-y-4">
                <p className="text-[14px] font-bold text-white">{t('import.link')}</p>
                <div className="flex gap-3">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void load()}
                    placeholder="https://music.yandex.ru/users/…/playlists/…"
                    className="flex-1 min-w-0 h-12 px-4 rounded-md bg-[#3e3e3e] text-[15px] text-white placeholder:text-white/35 outline-none border border-transparent focus:border-white"
                  />
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading || !url.trim()}
                    className="h-12 px-6 rounded-full bg-white text-black text-[15px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : t('import.load')}
                  </button>
                </div>
                {list ? (
                  <p className="text-[14px] text-white/80">
                    <span className="font-bold text-white">{list.title}</span> ·{' '}
                    {t('import.tracksCount', { count: list.tracks.length })}
                  </p>
                ) : (
                  <>
                    <p className="text-[14px] text-white/60">{t('import.linkHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      {SOURCES.map((s) => (
                        <span
                          key={s.label}
                          className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-black/30 text-[13px] font-semibold text-white"
                        >
                          <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[14px] font-bold text-white">{t('import.textLabel')}</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={'kizaru - Bandana\nМонеточка - гори гори гори'}
                  className="w-full px-4 py-3 rounded-md bg-[#3e3e3e] text-[14px] text-white placeholder:text-white/35 outline-none border border-transparent focus:border-white resize-none"
                />
                <p className="text-[13px] text-white/50">
                  {t('import.textHint', { count: items.length })}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-4 mt-7">
              {progress && (
                <span className="mr-auto text-[13px] text-white/70 tabular-nums">
                  {t('import.progress', { ...progress })}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (running) cancelRef.current.cancelled = true;
                  else onOpenChange(false);
                }}
                className="text-[15px] font-bold text-white/70 hover:text-white cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void run()}
                disabled={running || items.length === 0}
                className="h-12 px-7 rounded-full bg-accent text-black text-[15px] font-bold cursor-pointer disabled:opacity-40"
              >
                {running ? <Loader2 size={18} className="animate-spin" /> : t('import.run')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {ymOpen && (
        <React.Suspense fallback={null}>
          <YMImportDialog open={ymOpen} onOpenChange={setYmOpen} />
        </React.Suspense>
      )}
    </>
  );
}
