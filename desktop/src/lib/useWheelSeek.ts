import { type RefObject, useEffect, useRef } from 'react';
import { formatTime } from './formatters';

const STEP_SEC = 5;
const SHIFT_STEP_SEC = 15;
const WHEEL_NOTCH = 40;
const WHEEL_IDLE_MS = 220;
const COMMIT_DELAY_MS = 200;

export interface WheelSeekSource {
  position: () => number;
  duration: () => number;
  seek: (seconds: number) => void;
  preview: (seconds: number) => void;
  dragging: () => boolean;
}

export function useWheelSeek(
  rootRef: RefObject<HTMLElement | null>,
  tipRef: RefObject<HTMLElement | null>,
  source: WheelSeekSource,
): RefObject<number | null> {
  const sourceRef = useRef(source);
  const targetRef = useRef<number | null>(null);

  useEffect(() => {
    sourceRef.current = source;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let accumulated = 0;
    let lastAt = 0;
    let timer = 0;

    const commit = () => {
      timer = 0;
      const target = targetRef.current;
      targetRef.current = null;
      if (tipRef.current) tipRef.current.style.opacity = '0';
      if (target !== null) sourceRef.current.seek(target);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const src = sourceRef.current;
      const duration = src.duration();
      if (duration <= 0 || src.dragging()) return;
      e.preventDefault();

      const now = performance.now();
      if (now - lastAt > WHEEL_IDLE_MS) accumulated = 0;
      lastAt = now;
      const delta = e.deltaY || e.deltaX;
      accumulated += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? delta : delta * WHEEL_NOTCH;
      if (Math.abs(accumulated) < WHEEL_NOTCH) return;

      const step = (e.shiftKey ? SHIFT_STEP_SEC : STEP_SEC) * (accumulated < 0 ? 1 : -1);
      accumulated = 0;
      const target = Math.max(0, Math.min(duration, (targetRef.current ?? src.position()) + step));
      targetRef.current = target;
      src.preview(target);

      const tip = tipRef.current;
      if (tip) {
        tip.textContent = formatTime(target);
        tip.style.left = `${(target / duration) * 100}%`;
        tip.style.opacity = '1';
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, COMMIT_DELAY_MS);
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      root.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
      targetRef.current = null;
    };
  }, [rootRef, tipRef]);

  return targetRef;
}
