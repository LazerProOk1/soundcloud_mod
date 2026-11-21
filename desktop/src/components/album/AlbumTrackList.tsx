import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dur, fc } from '../../lib/formatters';
import { Clock, ListMusic, Music } from '../../lib/icons';
import { getArtistDisplay } from '../../lib/track-display';
import type { Track } from '../../stores/player';
import { TrackTableRow } from '../music/TrackTableRow';

interface AlbumTrackListProps {
  tracks: Track[];
}

interface Partitioned {
  available: Track[];
  wanted: Track[];
  totalDuration: number;
}

function partition(tracks: Track[]): Partitioned {
  const available: Track[] = [];
  const wanted: Track[] = [];
  let totalDuration = 0;
  for (const t of tracks) {
    if (t.enrichment?.availability === 'wanted') {
      wanted.push(t);
    } else {
      available.push(t);
      totalDuration += t.duration ?? 0;
    }
  }
  return { available, wanted, totalDuration };
}

const WantedRow = memo(function WantedRow({ track, position }: { track: Track; position: number }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_56px] items-center gap-4 px-4 h-14 opacity-50 select-none">
      <span className="text-center text-[14px] tabular-nums text-white/50">{position}</span>
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
        {track.duration ? dur(track.duration) : '—'}
      </span>
    </div>
  );
});

function AlbumTrackListImpl({ tracks }: AlbumTrackListProps) {
  const { t } = useTranslation();
  const { available, wanted, totalDuration } = useMemo(() => partition(tracks), [tracks]);

  if (tracks.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.04]">
          <Music size={24} className="text-white/15" />
        </div>
        <p className="text-white/30 text-sm">{t('album.noTracks')}</p>
      </div>
    );
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 mb-3 text-[22px] font-bold text-white">
        <ListMusic size={20} className="text-white/50" />
        {t('album.tracks')}
        <span className="text-[15px] font-semibold text-white/40">{available.length}</span>
      </h2>
      <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,0.7fr)_40px_56px] items-center gap-4 px-4 h-9 mb-2 border-b border-white/[0.08] text-[13px] text-white/50">
        <span className="text-center">#</span>
        <span>{t('trackList.title', 'Title')}</span>
        <span>{t('trackList.album', 'Album')}</span>
        <span />
        <span className="flex items-center justify-end gap-1.5 tabular-nums">
          {dur(totalDuration)} <Clock size={15} />
        </span>
      </div>

      {available.length > 0 && (
        <div className="flex flex-col">
          {available.map((track, i) => (
            <TrackTableRow key={track.urn} track={track} index={i} queue={available} />
          ))}
        </div>
      )}

      {wanted.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 px-3">
            <span className="text-[15px] font-bold text-white/80">{t('album.comingSoon')}</span>
            <span className="text-[13px] text-white/40 tabular-nums">{fc(wanted.length)}</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div className="flex flex-col">
            {wanted.map((track, i) => (
              <WantedRow key={track.urn} track={track} position={available.length + i + 1} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export const AlbumTrackList = memo(AlbumTrackListImpl);
