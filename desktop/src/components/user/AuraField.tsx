import React from 'react';
import type { Aura } from '../../lib/aura';
import { PAGE_STAR_SEEDS, StarField } from './StarField';

interface AuraFieldProps {
  aura: Aura;
  isStar: boolean;
}

function AuraFieldImpl({ aura, isStar }: AuraFieldProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ contain: 'strict', transform: 'translateZ(0)' }}
    >
      <div
        className="absolute -top-[20%] -left-[15%] w-[86vw] h-[86vw] rounded-full mix-blend-screen"
        style={{
          background: `radial-gradient(circle, ${aura.orbs[0]} 0%, color-mix(in srgb, ${aura.orbs[0]} 35%, transparent) 38%, transparent 70%)`,
          opacity: isStar ? 0.42 : 0.22,
          animation: 'orb-drift 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-[5%] -right-[20%] w-[76vw] h-[76vw] rounded-full mix-blend-screen"
        style={{
          background: `radial-gradient(circle, ${aura.orbs[1]} 0%, color-mix(in srgb, ${aura.orbs[1]} 32%, transparent) 38%, transparent 70%)`,
          opacity: isStar ? 0.38 : 0.18,
          animation: 'orb-drift 28s ease-in-out -8s infinite',
        }}
      />
      <div
        className="absolute top-[40%] left-[20%] w-[60vw] h-[60vw] rounded-full mix-blend-screen"
        style={{
          background: `radial-gradient(circle, ${aura.orbs[2]} 0%, color-mix(in srgb, ${aura.orbs[2]} 30%, transparent) 38%, transparent 70%)`,
          opacity: isStar ? 0.28 : 0.12,
          animation: 'orb-drift 34s ease-in-out -16s infinite',
        }}
      />
      {isStar && <StarField aura={aura} seeds={PAGE_STAR_SEEDS} intensity={0.85} />}
    </div>
  );
}

export const AuraField = React.memo(AuraFieldImpl);
