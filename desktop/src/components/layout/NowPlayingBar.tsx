import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/shallow';
import { rgbToCss, useArtworkColor } from '../../hooks/useArtworkColor';
import { api } from '../../lib/api';
import {
  getAudioSecond,
  getCurrentTime,
  getDuration,
  handlePrev,
  seek,
  subscribe,
} from '../../lib/audio';
import { toggleDislike, useDislikeStatus } from '../../lib/dislikes';
import { art, formatTime } from '../../lib/formatters';
import { invalidateAllLikesCache, useCurrentTrackHydration, useLiquidGlass } from '../../lib/hooks';
import {
  audioLines16,
  Heart,
  listMusic16,
  MicVocal,
  Moon,
  Pencil,
  pauseBlack20,
  playBlack20,
  repeat1Icon16,
  repeatIcon16,
  shuffleIcon16,
  skipBack20,
  skipForward20,
  slidersHorizontal16,
  ThumbsDown,
  volume1Icon16,
  volume2Icon16,
  volumeXIcon16,
  X,
} from '../../lib/icons';
import { optimisticToggleLike } from '../../lib/likes';
import { getSleepTimerRemaining, useSleepTimer } from '../../lib/sleep-timer';
import { getArtistDisplay, useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { useWheelSeek } from '../../lib/useWheelSeek';
import { useLyricsStore } from '../../stores/lyrics';
import {
  getEffectivePitchSemitones,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  PITCH_SEMITONES_STEP,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  PLAYBACK_RATE_STEP,
  type Track,
  usePlayerStore,
} from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';
import { useTrackOverridesStore } from '../../stores/track-overrides';
import { EqualizerPanel } from '../music/EqualizerPanel';
import { FullscreenPlayer } from '../music/FullscreenPlayer';
import { UploadKindDot } from '../music/UploadKindDot';
import { NowPlayingPanelButton } from './NowPlayingPanel';

/* ── Download Progress Panel ────────────────────────────────── */

const DownloadProgressPanel = React.memo(() => {
  const downloadProgress = usePlayerStore((s) => s.downloadProgress);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef<number | null>(null);
  const [visibleProgress, setVisibleProgress] = useState<number | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (downloadProgress === null) {
      if (lastProgressRef.current !== null && lastProgressRef.current >= 1) {
        hideTimerRef.current = setTimeout(() => {
          setVisibleProgress(null);
          hideTimerRef.current = null;
        }, 260);
      } else {
        setVisibleProgress(null);
      }
      return;
    }

    lastProgressRef.current = downloadProgress;
    setVisibleProgress(downloadProgress);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [downloadProgress]);

  if (visibleProgress === null) return null;

  const normalizedProgress = Math.max(0, Math.min(1, visibleProgress));
  const progressPercent =
    normalizedProgress >= 1 ? 100 : Math.max(1, Math.min(99, Math.round(normalizedProgress * 100)));

  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)]">
      <div
        className="flex min-w-[148px] items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-2 shadow-[0_10px_34px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[22px]"
        style={{ contain: 'layout paint', transform: 'translateZ(0)' }}
      >
        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.09]">
          <div className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
            style={{
              width: `${progressPercent}%`,
              background: 'var(--color-accent)',
              boxShadow: '0 0 12px var(--color-accent-glow)',
            }}
          />
        </div>
        <div className="min-w-[34px] text-right text-[11px] font-semibold tabular-nums text-white/72">
          {progressPercent}%
        </div>
      </div>
    </div>
  );
});

/* ── Progress Slider ─────────────────────────────────────────── */

function paintProgress(
  range: HTMLSpanElement | null,
  thumb: HTMLSpanElement | null,
  seconds: number,
) {
  const d = getDuration();
  const pct = d > 0 ? (seconds / d) * 100 : 0;
  if (range) range.style.right = `${100 - pct}%`;
  const thumbWrapper = thumb?.parentElement;
  if (thumbWrapper) thumbWrapper.style.left = `${pct}%`;
}

const tipClass =
  'pointer-events-none absolute bottom-[calc(100%+7px)] z-[4] -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white opacity-0 shadow-lg transition-opacity duration-100';

