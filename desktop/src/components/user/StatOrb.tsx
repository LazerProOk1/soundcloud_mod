import React from 'react';
import { fc } from '../../lib/formatters';

/** Flat stat tile: big number + small label. */
function StatOrbImpl({
  value,
  label,
  icon,
}: {
  value: number | null | undefined;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-baseline gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      {icon && <span className="self-center text-white/40">{icon}</span>}
      <span className="text-[17px] font-bold tabular-nums text-white">
        {value != null ? fc(value) : '—'}
      </span>
      <span className="text-[13px] text-white/50 lowercase">{label}</span>
    </div>
  );
}

export const StatOrb = React.memo(StatOrbImpl);
