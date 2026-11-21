import React from 'react';

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Position in the wave; kept for callers, not drawn in the flat style. */
  index: number;
}

/** Shelf heading inside a wave: flat icon tile, title and one line of description. */
export const ClusterHeader = React.memo(function ClusterHeader({
  icon,
  title,
  description,
}: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ui-card text-accent">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[18px] font-bold leading-tight text-white">{title}</h3>
        <p className="text-[13px] text-white/50 leading-snug">{description}</p>
      </div>
    </div>
  );
});
