import type { Track } from '../stores/player';
import { usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import { getCurrentTime, subscribe as subscribeAudioTime } from './audio';
import { trackedInvoke as invoke } from './diagnostics';
import { getArtistDisplay, getDisplayTitle } from './track-display';

let connected = false;
let lastConnectAttemptAt = 0;
// Discord not running is the normal case: retry rarely, doubling up to 5 minutes.
const CONNECT_RETRY_MS = 5000;
const CONNECT_RETRY_MAX_MS = 5 * 60_000;
let connectRetryMs = CONNECT_RETRY_MS;

async function ensureConnected(): Promise<boolean> {
  if (!useSettingsStore.getState().discordRpcEnabled) {
    return false;
  }
  if (connected) return true;
  const now = Date.now();
  if (now - lastConnectAttemptAt < connectRetryMs) {
    return false;
  }
  lastConnectAttemptAt = now;
  try {
    connected = await invoke<boolean>('discord_connect');
  } catch {
    connected = false;
  }
  connectRetryMs = connected
    ? CONNECT_RETRY_MS
    : Math.min(connectRetryMs * 2, CONNECT_RETRY_MAX_MS);
  return connected;
}

function artworkToLarge(url: string | null): string | undefined {
  if (!url) return undefined;
  return url.replace(/-[^-./]+(\.[^.]+)$/, '-t500x500$1');
}

async function updatePresence(track: Track) {
  if (!(await ensureConnected())) return;

  try {
    const { isPlaying, playbackRate } = usePlayerStore.getState();
    const { discordRpcMode, discordRpcShowButton } = useSettingsStore.getState();
    const display = getArtistDisplay(track);
    await invoke('discord_set_activity', {
      track: {
        title: getDisplayTitle(track),
        artist: display.primary,
        artwork_url: artworkToLarge(track.artwork_url),
        track_url: track.permalink_url ? `${track.permalink_url}`.replace(/\?.*$/, '') : undefined,
        duration_secs: Math.round(track.duration / 1000),
        elapsed_secs: Math.round(getCurrentTime()),
        playback_rate: playbackRate,
        is_playing: isPlaying,
        mode: discordRpcMode,
        show_button: discordRpcShowButton,
      },
    });
  } catch (e) {
    console.warn('[Discord] Failed to set activity:', e);
    connected = false;
  }
}

async function clearPresence() {
  if (!connected) return;
  try {
    await invoke('discord_clear_activity');
  } catch {
    connected = false;
  }
}

let lastUrn: string | null = null;
let lastPlaying = false;
let lastElapsed = 0;
let lastPlaybackRate = 1;
let seekSyncTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePresenceSync(track: Track, delayMs: number) {
  if (seekSyncTimer) clearTimeout(seekSyncTimer);
  seekSyncTimer = setTimeout(() => {
    seekSyncTimer = null;
    lastElapsed = Math.round(getCurrentTime());
    updatePresence(track);
  }, delayMs);
}

usePlayerStore.subscribe((state) => {
  const { currentTrack, isPlaying, playbackRate } = state;

  const trackChanged = currentTrack?.urn !== lastUrn;
  const playChanged = isPlaying !== lastPlaying;
  const rateChanged = playbackRate !== lastPlaybackRate;

  if (!currentTrack) {
    if (lastPlaying || trackChanged) {
      clearPresence();
    }
    if (seekSyncTimer) {
      clearTimeout(seekSyncTimer);
      seekSyncTimer = null;
    }
    lastUrn = null;
    lastPlaying = false;
    lastElapsed = 0;
    lastPlaybackRate = 1;
    return;
  }

  if (trackChanged || playChanged || rateChanged) {
    if (seekSyncTimer) {
      clearTimeout(seekSyncTimer);
      seekSyncTimer = null;
    }
    lastUrn = currentTrack.urn;
    lastPlaying = isPlaying;
    lastElapsed = Math.round(getCurrentTime());
    lastPlaybackRate = playbackRate;
    updatePresence(currentTrack);
  }
});

useSettingsStore.subscribe((state, prev) => {
  const rpcSettingsChanged =
    state.discordRpcEnabled !== prev.discordRpcEnabled ||
    state.discordRpcMode !== prev.discordRpcMode ||
    state.discordRpcShowButton !== prev.discordRpcShowButton;

  if (!rpcSettingsChanged) return;

  if (!state.discordRpcEnabled) {
    if (seekSyncTimer) {
      clearTimeout(seekSyncTimer);
      seekSyncTimer = null;
    }
    void clearPresence().finally(() => {
      connected = false;
      void invoke('discord_disconnect').catch(() => undefined);
    });
    return;
  }

  // Turned on (or changed) by hand: try now instead of waiting out the backoff.
  lastConnectAttemptAt = 0;
  connectRetryMs = CONNECT_RETRY_MS;
  const { currentTrack } = usePlayerStore.getState();
  if (currentTrack) {
    void updatePresence(currentTrack);
  }
});

subscribeAudioTime(() => {
  const { currentTrack, isPlaying } = usePlayerStore.getState();
  if (!currentTrack || !useSettingsStore.getState().discordRpcEnabled) return;

  if (!connected) {
    void updatePresence(currentTrack);
    return;
  }

  if (!isPlaying) return;

  const elapsed = Math.round(getCurrentTime());
  const drift = Math.abs(elapsed - lastElapsed);

  // Re-sync Discord timestamps on manual seek / large jumps without spamming updates every second.
  if (drift >= 2) {
    lastElapsed = elapsed;
    schedulePresenceSync(currentTrack, 180);
  } else {
    lastElapsed = elapsed;
  }
});
