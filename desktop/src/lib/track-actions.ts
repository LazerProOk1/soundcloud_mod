import { toast } from 'sonner';
import i18n from '../i18n';
import { type Track, usePlayerStore } from '../stores/player';
import { downloadTrack } from './cache';
import { cleanPermalink } from './permalink';
import { getArtistDisplay, getDisplayTitle } from './track-display';

function enqueue(track: Track, where: 'next' | 'last') {
  const player = usePlayerStore.getState();
  if (!player.currentTrack) {
    player.play(track, [track]);
    return;
  }
  if (where === 'next') player.addToQueueNext([track]);
  else player.addToQueue([track]);
  const key = where === 'next' ? 'trackMenu.playNextDone' : 'trackMenu.playLastDone';
  toast(i18n.t(key, { title: getDisplayTitle(track) }));
}

export const playTrackNext = (track: Track) => enqueue(track, 'next');
export const playTrackLast = (track: Track) => enqueue(track, 'last');

export function trackArtist(track: Track): string {
  return getArtistDisplay(track).primary || track.user?.username || '';
}

export function trackLabel(track: Track): string {
  const artist = trackArtist(track);
  const title = getDisplayTitle(track);
  return artist ? `${artist} — ${title}` : title;
}

async function copyText(text: string, doneKey: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(i18n.t(doneKey));
  } catch {
    toast.error(i18n.t('trackMenu.copyFailed'));
  }
}

export function copyTrackLink(track: Track) {
  if (track.permalink_url)
    void copyText(cleanPermalink(track.permalink_url), 'trackMenu.linkCopied');
}

export function copyTrackLabel(track: Track) {
  void copyText(trackLabel(track), 'trackMenu.labelCopied');
}

export function saveTrackFile(track: Track) {
  return downloadTrack(track.urn, trackArtist(track), getDisplayTitle(track));
}
