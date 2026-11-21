import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { useArtworkColor } from '../../hooks/useArtworkColor';
import { getCurrentTime, handlePrev, seek, subscribe } from '../../lib/audio';
import { FFT_BIN_COUNT, readAccentRgb, subscribeAudioFft } from '../../lib/audio-fft';
import { useDislikeStatus } from '../../lib/dislikes';
import { art, durLong } from '../../lib/formatters';
import { type Comment, useCurrentTrackHydration, useTrackComments } from '../../lib/hooks';
import {
  ExternalLink,
  Eye,
  Heart,
  ListPlus,
  Loader2,
  MessageCircle,
  MicVocal,
  Pencil,
  pauseBlack18,
  playBlack18,
  repeat1Icon16,
  repeatIcon16,
  Search,
  SkipBack,
  SkipForward,
  shuffleIcon16,
  ThumbsDown,
  X,
} from '../../lib/icons';
import { setTrackDisliked, setTrackLiked } from '../../lib/like-toggle';
import { useLiked } from '../../lib/likes';
import { lrclibGet, lrclibSearch } from '../../lib/lrclib';
import {
  type LyricLine,
  type LyricsSource,
  searchLyricsManual,
  splitArtistTitle,
} from '../../lib/lyrics';
import { fetchLyricsForTrack, firstSynced, lyricsQueryKey } from '../../lib/lyrics-fetch';
import { forgetLyrics, rememberLyrics } from '../../lib/offline-index';
import { getArtistDisplay, useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import {
  clampLyricsSplit,
  LYRICS_SPLIT_DEFAULT,
  LYRICS_SPLIT_KEYBOARD_STEP,
  LYRICS_SPLIT_MAX,
  LYRICS_SPLIT_MIN,
  useLyricsStore,
} from '../../stores/lyrics';
import { type Track, usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';
import { useTrackOverridesStore } from '../../stores/track-overrides';
import {
  ControlVolumeBtn,
  PlaybackRateSlider,
  ProgressSlider,
  ProgressTime,
  VolumeLabel,
  VolumeSlider,
} from '../layout/NowPlayingBar';
import { PopIcon } from '../ui/PopIcon';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';

/* ── Source labels ────────────────────────────────────────── */

const SOURCE_LABELS: Record<LyricsSource, string> = {
  lrclib: 'LRCLib',
  musixmatch: 'Musixmatch',
  genius: 'Genius',
  netease: 'NetEase',
  self_gen: 'AI',
  none: '',
};

/* ── Shared: dynamic background ───────────────────────────── */

const FullscreenBackground = React.memo(
  ({ artworkSrc, color }: { artworkSrc: string | null; color: [number, number, number] }) => {
    const [r, g, b] = color;
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ contain: 'strict', transform: 'translateZ(0)' }}
      >
        {artworkSrc ? (
          <>
            <img
              src={artworkSrc}
              alt=""
              className="w-full h-full object-cover scale-[1.14] blur-[32px] opacity-30 saturate-[1.25]"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(8,8,10,0.06)_0%,rgba(8,8,10,0.5)_62%,rgba(8,8,10,0.82)_100%)]" />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at 25% 50%, rgba(${r},${g},${b},0.2) 0%, transparent 60%),
                radial-gradient(ellipse at 75% 70%, rgba(${r},${g},${b},0.12) 0%, transparent 50%)
              `,
            }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.3)_0%,rgba(8,8,10,0.56)_48%,rgba(8,8,10,0.84)_100%)]" />
      </div>
    );
  },
);

/* ── Shared: like button ───────────────────────────────────── */

const FullscreenLikeButton = React.memo(({ track }: { track: Track }) => {
  const liked = useLiked(track.urn);
  const qc = useQueryClient();

  const toggle = () => void setTrackLiked(qc, track, !liked);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`press w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ui-icon outline-none ${
        liked ? 'text-accent' : 'text-white/30 hover:text-white/60'
      }`}
    >
      <PopIcon on={liked}>
        <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
      </PopIcon>
    </button>
  );
});

/* ── Shared: dislike button (matches NowBar style) ─────────── */

const FullscreenDislikeButton = React.memo(({ track }: { track: Track }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const disliked = useDislikeStatus(track.urn);

  const toggle = () => setTrackDisliked(qc, track, !disliked);

  return (
    <button
      type="button"
      onClick={toggle}
      title={disliked ? t('track.removeDislike') : t('track.dislike')}
      className={`press w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ui-icon outline-none ${
        disliked ? 'text-rose-400' : 'text-white/30 hover:text-white/60'
      }`}
    >
      <PopIcon on={disliked}>
        <ThumbsDown size={18} fill={disliked ? 'currentColor' : 'none'} />
      </PopIcon>
    </button>
  );
});

/* ── Open track page inside the app ──────────────────────── */

const FullscreenOpenTrackButton = React.memo(({ track }: { track: Track }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const closeLyrics = useLyricsStore((s) => s.close);
  return (
    <button
      type="button"
      onClick={() => {
        closeLyrics();
        navigate(`/track/${encodeURIComponent(track.urn)}`);
      }}
      title={t('track.openTrackPage')}
      className="press w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ui-icon text-white/30 hover:text-white/60 outline-none"
    >
      <ExternalLink size={18} />
    </button>
  );
});

/* ── Transport controls ───────────────────────────────────── */

const Controls = React.memo(({ track }: { track: Track }) => {
  const { isPlaying, next, repeat, shuffle, togglePlay, toggleRepeat, toggleShuffle } =
    usePlayerStore(
      useShallow((s) => ({
        isPlaying: s.isPlaying,
        next: s.next,
        repeat: s.repeat,
        shuffle: s.shuffle,
        togglePlay: s.togglePlay,
        toggleRepeat: s.toggleRepeat,
        toggleShuffle: s.toggleShuffle,
      })),
    );

  const ctrl =
    'press w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ui-icon outline-none';
  const small =
    'press w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ui-icon outline-none';

  return (
    <div className="flex items-center justify-center gap-2">
      <AddToPlaylistDialog trackUrns={[track.urn]}>
        <button type="button" className={`${small} text-white/30 hover:text-white/60`}>
          <ListPlus size={20} />
        </button>
      </AddToPlaylistDialog>
      {/* Dislike on the left, like on the right — the same order everywhere in the app. */}
      <FullscreenDislikeButton track={track} />
      <button
        type="button"
        onClick={toggleShuffle}
        className={`${small} ${shuffle ? 'text-accent' : 'text-white/35 hover:text-white/60'}`}
      >
        <PopIcon on={shuffle}>{shuffleIcon16}</PopIcon>
      </button>
      <button
        type="button"
        onClick={handlePrev}
        className={`${ctrl} text-white/60 hover:text-white`}
      >
        <SkipBack size={20} fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        className="w-14 h-14 rounded-full ui-primary flex items-center justify-center hover:scale-105 active:scale-90 transition-all duration-200 cursor-pointer shadow-lg outline-none"
      >
        <PopIcon on={isPlaying}>{isPlaying ? pauseBlack18 : playBlack18}</PopIcon>
      </button>
      <button type="button" onClick={next} className={`${ctrl} text-white/60 hover:text-white`}>
        <SkipForward size={20} fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={toggleRepeat}
        className={`${small} ${repeat !== 'off' ? 'text-accent' : 'text-white/35 hover:text-white/60'}`}
      >
        <PopIcon on={repeat}>{repeat === 'one' ? repeat1Icon16 : repeatIcon16}</PopIcon>
      </button>
      <FullscreenLikeButton track={track} />
      <FullscreenOpenTrackButton track={track} />
    </div>
  );
});

/* ── Artwork View Modal ───────────────────────────────────── */

const ArtworkViewModal = React.memo(
  ({
    src,
    title,
    subtitle,
    onClose,
  }: {
    src: string;
    title: string;
    subtitle: string;
    onClose: () => void;
  }) => {
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', onKey, true);
      return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    if (typeof document === 'undefined') return null;

    return createPortal(
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 p-8 backdrop-blur-xl sm:p-12">
        <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full bar-control text-white cursor-pointer"
        >
          <X size={20} />
        </button>
        <div
          className="relative z-10 aspect-square w-[min(calc(100vw-4rem),calc(100vh-4rem))] max-w-full max-h-full sm:w-[min(calc(100vw-6rem),calc(100vh-6rem))]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-black/24 shadow-[0_32px_128px_rgba(0,0,0,0.8)]">
            <img
              src={src}
              alt={title}
              loading="eager"
              decoding="async"
              className="h-full w-full animate-zoom-in rounded-[28px] object-cover"
            />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 w-[min(560px,calc(100vw-3rem))] -translate-x-1/2 px-3">
          <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-0.5 rounded-[28px] ui-float px-4 py-3 text-center">
            <p className="max-w-[min(480px,calc(100vw-6rem))] truncate text-lg font-bold text-white/95">
              {title}
            </p>
            <p className="max-w-[min(440px,calc(100vw-6rem))] truncate text-sm text-white/50">
              {subtitle}
            </p>
          </div>
        </div>
      </div>,
      document.body,
    );
  },
);

/* ── Track column (artwork + info + slider + controls) ────── */

const TrackColumn = React.memo(({ track, maxArt }: { track: Track; maxArt?: string }) => {
  const { t } = useTranslation();
  const artwork500 = art(track.artwork_url, 't500x500');
  const artwork200 = art(track.artwork_url, 't200x200');
  const artistDisplay = useArtistDisplay(track);
  const displayTitle = useDisplayTitle(track);
  const [loaded, setLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showFullArt, setShowFullArt] = useState(false);
  const switchTimerRef = useRef<number | null>(null);

  const prevUrlRef = useRef(track.artwork_url);
  if (prevUrlRef.current !== track.artwork_url) {
    prevUrlRef.current = track.artwork_url;
    setLoaded(false);
    setShowFullArt(false);
    if (artwork200 && artwork500 && artwork200 !== artwork500) {
      setIsSwitching(true);
    }
  }

  useEffect(() => {
    if (!isSwitching) return;
    if (switchTimerRef.current !== null) window.clearTimeout(switchTimerRef.current);
    switchTimerRef.current = window.setTimeout(() => {
      setIsSwitching(false);
      switchTimerRef.current = null;
    }, 900);
    return () => {
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [isSwitching]);

  const widthClass = `w-full ${maxArt ?? 'max-w-[360px]'}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-[clamp(8px,1.4vh,22px)] overflow-y-auto scrollbar-hide px-12 py-6">
      <div
        className={`${widthClass} aspect-square rounded-[32px] overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.08] relative group/art`}
      >
        {artwork500 ? (
          <>
            <img
              src={artwork200 || artwork500}
              alt=""
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-[var(--ease-apple)] ${
                isSwitching ? 'blur-2xl scale-125' : 'scale-110'
              } ${loaded ? 'opacity-0' : 'opacity-100'}`}
            />
            <img
              src={artwork500}
              alt=""
              decoding="async"
              onLoad={() => {
                setLoaded(true);
                setIsSwitching(false);
              }}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-[var(--ease-apple)] ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
            <button
              type="button"
              onClick={() => setShowFullArt(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-300 group-hover/art:opacity-100 cursor-pointer outline-none"
            >
              {/* Plain dim + one flat pill: no blur, so the cover stays sharp under the cursor. */}
              <span className="flex h-10 items-center gap-2 rounded-full bg-black/60 px-4 text-[13px] font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
                <Eye size={16} />
                {t('track.viewArtwork')}
              </span>
            </button>
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/[0.06] to-white/[0.02] flex items-center justify-center">
            <MicVocal size={48} className="text-white/10" />
          </div>
        )}
      </div>

      {showFullArt && artwork500 && (
        <ArtworkViewModal
          src={artwork500}
          title={displayTitle}
          subtitle={artistDisplay.primary}
          onClose={() => setShowFullArt(false)}
        />
      )}

      <div className={`${widthClass} text-center space-y-1`}>
        <div className="flex items-center justify-center gap-2 min-w-0">
          <p className="text-[18px] font-bold text-white/95 truncate">{displayTitle}</p>
          {track.access === 'preview' && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-400/90 px-1.5 py-px rounded">
              Preview
            </span>
          )}
        </div>
        <p className="text-[14px] text-white/40 truncate">{artistDisplay.primary}</p>
      </div>

      <div className={widthClass}>
        <ProgressSlider />
        <div className="flex justify-center mt-1">
          <ProgressTime />
        </div>
      </div>

      <Controls track={track} />

      <div className={`${widthClass} flex flex-col gap-2 rounded-[22px] ui-float p-3`}>
        <div className="flex items-center gap-2">
          <ControlVolumeBtn size="sm" />
          <VolumeSlider className="flex-1" />
          <VolumeLabel />
        </div>
        <PlaybackRateSlider />
      </div>
    </div>
  );
});

/* ── Source badge ─────────────────────────────────────────── */

const LyricsSourceBadge = React.memo(
  ({
    source,
    hasSynced,
    onSearch,
    copyText,
  }: {
    source: LyricsSource;
    hasSynced: boolean;
    onSearch: () => void;
    copyText: string;
  }) => {
    const { t } = useTranslation();
    const wordMode = useSettingsStore((s) => s.lyricsWordMode);
    const setWordMode = useSettingsStore((s) => s.setLyricsWordMode);
    const label = source === 'self_gen' ? t('track.selfGenerated') : SOURCE_LABELS[source];
    return (
      <div className="flex items-center justify-between px-12 pt-3 pb-0">
        <div className="flex items-center gap-1.5">
          {label ? (
            <span className="text-[10px] font-semibold text-white/20 ui-card px-2 py-0.5 rounded-full">
              {label}
            </span>
          ) : (
            <span />
          )}
          {hasSynced && (
            <button
              type="button"
              onClick={() => setWordMode(!wordMode)}
              aria-pressed={wordMode}
              // On: a white pill like every other toggle; off: the plain chip.
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer ${
                wordMode ? 'ui-primary' : 'bar-control text-white/60 hover:text-white'
              }`}
            >
              {t('track.lyricsWordMode')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(copyText)
                .then(() => toast.success(t('track.lyricsCopied')));
            }}
            className="bar-control text-[11px] font-semibold px-2.5 py-1 rounded-full text-white/60 hover:text-white cursor-pointer"
          >
            {t('track.lyricsCopy')}
          </button>
        </div>
        <button
          type="button"
          onClick={onSearch}
          className="w-8 h-8 flex items-center justify-center rounded-full ui-icon text-white/30 hover:text-white/70 cursor-pointer"
          aria-label={t('track.manualSearch')}
        >
          <Search size={14} />
        </button>
      </div>
    );
  },
);

