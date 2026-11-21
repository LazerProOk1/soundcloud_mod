import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dur, fc } from '../../lib/formatters';
import { Calendar, ListMusic, Loader2, Music } from '../../lib/icons';
import { getArtistDisplay } from '../../lib/track-display';
import type { Track } from '../../stores/player';
import { TrackTableRow } from '../music/TrackTableRow';
import { Segmented } from '../ui/Segmented';
import { VirtualList } from '../ui/VirtualList';
import type { TracksSort } from './types';
import { useArtistTracks } from './useArtistData';

export type TracksView = 'list' | 'years';

interface ArtistTracksTabProps {
  artistId: string;
  role: 'primary' | 'featured';
  sort: TracksSort;
  onSortChange: (s: TracksSort) => void;
  view: TracksView;
  onViewChange: (v: TracksView) => void;
  showSort?: boolean;
}

const ROW_HEIGHT = 56;

function partition(tracks: Track[]): { available: Track[]; wanted: Track[] } {
  const available: Track[] = [];
  const wanted: Track[] = [];
  for (const t of tracks) {
    if (t.enrichment?.availability === 'wanted') wanted.push(t);
    else available.push(t);
  }
  return { available, wanted };
}

type YearBucket = { year: number | null; items: Track[] };

function compareByReleaseDateDesc(a: Track, b: Track): number {
  const da = a.enrichment?.release_date;
  const db = b.enrichment?.release_date;
  if (da && db) {
    if (da === db) return 0;
    return da < db ? 1 : -1;
  }
  if (da) return -1;
  if (db) return 1;
  return 0;
}

function groupByYear(tracks: Track[]): YearBucket[] {
  const map = new Map<number | 'unknown', Track[]>();
  for (const t of tracks) {
    const y = t.enrichment?.release_year;
    const key = typeof y === 'number' && y > 1900 ? y : 'unknown';
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  const known: YearBucket[] = [];
  for (const [k, items] of map) {
    if (k === 'unknown') continue;
    items.sort(compareByReleaseDateDesc);
    known.push({ year: k as number, items });
  }
  known.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const undated = map.get('unknown');
  if (undated && undated.length > 0) {
    undated.sort(compareByReleaseDateDesc);
    known.push({ year: null, items: undated });
  }
  return known;
}

function ArtistTracksTabImpl({
  artistId,
  role,
  sort,
  onSortChange,
  view,
  onViewChange,
  showSort = true,
}: ArtistTracksTabProps) {
  const { t } = useTranslation();
  const query = useArtistTracks(artistId, role, sort);
  const tracks = query.data ?? [];
  const { available, wanted } = useMemo(() => partition(tracks), [tracks]);
  const yearBuckets = useMemo(
    () => (view === 'years' ? groupByYear(available) : []),
    [view, available],
  );
  const yearsQueue = useMemo(
    () => (view === 'years' ? yearBuckets.flatMap((b) => b.items) : []),
    [view, yearBuckets],
  );
  const totalDuration = useMemo(
    () => tracks.reduce((acc, x) => acc + (x.duration ?? 0), 0),
    [tracks],
  );
  const taggedYears = useMemo(
    () => yearBuckets.filter((b) => b.year != null).length,
    [yearBuckets],
  );

  if (query.isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 size={28} className="text-white/20 animate-spin" />
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center ui-card">
          <Music size={24} className="text-white/15" />
        </div>
        <p className="text-white/30 text-sm">
          {role === 'primary' ? t('artist.noTracks') : t('artist.noAppearances')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showSort && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={view === 'years' ? 'opacity-40 pointer-events-none' : ''}>
              <Segmented
                value={sort}
                onChange={onSortChange}
                options={[
                  { id: 'popular', label: t('artist.sortPopular') },
                  { id: 'recent', label: t('artist.sortRecent') },
                ]}
              />
            </div>
            <Segmented
              value={view}
              onChange={onViewChange}
              options={[
                { id: 'list', label: t('artist.viewList'), icon: <ListMusic size={14} /> },
                { id: 'years', label: t('artist.viewYears'), icon: <Calendar size={14} /> },
              ]}
            />
          </div>
          <span className="text-[13px] text-white/50 tabular-nums">
            {fc(tracks.length)} · {dur(totalDuration)}
            {view === 'years' && taggedYears > 0 && (
              <span className="ml-2 text-white/35">· {taggedYears} y</span>
            )}
          </span>
        </div>
      )}

      {view === 'list' && available.length > 0 && (
        <VirtualList
          items={available}
          rowHeight={ROW_HEIGHT}
          overscan={8}
          getItemKey={(track) => track.urn}
          renderItem={(track, i) => <TrackTableRow track={track} index={i} queue={available} />}
        />
      )}

      {view === 'years' && yearBuckets.length > 0 && (
        <div className="flex flex-col gap-10">
          {yearBuckets.map((bucket, idx) => (
            <YearBlock key={bucket.year ?? `unknown-${idx}`} bucket={bucket} queue={yearsQueue} />
          ))}
        </div>
      )}

      {wanted.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="text-[15px] font-bold text-white/80">{t('artist.comingSoon')}</span>
            <span className="text-[13px] text-white/40 tabular-nums">{fc(wanted.length)}</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div className="flex flex-col">
            {wanted.slice(0, 100).map((track, i) => (
              <WantedRow key={track.urn} track={track} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const YearBlock = memo(({ bucket, queue }: { bucket: YearBucket; queue: Track[] }) => {
  const { t } = useTranslation();
  const total = bucket.items.reduce((acc, x) => acc + (x.duration ?? 0), 0);
  return (
    <div className="flex flex-col md:flex-row md:gap-8 gap-3">
      {/* Year marker, same look as the albums timeline */}
      <div className="md:w-[200px] md:shrink-0 flex md:flex-col md:items-end items-center md:sticky md:top-24 self-start">
        <div className="flex items-baseline gap-3 md:flex-col md:items-end md:gap-1 min-w-0 max-w-full">
          <span className="font-black leading-none tabular-nums tracking-tight whitespace-nowrap text-white text-[clamp(40px,6vw,64px)]">
            {bucket.year ?? '∞'}
          </span>
          <span className="text-[12px] text-white/45 md:text-right whitespace-nowrap">
            {bucket.year != null ? t('artist.releaseYear') : t('artist.unknownYear')} ·{' '}
            {bucket.items.length} · {dur(total)}
          </span>
        </div>
      </div>

      {/* Tracks of the year */}
      <div className="flex-1 min-w-0 flex flex-col">
        {bucket.items.map((track, i) => (
          <TrackTableRow key={track.urn} track={track} index={i} queue={queue} />
        ))}
      </div>
    </div>
  );
});

/** A track the catalog knows about but cannot play yet: dimmed, laid out like TrackTableRow. */
const WantedRow = memo(({ track, index }: { track: Track; index: number }) => (
  <div className="grid grid-cols-[32px_minmax(0,1fr)_56px] items-center gap-4 px-4 h-14 opacity-50 select-none">
    <span className="text-center text-[14px] tabular-nums text-white/50">{index + 1}</span>
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded bg-white/[0.06] shrink-0 flex items-center justify-center text-white/30">
        <Music size={16} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] text-white">{track.title}</p>
        <p className="truncate text-[13px] text-white/55">{getArtistDisplay(track).primary}</p>
      </div>
    </div>
    <span className="text-right text-[13px] tabular-nums text-white/55">
      {track.enrichment?.release_year ?? ''}
    </span>
  </div>
));

export const ArtistTracksTab = memo(ArtistTracksTabImpl);
