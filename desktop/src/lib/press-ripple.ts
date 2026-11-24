/**
 * Press ripple for every button: a light circle spreads from the pointer inside the button's
 * shape. Drawn in a fixed overlay (a copy of the button's box and corner radius), so buttons
 * keep their own layout, overflow and pseudo-elements untouched.
 */
const SELECTOR = 'button:not(:disabled), [role="button"], [role="menuitem"], a.press';

export function installPressRipple() {
  if (typeof window === 'undefined') return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (reduced.matches || e.button !== 0) return;
      const target = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const radius = getComputedStyle(target).borderRadius;

      const box = document.createElement('span');
      box.className = 'press-ripple-box';
      Object.assign(box.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: radius,
      });
      const dot = document.createElement('span');
      dot.className = 'press-ripple';
      // Big enough to cover the farthest corner from the pointer.
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = 2 * Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      Object.assign(dot.style, {
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
      box.appendChild(dot);
      document.body.appendChild(box);

      // The button can resize or move while the ripple runs ("Follow" turning into "Following",
      // a collapsing sidebar): keep the overlay on the button's current box every frame, and
      // drop it if the button leaves the page.
      let raf = 0;
      const follow = () => {
        if (!target.isConnected) {
          box.remove();
          return;
        }
        const r = target.getBoundingClientRect();
        box.style.left = `${r.left}px`;
        box.style.top = `${r.top}px`;
        box.style.width = `${r.width}px`;
        box.style.height = `${r.height}px`;
        box.style.borderRadius = getComputedStyle(target).borderRadius;
        raf = requestAnimationFrame(follow);
      };
      raf = requestAnimationFrame(follow);
      dot.addEventListener(
        'animationend',
        () => {
          cancelAnimationFrame(raf);
          box.remove();
        },
        { once: true },
      );
    },
    { capture: true, passive: true },
  );
}
