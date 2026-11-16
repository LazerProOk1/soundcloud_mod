/**
 * LiquidGlassDefs — global SVG filter primitives used by active Liquid Glass UI controls.
 *
 * Mounted once at app root (App.tsx). Unused refraction/displacement filters are
 * intentionally omitted so the browser doesn't retain idle SVG filter graphs.
 */
export function LiquidGlassDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <defs>
        {/* Waveform gooey: subtle organic merge at bar tips */}
        <filter id="waveform-gooey" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -4"
            result="gooey"
          />
          <feBlend in="SourceGraphic" in2="gooey" mode="normal" />
        </filter>

        {/* Tight gooey merge: LiquidSwitch mercury thumb */}
        <filter id="liquid-gooey-switch" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -10"
            result="gooey"
          />
          <feBlend in="SourceGraphic" in2="gooey" mode="normal" />
        </filter>
      </defs>
    </svg>
  );
}