/* ── Synced lyrics — line by line ── */

const LYRIC_LEAD_SECS = 0.15;
/** An instrumental break at least this long gets countdown dots. */
const LYRIC_GAP_MIN_SECS = 3;
/** Auto-follow resumes this long after the user scrolled the lyrics by hand. */
const LYRIC_MANUAL_SCROLL_MS = 3500;

interface LyricItem {
  time: number;
  /** Start of the next item (Infinity for the last one). */
  end: number;
  text: string;
  gap: boolean;
  /** How long the word-by-word sweep takes for this line. */
  sweep: number;
  /** Words with the point (0..1 of the sweep) where each one lights up. */
  words: { text: string; at: number }[];
}

function buildItems(lines: LyricLine[]): LyricItem[] {
  const src = lines.filter((l) => Number.isFinite(l.time));
  const out: LyricItem[] = [];
  const gap = (time: number, end: number): LyricItem => ({
    time,
    end,
    text: '',
    gap: true,
    sweep: end - time,
    words: [],
  });
  if (src.length > 0 && src[0].time >= LYRIC_GAP_MIN_SECS) out.push(gap(0, src[0].time));
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const end = i + 1 < src.length ? src[i + 1].time : Number.POSITIVE_INFINITY;
    const text = line.text.trim();
    if (!text) {
      // Empty LRC line = instrumental break; short ones are simply skipped.
      // A trailing empty line has no end: no countdown to show there.
      if (Number.isFinite(end) && end - line.time >= LYRIC_GAP_MIN_SECS) {
        out.push(gap(line.time, end));
      }
      continue;
    }
    const parts = text.split(/\s+/);
    const total = parts.reduce((n, w) => n + w.length, 0) || 1;
    let acc = 0;
    const words = parts.map((w) => {
      const at = acc / total;
      acc += w.length;
      return { text: w, at };
    });
    // Sweep over the line's slot, but not slower than a relaxed singing pace
    // (a line followed by a long silence shouldn't crawl).
    const sweep = Math.max(0.4, Math.min(end - line.time, 0.6 + total * 0.13));
    out.push({ time: line.time, end, text, gap: false, sweep, words });
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const SyncedLyrics = React.memo(({ lines }: { lines: LyricLine[] }) => {
  const items = useMemo(() => buildItems(lines), [lines]);
  const wordMode = useSettingsStore((s) => s.lyricsWordMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const manualScrollRef = useRef(false);
  const syncRef = useRef<((jump?: boolean) => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lineEls = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
    let active = -1;
    let litCount = -1;
    let manualTimer: ReturnType<typeof setTimeout> | undefined;
    manualScrollRef.current = false;

    const markManual = () => {
      manualScrollRef.current = true;
      clearTimeout(manualTimer);
      manualTimer = setTimeout(() => {
        manualScrollRef.current = false;
        syncRef.current?.(true);
      }, LYRIC_MANUAL_SCROLL_MS);
    };
    container.addEventListener('wheel', markManual, { passive: true });
    container.addEventListener('touchstart', markManual, { passive: true });

    void invoke('audio_set_lyrics_timeline', {
      lines: items.map((item) => ({ timeSecs: item.time })),
    });

    // Active item from the real playback position, so it's right after opening the
    // panel mid-track, after a seek and after clicking a line.
    const itemAt = (t: number) => {
      let lo = 0;
      let hi = items.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid].time <= t + 0.05) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found;
    };

    // Per-frame detail of the active item: word sweep or gap dots + countdown.
    const paintActive = (t: number) => {
      if (active < 0) return;
      const item = items[active];
      const el = lineEls[active];
      if (!el) return;
      if (item.gap) {
        const p = clamp01((t - item.time) / (item.end - item.time));
        const dots = el.querySelectorAll<HTMLElement>('.lyric-gap-dots > i');
        dots.forEach((dot, i) => {
          dot.style.setProperty('--fill', String(clamp01(p * dots.length - i)));
        });
        const count = el.querySelector<HTMLElement>('.lyric-gap-count');
        const left = String(Math.max(1, Math.ceil(item.end - t)));
        if (count && count.textContent !== left) count.textContent = left;
        return;
      }
      if (!wordMode) return;
      const p = clamp01((t - item.time) / item.sweep);
      let n = 0;
      while (n < item.words.length && item.words[n].at <= p) n++;
      if (n === litCount) return;
      litCount = n;
      const words = el.querySelectorAll<HTMLElement>('.lyric-w');
      words.forEach((w, i) => {
        if (i < n) w.setAttribute('data-lit', '');
        else w.removeAttribute('data-lit');
      });
    };

    const sync = (jump = false) => {
      if (lineEls.length === 0) return;
      // Small lead so a line lights up as it's sung, not after the transition.
      const t = getCurrentTime() + LYRIC_LEAD_SECS;
      const idx = itemAt(t);
      const prev = active;
      if (idx !== prev || jump) {
        // A break that stops being active forgets its progress: no frozen "●●○ 1" left behind.
        if (prev >= 0 && prev !== idx && items[prev]?.gap && lineEls[prev]) {
          for (const dot of lineEls[prev].querySelectorAll<HTMLElement>('.lyric-gap-dots > i')) {
            dot.style.removeProperty('--fill');
          }
          const count = lineEls[prev].querySelector<HTMLElement>('.lyric-gap-count');
          if (count) count.textContent = '';
        }
        active = idx;
        litCount = -1;
        for (let i = 0; i < lineEls.length; i++) {
          let state: string;
          if (i === idx) state = 'active';
          else if (i === idx - 1) state = 'past-near';
          else if (i === idx + 1) state = 'next-near';
          else if (idx >= 0 && i < idx) state = 'past';
          else state = 'next';
          if (lineEls[i].dataset.state !== state) lineEls[i].dataset.state = state;
        }
        if (idx >= 0 && !manualScrollRef.current) {
          const el = lineEls[idx];
          const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
          // Smooth glide to the next line; instant snap when opening or jumping.
          const smooth = !jump && prev >= 0 && Math.abs(idx - prev) <= 2;
          container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
        }
      }
      paintActive(t);
    };
    syncRef.current = sync;
    sync(true);

    // Position ticks keep it right while paused/seeking; rAF makes the word sweep
    // and the gap dots move smoothly while playing.
    const unsubTime = subscribe(() => sync());
    let raf = 0;
    const frame = () => {
      sync();
      raf = requestAnimationFrame(frame);
    };
    // Only the word sweep needs frame-rate updates. Without word mode the 20 Hz
    // position ticks are plenty, so the loop stays off; it also stops while the
    // window is hidden.
    const stopFrames = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const applyState = () => {
      const paused = !usePlayerStore.getState().isPlaying;
      container.classList.toggle('lyrics-paused', paused);
      stopFrames();
      if (!paused && wordMode && !document.hidden) raf = requestAnimationFrame(frame);
    };
    applyState();
    const unsubPlayer = usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying !== prev.isPlaying) applyState();
    });
    const onVisibilityChange = () => applyState();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      container.removeEventListener('wheel', markManual);
      container.removeEventListener('touchstart', markManual);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(manualTimer);
      stopFrames();
      void invoke('audio_clear_lyrics_timeline');
      unsubTime();
      syncRef.current = null;
      unsubPlayer();
    };
  }, [items, wordMode]);

  const jumpTo = (time: number) => {
    manualScrollRef.current = false;
    seek(time);
    syncRef.current?.(true);
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-y-auto scrollbar-hide px-12 py-16 relative ${wordMode ? 'lyrics-word-mode' : ''}`}
      style={{
        maskImage: 'linear-gradient(transparent 0%, black 10%, black 90%, transparent 100%)',
      }}
    >
      <div className="flex flex-col gap-2">
        {items.map((item) =>
          item.gap ? (
            <div
              key={`g-${item.time}`}
              className="lyric-line lyric-gap"
              onClick={() => jumpTo(Math.max(item.time, item.end - 0.6))}
            >
              <span className="lyric-gap-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="lyric-gap-count" />
            </div>
          ) : (
            <div
              key={`l-${item.time}-${item.text}`}
              className="lyric-line"
              onClick={() => jumpTo(item.time)}
            >
              <span className="lyric-fill">
                {wordMode
                  ? item.words.map((w, j) => (
                      <React.Fragment key={w.at}>
                        <span className="lyric-w">{w.text}</span>
                        {j < item.words.length - 1 ? ' ' : ''}
                      </React.Fragment>
                    ))
                  : item.text}
              </span>
            </div>
          ),
        )}
      </div>
      <div className="h-[40vh]" />
    </div>
  );
});

/* ── Plain lyrics ─────────────────────────────────────────── */

const PlainLyrics = React.memo(({ text }: { text: string }) => (
  <div
    className="flex-1 overflow-y-auto scrollbar-hide px-12 py-16"
    style={{ maskImage: 'linear-gradient(transparent 0%, black 10%, black 90%, transparent 100%)' }}
  >
    <div className="text-[22px] text-white/70 font-semibold whitespace-pre-wrap leading-loose tracking-tight">
      {text}
    </div>
  </div>
));

/* ── Tab button ───────────────────────────────────────────── */

const PanelTabButton = React.memo(
  ({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`press h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors duration-200 cursor-pointer ${
        active ? 'bg-white text-black' : 'text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  ),
);

/* ── Timed comments rail ──────────────────────────────────── */

/** One chat line: avatar, name, the moment in the track (click to jump there) and the text. */
const TimedCommentRow = React.memo(({ comment }: { comment: Comment }) => {
  const avatar = art(comment.user.avatar_url, 'small');
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2 animate-fade-in-up hover:bg-white/[0.04]">
      <img
        src={avatar ?? ''}
        alt=""
        className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-white/[0.06]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-white/85">
            {comment.user.username}
          </span>
          <button
            type="button"
            onClick={() => seek((comment.timestamp ?? 0) / 1000)}
            className="shrink-0 text-[12px] tabular-nums text-white/40 hover:text-accent cursor-pointer"
          >
            {durLong(comment.timestamp ?? 0)}
          </button>
        </div>
        <p className="mt-0.5 break-words text-[14px] leading-snug text-white/75">{comment.body}</p>
      </div>
    </div>
  );
});

