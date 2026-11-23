/**
 * AmbientMeshBackground — full-screen living mesh gradient.
 *
 * Uses smooth multi-stop radial gradients without heavy offscreen `filter: blur()`
 * layers so Liquid Glass panels above refract vivid colour at zero blur-pass GPU cost.
 * The fixed colours show only when idle: with a track playing the artwork colours
 * (DynamicBackground) or the wallpaper set the tone, and the mesh would tint them.
 */
import React from 'react';
import { usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';

const BASE = 'rgba(6, 6, 9, 0.96)';

export const AmbientMeshBackground = React.memo(function AmbientMeshBackground() {
  const hasArtwork = usePlayerStore((s) => !!s.currentTrack?.artwork_url);
  const hasWallpaper = useSettingsStore((s) => !!s.backgroundImage);
  const idle = !hasArtwork && !hasWallpaper;
  return (
    <div
      aria-hidden="true"
      className="ambient-mesh"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        isolation: 'isolate',
        contain: 'strict',
        background: idle
          ? `
          radial-gradient(ellipse 68% 64% at 14% 12%, rgba(255,95,20,0.28) 0%, rgba(255,60,0,0.12) 38%, rgba(255,60,0,0.02) 64%, transparent 78%),
          radial-gradient(ellipse 62% 58% at 88% 16%, rgba(99,102,241,0.24) 0%, rgba(79,70,229,0.10) 40%, rgba(79,70,229,0.02) 66%, transparent 80%),
          radial-gradient(ellipse 58% 54% at 18% 88%, rgba(34,211,238,0.16) 0%, rgba(6,182,212,0.07) 42%, transparent 76%),
          radial-gradient(ellipse 54% 52% at 86% 86%, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.06) 42%, transparent 76%),
          radial-gradient(ellipse 46% 52% at 4% 48%, rgba(120,80,220,0.16) 0%, rgba(80,60,180,0.06) 44%, transparent 76%),
          ${BASE}
        `
          : BASE,
      }}
    />
  );
});
