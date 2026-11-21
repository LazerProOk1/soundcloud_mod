import React, { useEffect, useRef } from 'react';
import { FFT_BIN_COUNT, readAccentRgb, subscribeAudioFft } from '../../lib/audio-fft';

interface LiveSpectrumCanvasProps {
  active: boolean;
  bars?: number;
  height?: number;
  className?: string;
  /** `dots`: each column is a stack of round dots mirrored around the middle line. */
  variant?: 'bars' | 'dots';
}

/**
 * Ultra-lightweight 60/120Hz delta-time-smoothed spectrum bar strip.
 * Uses real Rust `audio:fft` 64-bin events in Tauri desktop and falls back
 * to a subtle organic harmonic pulse when playing in browser preview.
 */
export const LiveSpectrumCanvas = React.memo(function LiveSpectrumCanvas({
  active,
  bars = 32,
  height = 24,
  className = '',
  variant = 'bars',
}: LiveSpectrumCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // In the desktop app only real FFT frames drive the bars; the synthetic pulse is
    // a web-preview fallback and must never fake audio activity in Tauri.
    const isTauri = '__TAURI_INTERNALS__' in window;
    let accent = readAccentRgb();
    let accentReadAt = performance.now();

    const target = new Float32Array(bars);
    const display = new Float32Array(bars);

    let cssW = 240;
    let cssH = height;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cssW = Math.max(80, Math.floor(rect.width));
      cssH = height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let hasRealFft = false;
    let lastFftAt = 0;
    let lastTs = performance.now();
    let rafId = 0;

    const draw = () => {
      if (document.visibilityState === 'hidden') return;
      ctx.clearRect(0, 0, cssW, cssH);

      // getComputedStyle forces a style recalc — refresh the accent at most once a second.
      const nowMs = performance.now();
      if (nowMs - accentReadAt > 1000) {
        accent = readAccentRgb();
        accentReadAt = nowMs;
      }
      const [r, g, b] = accent;
      const gap = 3;
      const barW = Math.max(2, (cssW - gap * (bars - 1)) / bars);
      const radius = Math.min(barW / 2, 2.5);
      const minH = 3;
      const maxH = cssH - 2;

      if (variant === 'dots') {
        // Dot grid: the louder the band, the more dots light up away from the middle line.
        const step = cssW / bars;
        const dot = Math.max(1.5, Math.min(step * 0.32, 3));
        const rows = Math.max(1, Math.floor(cssH / (dot * 3) / 2));
        const mid = cssH / 2;
        for (let i = 0; i < bars; i++) {
          const v = Math.min(1, Math.max(0, display[i]));
          const lit = v * rows;
          const x = i * step + step / 2;
          for (let k = 0; k <= rows; k++) {
            const on = Math.min(1, Math.max(0, lit - k + 1));
            const alpha = 0.3 + on * (0.7 - (k / (rows + 1)) * 0.3);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
            for (const y of k === 0 ? [mid] : [mid - k * dot * 3, mid + k * dot * 3]) {
              ctx.beginPath();
              ctx.arc(x, y, dot, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        return;
      }

      for (let i = 0; i < bars; i++) {
        const v = Math.min(1, Math.max(0, display[i]));
        const h = minH + v * (maxH - minH);
        const x = i * (barW + gap);
        const y = (cssH - h) * 0.5;
        const alpha = 0.24 + v * 0.72;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, radius);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      const dtMs = Math.min(48, Math.max(1, now - lastTs));
      lastTs = now;

      const isActive = activeRef.current;
      const fftFresh = hasRealFft && now - lastFftAt < 400;

      if (!isActive || (isTauri && !fftFresh)) {
        target.fill(0);
      } else if (!fftFresh && !reducedMotion) {
        // Gentle harmonic ambient pulse when running in web preview without Rust FFT
        const t = now * 0.0028;
        for (let i = 0; i < bars; i++) {
          const norm = i / Math.max(1, bars - 1);
          const wave =
            0.3 +
            0.22 * Math.sin(t + norm * 5.2) +
            0.14 * Math.cos(t * 1.45 - norm * 8.4) +
            0.1 * Math.sin(t * 0.75 + i * 0.9);
          target[i] = Math.max(0.08, Math.min(0.75, wave));
        }
      } else if (reducedMotion && isActive && !fftFresh) {
        for (let i = 0; i < bars; i++) {
          target[i] = 0.25 + 0.12 * Math.sin((i / bars) * Math.PI);
        }
      }

      // Frame-rate independent exponential smoothing (normalized to 16.67ms)
      const attack = 1 - 0.035 ** (dtMs / 16.67);
      const release = 1 - 0.28 ** (dtMs / 16.67);

      let anyEnergy = false;
      for (let i = 0; i < bars; i++) {
        const tVal = target[i];
        const dVal = display[i];
        const k = tVal > dVal ? attack : release;
        const next = dVal + (tVal - dVal) * k;
        display[i] = next < 0.004 ? 0 : next;
        if (display[i] > 0.004 || tVal > 0.004) anyEnergy = true;
      }

      draw();

      // Park when idle: in Tauri new FFT frames wake the loop via ensureLoop().
      if (anyEnergy || (isActive && !isTauri)) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const ensureLoop = () => {
      if (!rafId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    wakeRef.current = ensureLoop;

    const unsubscribe = subscribeAudioFft((bins) => {
      hasRealFft = true;
      lastFftAt = performance.now();
      const step = Math.min(FFT_BIN_COUNT, bins.length) / bars;
      for (let i = 0; i < bars; i++) {
        const start = Math.floor(i * step);
        const end = Math.max(start + 1, Math.floor((i + 1) * step));
        let sum = 0;
        for (let j = start; j < end && j < bins.length; j++) sum += bins[j];
        target[i] = sum / (end - start);
      }
      ensureLoop();
    });

    ensureLoop();

    return () => {
      wakeRef.current = null;
      unsubscribe();
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [bars, height, variant]);

  // Wake animation loop whenever `active` flips true after an idle pause
  useEffect(() => {
    if (active) wakeRef.current?.();
  }, [active]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={`w-full pointer-events-none select-none ${className}`}
      style={{ height, contain: 'strict' }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
});
