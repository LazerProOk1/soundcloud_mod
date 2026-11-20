import type React from 'react';
import { memo } from 'react';

interface GlassHeroPanelProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Hero block for profile / artist / album pages. Flat on the page (no glass card,
 * frame or glow), like the list pages; only a gentle rise when it appears.
 */
function GlassHeroPanelImpl({ className, children }: GlassHeroPanelProps) {
  return (
    <div
      className={`relative ${className ?? ''}`}
      style={{ animation: 'hub-rise 600ms cubic-bezier(0.2,0.8,0.2,1) both', isolation: 'isolate' }}
    >
      {children}
    </div>
  );
}

export const GlassHeroPanel = memo(GlassHeroPanelImpl);
