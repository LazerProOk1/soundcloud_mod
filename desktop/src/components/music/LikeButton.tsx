import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { invalidateAllLikesCache } from '../../lib/hooks';
import { Heart } from '../../lib/icons';
import { optimisticToggleLike, setLikedUrn, useLiked } from '../../lib/likes';
import type { Track } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const LikeButton = React.memo(function LikeButton({
  track,
  variant = 'inline',
  size,
  className = '',
  title,
}: {
  track: Track;
  variant?: 'overlay' | 'inline' | 'always';
  size?: number;
  className?: string;
  title?: string;
}) {
  const liked = useLiked(track.urn);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const [popping, setPopping] = useState(false);
  const prevLikedRef = useRef(liked);

  // Seed from API data when available
  useEffect(() => {
    if (track.user_favorite) setLikedUrn(track.urn, true);
  }, [track.urn, track.user_favorite]);

  useEffect(() => {
    if (liked && !prevLikedRef.current) {
      setPopping(true);
      const timer = setTimeout(() => setPopping(false), 380);
      prevLikedRef.current = liked;
      return () => clearTimeout(timer);
    }
    prevLikedRef.current = liked;
  }, [liked]);

  const qc = useQueryClient();

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !liked;
    optimisticToggleLike(qc, track, next);
    invalidateAllLikesCache();
    try {
      await api(`/likes/tracks/${encodeURIComponent(track.urn)}`, {
        method: next ? 'POST' : 'DELETE',
        body: next ? JSON.stringify(track) : undefined,
      });
    } catch {
      optimisticToggleLike(qc, track, !next);
    }
  };

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={toggle}
        title={title}
        aria-label={title}
        className={`cursor-pointer absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
          liked
            ? 'opacity-90 group-hover:opacity-100 translate-y-0'
            : 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0'
        } ${className}`}
        style={{
          /* Translucent tinted pill — crisp without stacking nested backdrop-filters per card */
          background: liked ? hexToRgba(accentColor, 0.92) : hexToRgba(accentColor, 0.72),
          boxShadow: liked
            ? `0 1px 0 0 rgba(255,255,255,0.35) inset, 0 -1px 0 0 rgba(0,0,0,0.25) inset, 0 4px 14px ${hexToRgba(accentColor, 0.5)}`
            : `0 1px 0 0 rgba(255,255,255,0.28) inset, 0 -1px 0 0 rgba(0,0,0,0.20) inset, 0 2px 10px ${hexToRgba(accentColor, 0.3)}`,
          color: 'white',
        }}
      >
        <Heart
          size={size ?? 14}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'animate-like-pop' : undefined}
        />
      </button>
    );
  }

  if (variant === 'always') {
    return (
      <button
        type="button"
        onClick={toggle}
        title={title}
        aria-label={title}
        className={`cursor-pointer rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 shrink-0 ${
          liked
            ? 'text-accent bg-accent/15 border border-accent/25'
            : 'text-white/50 hover:text-white hover:bg-white/[0.08] border border-transparent'
        } ${className || 'w-9 h-9'}`}
      >
        <Heart
          size={size ?? 16}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'animate-like-pop' : undefined}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-label={title}
      className={`cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 ${
        liked
          ? 'opacity-100 text-accent'
          : 'opacity-0 group-hover:opacity-100 text-white/25 hover:text-white/60'
      } ${className}`}
    >
      <Heart
        size={size ?? 14}
        fill={liked ? 'currentColor' : 'none'}
        className={popping ? 'animate-like-pop' : undefined}
      />
    </button>
  );
});
