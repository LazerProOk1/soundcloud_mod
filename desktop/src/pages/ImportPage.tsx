import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { TrackListPage } from '../components/music/TrackListPage';
import { TrackTableRow } from '../components/music/TrackTableRow';
import { ALL_LIKES_PAGE_SIZE, useLikedTracks } from '../lib/hooks';
import { Download, ExternalLink, Loader2, Trash2, X } from '../lib/icons';
import { runImport } from '../lib/link-import';
import { type ImportRow, importCounts, useImportsStore } from '../stores/imports';
import type { Track } from '../stores/player';

/** An import from another service: every song name at once, filled in as matches are found. */
export function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const job = useImportsStore((s) => s.jobs.find((j) => j.id === id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Saved rows carry no "liked" flag: load the likes so hearts show for songs liked before.
  useLikedTracks(ALL_LIKES_PAGE_SIZE, true);

  // Found tracks, once each: they are what plays, shuffles and goes offline.
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const r of job?.rows ?? []) {
      if (r.state !== 'found' || !r.track || seen.has(r.track.urn)) continue;
      seen.add(r.track.urn);
      out.push(r.track);
    }
    return out;
  }, [job?.rows]);

  if (!job) {
    return <p className="p-10 text-white/60">{t('import.page.gone')}</p>;
  }

  const { found, done, total } = importCounts(job);
  const searchingKey =
    job.status === 'running' ? job.rows.find((r) => r.state === 'pending')?.key : undefined;
  const removeRow = (key: number) => useImportsStore.getState().removeRow(job.id, key);

  const status =
    job.status === 'running'
      ? t('import.page.searching', { done, total, found })
      : job.status === 'paused'
        ? t('import.page.paused', { done, total, found })
        : t('import.page.done', { found, total });

  const pill =
    'h-9 px-4 rounded-full text-[13px] font-semibold flex items-center gap-2 cursor-pointer';

  return (
    <TrackListPage
      kind={t('import.page.kind')}
      title={job.title}
      tile={
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#ff5500] to-[#7c3aed] text-white">
          <Download size={56} />
        </div>
      }
      subtitle={
        <div className="max-w-[560px]">
          <p className="text-white/75 tabular-nums">{status}</p>
          {job.status !== 'done' && (
            <div className="h-1.5 mt-3 rounded-full bg-white/[0.12] overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      }
      tracks={tracks}
      totalCount={tracks.length}
      downloadable
      rowsWhenEmpty
      actions={
        <>
          {job.status === 'paused' && (
            <button
              type="button"
              onClick={() => void runImport(job.id)}
              className={`${pill} bar-control text-white`}
            >
              {t('import.page.resume')}
            </button>
          )}
          {job.playlistUrn && (
            <button
              type="button"
              onClick={() => navigate(`/playlist/${encodeURIComponent(job.playlistUrn ?? '')}`)}
              className={`${pill} bar-control text-white`}
            >
              <ExternalLink size={15} />
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
            className={`${pill} ${confirmDelete ? 'ui-danger' : 'text-white/60 hover:text-white'}`}
          >
            <Trash2 size={15} />
            {confirmDelete ? t('import.page.confirmDelete') : t('import.page.delete')}
          </button>
        </>
      }
      renderRows={(shown) =>
        // Filtering by the search box shows found tracks only; otherwise every source row.
        shown === tracks
          ? job.rows.map((row, i) =>
              row.state === 'found' && row.track ? (
                <TrackTableRow
                  key={row.key}
                  track={row.track}
                  index={i}
                  queue={tracks}
                  onRemove={() => removeRow(row.key)}
                  removeLabel={t('import.page.remove')}
                />
              ) : (
                <SourceRow
                  key={row.key}
                  index={i}
                  row={row}
                  searching={row.key === searchingKey}
                  onRemove={() => removeRow(row.key)}
                />
              ),
            )
          : shown.map((track, i) => (
              <TrackTableRow key={track.urn} track={track} index={i} queue={shown} />
            ))
      }
    />
  );
}

/** A source song that is not a SoundCloud track (yet): same grid as a track row, greyed out. */
function SourceRow({
  index,
  row,
  searching,
  onRemove,
}: {
  index: number;
  row: ImportRow;
  searching: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const note =
    row.state === 'missing'
      ? t('import.page.notFound')
      : row.state === 'duplicate'
        ? t('import.page.duplicate')
        : '';
  return (
    <div
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' }}
      className={`group grid grid-cols-[32px_minmax(0,1fr)_minmax(0,0.7fr)_40px_56px] items-center gap-4 px-4 h-14 rounded-md hover:bg-white/[0.04] ${
        row.state === 'pending' ? 'opacity-60' : 'opacity-40'
      }`}
    >
      <span className="text-center text-[14px] tabular-nums text-white/50">{index + 1}</span>
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded shrink-0 bg-white/[0.06] flex items-center justify-center text-white/40">
          {searching && <Loader2 size={16} className="animate-spin" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-white">{row.title}</span>
          <span className="block truncate text-[13px] text-white/60">{row.artist}</span>
        </span>
      </span>
      <span className="truncate text-[13px] text-white/50">{note}</span>
      <button
        type="button"
        onClick={onRemove}
        title={t('import.page.remove')}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white opacity-0 group-hover:opacity-100 cursor-pointer"
      >
        <X size={16} />
      </button>
      <span />
    </div>
  );
}
