/**
 * LiquidGlassDefs — global SVG filters: Liquid Glass refraction and the gooey switch merge.
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
        {/* Liquid Glass refraction: a soft noise field bends what is behind the panel
            (used by html.liquid-glass through backdrop-filter: url(#lg-refract)). */}
        <filter id="lg-refract" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="38"
            xChannelSelector="R"
            yChannelSelector="G"
          />
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
