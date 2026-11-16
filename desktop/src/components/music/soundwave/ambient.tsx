import React, { useMemo } from 'react';

interface Props {
  /** Number of drifting accent particles. Fewer on smaller blocks. */
  particleCount?: number;
  /** Retained for API compatibility; smooth multi-stop gradients need no offscreen blur. */
  blur?: number;
  /** Primary aurora opacity. */
  intensity?: number;
}

/**
 * Decorative aurora + particle layer for SoundWave blocks.
 *
 * Uses smooth multi-stop radial gradients (no `filter: blur()` or SVG filter wrappers)
 * so drifting aurora orbs stay purely on the GPU compositor with zero blur readbacks.
 */
export const AmbientLayer = React.memo(function AmbientLayer({
  particleCount = 8,
  intensity = 0.55,
}: Props) {
  const particles = useMemo(
    () => Array.from({ length: particleCount }, (_, i) => i),
    [particleCount],
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
      style={{ contain: 'strict', transform: 'translateZ(0)' }}
    >
      {/* Primary accent orb — top-left */}
      <div
        className="absolute -top-1/3 -left-1/4 w-[64%] h-[180%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, var(--color-accent-glow) 0%, color-mix(in srgb, var(--color-accent-glow) 35%, transparent) 42%, transparent 74%)',
          opacity: intensity,
          animation: 'sw-aurora 32s linear infinite',
          willChange: 'transform',
        }}
      />
      {/* White shimmer orb — bottom-right */}
      <div
        className="absolute -bottom-1/2 right-[-12%] w-[58%] h-[170%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 42%, transparent 74%)',
          opacity: intensity * 0.8,
          animation: 'sw-aurora 44s linear reverse infinite',
          willChange: 'transform',
        }}
      />
      {/* Secondary indigo orb — center-right */}
      <div
        className="absolute top-[10%] right-[-8%] w-[48%] h-[140%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(99,102,241,0.16) 0%, rgba(99,102,241,0.05) 42%, transparent 74%)',
          opacity: intensity * 0.65,
          animation: 'sw-aurora 58s linear infinite',
          animationDelay: '-18s',
          willChange: 'transform',
        }}
      />

      {/* Accent particles — drift upward and fade */}
      {particles.map((i) => {
        const size = 2 + (i % 3);
        const left = (i * 41) % 100;
        const top = 12 + ((i * 53) % 70);
        const duration = 5200 + ((i * 313) % 3200);
        const delay = (i * 277) % 3800;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              top: `${top}%`,
              background: 'var(--color-accent)',
              boxShadow: '0 0 6px var(--color-accent-glow)',
              animation: `sw-drift ${duration}ms ease-in-out ${delay}ms infinite`,
              willChange: 'transform, opacity',
            }}
          />
        );
      })}
    </div>
  );
});
