import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import i18n from '../i18n';
import { usePlayerStore } from '../stores/player';
import { handlePrev } from './audio';
import { art } from './formatters';
import { setTrackLiked } from './like-toggle';
import { isUrnLiked } from './likes';
import { queryClient } from './query-client';
import { reportProblem } from './report';
import { getArtistDisplay, getDisplayTitle } from './track-display';

listen<string>('tray-action', (event) => {
  const store = usePlayerStore.getState();
  switch (event.payload) {
    case 'play_pause':
      store.togglePlay();
      break;
    case 'next':
      store.next();
      break;
    case 'prev':
      handlePrev();
      break;
    case 'like': {
      const track = store.currentTrack;
      if (track) void setTrackLiked(queryClient, track, !isUrnLiked(track.urn)).then(syncTray);
      break;
    }
    case 'report':
      reportProblem(i18n.t('tray.report'));
      break;
  }
});

/** Sends the tray menu its labels (app language), the current track and the play state. */
let lastSent = '';
function syncTray() {
  const { currentTrack, isPlaying } = usePlayerStore.getState();
  const t = i18n.t.bind(i18n);
  const state = {
    title: currentTrack ? getDisplayTitle(currentTrack) : null,
    artist: currentTrack ? getArtistDisplay(currentTrack).primary : null,
    artwork: currentTrack
      ? art(currentTrack.artwork_url ?? currentTrack.user?.avatar_url, 't200x200')
      : null,
    playing: isPlaying,
    liked: currentTrack ? isUrnLiked(currentTrack.urn) : false,
    play: t('tray.play'),
    pause: t('tray.pause'),
    previous: t('tray.previous'),
    next: t('tray.next'),
    like: t('tray.like'),
    unlike: t('tray.unlike'),
    open: t('tray.open'),
    quit: t('tray.quit'),
    report: t('tray.report'),
  };
  const key = JSON.stringify(state);
  if (key === lastSent) return;
  lastSent = key;
  invoke('tray_update', { state }).catch(() => {});
}

if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  usePlayerStore.subscribe((s, prev) => {
    if (s.currentTrack !== prev.currentTrack || s.isPlaying !== prev.isPlaying) {
      syncTray();
    }
  });
  i18n.on('languageChanged', syncTray);
  if (i18n.isInitialized) syncTray();
  else i18n.on('initialized', syncTray);
}
