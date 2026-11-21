import React from 'react';
import { AudioLines } from '../../../lib/icons';

interface Props {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export const EmptyState = React.memo(function EmptyState({ title, description, icon }: Props) {
  return (
    <div className="py-14 flex flex-col items-center gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center ui-card">
        {icon ?? <AudioLines size={22} className="text-white/25" />}
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="text-[14px] font-semibold text-white/75">{title}</p>
        <p className="text-[13px] text-white/45 leading-relaxed">{description}</p>
      </div>
    </div>
  );
});
