import type React from 'react';
import { useRef } from 'react';

/** Wraps an icon and replays the `.icon-pop` animation each time `on` changes (not on mount). */
export function PopIcon({ on, children }: { on: unknown; children: React.ReactNode }) {
  const prev = useRef(on);
  const flips = useRef(0);
  if (prev.current !== on) {
    prev.current = on;
    flips.current++;
  }
  return (
    <span key={flips.current} className={flips.current > 0 ? 'icon-pop' : 'inline-flex'}>
      {children}
    </span>
  );
}
