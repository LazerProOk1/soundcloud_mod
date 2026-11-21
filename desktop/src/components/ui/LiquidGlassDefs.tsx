/**
 * LiquidGlassDefs — global SVG filters (the gooey switch merge).
 *
 * Mounted once at app root (App.tsx). Liquid Glass panels deliberately use no SVG
 * displacement filter: a url() backdrop filter is re-rasterised on every repaint.
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
