import { memo, useCallback, useMemo } from 'react';
import { useIsPlayingFrom } from '../../lib/useTrackPlay';
import { type Track, usePlayerStore } from '../../stores/player';
import { PlayFab } from '../ui/PlayFab';

/** Main album action: the same round play button as list pages. */
function AlbumPlayButtonImpl({ tracks }: { tracks: Track[] }) {
  const { playable, playableUrns } = useMemo(() => {
    const list: Track[] = [];
    const urns = new Set<string>();
    for (const tr of tracks) {
      if (tr.enrichment?.availability !== 'wanted') {
        list.push(tr);
        urns.add(tr.urn);
      }
    }
    return { playable: list, playableUrns: urns };
  }, [tracks]);

  const isPlayingFromAlbum = useIsPlayingFrom(playableUrns);
  const empty = playable.length === 0;

  const onClick = useCallback(() => {
    if (empty) return;
    const { play, pause, resume, currentTrack } = usePlayerStore.getState();
    const currentUrn = currentTrack?.urn;
    if (isPlayingFromAlbum) {
      pause();
      return;
    }
    if (currentUrn && playableUrns.has(currentUrn)) {
      resume();
      return;
    }
    play(playable[0], playable);
  }, [empty, isPlayingFromAlbum, playable, playableUrns]);

  return <PlayFab playing={isPlayingFromAlbum} disabled={empty} onClick={onClick} />;
}

export const AlbumPlayButton = memo(AlbumPlayButtonImpl);