/** How many past comments stay in the chat; older ones are dropped to keep the DOM small. */
const COMMENT_CHAT_LIMIT = 80;
/** At most one new line per this interval, so each one can be read. */
const COMMENT_REVEAL_MS = 1800;
/** If more than this many are waiting, the oldest waiting ones are skipped to stay in sync. */
const COMMENT_MAX_BACKLOG = 6;

/**
 * Timed comments as a live chat: a comment appears once playback reaches its moment, at the
 * bottom, and stays put so it can be read. The list sticks to the bottom unless the user has
 * scrolled up to read older ones.
 */
const TimedCommentsRail = React.memo(({ trackUrn }: { trackUrn: string }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const hoverRef = useRef(false);
  const [shownCount, setShownCount] = useState(0);
  const { comments, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTrackComments(trackUrn);

  const timedComments = useMemo(
    () =>
      [...comments]
        .filter((comment) => comment.timestamp != null && comment.body.trim())
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    [comments],
  );

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Number of comments whose moment playback has reached (binary search on the sorted list).
  useEffect(() => {
    const countUpTo = (timeMs: number) => {
      let lo = 0;
      let hi = timedComments.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((timedComments[mid].timestamp ?? 0) <= timeMs) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    // Reveal one line per tick; jump back instantly after a seek backwards; skip a long backlog.
    const step = () => {
      const target = countUpTo(Math.max(0, getCurrentTime()) * 1000);
      setShownCount((shown) => {
        if (target <= shown) return target;
        if (hoverRef.current) return shown;
        return Math.max(shown, target - COMMENT_MAX_BACKLOG) + 1;
      });
    };
    setShownCount(0);
    step();
    const id = window.setInterval(step, COMMENT_REVEAL_MS);
    return () => window.clearInterval(id);
  }, [timedComments]);

  // Keep the newest line in view while the user is at the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when lines are added
  useEffect(() => {
    const el = containerRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [shownCount]);

  if (isLoading && timedComments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-white/15" />
        <p className="text-[13px] text-white/25">{t('track.comments')}</p>
      </div>
    );
  }

  if (timedComments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 text-center">
        <MessageCircle size={40} className="text-white/[0.06]" />
        <p className="text-[15px] text-white/30 font-medium">{t('track.noComments')}</p>
      </div>
    );
  }

  const shown = timedComments.slice(Math.max(0, shownCount - COMMENT_CHAT_LIMIT), shownCount);

  return (
    <div className="flex-1 min-h-0 px-8 pb-8">
      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        onMouseEnter={() => {
          hoverRef.current = true;
        }}
        onMouseLeave={() => {
          hoverRef.current = false;
        }}
        className="flex h-full flex-col overflow-y-auto scrollbar-hide px-2 pb-32"
        style={{ maskImage: 'linear-gradient(transparent 0%, black 10%)' }}
      >
        <div className="flex-1" />
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-white/35">{t('track.commentsSoon')}</p>
        ) : (
          shown.map((comment) => <TimedCommentRow key={comment.id} comment={comment} />)
        )}
      </div>
    </div>
  );
});

