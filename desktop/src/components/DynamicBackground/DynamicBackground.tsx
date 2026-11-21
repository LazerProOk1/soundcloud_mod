/**
 * DynamicBackground
 *
 * Renders three soft colour fields derived from the current track artwork.
 * Uses smooth multi-stop radial gradients (without heavy offscreen filter: blur)
 * so overlapping Liquid Glass backdrop-filter layers remain smooth at 60–120 fps.
 */

import React, { useEffect, useRef } from 'react';
import { rgbToCss, useArtworkColor } from '../../hooks/useArtworkColor';
import { art } from '../../lib/formatters';
import { usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';

interface BlobProps {
  colorVar: string;
  midVar: string;
  className: string;
  style?: React.CSSProperties;
}

const Blob = React.memo(({ colorVar, midVar, className, style }: BlobProps) => (
  <div
    aria-hidden="true"
    className={`dynamic-bg-blob ${className}`}
    style={{
      background: `radial-gradient(ellipse at center, var(${colorVar}, transparent) 0%, var(${midVar}, transparent) 38%, transparent 72%)`,
      ...style,
    }}
  />
));

interface DynamicBackgroundProps {
  blendMode?: boolean;
}

export const DynamicBackground = React.memo(({ blendMode = false }: DynamicBackgroundProps) => {
  const artwork = usePlayerStore((s) => art(s.currentTrack?.artwork_url, 't300x300'));
  const colors = useArtworkColor(artwork);
  const containerRef = useRef<HTMLDivElement>(null);

  // Liquid Glass panels catch the artwork colour on their lit corner and outer glow.
  useEffect(() => {
    const root = document.documentElement.style;
    if (colors) {
      root.setProperty('--art-tint', rgbToCss(colors.dominant, 0.16));
      root.setProperty('--art-glow', rgbToCss(colors.dominant, 0.45));
    } else {
      root.removeProperty('--art-tint');
      root.removeProperty('--art-glow');
    }
  }, [colors]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (colors) {
      el.style.setProperty('--db-color-1', rgbToCss(colors.dominant, blendMode ? 0.36 : 0.28));
      el.style.setProperty('--db-mid-1', rgbToCss(colors.dominant, blendMode ? 0.14 : 0.1));
      el.style.setProperty('--db-color-2', rgbToCss(colors.secondary, blendMode ? 0.3 : 0.22));
      el.style.setProperty('--db-mid-2', rgbToCss(colors.secondary, blendMode ? 0.11 : 0.08));
      el.style.setProperty('--db-color-3', rgbToCss(colors.tertiary, blendMode ? 0.24 : 0.18));
      el.style.setProperty('--db-mid-3', rgbToCss(colors.tertiary, blendMode ? 0.08 : 0.06));
    } else {
      for (const prop of [
        '--db-color-1',
        '--db-mid-1',
        '--db-color-2',
        '--db-mid-2',
        '--db-color-3',
        '--db-mid-3',
      ]) {
        el.style.removeProperty(prop);
      }
    }
  }, [colors, blendMode]);

  if (!artwork) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="dynamic-bg-root"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 2,
        mixBlendMode: blendMode ? 'screen' : 'normal',
        opacity: blendMode ? 0.65 : 1,
        contain: 'strict',
        transform: 'translateZ(0)',
        willChange: 'opacity',
        transition: 'opacity 0.8s ease-out',
      }}
    >
      <Blob
        colorVar="--db-color-1"
        midVar="--db-mid-1"
        className="dynamic-bg-blob-1"
        style={{
          position: 'absolute',
          width: '72vw',
          height: '72vh',
          top: '-14vh',
          left: '-12vw',
        }}
      />

      <Blob
        colorVar="--db-color-2"
        midVar="--db-mid-2"
        className="dynamic-bg-blob-2"
        style={{
          position: 'absolute',
          width: '62vw',
          height: '62vh',
          bottom: '-12vh',
          right: '-10vw',
        }}
      />

      <Blob
        colorVar="--db-color-3"
        midVar="--db-mid-3"
        className="dynamic-bg-blob-3"
        style={{
          position: 'absolute',
          width: '54vw',
          height: '54vh',
          top: '22vh',
          left: '24vw',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 32%, rgba(6,6,9,0.68) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export const DynamicBackgroundConnected = React.memo(() => {
  const hasWallpaper = useSettingsStore((s) => !!s.backgroundImage);
  return <DynamicBackground blendMode={hasWallpaper} />;
});
