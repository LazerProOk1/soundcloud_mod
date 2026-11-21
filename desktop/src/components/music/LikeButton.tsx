import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { invalidateAllLikesCache } from '../../lib/hooks';
import { Heart } from '../../lib/icons';
import { optimisticToggleLike, setLikedUrn, useLiked } from '../../lib/likes';
import type { Track } from '../../stores/player';

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
  const [popping, setPopping] = useState(false);
  const prevLikedRef = useRef(liked);

  // Seed from API data when available
  useEffect(() => {
    if (track.user_favorite) setLikedUrn(track.urn, true);
  }, [track.urn, track.user_favorite]);

  useEffect(() => {
    if (liked && !prevLikedRef.current) {
      setPopping(true);
      const timer = setTimeout(() => setPopping(false), 600);
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
        className={`press absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/75 cursor-pointer transition-opacity duration-200 ${
          liked ? 'text-accent' : 'text-white opacity-0 group-hover:opacity-100'
        } ${className}`}
      >
        <Heart
          size={size ?? 14}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'heart-pop' : undefined}
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
            ? 'text-accent hover:bg-white/[0.08]'
            : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
        } ${className || 'w-9 h-9'}`}
      >
        <Heart
          size={size ?? 16}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'heart-pop' : undefined}
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
        className={popping ? 'heart-pop' : undefined}
      />
    </button>
  );
});
