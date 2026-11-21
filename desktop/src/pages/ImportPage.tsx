import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { art, dur } from '../lib/formatters';
import { Download, ExternalLink, Loader2, Play, Trash2 } from '../lib/icons';
import { runImport } from '../lib/link-import';
import { type ImportRow, importCounts, useImportsStore } from '../stores/imports';
import { type Track, usePlayerStore } from '../stores/player';

/** An import from another service: every song name at once, filled in as matches are found. */
export function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const job = useImportsStore((s) => s.jobs.find((j) => j.id === id));
  const currentUrn = usePlayerStore((s) => s.currentTrack?.urn);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!job) {
    return <p className="p-10 text-white/60">{t('import.page.gone')}</p>;
  }

  const { found, done, total } = importCounts(job);
  const tracks = job.rows.flatMap((r) => (r.track ? [r.track] : []));
  const searchingAt =
    job.status === 'running' ? job.rows.findIndex((r) => r.state === 'pending') : -1;
  const play = (track?: Track) => {
    if (tracks.length === 0) return;
    usePlayerStore.getState().play(track ?? tracks[0], tracks);
  };

  const status =
    job.status === 'running'
      ? t('import.page.searching', { done, total, found })
      : job.status === 'paused'
        ? t('import.page.paused', { done, total, found })
        : t('import.page.done', { found, total });

  return (
    <div className="px-8 py-8 max-w-[1100px] mx-auto">
      <header className="flex items-end gap-6 mb-6">
        <div className="w-36 h-36 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#ff5500] to-[#7c3aed] text-white">
          <Download size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white/60 mb-1">{t('import.page.kind')}</p>
          <h1 className="text-[40px] leading-tight font-extrabold text-white truncate">
            {job.title}
          </h1>
          <p className="text-[14px] text-white/70 mt-2 tabular-nums">{status}</p>
          {job.status !== 'done' && (
            <div className="h-1.5 mt-3 rounded-full bg-white/[0.08] overflow-hidden max-w-[420px]">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => play()}
          disabled={tracks.length === 0}
          className="h-11 px-5 rounded-full ui-primary text-[14px] font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40"
        >
          <Play size={16} fill="currentColor" />
          {t('import.page.play')}
        </button>
        {job.status === 'paused' && (
          <button
            type="button"
            onClick={() => void runImport(job.id)}
            className="h-11 px-5 rounded-full bar-control text-[14px] font-bold text-white cursor-pointer"
          >
            {t('import.page.resume')}
          </button>
        )}
        {job.playlistUrn && (
          <button
            type="button"
            onClick={() => navigate(`/playlist/${encodeURIComponent(job.playlistUrn ?? '')}`)}
            className="h-11 px-5 rounded-full bar-control text-[14px] font-bold text-white flex items-center gap-2 cursor-pointer"
          >
            <ExternalLink size={16} />
            {t('import.page.openPlaylist')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            useImportsStore.getState().remove(job.id);
            navigate('/library');
          }}
          onBlur={() => setConfirmDelete(false)}
          className={`h-11 px-4 rounded-full text-[14px] font-semibold flex items-center gap-2 cursor-pointer ${
            confirmDelete ? 'ui-danger' : 'text-white/60 hover:text-white'
          }`}
        >
          <Trash2 size={16} />
          {confirmDelete ? t('import.page.confirmDelete') : t('import.page.delete')}
        </button>
      </div>

      <ol className="rounded-xl ui-card divide-y divide-white/[0.05]">
        {job.rows.map((row, i) => (
          <Row
            key={`${i}-${row.title}`}
            index={i}
            row={row}
            searching={i === searchingAt}
            playing={!!row.track && row.track.urn === currentUrn}
            onPlay={() => play(row.track)}
          />
        ))}
      </ol>
    </div>
  );
}

function Row({
  index,
  row,
  searching,
  playing,
  onPlay,
}: {
  index: number;
  row: ImportRow;
  searching: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  const { t } = useTranslation();
  const track = row.track;
  const cover = art(track?.artwork_url, 't67x67');
  const content = (
    <>
      <span className="w-8 text-right text-[13px] tabular-nums text-white/35">{index + 1}</span>
      <span className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-white/[0.06]">
        {cover && <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] ${playing ? 'text-accent' : 'text-white'}`}>
          {track?.title ?? row.title}
        </span>
        <span className="block truncate text-[13px] text-white/50">
          {track?.user?.username ?? row.artist}
        </span>
      </span>
      <span className="shrink-0 text-[13px] tabular-nums text-white/45">
        {row.state === 'found' && track ? (
          dur(track.duration)
        ) : row.state === 'missing' ? (
          t('import.page.notFound')
        ) : searching ? (
          <Loader2 size={15} className="animate-spin" />
        ) : null}
      </span>
    </>
  );
  return (
    <li
      className={
        row.state === 'pending' ? 'opacity-60' : row.state === 'missing' ? 'opacity-45' : ''
      }
    >
      {track ? (
        <button
          type="button"
          onClick={onPlay}
          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04] cursor-pointer"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2">{content}</div>
      )}
    </li>
  );
}