/* ── Manual search edit panel ─────────────────────────────── */

const ManualSearchPanel = React.memo(
  ({
    initialArtist,
    initialTitle,
    onCancel,
    onSubmit,
  }: {
    initialArtist: string;
    initialTitle: string;
    onCancel: () => void;
    onSubmit: (artist: string, title: string) => void;
  }) => {
    const { t } = useTranslation();
    const [artist, setArtist] = useState(initialArtist);
    const [title, setTitle] = useState(initialTitle);

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 animate-fade-in-up">
        <h3 className="text-white/80 font-bold mb-2">{t('track.manualSearch')}</h3>
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist"
          autoFocus
          className="w-full max-w-[280px] ui-card px-4 py-2.5 rounded-xl text-white text-[14px] outline-none focus-visible:ring-1 focus-visible:ring-white/25 placeholder:text-white/30"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && artist.trim() && title.trim()) {
              onSubmit(artist.trim(), title.trim());
            }
          }}
          className="w-full max-w-[280px] ui-card px-4 py-2.5 rounded-xl text-white text-[14px] outline-none focus-visible:ring-1 focus-visible:ring-white/25 placeholder:text-white/30"
        />
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-full ui-icon text-[13px] font-medium text-white/50 hover:text-white cursor-pointer"
          >
            {t('common.back')}
          </button>
          <button
            type="button"
            disabled={!artist.trim() || !title.trim()}
            onClick={() => onSubmit(artist.trim(), title.trim())}
            className="px-6 py-2 rounded-full bar-control text-[13px] font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('track.search')}
          </button>
        </div>
      </div>
    );
  },
);

