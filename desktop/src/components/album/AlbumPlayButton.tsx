import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { pauseBlack14, playBlack14 } from '../../lib/icons';
import { useIsPlayingFrom } from '../../lib/useTrackPlay';
import { type Track, usePlayerStore } from '../../stores/player';

/** Main album action: a flat accent pill (no glow), like the play button on list pages. */
function AlbumPlayButtonImpl({ tracks }: { tracks: Track[] }) {
  const { t } = useTranslation();

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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className="press inline-flex items-center gap-2 h-10 pl-4 pr-5 rounded-full ui-accent text-[14px] font-semibold cursor-pointer"
    >
      {isPlayingFromAlbum ? pauseBlack14 : playBlack14}
      {isPlayingFromAlbum ? t('album.pauseAlbum') : t('album.playAlbum')}
    </button>
  );
}

export const AlbumPlayButton = memo(AlbumPlayButtonImpl);
