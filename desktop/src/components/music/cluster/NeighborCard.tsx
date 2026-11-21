import React from 'react';
import { useNavigate } from 'react-router-dom';
import { art } from '../../../lib/formatters';
import { pauseBlack14, playBlack14 } from '../../../lib/icons';
import {
  recordClusterFeedback,
  setUrnCluster,
  useClusterFeedback,
} from '../../../lib/recsFeedback';
import { getArtistDisplay } from '../../../lib/track-display';
import { openTrackMenu } from '../../../lib/useTrackContextMenu';
import { useTrackPlay } from '../../../lib/useTrackPlay';
import type { Track } from '../../../stores/player';
import type { ClusterNeighborDto } from './types';

interface Props {
  neighbor: ClusterNeighborDto;
  track: Track;
  queue: Track[];
}

export const NeighborCard = React.memo(function NeighborCard({ neighbor, track, queue }: Props) {
  const navigate = useNavigate();
  const { isThisPlaying, togglePlay: togglePlayRaw } = useTrackPlay(track, queue);
  const clusterId = useClusterFeedback();
  const togglePlay = React.useCallback(() => {
    if (clusterId) {
      setUrnCluster(track.urn, clusterId);
      recordClusterFeedback(clusterId, 'click');
    }
    togglePlayRaw();
  }, [clusterId, track.urn, togglePlayRaw]);
  const cover = art(track.artwork_url, 't300x300');
  const avatar = art(neighbor.avatar_url, 't120x120');

  const openArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/artist/${encodeURIComponent(neighbor.artist_id)}`);
  };

  return (
    <button
      onContextMenu={(e) => openTrackMenu(e, track)}
      type="button"
      onClick={togglePlay}
      className="group relative w-full text-left p-2 rounded-xl cursor-pointer ui-icon"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white/[0.06]">
        {cover ? (
          <img
            src={cover}
            alt={track.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-white/[0.04]" />
        )}

        <span
          onClick={openArtist}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openArtist(e as unknown as React.MouseEvent);
            }
          }}
          className="absolute top-2 left-2 inline-flex items-center gap-1.5 max-w-[80%] pl-[3px] pr-2.5 h-7 rounded-full bg-black/70 hover:bg-black/85 text-[12px] font-semibold text-white cursor-pointer"
        >
          {avatar ? (
            <img src={avatar} alt="" className="w-[22px] h-[22px] rounded-full object-cover" />
          ) : (
            <span className="w-[22px] h-[22px] rounded-full bg-accent" />
          )}
          <span className="truncate">{neighbor.artist_name}</span>
        </span>

        <div
          className={`absolute right-2 bottom-2 transition-opacity duration-200 ${
            isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <span className="w-11 h-11 rounded-full flex items-center justify-center bg-accent shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {isThisPlaying ? pauseBlack14 : playBlack14}
          </span>
        </div>
      </div>

      <div className="pt-2 px-0.5">
        <p className="text-[14px] font-semibold text-white truncate">{track.title}</p>
        <p className="text-[13px] text-white/55 truncate mt-0.5">
          {getArtistDisplay(track).primary}
        </p>
      </div>
    </button>
  );
});