/* ── Resizable split divider ──────────────────────────────── */

const SplitDivider = React.memo(
  ({
    splitRatio,
    onChange,
    layoutRef,
  }: {
    splitRatio: number;
    onChange: (ratio: number) => void;
    layoutRef: React.RefObject<HTMLDivElement | null>;
  }) => {
    const { t } = useTranslation();
    const [active, setActive] = useState(false);
    const draggingRef = useRef(false);
    const splitPercent = splitRatio * 100;

    useEffect(() => {
      if (!active) return;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      };
    }, [active]);

    const updateFromX = (clientX: number) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const rect = layout.getBoundingClientRect();
      if (rect.width <= 0) return;
      onChange(clampLyricsSplit((clientX - rect.left) / rect.width));
    };

    const stop = () => {
      draggingRef.current = false;
      setActive(false);
    };

    return (
      <div
        role="separator"
        aria-label={t('track.resizeLayout')}
        aria-orientation="vertical"
        aria-valuemin={Math.round(LYRICS_SPLIT_MIN * 100)}
        aria-valuemax={Math.round(LYRICS_SPLIT_MAX * 100)}
        aria-valuenow={Math.round(splitPercent)}
        tabIndex={0}
        className="group/splitter absolute top-0 bottom-0 z-20 w-6 -translate-x-1/2 touch-none cursor-col-resize outline-none"
        style={{ left: `${splitPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
          setActive(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromX(event.clientX);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          draggingRef.current = false;
          setActive(false);
          onChange(LYRICS_SPLIT_DEFAULT);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          updateFromX(event.clientX);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onChange(clampLyricsSplit(splitRatio - LYRICS_SPLIT_KEYBOARD_STEP));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            onChange(clampLyricsSplit(splitRatio + LYRICS_SPLIT_KEYBOARD_STEP));
          }
        }}
      >
        {/* Invisible until hovered: a short pill that brightens while dragging. */}
        <div
          className={`absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-150 ${
            active ? 'bg-white/60' : 'bg-transparent group-hover/splitter:bg-white/25'
          }`}
        />
      </div>
    );
  },
);

/* ── Right pane content (lyrics + manual search) ──────────── */

const LyricsPane = React.memo(({ track }: { track: Track }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [manualQuery, setManualQuery] = useState<{ artist: string; title: string } | null>(null);
  // Must be unconditional — hooks cannot be called after conditional returns
  const override = useTrackOverridesStore((s) => s.getOverride(track.urn));
  const setOverride = useTrackOverridesStore((s) => s.setOverride);
  // A downloaded track keeps the corrected name (local rename); others search once.
  const onDisk = useCachedUrnsStore((s) => s.urns.has(track.urn));
  const qc = useQueryClient();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on track switch
  useEffect(() => {
    setManualQuery(null);
    setIsEditing(false);
  }, [track.urn]);

  const { data: lyrics, isLoading } = useQuery({
    queryKey: manualQuery
      ? ['lyrics', 'search', manualQuery.artist, manualQuery.title, track.duration]
      : lyricsQueryKey(track),
    queryFn: async () => {
      // Manual search: user provided custom artist/title
      if (manualQuery) {
        const durationSec = track.duration > 0 ? track.duration / 1000 : undefined;
        const lrcP = lrclibGet(manualQuery.artist, manualQuery.title, durationSec);
        const backendP = searchLyricsManual(manualQuery.artist, manualQuery.title, track.duration);
        const synced = await firstSynced([lrcP, backendP]);
        if (synced) {
          void rememberLyrics(track.urn, synced);
          return synced;
        }
        const [lrc, backend] = await Promise.all([
          lrcP.catch(() => null),
          backendP.catch(() => null),
        ]);
        const result = lrc?.plain ? lrc : backend?.plain ? backend : null;
        if (result) {
          void rememberLyrics(track.urn, result);
          return result;
        }
        const parsed = splitArtistTitle(track.title);
        const fuzzy = await lrclibSearch(
          parsed?.[0] ?? manualQuery.artist,
          parsed?.[1] ?? manualQuery.title,
          track.duration > 0 ? track.duration / 1000 : undefined,
        );
        if (fuzzy) void rememberLyrics(track.urn, fuzzy);
        return fuzzy;
      }

      // Normal track: use the shared fetch (disk cache → network)
      return fetchLyricsForTrack(track);
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const startSearch = () => {
    const parsed = splitArtistTitle(track.title);
    setIsEditing(true);
    if (!manualQuery) {
      setManualQuery(
        (prev) =>
          prev ?? {
            artist: parsed?.[0] || getArtistDisplay(track).primary,
            title: parsed?.[1] || track.title,
          },
      );
    }
  };

  if (isEditing) {
    const parsed = splitArtistTitle(track.title);
    const initialArtist =
      manualQuery?.artist || override?.artist || parsed?.[0] || getArtistDisplay(track).primary;
    const initialTitle = manualQuery?.title || override?.title || parsed?.[1] || track.title;
    return (
      <ManualSearchPanel
        initialArtist={initialArtist}
        initialTitle={initialTitle}
        onCancel={() => setIsEditing(false)}
        onSubmit={(artist, title) => {
          // Clear the disk cache so manual search doesn't return stale wrong lyrics
          void forgetLyrics(track.urn);
          if (onDisk) {
            setOverride(track.urn, {
              title: title.trim() || undefined,
              artist: artist.trim() || undefined,
            });
            void qc.invalidateQueries({ queryKey: ['lyrics', 'track', track.urn] });
          }
          setManualQuery({ artist, title });
          setIsEditing(false);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-white/15" />
        <p className="text-[13px] text-white/25">{t('track.lyricsLoading')}</p>
      </div>
    );
  }

  if (lyrics?.synced && lyrics.synced.length > 0) {
    return (
      <>
        <LyricsSourceBadge
          source={lyrics.source}
          hasSynced={true}
          onSearch={startSearch}
          copyText={lyrics.synced.map((l) => l.text).join('\n')}
        />
        <SyncedLyrics lines={lyrics.synced} />
      </>
    );
  }

  if (lyrics?.plain) {
    return (
      <>
        <LyricsSourceBadge
          source={lyrics.source}
          hasSynced={false}
          onSearch={startSearch}
          copyText={lyrics.plain}
        />
        <PlainLyrics text={lyrics.plain} />
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 text-center relative">
      <button
        type="button"
        onClick={startSearch}
        aria-label={t('track.manualSearch')}
        className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center rounded-full ui-icon text-white/30 hover:text-white/70 cursor-pointer"
      >
        <Search size={14} />
      </button>
      <MicVocal size={40} className="text-white/[0.06]" />
      <p className="text-[15px] text-white/30 font-medium">{t('track.lyricsNotFound')}</p>
      <p className="text-[12px] text-white/15 leading-relaxed max-w-[300px]">
        {t('track.lyricsNotFoundHint')}
      </p>
      {/* Suggest editing track info for better lyrics matching */}
      <button
        type="button"
        onClick={startSearch}
        className={`bar-control press mt-1 flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold cursor-pointer ${
          override ? 'text-accent' : 'text-white/75 hover:text-white'
        }`}
      >
        <Pencil size={12} />
        {override ? t('track.editInfoActive') : t('track.editInfoSuggest')}
      </button>
    </div>
  );
});

/* ── Fullscreen wave visualizer — driven by real FFT from Rust ────── */
/* Rust `audio:fft` event delivers 64 log-spaced magnitude bins ~30Hz.
 * We never poll: the canvas redraws ONLY when a new frame arrives + a short
 * decay tail (~250ms) so play→pause fades smoothly. No rAF when idle. */

const VIS_BINS = FFT_BIN_COUNT;

const FullscreenVisualizer = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Mirror of the latest FFT bins. Smoothed display values live separately
  // so we can do a quick decay tail after the last event.
  const targetRef = useRef<Float32Array>(new Float32Array(VIS_BINS));
  const displayRef = useRef<Float32Array>(new Float32Array(VIS_BINS));

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const accent = readAccentRgb();
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      cssW = Math.max(1, Math.floor(r.width));
      cssH = Math.max(1, Math.floor(r.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Reusable smoothed-bins buffer; refilled per-frame to avoid GC churn.
    const smoothedBins = new Float32Array(VIS_BINS);
    // X-coords for each bin, evenly spread across the full viewport width.
    let sampleXs: Float32Array | null = null;
    const buildSampleXs = () => {
      const xs = new Float32Array(VIS_BINS);
      for (let i = 0; i < VIS_BINS; i++) xs[i] = (i / (VIS_BINS - 1)) * cssW;
      sampleXs = xs;
    };

    const draw = () => {
      if (document.visibilityState === 'hidden') return;
      ctx.clearRect(0, 0, cssW, cssH);
      if (!sampleXs || sampleXs.length !== VIS_BINS) buildSampleXs();

      const display = displayRef.current;

      // Smooth bins horizontally to kill staircase between adjacent bins.
      // 1-2-1 kernel; result is rounder, no "sharp jump bass→treble" artifact.
      smoothedBins[0] = (display[0] * 3 + display[1]) * 0.25;
      smoothedBins[VIS_BINS - 1] = (display[VIS_BINS - 1] * 3 + display[VIS_BINS - 2]) * 0.25;
      for (let i = 1; i < VIS_BINS - 1; i++) {
        smoothedBins[i] = display[i - 1] * 0.25 + display[i] * 0.5 + display[i + 1] * 0.25;
      }

      // Wave sits at the very bottom; amplitude grows upward.
      const baseY = cssH - 6;
      const maxAmp = cssH * 0.78;
      const xs = sampleXs!;

      let peak = 0;
      for (let i = 0; i < VIS_BINS; i++) if (display[i] > peak) peak = display[i];

      // Smooth path: quadratic Béziers through midpoints between consecutive bins.
      // Bins go left → right across the full width: bin[0]=lows on the left,
      // bin[VIS_BINS-1]=highs on the right. No mirroring.
      const tracePath = (ampScale: number) => {
        ctx.beginPath();
        const y0 = baseY - smoothedBins[0] * maxAmp * ampScale;
        ctx.moveTo(xs[0], y0);
        for (let i = 0; i < VIS_BINS - 1; i++) {
          const yA = baseY - smoothedBins[i] * maxAmp * ampScale;
          const yB = baseY - smoothedBins[i + 1] * maxAmp * ampScale;
          const xA = xs[i];
          const xB = xs[i + 1];
          const xMid = (xA + xB) * 0.5;
          const yMid = (yA + yB) * 0.5;
          ctx.quadraticCurveTo(xA, yA, xMid, yMid);
        }
        // Final anchor at the rightmost bin
        ctx.lineTo(xs[VIS_BINS - 1], baseY - smoothedBins[VIS_BINS - 1] * maxAmp * ampScale);
      };

      // Filled body with vertical accent gradient.
      const fillGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      fillGrad.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0)`);
      fillGrad.addColorStop(
        0.5,
        `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${(0.18 * Math.min(1, peak * 1.3)).toFixed(3)})`,
      );
      fillGrad.addColorStop(
        1,
        `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${(0.32 * Math.min(1, peak * 1.3)).toFixed(3)})`,
      );

      tracePath(1.0);
      ctx.lineTo(cssW, baseY);
      ctx.lineTo(0, baseY);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Strokes — 3 layered for depth.
      const drawStroke = (
        ampScale: number,
        alphaMul: number,
        hueAccent: boolean,
        lineW: number,
      ) => {
        tracePath(ampScale);
        const [rC, gC, bC] = hueAccent ? accent : [255, 255, 255];
        const peakAlpha = (0.45 + 0.4 * Math.min(1, peak)) * alphaMul;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = lineW;
        ctx.strokeStyle = `rgba(${rC}, ${gC}, ${bC}, ${peakAlpha.toFixed(3)})`;
        ctx.shadowBlur = 24 * alphaMul;
        ctx.shadowColor = `rgba(${rC}, ${gC}, ${bC}, ${(peakAlpha * 0.6).toFixed(3)})`;
        ctx.stroke();
      };

      drawStroke(1.0, 1.0, true, 2.4);
      drawStroke(0.78, 0.5, false, 1.2);
      ctx.shadowBlur = 0;
    };

    let rafId = 0;
    let lastEventTs = 0;
    let lastDecayTs = performance.now();

    // Single rAF that runs only when there is something to animate:
    // either a new frame is available, or we are still decaying after pause.
    let dirty = false;
    const ensureLoop = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(loop);
    };
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastDecayTs) / 1000);
      lastDecayTs = ts;

      // Smooth target → display. Faster attack, slower release.
      const target = targetRef.current;
      const display = displayRef.current;
      const attack = 1 - Math.exp(-dt * 18); // ~55ms
      const release = 1 - Math.exp(-dt * 5); // ~200ms
      let any = false;
      for (let i = 0; i < VIS_BINS; i++) {
        const t = target[i];
        const d = display[i];
        const k = t > d ? attack : release;
        const next = d + (t - d) * k;
        display[i] = next;
        if (next > 1e-3 || t > 1e-3) any = true;
      }

      draw();

      const sinceEvent = ts - lastEventTs;
      // Keep ticking while there's energy on screen, or up to 350ms after the
      // last event (lets us animate the post-event smoothing curve). Otherwise
      // park the rAF — pure idle CPU.
      if (any && (dirty || sinceEvent < 350)) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = 0;
        dirty = false;
      }
    };

    // Shared ref-counted bridge enables Rust FFT analyser only while mounted.
    const unsubscribeFft = subscribeAudioFft((bins) => {
      const target = targetRef.current;
      const n = Math.min(target.length, bins.length);
      for (let i = 0; i < n; i++) target[i] = bins[i];
      lastEventTs = performance.now();
      dirty = true;
      ensureLoop();
    });

    return () => {
      unsubscribeFft();
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-x-0 bottom-0 z-0 pointer-events-none"
      style={{
        height: 'min(56vh, 460px)',
        // Hard floor at bottom (full opacity until ~78% from the top of the canvas)
        // and a soft fade upward — so the wave reads as rooted to the very edge.
        maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        contain: 'strict',
        transform: 'translateZ(0)',
      }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
});