export const ProgressSlider = React.memo(() => {
  // useEffect+useState instead of useSyncExternalStore — avoids React 19 "forceStoreRerender"
  // loop when audio:tick lands between the render and commit phases (20 Hz).
  const [duration, setDuration] = useState(getDuration);
  useEffect(
    () =>
      subscribe(() => {
        const nextDuration = getDuration();
        setDuration((prev) => (prev === nextDuration ? prev : nextDuration));
      }),
    [],
  );

  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  // syncedValue mirrors the last user-committed seek position so Radix Slider's
  // internal state stays close to reality. Reset to 0 on each track change so
  // Radix doesn't try to render the previous track's position on the new one.
  const [syncedValue, setSyncedValue] = useState(0);

  const draggingRef = useRef(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLSpanElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // Mouse wheel over the bar seeks ±5 s (Shift: ±15 s) with a time tooltip.
  const wheelTargetRef = useWheelSeek(rootRef, tipRef, {
    position: getCurrentTime,
    duration: getDuration,
    seek,
    preview: (seconds) => paintProgress(rangeRef.current, thumbRef.current, seconds),
    dragging: () => draggingRef.current,
  });

  // Reset slider state on track change so Radix doesn't render stale position.
  const currentUrn = usePlayerStore((s) => s.currentTrack?.urn);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const prevUrnRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentUrn !== prevUrnRef.current) {
      prevUrnRef.current = currentUrn;
      setSyncedValue(0);
      setDragging(false);
      draggingRef.current = false;
    }
  }, [currentUrn]);

  // Direct DOM updates at the 20 Hz tick — zero React re-renders during playback.
  // Also keeps syncedValue in sync so Radix computes correct delta on next drag start.
  useEffect(() => {
    return subscribe(() => {
      if (draggingRef.current || wheelTargetRef.current !== null) return;
      paintProgress(rangeRef.current, thumbRef.current, getCurrentTime());
    });
  }, [wheelTargetRef]);

  const displayValue = dragging ? dragValue : syncedValue;

  // Safety net: if Radix onValueCommit doesn't fire (pointer leaves window, fast flick),
  // reset dragging state on any pointerup so the progress bar doesn't freeze.
  const pendingCommitRef = useRef<number | null>(null);

  const onValueChange = useCallback(([v]: number[]) => {
    setDragValue(v);
    pendingCommitRef.current = v;
    if (!draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);

      const resetDrag = () => {
        window.removeEventListener('pointerup', resetDrag);
        window.removeEventListener('pointercancel', resetDrag);
        // Give Radix a frame to fire onValueCommit first
        requestAnimationFrame(() => {
          if (draggingRef.current) {
            const val = pendingCommitRef.current;
            if (val != null) seek(val);
            draggingRef.current = false;
            setDragging(false);
            setSyncedValue(val ?? 0);
          }
        });
      };
      window.addEventListener('pointerup', resetDrag);
      window.addEventListener('pointercancel', resetDrag);
    }
  }, []);

  const onValueCommit = useCallback(([v]: number[]) => {
    seek(v);
    draggingRef.current = false;
    pendingCommitRef.current = null;
    setDragging(false);
    setSyncedValue(v);
  }, []);

  return (
    <Slider.Root
      ref={rootRef}
      className="relative flex items-center w-full h-5 cursor-pointer group select-none touch-none"
      value={[displayValue]}
      max={duration || 1}
      step={0.1}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    >
      <Slider.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-white/[0.08] group-hover:h-[5px] transition-all duration-150">
        {isBuffering && (
          <div
            aria-hidden="true"
            className="skeleton-shimmer pointer-events-none absolute inset-0 rounded-full opacity-80"
          />
        )}
        <Slider.Range
          ref={rangeRef}
          className="absolute h-full rounded-full bg-accent will-change-transform"
        />
      </Slider.Track>
      <Slider.Thumb
        ref={thumbRef}
        className="block w-3 h-3 rounded-full bg-accent scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-150 outline-none will-change-transform"
      />
      <span ref={tipRef} className={tipClass} />
    </Slider.Root>
  );
});

/* ── Volume Slider ───────────────────────────────────────────── */

