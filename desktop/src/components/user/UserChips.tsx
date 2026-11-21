import React from 'react';
import { Check, Globe, Instagram, LinkIcon, Twitter, Youtube } from '../../lib/icons';

export const VerifiedBadge = React.memo(function VerifiedBadge({ title }: { title: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"
      title={title}
    >
      <Check size={13} className="text-white" strokeWidth={3.5} />
    </div>
  );
});

export const ProChip = React.memo(function ProChip({ plan }: { plan: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-orange-500/15 text-[12px] font-semibold text-orange-300">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
      {plan}
    </span>
  );
});

/** Small flat label chip (country, date, kind...). */
export const InfoChip = React.memo(function InfoChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bar-control text-[12px] font-semibold text-white/70">
      <span className="text-white/45">{icon}</span>
      {children}
    </span>
  );
});

export function getWebIcon(service: string) {
  switch (service.toLowerCase()) {
    case 'instagram':
      return <Instagram size={14} />;
    case 'twitter':
      return <Twitter size={14} />;
    case 'youtube':
      return <Youtube size={14} />;
    case 'personal':
      return <Globe size={14} />;
    default:
      return <LinkIcon size={14} />;
  }
}
