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
  const highRef = useRef(0);
  const peakRef = useRef(1e-3);

  // Music energy from the analyser (only while playing).
  useEffect(() => {
    if (!active) return;
    return subscribeAudioFft((bins) => {
      let low = 0;
      let high = 0;
      let all = 0;
      for (let i = 0; i < bins.length; i++) {
        all += bins[i];
        if (i < 6) low += bins[i];
        else if (i > 24) high += bins[i];
      }
      // Self-calibrating: compare against a slowly decaying peak.
      peakRef.current = Math.max(peakRef.current * 0.995, all, 1e-3);
      const avg = peakRef.current / bins.length;
      energyRef.current = all / peakRef.current;
      bassRef.current = Math.min(1, low / 6 / avg / 3);
      highRef.current = Math.min(1, (high / (bins.length - 25) / avg) * 1.5);
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
    let high = 0;
    let kick = 0;
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
      const nextBass = active ? bassRef.current : 0;
      // A sudden rise in the bass is a beat: a quick swell that decays.
      if (nextBass - bass > 0.12) kick = 1;
      kick = Math.max(0, kick - dt * 3.5);
      bass += (nextBass - bass) * Math.min(1, dt * 12);
      high += ((active ? highRef.current : 0) - high) * Math.min(1, dt * 8);
      if (!reduced) phase += dt * (active ? 1.1 + amp * 1.5 + kick : 0.35);

      const duration = getDuration();
      const progress = active && duration > 0 ? Math.min(1, getCurrentTime() / duration) : 0;
      const mid = h / 2;
      const layers = 4;
      for (let l = 0; l < layers; l++) {
        const k = l / (layers - 1);
        // Inner lines follow the bass (and beats), outer ones the highs.
        const drive = (1 - k) * (amp + kick * 0.5) + k * (amp * 0.6 + high * 0.8);
        const height = h * 0.4 * drive * (1 - k * 0.3);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const u = x / w;
          // Taper to the edges; the swing is biggest beside the cover, where it's visible.
          const envelope =
            0.3 * Math.sin(Math.PI * u) + 0.7 * Math.abs(Math.sin(2 * Math.PI * u)) ** 1.2;
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

      const target = pulseTarget?.current;
      if (target) {
        target.style.setProperty('--bass', (bass * 0.7 + kick * 0.5).toFixed(3));
        // Slow float with the music; the cover sways a little.
        target.style.setProperty('--sway', (Math.sin(phase * 0.6) * (2 + amp * 6)).toFixed(2));
      }
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
