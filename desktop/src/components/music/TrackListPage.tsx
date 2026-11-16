import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useArtworkColor } from '../../hooks/useArtworkColor';
import { durLong } from '../../lib/formatters';
import { Clock, Download, Loader2, Search, Shuffle } from '../../lib/icons';
import { type Track, usePlayerStore } from '../../stores/player';
import { TrackTableRow } from './TrackTableRow';

/**
 * Spotify/Justify-style list page: colour band from the cover, big tile and title,
 * a play/shuffle row, then a plain track table. Used for liked tracks, history, etc.
 */
export const TrackListPage = React.memo(function TrackListPage({
  kind,
  title,
  tile,
  colorFrom,
  tracks,
  totalCount,
  isLoading,
  footer,
  onDownload,
}: {
  kind: string;
  title: string;
  /** Square artwork / gradient tile shown in the header. */
  tile: React.ReactNode;
  /** Artwork URL to derive the header colour from (falls back to the accent). */
  colorFrom?: string | null;
  tracks: Track[];
  totalCount?: number;
  isLoading?: boolean;
  /** e.g. an infinite-scroll sentinel */
  footer?: React.ReactNode;
  /** Shows a "download for offline" button. */
  onDownload?: () => void;
}) {
  const { t } = useTranslation();
  const colors = useArtworkColor(colorFrom ?? null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (tr) => tr.title.toLowerCase().includes(q) || tr.user?.username?.toLowerCase().includes(q),
    );
  }, [tracks, query]);
  const totalMs = useMemo(() => tracks.reduce((sum, tr) => sum + (tr.duration || 0), 0), [tracks]);

  const band = colors?.dominant
    ? `rgb(${colors.dominant.join(',')})`
    : 'color-mix(in srgb, var(--color-accent) 55%, #1a1a2e)';

  const shuffle = usePlayerStore((s) => s.shuffle);
  const play = () => {
    if (!shown.length) return;
    const first = shuffle ? shown[Math.floor(Math.random() * shown.length)] : shown[0];
    usePlayerStore.getState().play(first, shown);
  };

  return (
    <div className="min-h-full">
      <header
        className="relative px-8 pt-16 pb-6 flex items-end gap-6"
        style={{ background: `linear-gradient(180deg, ${band} 0%, transparent 100%)` }}
      >
        <div className="w-[200px] h-[200px] shrink-0 rounded-md overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.5)] np-cover-img">
          {tile}
        </div>
        <div className="min-w-0 pb-2">
          <p className="text-[13px] font-semibold text-white/90">{kind}</p>
          <h1 className="text-[clamp(32px,6vw,84px)] font-black tracking-tight leading-[1.02] text-white truncate">
            {title}
          </h1>
          <p className="mt-3 text-[14px] text-white/70">
            {t('trackList.meta', {
              count: totalCount ?? tracks.length,
              duration: durLong(totalMs),
            })}
          </p>
        </div>
      </header>

      <div className="px-8 py-5 flex items-center gap-5">
        <button
          type="button"
          onClick={play}
          disabled={!shown.length}
          title={t('common.play', 'Play')}
          className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:scale-[1.05] cursor-pointer disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        {/* Shuffle is a toggle (dot = on), like Spotify/Justify. */}
        <button
          type="button"
          onClick={() => usePlayerStore.getState().toggleShuffle()}
          title={t('trackList.shuffle', 'Shuffle')}
          aria-pressed={shuffle}
          className={`relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
            shuffle ? 'text-accent' : 'text-white/60 hover:text-white'
          }`}
        >
          <Shuffle size={24} />
          {shuffle && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-accent" />}
        </button>
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            title={t('trackList.download', 'Download for offline')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
          >
            <Download size={24} />
          </button>
        )}
        <div className="flex-1" />
        {searchOpen ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: opened by an explicit click on the search icon
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && setSearchOpen(false)}
            placeholder={t('trackList.searchHere', 'Search in this list')}
            className="w-64 h-9 px-3 rounded-md bg-white/[0.08] text-[14px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.12]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title={t('trackList.searchHere', 'Search in this list')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
          >
            <Search size={20} />
          </button>
        )}
      </div>

      <div className="px-4 pb-8">
        <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,0.7fr)_40px_56px] items-center gap-4 px-4 h-9 mb-2 border-b border-white/[0.08] text-[13px] text-white/50">
          <span className="text-center">#</span>
          <span>{t('trackList.title', 'Title')}</span>
          <span>{t('trackList.album', 'Album')}</span>
          <span />
          <span className="flex justify-end">
            <Clock size={15} />
          </span>
        </div>

        {isLoading && tracks.length === 0 ? (
          <div className="flex justify-center py-16 text-white/30">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-white/40">
            {query ? t('library.noMatches') : t('trackList.empty', 'Nothing here yet')}
          </p>
        ) : (
          shown.map((track, i) => (
            <TrackTableRow key={track.urn} track={track} index={i} queue={shown} />
          ))
        )}
        {!query && footer}
      </div>
    </div>
  );
});
