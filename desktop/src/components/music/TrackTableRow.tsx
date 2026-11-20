import React from 'react';
import { art, dur } from '../../lib/formatters';
import { Music, Trash2 } from '../../lib/icons';
import { useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { openTrackMenu } from '../../lib/useTrackContextMenu';
import { useTrackPlay } from '../../lib/useTrackPlay';
import type { Track } from '../../stores/player';
import { CacheBadge } from './CacheBadge';
import { LikeButton } from './LikeButton';

/** One row of a Spotify-style track table: #, cover + title/artist, album, like, length. */
export const TrackTableRow = React.memo(function TrackTableRow({
  track,
  index,
  queue,
  onRemove,
  removeLabel,
}: {
  track: Track;
  index: number;
  queue: Track[];
  /** Shows a remove button on hover (own playlists). */
  onRemove?: (track: Track) => void;
  removeLabel?: string;
}) {
  const { isThis, isThisPlaying, togglePlay } = useTrackPlay(track, queue);
  const title = useDisplayTitle(track);
  const artist = useArtistDisplay(track);
  const cover = art(track.artwork_url, 't67x67');
  const album = track.enrichment?.album?.title ?? track.publisher_metadata?.album_title ?? '';

  return (
    <div
      onDoubleClick={togglePlay}
      onContextMenu={(e) => openTrackMenu(e, track)}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' }}
      className={`group grid grid-cols-[32px_minmax(0,1fr)_minmax(0,0.7fr)_40px_56px] items-center gap-4 px-4 h-14 rounded-md select-none transition-colors duration-150 ${
        isThis ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
      }`}
    >
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center text-[14px] tabular-nums text-white/50 cursor-pointer"
      >
        {isThisPlaying ? (
          <span className="flex items-end gap-[2px] h-3.5" aria-hidden>
            <span className="eq-bar w-[3px] h-full bg-accent rounded-sm" />
            <span className="eq-bar w-[3px] h-full bg-accent rounded-sm" />
            <span className="eq-bar w-[3px] h-full bg-accent rounded-sm" />
          </span>
        ) : (
          <>
            <span className={`group-hover:hidden ${isThis ? 'text-accent' : ''}`}>{index + 1}</span>
            <svg
              className="hidden group-hover:block"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </>
        )}
      </button>

      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded overflow-hidden bg-white/[0.06] shrink-0">
          {cover ? (
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/30">
              <Music size={16} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className={`truncate text-[15px] ${isThis ? 'text-accent' : 'text-white'}`}>{title}</p>
          <p className="flex items-center gap-1.5 text-[13px] text-white/55">
            <CacheBadge urn={track.urn} />
            <span className="truncate">{artist.primary}</span>
          </p>
        </div>
      </div>

      <p className="truncate text-[13px] text-white/55">{album}</p>

      <LikeButton track={track} />

      {onRemove ? (
        <span className="flex items-center justify-end">
          <span className="text-[13px] tabular-nums text-white/55 group-hover:hidden">
            {dur(track.duration)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(track)}
            title={removeLabel}
            className="hidden group-hover:flex w-8 h-8 items-center justify-center rounded-full text-white/50 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </span>
      ) : (
        <span className="text-right text-[13px] tabular-nums text-white/55">
          {dur(track.duration)}
        </span>
      )}
    </div>
  );
});
