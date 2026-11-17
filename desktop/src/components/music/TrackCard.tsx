import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { preloadTrack } from '../../lib/audio';
import { art, dur, fc } from '../../lib/formatters';
import { useLiquidGlass } from '../../lib/hooks';
import { CheckCircle2, ListMusic, ListPlus, playIcon32 } from '../../lib/icons';
import { recordClusterFeedback, setUrnCluster, useClusterFeedback } from '../../lib/recsFeedback';
import { useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { openTrackMenu } from '../../lib/useTrackContextMenu';
import { useTrackPlay } from '../../lib/useTrackPlay';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import type { Track } from '../../stores/player';
import { usePlayerStore } from '../../stores/player';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { LikeButton } from './LikeButton';
import { UploadKindDot } from './UploadKindDot';

interface TrackCardProps {
  track: Track;
  queue?: Track[];
}

export const TrackCard = React.memo(
  function TrackCard({ track, queue }: TrackCardProps) {
    const { t } = useTranslation();
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
    const addToQueueNext = usePlayerStore((s) => s.addToQueueNext);
    const cardRef = useRef<HTMLDivElement>(null);
    const artwork = art(track.artwork_url, 't300x300');
    const artistDisplay = useArtistDisplay(track);
    const displayTitle = useDisplayTitle(track);
    const isWanted = artistDisplay.availability !== 'indexed';
    const isCachedOffline = useCachedUrnsStore((s) => s.urns.has(track.urn));
    const glass = useLiquidGlass();

    const artistTarget =
      track.enrichment?.primary_artist?.id && artistDisplay.verified
        ? `/artist/${encodeURIComponent(track.enrichment.primary_artist.id)}`
        : track.user?.urn
          ? `/user/${encodeURIComponent(track.user.urn)}`
          : null;

    const handleAddToQueue = (e: React.MouseEvent) => {
      e.stopPropagation();
      addToQueueNext([track]);
    };

    /* Spring 3-D tilt on mouse move — full card tilts toward cursor */
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      const x = ((e.clientX - left) / width - 0.5) * 14; // ±7°
      const y = ((e.clientY - top) / height - 0.5) * -14;
      el.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${y}deg) translateY(-4px) scale(1.02)`;
    };

    const handleMouseLeave = () => {
      const el = cardRef.current;
      if (el) {
        el.style.transform =
          'perspective(600px) rotateY(0deg) rotateX(0deg) translateY(0) scale(1)';
      }
    };

    return (
      <div
        onContextMenu={(e) => openTrackMenu(e, track)}
        ref={cardRef}
        className="group relative select-none"
        style={{
          isolation: 'isolate',
          transition: 'transform 0.45s cubic-bezier(0.16,1,0.3,1)',
          contentVisibility: 'auto',
          containIntrinsicSize: '180px 260px',
          /* Extra padding so scale(1.02) + glow can breathe without clipping by parent */
          padding: 4,
          margin: -4,
        }}
        onMouseEnter={() => preloadTrack(track.urn)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Artwork ──────────────────────────────────────────── */}
        <div
          className="glass-artwork relative aspect-square rounded-[32px] cursor-pointer"
          style={{
            boxShadow: glass
              ? `
              0 1px 0 0 rgba(255,255,255,0.22) inset,
              0 3px 8px -2px rgba(255,255,255,0.06) inset,
              1px 0 0 0 rgba(255,255,255,0.12) inset,
              0 -1px 0 0 rgba(0,0,0,0.60) inset,
              -1px 0 0 0 rgba(0,0,0,0.22) inset,
              0 0 0 0.5px rgba(255,255,255,0.07),
              0 2px 6px rgba(0,0,0,0.10),
              0 10px 24px rgba(0,0,0,0.20),
              0 24px 52px rgba(0,0,0,0.28),
              0 0 80px rgba(255,255,255,0.012)
              `
              : `
              0 0 0 1px rgba(255,255,255,0.07),
              0 2px 6px rgba(0,0,0,0.14),
              0 10px 24px rgba(0,0,0,0.22)
              `,
            background: glass ? 'rgba(255,255,255,0.035)' : 'rgba(18,18,22,0.95)',
            /* --artwork-radius drives clip-path in .glass-artwork CSS class */
            ['--artwork-radius' as string]: '32px',
            transform: 'translateZ(0)',
            willChange: 'transform',
          }}
          onClick={togglePlay}
        >
          {artwork ? (
            <img
              src={artwork}
              alt={track.title}
              className="w-full h-full object-cover transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-[1.06]"
              style={{ willChange: 'transform' }}
              decoding="async"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              {playIcon32}
            </div>
          )}

          {/* Corner vignette — soft radial shadow on all 4 corners */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.30) 100%)',
              zIndex: 2,
            }}
          />

          {/* Liquid overlay — opacity-only transition (120fps safe) */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-[var(--ease-spring)] ${
              isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.50) 100%)',
            }}
          >
            {/* Play/pause — translucent glass sphere without per-card backdrop-filter */}
            <div
              className={`flex items-center justify-center transition-all duration-400 ease-[var(--ease-spring)] ${
                isThisPlaying ? 'scale-100' : 'scale-[0.7] group-hover:scale-100'
              }`}
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: glass ? 'rgba(24,24,30,0.68)' : 'rgba(255,255,255,0.92)',
                boxShadow: glass
                  ? `
                  0 1px 0 0 rgba(255,255,255,0.55) inset,
                  0 3px 8px -1px rgba(255,255,255,0.18) inset,
                  0 -1px 0 0 rgba(0,0,0,0.30) inset,
                  1px 0 0 0 rgba(255,255,255,0.35) inset,
                  -1px 0 0 0 rgba(0,0,0,0.12) inset,
                  0 0 0 1px rgba(255,255,255,0.22),
                  0 0 0 6px rgba(255,255,255,0.06),
                  0 8px 28px rgba(0,0,0,0.50),
                  0 2px 8px rgba(0,0,0,0.30)
                  `
                  : `
                  0 4px 16px rgba(0,0,0,0.40),
                  0 1px 4px rgba(0,0,0,0.24)
                  `,
                color: glass ? 'white' : 'rgba(20,20,24,1)',
              }}
            >
              {/* Playing: 3 animated equaliser bars  |  Paused: play arrow */}
              {isThisPlaying ? (
                <div
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 3,
                    height: 18,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    className="eq-bar"
                    style={{
                      width: 4,
                      height: '100%',
                      borderRadius: 2,
                      background: 'currentColor',
                    }}
                  />
                  <div
                    className="eq-bar"
                    style={{
                      width: 4,
                      height: '100%',
                      borderRadius: 2,
                      background: 'currentColor',
                    }}
                  />
                  <div
                    className="eq-bar"
                    style={{
                      width: 4,
                      height: '100%',
                      borderRadius: 2,
                      background: 'currentColor',
                    }}
                  />
                </div>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ pointerEvents: 'none', marginLeft: 2 }}
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          </div>

          {/* Bottom-left badges: Go+ and/or Offline cached */}
          {(track.access === 'blocked' || isCachedOffline) && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-[3]">
              {track.access === 'blocked' && (
                <div
                  className="flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{
                    background: glass ? 'rgba(10,10,14,0.72)' : 'rgba(20,20,24,0.88)',
                    boxShadow: glass
                      ? '0 1px 0 0 rgba(255,255,255,0.12) inset'
                      : '0 0 0 1px rgba(255,255,255,0.10)',
                  }}
                >
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide">
                    Go+
                  </span>
                </div>
              )}
              {isCachedOffline && (
                <div
                  title={t('offline.cachedBadge')}
                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-emerald-300/95"
                  style={{
                    background: glass ? 'rgba(6, 28, 20, 0.78)' : 'rgba(14, 34, 24, 0.92)',
                    boxShadow: glass
                      ? '0 1px 0 0 rgba(110, 231, 183, 0.25) inset, 0 0 0 0.5px rgba(52, 211, 153, 0.28)'
                      : '0 0 0 1px rgba(52, 211, 153, 0.25)',
                  }}
                >
                  <CheckCircle2 size={10} />
                </div>
              )}
            </div>
          )}

          {/* Duration pill — bottom right */}
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div
              className="text-[10px] font-medium text-white/85 px-2 py-0.5 rounded-full"
              style={{
                background: glass ? 'rgba(10,10,14,0.72)' : 'rgba(18,18,22,0.85)',
                boxShadow: glass
                  ? '0 1px 0 0 rgba(255,255,255,0.10) inset'
                  : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              {dur(track.duration)}
            </div>
          </div>

          {/* Like — top left (existing component) */}
          <LikeButton track={track} variant="overlay" />

          {/* Playlist + queue — top right */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
            <AddToPlaylistDialog trackUrns={[track.urn]}>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="cursor-pointer w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95"
                title={t('playlist.addToPlaylist')}
                style={{
                  background: glass ? 'rgba(20,20,26,0.72)' : 'rgba(30,30,36,0.92)',
                  boxShadow: glass
                    ? '0 1px 0 0 rgba(255,255,255,0.32) inset, 0 -1px 0 0 rgba(0,0,0,0.22) inset, 0 2px 10px rgba(0,0,0,0.32)'
                    : '0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.28)',
                }}
              >
                <ListPlus size={14} />
              </button>
            </AddToPlaylistDialog>
            <button
              type="button"
              onClick={handleAddToQueue}
              className="cursor-pointer w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95"
              title={t('player.addToQueue')}
              style={{
                background: glass ? 'rgba(20,20,26,0.72)' : 'rgba(30,30,36,0.92)',
                boxShadow: glass
                  ? '0 1px 0 0 rgba(255,255,255,0.32) inset, 0 -1px 0 0 rgba(0,0,0,0.22) inset, 0 2px 10px rgba(0,0,0,0.32)'
                  : '0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.28)',
              }}
            >
              <ListMusic size={14} />
            </button>
          </div>
        </div>

        {/* ── Subtle hover depth shadow (zero per-card blur pass) ── */}
        {artwork && (
          <div
            aria-hidden="true"
            className="absolute top-2 left-2 right-2 aspect-square -z-10 rounded-[32px] opacity-0 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.45) 70%, transparent 100%)',
              transform: 'translateY(8px)',
            }}
          />
        )}

        {/* ── Track info ─────────────────────────────────────────── */}
        <div className="mt-3 min-w-0">
          <p
            className={`text-[13px] font-medium truncate leading-snug transition-colors duration-150 ${
              isWanted ? 'text-white/45' : 'text-white/90 cursor-pointer hover:text-white'
            }`}
            onClick={
              isWanted ? undefined : () => navigate(`/track/${encodeURIComponent(track.urn)}`)
            }
          >
            {displayTitle}
          </p>
          <p
            className={`text-[11px] truncate mt-0.5 flex items-center gap-1 transition-colors duration-150 ${
              isWanted ? 'text-white/25' : 'text-white/40 cursor-pointer hover:text-white/60'
            }`}
            onClick={artistTarget && !isWanted ? () => navigate(artistTarget) : undefined}
          >
            <UploadKindDot kind={artistDisplay.uploadKind} />
            <span className="truncate">{artistDisplay.primary}</span>
          </p>
          {isWanted ? (
            <p className="text-[10px] text-white/20 mt-1">
              {t('track.notFoundOnSc', 'not found on SoundCloud')}
            </p>
          ) : (
            track.playback_count != null && (
              <p className="text-[10px] text-white/15 mt-1 tabular-nums">
                {fc(track.playback_count)} plays
              </p>
            )
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.track.urn === next.track.urn &&
    prev.track.title === next.track.title &&
    prev.track.artwork_url === next.track.artwork_url &&
    prev.track.duration === next.track.duration &&
    prev.track.access === next.track.access &&
    prev.track.user_favorite === next.track.user_favorite &&
    prev.track.enrichment?.primary_artist?.name === next.track.enrichment?.primary_artist?.name &&
    prev.track.enrichment?.upload_kind === next.track.enrichment?.upload_kind &&
    prev.track.enrichment?.availability === next.track.enrichment?.availability &&
    prev.queue === next.queue,
);
