import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 450;
const GAP = 8;

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

/**
 * One tooltip for the whole app in the app's look, instead of the grey system one. Any element
 * with a `title` gets it: on hover the title moves to `data-tip` (so Windows doesn't draw its
 * own) and this bubble shows above or below the element after a short delay.
 */
export function AppTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef<Element | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);

  // Centre on the element, then keep the whole bubble inside the window (8px margin).
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!tip || !el) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(Math.max(tip.x - w / 2, 8), window.innerWidth - w - 8)}px`;
  }, [tip]);

  useEffect(() => {
    const hide = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      target.current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]');
      if (!el || el === target.current) return;
      const title = el.getAttribute('title');
      if (title) {
        el.setAttribute('data-tip', title);
        el.removeAttribute('title');
      }
      const text = el.getAttribute('data-tip');
      hide();
      if (!text) return;
      target.current = el;
      timer.current = setTimeout(() => {
        if (target.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setTip({
          text,
          x: r.left + r.width / 2,
          y: below ? r.bottom + GAP : r.top - GAP,
          below,
        });
      }, SHOW_DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (target.current && to && target.current.contains(to)) return;
      hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      className="app-tooltip"
      style={{ left: tip.x, top: tip.y, transform: tip.below ? undefined : 'translateY(-100%)' }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
