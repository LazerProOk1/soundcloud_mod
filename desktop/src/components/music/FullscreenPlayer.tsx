/**
 * FullscreenPlayer
 *
 * Full-screen overlay that opens when the user clicks the artwork thumbnail
 * in the NowPlayingBar. Shows large artwork, track info, and playback controls.
 *
 * Opens with a bottom-sheet slide-up animation; closes with slide-down.
 * Dynamic background derives from useArtworkColor (same blobs as DynamicBackground).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { rgbToCss, useArtworkColor } from '../../hooks/useArtworkColor';
import { handlePrev } from '../../lib/audio';
import { art } from '../../lib/formatters';
import { pauseBlack22, playBlack22, SkipBack, SkipForward, X } from '../../lib/icons';
import { useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { useLyricsStore } from '../../stores/lyrics';
import { type Track, usePlayerStore } from '../../stores/player';
import { ProgressSlider, ProgressTime } from '../layout/NowPlayingBar';
import { PopIcon } from '../ui/PopIcon';
import { LikeButton } from './LikeButton';
import { LiveSpectrumCanvas } from './LiveSpectrumCanvas';

/* ── Inner content (track guaranteed non-null) ──────────────── */

interface FsContentProps {
  track: Track;
  visible: boolean;
  onClose: () => void;
}

const FsContent = React.memo(({ track, visible, onClose }: FsContentProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openLyricsPanel = useLyricsStore((s) => s.openPanel);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);

  const artworkLg = art(track.artwork_url, 't500x500');
  const colors = useArtworkColor(artworkLg);
  const artistDisplay = useArtistDisplay(track);
  const displayTitle = useDisplayTitle(track);

  const artistTarget = track.enrichment?.primary_artist?.id
    ? `/artist/${encodeURIComponent(track.enrichment.primary_artist.id)}`
    : track.user?.urn
      ? `/user/${encodeURIComponent(track.user.urn)}`
      : null;

  const navigateAndClose = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex flex-col items-center justify-center overflow-hidden"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.42s cubic-bezier(0.16,1,0.3,1)',
        background: 'rgb(8,8,10)',
      }}
    >
      {/* Dynamic colour backdrop */}
      {artworkLg && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${artworkLg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(32px) saturate(1.5)',
              transform: 'scale(1.12) translateZ(0)',
              opacity: 0.28,
            }}
          />
          {colors && (
            <>
              <div
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  width: '68vw',
                  height: '68vh',
                  top: '-14vh',
                  left: '-12vw',
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse at center, ${rgbToCss(colors.dominant, 0.34)} 0%, ${rgbToCss(colors.dominant, 0.12)} 42%, transparent 72%)`,
                }}
              />
              <div
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  width: '58vw',
                  height: '58vh',
                  bottom: '-10vh',
                  right: '-10vw',
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse at center, ${rgbToCss(colors.secondary, 0.28)} 0%, ${rgbToCss(colors.secondary, 0.1)} 42%, transparent 72%)`,
                }}
              />
            </>
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 120% 120% at 50% 50%, rgba(6,6,9,0.55) 0%, rgba(6,6,9,0.88) 100%)',
            }}
          />
        </>
      )}

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
      >
        <X size={18} />
      </button>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-sm px-6">
        {/* Artwork */}
        <div
          className="glass-artwork rounded-[32px] overflow-hidden"
          style={{
            width: 280,
            height: 280,
            flexShrink: 0,
            ['--artwork-radius' as string]: '32px',
            boxShadow: colors
              ? `0 24px 80px ${rgbToCss(colors.dominant, 0.55)}, 0 8px 32px rgba(0,0,0,0.6)`
              : '0 24px 80px rgba(0,0,0,0.6)',
            transition: 'box-shadow 1s ease-out',
          }}
        >
          {artworkLg ? (
            <img
              src={artworkLg}
              alt={track.title}
              className="w-full h-full object-cover"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full bg-white/[0.06]" />
          )}
        </div>

        {/* Track info */}
        <div className="text-center min-w-0 w-full px-4">
          <p
            className="text-[17px] font-semibold text-white/95 leading-tight truncate cursor-pointer hover:text-white transition-colors"
            onClick={() => navigateAndClose(`/track/${encodeURIComponent(track.urn)}`)}
          >
            {displayTitle}
          </p>
          <p
            className={`text-[13px] text-white/45 mt-1 truncate transition-colors ${
              artistTarget ? 'cursor-pointer hover:text-white/70' : ''
            }`}
            onClick={artistTarget ? () => navigateAndClose(artistTarget) : undefined}
          >
            {artistDisplay.primary}
          </p>
        </div>

        {/* Like */}
        <LikeButton
          track={track}
          variant="always"
          size={22}
          className="w-12 h-12"
          title={t('track.likes')}
        />

        {/* Progress slider */}
        <div className="w-full space-y-2">
          <LiveSpectrumCanvas
            active={isPlaying}
            bars={36}
            height={20}
            className="max-w-[260px] mx-auto opacity-80"
          />
          <ProgressSlider />
          <div className="flex justify-center">
            <ProgressTime />
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handlePrev}
            className="press w-12 h-12 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <SkipBack size={22} fill="currentColor" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="press w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 cursor-pointer"
          >
            <PopIcon on={isPlaying}>{isPlaying ? pauseBlack22 : playBlack22}</PopIcon>
          </button>

          <button
            type="button"
            onClick={next}
            className="press w-12 h-12 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
        </div>

        {/* Open lyrics link */}
        <button
          type="button"
          onClick={() => {
            openLyricsPanel({ tab: 'lyrics', rightPanelOpen: true });
            onClose();
          }}
          className="press h-8 rounded-full bg-white/[0.07] px-4 text-[12px] font-semibold text-white/70 hover:bg-white/[0.12] hover:text-white cursor-pointer"
        >
          {t('player.openLyrics')}
        </button>
      </div>
    </div>,
    document.body,
  );
});

/* ── FullscreenPlayer (outer, manages mount/unmount) ────────── */

interface FullscreenPlayerProps {
  open: boolean;
  onClose: () => void;
}

export const FullscreenPlayer = React.memo(({ open, onClose }: FullscreenPlayerProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      closeTimerRef.current = setTimeout(() => setMounted(false), 420);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!mounted || !currentTrack) return null;

  return <FsContent track={currentTrack} visible={visible} onClose={onClose} />;
});