export const VolumeSlider = React.memo(({ className = '' }: { className?: string }) => {
  const { volume, setVolume } = usePlayerStore(
    useShallow((s) => ({ volume: s.volume, setVolume: s.setVolume })),
  );

  return (
    <div className={`relative ${className}`}>
      <Slider.Root
        className="relative flex items-center h-5 w-full cursor-pointer group select-none touch-none"
        value={[volume]}
        max={200}
        step={1}
        onValueChange={([v]) => setVolume(v)}
        onKeyDown={(e) => {
          // Prevent slider from handling arrows itself, otherwise it stacks with global hotkeys.
          if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown'
          ) {
            e.preventDefault();
          }
        }}
        onWheel={(e) => {
          e.preventDefault();
          setVolume(Math.max(0, Math.min(200, volume + (e.deltaY < 0 ? 1 : -1))));
        }}
      >
        <Slider.Track className="relative h-[3px] grow rounded-full bg-white/[0.08] group-hover:h-[4px] transition-all duration-150">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block w-2.5 h-2.5 rounded-full bg-accent transition-all duration-150 outline-none scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100" />
      </Slider.Root>
      {/* 100% tick mark (visual only, outside Slider tree) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-[3px] w-px bg-white/20 pointer-events-none"
        style={{ left: '50%' }}
      />
    </div>
  );
});

/* ── Volume button ───────────────────────────────────────────── */

export const ControlVolumeBtn = React.memo(({ size = 'default' }: { size?: 'default' | 'sm' }) => {
  const { volume, volumeBeforeMute, setVolume } = usePlayerStore(
    useShallow((s) => ({
      volume: s.volume,
      volumeBeforeMute: s.volumeBeforeMute,
      setVolume: s.setVolume,
    })),
  );
  const s = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
  return (
    <button
      type="button"
      onClick={() => setVolume(volume > 0 ? 0 : volumeBeforeMute)}
      className={`${s} rounded-full flex items-center justify-center transition-all duration-150 ease-[var(--ease-apple)] cursor-pointer hover:bg-white/[0.04] ${
        volume === 0 ? 'text-accent' : 'text-white/40 hover:text-white/70'
      }`}
    >
      {volume === 0 ? volumeXIcon16 : volume < 50 ? volume1Icon16 : volume2Icon16}
    </button>
  );
});

/* ── Volume % label ──────────────────────────────────────────── */

export const VolumeLabel = React.memo(() => {
  const volume = usePlayerStore((s) => s.volume);
  return (
    <span
      className={`hidden xl:inline-block text-[10px] tabular-nums w-[34px] text-right shrink-0 ${volume > 100 ? 'text-amber-400/70' : 'text-white/30'}`}
    >
      {volume}%
    </span>
  );
});

/* ── Progress Time (updates once per second) ─────────────────── */

export const ProgressTime = React.memo(() => {
  const [currentSecond, setCurrentSecond] = useState(getAudioSecond);
  const [duration, setDuration] = useState(getDuration);
  useEffect(
    () =>
      subscribe(() => {
        // The tick arrives at 20 Hz but the text only changes once a second:
        // keep the previous value so React bails out instead of re-rendering.
        const second = getAudioSecond();
        const nextDuration = getDuration();
        setCurrentSecond((prev) => (prev === second ? prev : second));
        setDuration((prev) => (prev === nextDuration ? prev : nextDuration));
      }),
    [],
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-white/50 tabular-nums font-medium">
        {formatTime(currentSecond)}
      </span>
      <span className="text-[11px] text-white/20">/</span>
      <span className="text-[11px] text-white/30 tabular-nums font-medium">
        {formatTime(duration)}
      </span>
    </div>
  );
});

const PlaybackQualityBadge = React.memo(() => {
  const { t } = useTranslation();
  const { playbackQuality, playbackSource } = usePlayerStore(
    useShallow((s) => ({
      playbackQuality: s.playbackQuality,
      playbackSource: s.playbackSource,
    })),
  );

  if (!playbackQuality) return null;

  const isHq = playbackQuality === 'hq';

  return (
    <div className="hidden 2xl:flex shrink-0 items-center gap-1.5">
      <span
        className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[9px] font-semibold tracking-[0.14em] ${
          isHq
            ? 'border-white/[0.14] bg-white/[0.08] text-white/92'
            : 'border-white/[0.08] bg-white/[0.04] text-white/68'
        }`}
      >
        {isHq ? t('player.qualityHQ') : t('player.qualitySQ')}
      </span>
      {playbackSource === 'storage' && (
        <span className="hidden xl:inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-[#b7ffd8]/[0.16] bg-[#b7ffd8]/[0.07] px-2 text-[8px] font-medium tracking-[0.12em] text-[#dff7e9]/82">
          <span className="h-1.5 w-1.5 rounded-full bg-[#b7ffd8]" />
          {t('player.qualityCDN')}
        </span>
      )}
    </div>
  );
});

/* ── Like / Dislike buttons ──────────────────────────────────── */

function useTrackReactions(trackUrn: string) {
  const { data: trackData } = useQuery({
    queryKey: ['track', trackUrn],
    queryFn: () => api<Track>(`/tracks/${encodeURIComponent(trackUrn)}`),
    enabled: !!trackUrn,
    staleTime: 30_000,
  });
  return trackData;
}

function LikeButton({ trackUrn }: { trackUrn: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const trackData = useTrackReactions(trackUrn);
  const disliked = useDislikeStatus(trackUrn);

  const [liked, setLiked] = useState<boolean | null>(null);
  const prevUrn = useRef(trackUrn);

  useEffect(() => {
    if (prevUrn.current === trackUrn) return;
    prevUrn.current = trackUrn;
    setLiked(null);
  }, [trackUrn]);

  const isLiked = liked ?? trackData?.user_favorite ?? false;

  const toggle = async () => {
    const next = !isLiked;
    setLiked(next);
    if (trackData) optimisticToggleLike(qc, trackData, next);
    invalidateAllLikesCache();

    if (next && disliked && trackData) {
      toggleDislike(qc, trackData, false);
    }

    try {
      await api(`/likes/tracks/${encodeURIComponent(trackUrn)}`, {
        method: next ? 'POST' : 'DELETE',
      });
      qc.invalidateQueries({ queryKey: ['track', trackUrn, 'favoriters'] });
    } catch {
      setLiked(!next);
      if (trackData) optimisticToggleLike(qc, trackData, !next);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={t('track.likes')}
      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer hover:bg-white/[0.04] ${
        isLiked ? 'text-accent' : 'text-white/30 hover:text-white/60'
      }`}
    >
      <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
    </button>
  );
}

export function NowBarDislikeButton({ trackUrn }: { trackUrn: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const trackData = useTrackReactions(trackUrn);
  const disliked = useDislikeStatus(trackUrn);

  const toggle = async () => {
    if (!trackData) return;
    const next = !disliked;

    if (next && trackData.user_favorite) {
      optimisticToggleLike(qc, trackData, false);
      invalidateAllLikesCache();
      api(`/likes/tracks/${encodeURIComponent(trackUrn)}`, { method: 'DELETE' }).catch(() => {});
    }

    if (next) {
      const { currentTrack, next: skip } = usePlayerStore.getState();
      if (currentTrack?.urn === trackUrn) skip();
    }

    await toggleDislike(qc, trackData, next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={disliked ? t('track.removeDislike') : t('track.dislike')}
      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer hover:bg-white/[0.04] ${
        disliked ? 'text-rose-400' : 'text-white/30 hover:text-white/60'
      }`}
    >
      <ThumbsDown size={16} fill={disliked ? 'currentColor' : 'none'} />
    </button>
  );
}

/* ── Isolated control buttons ────────────────────────────────── */

const btnClass = (active: boolean, size: 'default' | 'sm') =>
  `${size === 'sm' ? 'w-9 h-9' : 'w-10 h-10'} rounded-full flex items-center justify-center transition-all duration-150 ease-[var(--ease-apple)] cursor-pointer hover:bg-white/[0.04] active:scale-[0.97] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.50)] ${
    active ? 'text-accent' : 'text-white/40 hover:text-white/70'
  }`;

const PlayPauseBtn = React.memo(() => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  // Both icons stay mounted and cross-fade with a little rotate/scale — a morph instead of a swap.
  const icon = (show: boolean) =>
    `absolute inset-0 flex items-center justify-center transition-all duration-200 ease-[var(--ease-spring)] ${
      show ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'
    }`;
  return (
    <button
      type="button"
      onClick={togglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className="relative w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-[1.06] active:scale-[0.92] transition-transform duration-200 ease-[var(--ease-spring)] cursor-pointer mx-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
    >
      <span className={icon(isPlaying && !isBuffering)}>{pauseBlack20}</span>
      <span className={icon(!isPlaying && !isBuffering)}>{playBlack20}</span>
      {/* Loading: the icon springs away and a spinner takes its place. */}
      <span className={icon(isBuffering)}>
        <span className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin" />
      </span>
    </button>
  );
});

const ShuffleBtn = React.memo(() => {
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  return (
    <button type="button" onClick={toggleShuffle} className={btnClass(shuffle, 'sm')}>
      {shuffleIcon16}
    </button>
  );
});

const RepeatBtn = React.memo(() => {
  const repeat = usePlayerStore((s) => s.repeat);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  return (
    <button type="button" onClick={toggleRepeat} className={btnClass(repeat !== 'off', 'sm')}>
      {repeat === 'one' ? repeat1Icon16 : repeatIcon16}
    </button>
  );
});

const PrevBtn = React.memo(() => (
  <button type="button" onClick={handlePrev} className={btnClass(false, 'default')}>
    {skipBack20}
  </button>
));

const NextBtn = React.memo(() => {
  const next = usePlayerStore((s) => s.next);
  return (
    <button type="button" onClick={next} className={btnClass(false, 'default')}>
      {skipForward20}
    </button>
  );
});

const QueueBtn = React.memo(({ onClick, active }: { onClick: () => void; active: boolean }) => (
  <button type="button" onClick={onClick} className={btnClass(active, 'sm')}>
    {listMusic16}
  </button>
));

const LyricsBtn = React.memo(() => {
  const open = useLyricsStore((s) => s.open);
  const closePanel = useLyricsStore((s) => s.close);
  const openPanel = useLyricsStore((s) => s.openPanel);
  return (
    <button
      type="button"
      onClick={() => {
        if (open) closePanel();
        else openPanel({ tab: 'lyrics', rightPanelOpen: true });
      }}
      className={btnClass(open, 'sm')}
    >
      <MicVocal size={16} />
    </button>
  );
});

const EqBtn = React.memo(() => {
  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  return (
    <EqualizerPanel>
      <button type="button" className={btnClass(eqEnabled, 'sm')}>
        {audioLines16}
      </button>
    </EqualizerPanel>
  );
});

/* ── Playback rate (speed) slider ─────────────────────────────── */

const formatPlaybackRate = (rate: number) =>
  `${rate
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')}x`;

export const PlaybackRateSlider = React.memo(() => {
  const { t } = useTranslation();
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const resetPlaybackRate = usePlayerStore((s) => s.resetPlaybackRate);
  const isDefault = Math.abs(playbackRate - 1) < 0.001;

  return (
    <div className="px-1 py-1.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-white/80">{t('player.playbackSpeed')}</span>
        <button
          type="button"
          title={isDefault ? t('player.playbackSpeed') : t('player.playbackSpeedReset')}
          onClick={() => {
            if (!isDefault) resetPlaybackRate();
          }}
          className={`min-w-[42px] text-right text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
            isDefault ? 'text-white/45' : 'text-accent hover:text-accent/80'
          }`}
        >
          {formatPlaybackRate(playbackRate)}
        </button>
      </div>
      <Slider.Root
        className="group/rate relative flex h-5 w-full cursor-pointer select-none touch-none items-center"
        aria-label={t('player.playbackSpeed')}
        value={[playbackRate]}
        min={PLAYBACK_RATE_MIN}
        max={PLAYBACK_RATE_MAX}
        step={PLAYBACK_RATE_STEP}
        onValueChange={([v]) => setPlaybackRate(v)}
        onWheel={(e) => {
          if (e.cancelable) e.preventDefault();
          setPlaybackRate(playbackRate + (e.deltaY < 0 ? PLAYBACK_RATE_STEP : -PLAYBACK_RATE_STEP));
        }}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-white/[0.12]">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] outline-none" />
      </Slider.Root>
      {/* 1.00x tick mark */}
      <div className="relative mt-1 h-2 w-full pointer-events-none">
        <div
          className="absolute top-0 h-1.5 w-px bg-white/15"
          style={{
            left: `${((1 - PLAYBACK_RATE_MIN) / (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)) * 100}%`,
          }}
        />
      </div>
    </div>
  );
});

const formatPitchSemitones = (semi: number) => {
  if (Math.abs(semi) < 0.001) return '0';
  return `${semi > 0 ? '+' : ''}${semi.toFixed(1).replace(/\.0$/, '')}`;
};

export const PitchModeToggle = React.memo(() => {
  const { t } = useTranslation();
  const mode = usePlayerStore((s) => s.pitchControlMode);
  const setMode = usePlayerStore((s) => s.setPitchControlMode);
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1">
      <button
        type="button"
        title={t('player.pitchModeAuto')}
        onClick={() => setMode('auto')}
        className={`press h-8 rounded-full text-[13px] font-semibold cursor-pointer ${
          mode === 'auto' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
        }`}
      >
        {t('player.pitchModeAutoShort')}
      </button>
      <button
        type="button"
        title={t('player.pitchModeManual')}
        onClick={() => setMode('manual')}
        className={`press h-8 rounded-full text-[13px] font-semibold cursor-pointer ${
          mode === 'manual' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
        }`}
      >
        {t('player.pitchModeManualShort')}
      </button>
    </div>
  );
});

export const PitchSlider = React.memo(() => {
  const { t } = useTranslation();
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const pitchSemitones = usePlayerStore((s) => s.pitchSemitones);
  const mode = usePlayerStore((s) => s.pitchControlMode);
  const setPitch = usePlayerStore((s) => s.setPitchSemitones);
  const resetPitch = usePlayerStore((s) => s.resetPitchSemitones);
  const effective = getEffectivePitchSemitones(playbackRate, mode, pitchSemitones);
  const isManual = mode === 'manual';
  const canReset = isManual && Math.abs(pitchSemitones) >= 0.001;

  return (
    <div className={`px-1 py-1.5 ${isManual ? '' : 'opacity-65'}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-[13px] font-semibold text-white/80">{t('player.pitch')}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isManual ? 'bg-white/[0.08] text-white/60' : 'bg-accent/15 text-accent'
            }`}
          >
            {isManual ? t('player.pitchModeManualShort') : t('player.pitchModeAutoShort')}
          </span>
        </div>
        <button
          type="button"
          title={canReset ? t('player.pitchReset') : t('player.pitch')}
          onClick={() => {
            if (canReset) resetPitch();
          }}
          className={`min-w-[42px] text-right text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
            canReset ? 'text-accent hover:text-accent/80' : 'text-white/45'
          }`}
        >
          {formatPitchSemitones(effective)}
        </button>
      </div>
      <Slider.Root
        className="group/pitch relative flex h-5 w-full cursor-pointer select-none touch-none items-center"
        aria-label={t('player.pitch')}
        value={[effective]}
        min={PITCH_SEMITONES_MIN}
        max={PITCH_SEMITONES_MAX}
        step={PITCH_SEMITONES_STEP}
        disabled={!isManual}
        onValueChange={([v]) => isManual && setPitch(v)}
        onWheel={(e) => {
          if (!isManual) return;
          if (e.cancelable) e.preventDefault();
          setPitch(pitchSemitones + (e.deltaY < 0 ? PITCH_SEMITONES_STEP : -PITCH_SEMITONES_STEP));
        }}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-white/[0.12]">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] outline-none data-[disabled]:opacity-0" />
      </Slider.Root>
      {/* 0 semi tick */}
      <div className="relative mt-1 h-2 w-full pointer-events-none">
        <div className="absolute top-0 h-1.5 w-px bg-white/15" style={{ left: '50%' }} />
      </div>
    </div>
  );
});

/* ── Sleep Timer button + popover ────────────────────────────── */

const SLEEP_PRESETS_MIN = [5, 10, 15, 30, 45, 60] as const;

const SleepTimerBtn = React.memo(() => {
  const { t } = useTranslation();
  const { endsAt, afterTrack, set, setAfterTrack, cancel } = useSleepTimer();
  const isActive = endsAt !== null || afterTrack;

  // Countdown that ticks every second while a fixed timer is running
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }
    setRemaining(getSleepTimerRemaining());
    const id = setInterval(() => {
      setRemaining(getSleepTimerRemaining());
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={t('player.sleepTimer')}
          className={
            isActive
              ? 'relative h-8 px-2 rounded-full flex items-center gap-1 text-accent bg-accent/15 border border-accent/25 transition-all duration-150 ease-[var(--ease-apple)] cursor-pointer hover:bg-accent/20 active:scale-[0.97] shrink-0'
              : `relative shrink-0 ${btnClass(false, 'sm')}`
          }
        >
          <Moon size={15} />
          {isActive && (
            <span className="text-[10px] font-semibold tabular-nums leading-none">
              {afterTrack ? '1x' : formatTime(remaining ?? 0)}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[200] w-[248px] origin-bottom-right rounded-2xl border border-white/[0.08] bg-[#141416]/95 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl outline-none data-[state=open]:animate-fade-in-up"
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
              <Moon size={15} className="text-white/60" />
              {t('player.sleepTimer')}
            </p>
            {isActive && (
              <span className="text-[12px] font-semibold tabular-nums text-accent">
                {afterTrack ? t('player.sleepAfterTrackShort') : formatTime(remaining ?? 0)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {SLEEP_PRESETS_MIN.map((min) => {
              const activeMins = endsAt !== null ? Math.round((endsAt - Date.now()) / 60000) : null;
              const isSelected =
                endsAt !== null && activeMins !== null && Math.abs(activeMins - min) <= 1;
              return (
                <button
                  key={min}
                  type="button"
                  onClick={() => set(min)}
                  className={`press h-10 rounded-xl text-[13px] font-semibold tabular-nums cursor-pointer ${
                    isSelected
                      ? 'bg-accent text-white'
                      : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.11] hover:text-white'
                  }`}
                >
                  {t('player.sleepMinutes', { count: min })}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={setAfterTrack}
            className={`press mt-1.5 h-10 w-full rounded-xl text-[13px] font-semibold cursor-pointer ${
              afterTrack
                ? 'bg-accent text-white'
                : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.11] hover:text-white'
            }`}
          >
            {t('player.sleepAfterTrack')}
          </button>

          {isActive && (
            <button
              type="button"
              onClick={cancel}
              className="press mt-1.5 h-10 w-full rounded-xl text-[13px] font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white cursor-pointer"
            >
              {t('player.sleepCancel')}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

const TuningBtn = React.memo(() => {
  const { t } = useTranslation();
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const pitchSemitones = usePlayerStore((s) => s.pitchSemitones);
  const pitchMode = usePlayerStore((s) => s.pitchControlMode);
  const isActive =
    Math.abs(playbackRate - 1) >= 0.001 ||
    (pitchMode === 'manual' && Math.abs(pitchSemitones) >= 0.001);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" title={t('player.soundTuning')} className={btnClass(isActive, 'sm')}>
          {slidersHorizontal16}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[200] w-[300px] origin-bottom-right rounded-2xl border border-white/[0.08] bg-[#141416]/95 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl outline-none data-[state=open]:animate-fade-in-up"
        >
          <p className="flex items-center gap-2 px-1 pb-3 text-[14px] font-semibold text-white">
            <span className="text-white/60">{slidersHorizontal16}</span>
            {t('player.soundTuning')}
          </p>
          <div className="space-y-2">
            <PitchModeToggle />
            <PlaybackRateSlider />
            <PitchSlider />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

/* ── Edit Track Info Dialog ──────────────────────────────────── */

const EditTrackInfoDialog = React.memo(function EditTrackInfoDialog({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const glass = useLiquidGlass();
  const { getOverride, setOverride, clearOverride } = useTrackOverridesStore();
  const qc = useQueryClient();
  const existing = getOverride(track.urn);

  const [titleVal, setTitleVal] = useState(existing?.title ?? track.title);
  const [artistVal, setArtistVal] = useState(existing?.artist ?? getArtistDisplay(track).primary);

  const handleSave = () => {
    setOverride(track.urn, {
      title: titleVal.trim() || undefined,
      artist: artistVal.trim() || undefined,
    });
    // Invalidate lyrics cache so next open re-fetches with new metadata
    void qc.invalidateQueries({ queryKey: ['lyrics', 'track', track.urn] });
    onClose();
  };

  const handleClear = () => {
    clearOverride(track.urn);
    setTitleVal(track.title);
    setArtistVal(getArtistDisplay(track).primary);
    void qc.invalidateQueries({ queryKey: ['lyrics', 'track', track.urn] });
    onClose();
  };

  return (
    <div
      className="absolute bottom-full left-0 mb-2 z-50 w-[280px] animate-fade-in-scale"
      style={{
        background: glass ? 'rgba(12,12,16,0.96)' : 'rgba(14,14,18,0.99)',
        ...(glass ? { backdropFilter: 'blur(24px) saturate(180%)' } : {}),
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        boxShadow: glass
          ? '0 1px 0 rgba(255,255,255,0.10) inset, 0 12px 48px rgba(0,0,0,0.70)'
          : '0 8px 32px rgba(0,0,0,0.60)',
        padding: '14px 16px',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-semibold text-white/70">
          {t('track.editInfo', 'Редактировать трек')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/30 hover:text-white/70 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">
            {t('track.title', 'Название')}
          </label>
          <input
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white/90 placeholder:text-white/20 outline-none focus:border-white/[0.18] focus:bg-white/[0.09] transition-all"
            placeholder={track.title}
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">
            {t('track.artist', 'Исполнитель')}
          </label>
          <input
            value={artistVal}
            onChange={(e) => setArtistVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white/90 placeholder:text-white/20 outline-none focus:border-white/[0.18] focus:bg-white/[0.09] transition-all"
            placeholder={getArtistDisplay(track).primary}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg text-[12px] font-semibold cursor-pointer transition-all hover:opacity-90"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          {t('common.save', 'Сохранить')}
        </button>
        {existing && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-lg text-[12px] text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer transition-all"
          >
            {t('common.reset', 'Сброс')}
          </button>
        )}
      </div>

      <p className="text-[10px] text-white/20 mt-2 leading-relaxed">
        {t(
          'track.editInfoHint',
          'Используется для поиска текстов. Не изменяет данные в SoundCloud.',
        )}
      </p>
    </div>
  );
});

/* ── Track Info (left section) ───────────────────────────────── */

const TrackInfo = React.memo(({ onArtworkClick }: { onArtworkClick?: () => void }) => {
  const navigate = useNavigate();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const artworkSmall = art(currentTrack?.artwork_url, 't200x200');

  if (!currentTrack) {
    return (
      <div className="flex items-center gap-3.5 w-[260px] md:w-[320px] xl:w-[400px] min-w-0 shrink">
        <div className="w-12 h-12 rounded-[10px] bg-white/[0.03] ring-1 ring-white/[0.04] shrink-0" />
        <p className="text-[12px] text-white/18 font-medium select-none truncate">
          Nothing playing
        </p>
      </div>
    );
  }

  return (
    <TrackInfoBody
      track={currentTrack}
      artworkSmall={artworkSmall}
      navigate={navigate}
      onArtworkClick={onArtworkClick}
    />
  );
});

const TrackInfoBody = React.memo(function TrackInfoBody({
  track,
  artworkSmall,
  navigate,
  onArtworkClick,
}: {
  track: Track;
  artworkSmall: string | null;
  navigate: ReturnType<typeof useNavigate>;
  onArtworkClick?: () => void;
}) {
  const glass = useLiquidGlass();
  const openLyricsPanel = useLyricsStore((s) => s.openPanel);
  const handleArtworkClick = onArtworkClick ?? (() => openLyricsPanel({ rightPanelOpen: false }));
  const artistDisplay = useArtistDisplay(track);
  const displayTitle = useDisplayTitle(track);
  const playbackSource = usePlayerStore((s) => s.playbackSource);
  const [editOpen, setEditOpen] = useState(false);
  const override = useTrackOverridesStore((s) => s.getOverride(track.urn));
  const artistTarget =
    track.enrichment?.primary_artist?.id && artistDisplay.verified
      ? `/artist/${encodeURIComponent(track.enrichment.primary_artist.id)}`
      : track.user?.urn
        ? `/user/${encodeURIComponent(track.user.urn)}`
        : null;
  return (
    <div className="flex items-center gap-3 w-[260px] md:w-[320px] xl:w-[400px] min-w-0 shrink relative">
      {editOpen && <EditTrackInfoDialog track={track} onClose={() => setEditOpen(false)} />}
      <div
        className="glass-artwork relative w-12 h-12 rounded-[10px] shrink-0 cursor-pointer transition-all duration-300 ease-[var(--ease-spring)] group/art"
        style={{
          ['--artwork-radius' as string]: '10px',
          boxShadow: glass
            ? `
            0 1px 0 0 rgba(255,255,255,0.24) inset,
            0 3px 6px -1px rgba(255,255,255,0.07) inset,
            1px 0 0 0 rgba(255,255,255,0.13) inset,
            0 -1px 0 0 rgba(0,0,0,0.50) inset,
            -1px 0 0 0 rgba(0,0,0,0.18) inset,
            0 0 0 0.5px rgba(255,255,255,0.09),
            0 3px 10px rgba(0,0,0,0.28),
            0 10px 28px rgba(0,0,0,0.30),
            0 0 40px rgba(255,255,255,0.010)
            `
            : `
            0 0 0 1px rgba(255,255,255,0.08),
            0 3px 10px rgba(0,0,0,0.28)
            `,
        }}
        onClick={handleArtworkClick}
      >
        {artworkSmall ? (
          <img
            key={track.urn}
            src={artworkSmall}
            alt=""
            className="w-full h-full object-cover track-swap-art"
          />
        ) : (
          <div className="w-full h-full bg-white/[0.04]" />
        )}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover/art:bg-black/40 group-hover/art:opacity-100 transition-all duration-200"
          style={{ zIndex: 4 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-white">
            <path
              d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div key={track.urn} className="min-w-0 flex-1 track-swap-text">
        <div className="flex items-center gap-1.5 min-w-0 group/title">
          <p
            className="text-[13px] text-white/90 truncate font-medium cursor-pointer hover:text-white leading-tight transition-colors"
            onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
          >
            {displayTitle}
          </p>
          {track.publisher_metadata?.explicit && (
            <span className="shrink-0 inline-flex items-center text-[8px] font-bold px-1 py-0.5 rounded bg-white/[0.08] text-white/35 border border-white/[0.08] tracking-widest uppercase leading-none">
              E
            </span>
          )}
          {/* Pencil — visible when downloaded (storage) or has override */}
          {(playbackSource === 'storage' || override) && (
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              title="Редактировать название / исполнителя"
              className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-all duration-200 cursor-pointer opacity-0 group-hover/title:opacity-100 ${
                editOpen
                  ? 'opacity-100 text-accent bg-white/[0.08]'
                  : 'text-white/30 hover:text-white/70 hover:bg-white/[0.06]'
              } ${override ? '!opacity-70' : ''}`}
            >
              <Pencil size={11} />
            </button>
          )}
        </div>
        <p
          className="text-[11px] text-white/35 truncate mt-1 flex items-center gap-1 cursor-pointer hover:text-white/55 transition-colors"
          onClick={artistTarget ? () => navigate(artistTarget) : undefined}
        >
          <UploadKindDot kind={artistDisplay.uploadKind} />
          <span className="truncate">{artistDisplay.primary}</span>
        </p>
      </div>
      <LikeButton trackUrn={track.urn} />
      <NowBarDislikeButton trackUrn={track.urn} />
      <PlaybackQualityBadge />
    </div>
  );
});

/* ── Background glow ─────────────────────────────────────────── */

const BackgroundGlow = React.memo(() => {
  const artworkUrl = usePlayerStore((s) => s.currentTrack?.artwork_url);
  const artwork = art(artworkUrl, 't200x200');
  const colors = useArtworkColor(artwork);

  if (!artwork) return null;
  return (
    <>
      {/* Base blurred artwork */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${artwork})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.07,
          filter: 'blur(28px)',
          contain: 'strict',
          transform: 'translateZ(0)',
          transition: 'background-image 1.2s ease-out',
        }}
      />
      {/* Dominant colour left-bleed — tints the player area around the artwork */}
      {colors && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg,
              ${rgbToCss(colors.dominant, 0.22)} 0%,
              ${rgbToCss(colors.dominant, 0.08)} 30%,
              transparent 60%)`,
            contain: 'strict',
            transform: 'translateZ(0)',
            transition: 'background 1.2s ease-out',
          }}
        />
      )}
    </>
  );
});

/* ── NowPlayingBar ───────────────────────────────────────────── */

export const NowPlayingBar = React.memo(
  ({ onQueueToggle, queueOpen }: { onQueueToggle: () => void; queueOpen: boolean }) => {
    // Hydrate currentTrack if it lacks publisher_metadata.artist (e.g. from SoundWave / playlists)
    useCurrentTrackHydration();
    const [fsOpen, setFsOpen] = useState(false);
    const openFs = useCallback(() => setFsOpen(true), []);
    const closeFs = useCallback(() => setFsOpen(false), []);

    return (
      <>
        <div
          className="liquid-panel-heavy shrink-0 relative z-[50]"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <BackgroundGlow />
          </div>
          {/* Isolated layer — repaints here won't cascade to blur background */}
          <div className="relative" style={{ isolation: 'isolate' }}>
            <DownloadProgressPanel />
            <ProgressSlider />

            <div className="h-[62px] flex items-center justify-between px-4 xl:px-5 gap-2 xl:gap-3 relative">
              {/* Left: track info */}
              <TrackInfo onArtworkClick={openFs} />

              {/* Center: controls */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="flex items-center gap-0.5">
                  <ShuffleBtn />
                  <PrevBtn />
                  <PlayPauseBtn />
                  <NextBtn />
                  <RepeatBtn />
                </div>
                <ProgressTime />
              </div>

              {/* Right: volume + queue */}
              <div className="flex items-center justify-end gap-0.5 flex-1 max-w-[360px] min-w-0">
                <SleepTimerBtn />
                <TuningBtn />
                <EqBtn />
                <LyricsBtn />
                <QueueBtn onClick={onQueueToggle} active={queueOpen} />
                <NowPlayingPanelButton className={(active) => btnClass(active, 'sm')} />
                <ControlVolumeBtn size="sm" />
                <VolumeSlider className="w-[60px] md:w-[76px] xl:w-[92px] shrink-0" />
                <VolumeLabel />
              </div>
            </div>
          </div>
        </div>
        <FullscreenPlayer open={fsOpen} onClose={closeFs} />
      </>
    );
  },
);
