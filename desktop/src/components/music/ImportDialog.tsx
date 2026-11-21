import * as Dialog from '@radix-ui/react-dialog';
import { invoke } from '@tauri-apps/api/core';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Cloud, LinkIcon, ListMusic, Loader2, X } from '../../lib/icons';
import { parseTextList } from '../../lib/import-match';
import { fetchLinkList, type ImportItem, runImport } from '../../lib/link-import';
import { useImportsStore } from '../../stores/imports';

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
  const [token, setToken] = useState('');

  const load = async () => {
    const yandex = tab === 'yandex';
    if (yandex ? !token.trim() : !url.trim()) return;
    setLoading(true);
    setList(null);
    try {
      const res = yandex
        ? await invoke<{ title: string; tracks: ImportItem[] }>('import_fetch_yandex_likes', {
            token: token.trim(),
          })
        : await fetchLinkList(url.trim());
      setList({
        title: yandex ? t('import.ymLikes') : res.title || t('import.untitled'),
        tracks: res.tracks,
      });
    } catch (e) {
      toast.error(t('import.loadFailed'), { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const items: ImportItem[] = tab === 'text' ? parseTextList(text) : (list?.tracks ?? []);
  const title = tab === 'text' ? t('import.textPlaylist') : (list?.title ?? '');

  // The playlist shows up at once with every song name; SoundCloud is searched in the background.
  const run = () => {
    if (items.length === 0) return;
    const id = useImportsStore.getState().add(title, items);
    void runImport(id);
    onOpenChange(false);
    setList(null);
    setText('');
    navigate(`/import/${id}`);
  };

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(id);
        setList(null);
      }}
      className={`flex items-center gap-2 h-10 px-4 rounded-full text-[14px] font-semibold cursor-pointer transition-colors ${
        tab === id ? 'ui-selected' : 'bar-control text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65" />
        <Dialog.Content className="fixed z-[80] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[94vw] rounded-2xl app-surface p-7 outline-none">
          <div className="flex items-start justify-between mb-5">
            <Dialog.Title className="text-[26px] font-bold text-white tracking-tight">
              {t('import.title')}
            </Dialog.Title>
            <Dialog.Close className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-white/60 hover:text-white ui-icon cursor-pointer">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {tabBtn('link', <LinkIcon size={17} />, t('import.byLink'))}
            {tabBtn('yandex', <Cloud size={17} />, 'Яндекс Музыка')}
            {tabBtn('text', <ListMusic size={17} />, t('import.byText'))}
          </div>

          {tab === 'yandex' ? (
            <div className="space-y-4">
              <p className="text-[14px] font-bold text-white">{t('import.ymToken')}</p>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void load()}
                  placeholder={t('ym.tokenPlaceholder')}
                  autoComplete="off"
                  className="flex-1 min-w-0 h-12 px-4 rounded-md bar-control text-[15px] text-white placeholder:text-white/35 outline-none focus:outline focus:outline-white/25"
                />
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading || !token.trim()}
                  className="h-12 px-6 rounded-full ui-primary text-[15px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : t('import.load')}
                </button>
              </div>
              {list ? (
                <ListPreview title={list.title} tracks={list.tracks} />
              ) : (
                <ol className="text-[13px] text-white/60 space-y-1 list-decimal pl-5">
                  <li>{t('ym.step1')}</li>
                  <li>{t('ym.step2')}</li>
                  <li>{t('ym.step3')}</li>
                </ol>
              )}
            </div>
          ) : tab === 'link' ? (
            <div className="space-y-4">
              <p className="text-[14px] font-bold text-white">{t('import.link')}</p>
              <div className="flex gap-3">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void load()}
                  placeholder="https://music.yandex.ru/users/…/playlists/…"
                  className="flex-1 min-w-0 h-12 px-4 rounded-md bar-control text-[15px] text-white placeholder:text-white/35 outline-none focus:outline focus:outline-white/25"
                />
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading || !url.trim()}
                  className="h-12 px-6 rounded-full ui-primary text-[15px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : t('import.load')}
                </button>
              </div>
              {list ? (
                <ListPreview title={list.title} tracks={list.tracks} />
              ) : (
                <>
                  <p className="text-[14px] text-white/60">{t('import.linkHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {SOURCES.map((s) => (
                      <span
                        key={s.label}
                        className="flex items-center gap-2 h-9 px-3.5 rounded-full bar-control text-[13px] font-semibold text-white"
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
                className="w-full px-4 py-3 rounded-md bar-control text-[14px] text-white placeholder:text-white/35 outline-none focus:outline focus:outline-white/25 resize-none"
              />
              <p className="text-[13px] text-white/50">
                {t('import.textHint', { count: items.length })}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-4 mt-7">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-[15px] font-bold text-white/70 hover:text-white cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={items.length === 0}
              className="h-12 px-7 rounded-full ui-accent text-[15px] font-bold cursor-pointer"
            >
              {t('import.run')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** What was found at the link: shown right away, before searching SoundCloud. */
function ListPreview({ title, tracks }: { title: string; tracks: ImportItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-[14px] text-white/80">
        <span className="font-bold text-white">{title}</span> ·{' '}
        {t('import.tracksCount', { count: tracks.length })}
      </p>
      <div className="max-h-48 overflow-y-auto rounded-md ui-card divide-y divide-white/[0.05]">
        {tracks.slice(0, 200).map((tr, i) => (
          <div key={`${i}-${tr.title}`} className="flex gap-3 px-3 py-1.5 text-[13px]">
            <span className="w-6 text-right tabular-nums text-white/35">{i + 1}</span>
            <span className="truncate text-white">{tr.title}</span>
            <span className="truncate text-white/50">{tr.artist}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
