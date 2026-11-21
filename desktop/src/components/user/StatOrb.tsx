import React from 'react';
import { fc } from '../../lib/formatters';

/**
 * One stat in a profile / artist header row: a big number with a small label under it,
 * no box. Neighbours are split by a thin line. A stat with no value is left out instead of
 * showing a dash.
 */
function StatOrbImpl({
  value,
  label,
  icon,
}: {
  value: number | null | undefined;
  label: string;
  icon?: React.ReactNode;
}) {
  if (value == null) return null;
  return (
    <div className="flex flex-col gap-1 not-first:border-l not-first:border-white/10 not-first:pl-5">
      <span className="text-[22px] font-extrabold leading-none tabular-nums text-white">
        {fc(value)}
      </span>
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/50 lowercase">
        {icon && <span className="text-white/35 [&>svg]:size-3">{icon}</span>}
        {label}
      </span>
    </div>
  );
}

export const StatOrb = React.memo(StatOrbImpl);