/* ── Lyrics Panel (fullscreen) ────────────────────────────── */

export const LyricsPanel = React.memo(() => {
  // Hydrate currentTrack artist metadata if missing (catches tracks from any source)
  useCurrentTrackHydration();
  const open = useLyricsStore((s) => s.open);
  const close = useLyricsStore((s) => s.close);
  const tab = useLyricsStore((s) => s.tab);
  const setTab = useLyricsStore((s) => s.setTab);
  const rightPanelOpen = useLyricsStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useLyricsStore((s) => s.setRightPanelOpen);
  const toggleRightPanel = useLyricsStore((s) => s.toggleRightPanel);
  const splitRatio = useLyricsStore((s) => s.splitRatio);
  const setSplitRatio = useLyricsStore((s) => s.setSplitRatio);
  const track = usePlayerStore((s) => s.currentTrack);
  const { t } = useTranslation();
  const artwork200 = art(track?.artwork_url, 't200x200');
  const artworkColors = useArtworkColor(artwork200);
  const dominantColor: [number, number, number] = artworkColors?.dominant ?? [255, 85, 0];
  const splitLayoutRef = useRef<HTMLDivElement>(null);
  const visualizerEnabled = useSettingsStore((s) => s.lyricsVisualizer);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  if (!open || !track) return null;

  const artwork500 = art(track.artwork_url, 't500x500');
  const splitPercent = splitRatio * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden animate-fade-in-up bg-[#08080a]">
      <FullscreenBackground artworkSrc={artwork500} color={dominantColor} />
      {visualizerEnabled && <FullscreenVisualizer />}

      <div
        className={`relative z-10 px-6 pt-5 pb-2 ${rightPanelOpen ? 'flex items-center justify-between gap-4' : 'flex items-center justify-center gap-4'}`}
        data-tauri-drag-region
      >
        <div className="ui-track inline-flex items-center gap-1 rounded-full p-1">
          <PanelTabButton
            active={rightPanelOpen && tab === 'lyrics'}
            onClick={() => {
              setTab('lyrics');
              setRightPanelOpen(true);
            }}
          >
            {t('track.lyrics')}
          </PanelTabButton>
          <PanelTabButton
            active={rightPanelOpen && tab === 'comments'}
            onClick={() => {
              setTab('comments');
              setRightPanelOpen(true);
            }}
          >
            {t('track.comments')}
          </PanelTabButton>
          <PanelTabButton active={!rightPanelOpen} onClick={toggleRightPanel}>
            {rightPanelOpen ? t('track.hidePanel') : t('track.showPanel')}
          </PanelTabButton>
        </div>
        <button
          type="button"
          onClick={close}
          className="w-9 h-9 rounded-full flex items-center justify-center ui-icon text-white/25 hover:text-white/70 cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {rightPanelOpen ? (
        <div
          ref={splitLayoutRef}
          className="relative z-10 grid flex-1 min-h-0"
          style={{
            isolation: 'isolate',
            gridTemplateColumns: `${splitPercent}% ${100 - splitPercent}%`,
          }}
        >
          <div className="min-w-0 min-h-0">
            <TrackColumn track={track} />
          </div>

          <SplitDivider
            splitRatio={splitRatio}
            onChange={setSplitRatio}
            layoutRef={splitLayoutRef}
          />

          <div className="min-w-0 min-h-0 flex flex-col relative">
            {tab === 'comments' ? (
              <TimedCommentsRail trackUrn={track.urn} />
            ) : (
              <LyricsPane track={track} />
            )}
          </div>
        </div>
      ) : (
        <div
          className="relative z-10 flex-1 flex items-center justify-center min-h-0"
          style={{ isolation: 'isolate' }}
        >
          <TrackColumn track={track} maxArt="max-w-[420px]" />
        </div>
      )}
    </div>
  );
});
