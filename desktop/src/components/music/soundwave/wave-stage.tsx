import React, { useEffect, useRef } from 'react';
import { getCurrentTime, getDuration } from '../../../lib/audio';
import { subscribeAudioFft } from '../../../lib/audio-fft';

/**
 * The living "horizon" of My Wave: a few monochrome wave lines across the stage that
 * breathe with the music (FFT energy), the played part of the track drawn brighter,
 * and the cover nudged by the bass (`--bass` CSS variable on `pulseTarget`).
 * Calm idle motion when nothing plays; static with reduced motion.
 */
export const WaveStage = React.memo(function WaveStage({
  active,
  pulseTarget,
}: {
  active: boolean;
  pulseTarget?: React.RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(0);
  const bassRef = useRef(0);
  const peakRef = useRef(1e-3);

  // Music energy from the analyser (only while playing).
  useEffect(() => {
    if (!active) return;
    return subscribeAudioFft((bins) => {
      let low = 0;
      let all = 0;
      for (let i = 0; i < bins.length; i++) {
        all += bins[i];
        if (i < 6) low += bins[i];
      }
      // Self-calibrating: compare against a slowly decaying peak.
      peakRef.current = Math.max(peakRef.current * 0.995, all, 1e-3);
      energyRef.current = all / peakRef.current;
      bassRef.current = Math.min(1, low / 6 / (peakRef.current / bins.length) / 3);
    });
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let amp = 0;
    let bass = 0;
    let phase = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Smooth towards the target so it flows instead of flickering.
      const targetAmp = active ? 0.25 + energyRef.current * 0.75 : 0.12;
      amp += (targetAmp - amp) * Math.min(1, dt * 6);
      bass += ((active ? bassRef.current : 0) - bass) * Math.min(1, dt * 12);
      if (!reduced) phase += dt * (active ? 1.1 + amp : 0.35);

      const duration = getDuration();
      const progress = active && duration > 0 ? Math.min(1, getCurrentTime() / duration) : 0;
      const mid = h / 2;
      const layers = 4;
      for (let l = 0; l < layers; l++) {
        const k = l / (layers - 1);
        const height = h * 0.32 * amp * (1 - k * 0.45);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const u = x / w;
          // Taper to the edges, wider in the middle where the cover stands.
          const envelope = Math.sin(Math.PI * u) ** 1.5;
          const y =
            mid +
            envelope *
              height *
              (Math.sin(u * (7 + l * 2) + phase * (1 + l * 0.35)) * 0.6 +
                Math.sin(u * (13 - l) - phase * 0.8) * 0.4);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        const played = 0.85 - k * 0.45;
        const rest = 0.22 - k * 0.12;
        grad.addColorStop(0, `rgba(255,255,255,${rest})`);
        if (progress > 0) {
          grad.addColorStop(Math.max(0, progress - 0.001), `rgba(255,255,255,${played})`);
          grad.addColorStop(Math.min(1, progress + 0.001), `rgba(255,255,255,${rest})`);
        }
        grad.addColorStop(1, `rgba(255,255,255,${rest})`);
        ctx.strokeStyle = progress > 0 ? grad : `rgba(255,255,255,${rest})`;
        ctx.lineWidth = l === 0 ? 2 : 1.25;
        ctx.stroke();
      }

      pulseTarget?.current?.style.setProperty('--bass', bass.toFixed(3));
      if (!reduced || active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, pulseTarget]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-[260px] pointer-events-none"
    />
  );
});
