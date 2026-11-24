import * as Popover from '@radix-ui/react-popover';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EQ_BAND_COUNT,
  EQ_LABELS,
  EQ_MAX_GAIN,
  EQ_MIN_GAIN,
  EQ_PRESETS,
} from '../../lib/equalizer';
import { AudioLines, RotateCcw, X } from '../../lib/icons';
import { useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';

/* ── Single Band Slider ─────────────────────────────────────── */

const BandSlider = React.memo(function BandSlider({
  index,
  gain,
  label,
  onChange,
}: {
  index: number;
  gain: number;
  label: string;
  onChange: (index: number, gain: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const calcGain = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round((pct * (EQ_MAX_GAIN - EQ_MIN_GAIN) + EQ_MIN_GAIN) * 2) / 2;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onChange(index, calcGain(e.clientY));
    },
    [index, onChange, calcGain],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(index, calcGain(e.clientY));
    },
    [index, onChange, calcGain],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Normalized 0-1 position
  const pct = (gain - EQ_MIN_GAIN) / (EQ_MAX_GAIN - EQ_MIN_GAIN);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Gain value */}
      <span
        className={`h-4 text-[11px] font-semibold tabular-nums ${
          gain !== 0 ? 'text-white' : 'text-white/40'
        }`}
      >
        {gain > 0 ? '+' : ''}
        {gain.toFixed(1)}
      </span>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative flex h-[140px] w-8 items-center justify-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Rail */}
        <div className="absolute h-full w-1 rounded-full bg-white/[0.10]" />

        {/* Fill from the 0 dB line towards the thumb */}
        <div
          className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-[var(--color-accent)]"
          style={{
            bottom: gain >= 0 ? '50%' : `${pct * 100}%`,
            top: gain >= 0 ? `${(1 - pct) * 100}%` : '50%',
          }}
        />

        {/* Thumb */}
        <div
          className="absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] will-change-transform"
          style={{ bottom: `calc(${pct * 100}% - 8px)` }}
        />
      </div>

      {/* Frequency label */}
      <span className="text-[10px] font-semibold text-white/45">{label}</span>
    </div>
  );
});

/* ── Preset Button ──────────────────────────────────────────── */

const PresetBtn = React.memo(function PresetBtn({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`press h-8 rounded-full px-3.5 text-[12px] font-semibold cursor-pointer ${
        active ? 'ui-selected' : 'bar-control text-white/75 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
});

/* ── Main Panel ─────────────────────────────────────────────── */

export const EqualizerPanel = React.memo(function EqualizerPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  const eqGains = useSettingsStore((s) => s.eqGains);
  const eqPreset = useSettingsStore((s) => s.eqPreset);
  const setEqEnabled = useSettingsStore((s) => s.setEqEnabled);
  const setEqGains = useSettingsStore((s) => s.setEqGains);
  const setEqPreset = useSettingsStore((s) => s.setEqPreset);
  const setEqBand = useSettingsStore((s) => s.setEqBand);

  const isRu = i18n.language === 'ru';

  // Touching a band or a preset while the EQ is off turns it on: that is what the user wants.
  const handleBandChange = useCallback(
    (index: number, gain: number) => {
      setEqBand(index, gain);
      if (!useSettingsStore.getState().eqEnabled) setEqEnabled(true);
    },
    [setEqBand, setEqEnabled],
  );

  const handlePreset = useCallback(
    (id: string) => {
      const preset = EQ_PRESETS[id];
      if (preset) {
        setEqGains([...preset.gains]);
        setEqPreset(id);
        if (!useSettingsStore.getState().eqEnabled) setEqEnabled(true);
      }
    },
    [setEqGains, setEqPreset, setEqEnabled],
  );

  const handleReset = useCallback(() => {
    setEqGains([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setEqPreset('flat');
  }, [setEqGains, setEqPreset]);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[200] w-[480px] max-w-[95vw] origin-bottom-right outline-none"
        >
          <div className="app-surface relative overflow-hidden rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <AudioLines size={20} className="text-white/70" />
                <h2 className="text-[16px] font-semibold tracking-tight text-white">
                  {t('eq.title')}
                </h2>
                <LiquidSwitch checked={eqEnabled} onChange={setEqEnabled} />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleReset}
                  title={t('eq.reset')}
                  className="ui-icon press flex h-9 w-9 items-center justify-center rounded-full text-white/55 hover:text-white cursor-pointer"
                >
                  <RotateCcw size={15} />
                </button>
                <Popover.Close className="ui-icon press flex h-9 w-9 items-center justify-center rounded-full text-white/55 hover:text-white cursor-pointer">
                  <X size={16} />
                </Popover.Close>
              </div>
            </div>

            {/* dB scale + Sliders */}
            <div
              className={`px-6 pb-4 transition-opacity duration-300 ${eqEnabled ? '' : 'opacity-55'}`}
            >
              <div className="flex items-end gap-0">
                {/* dB labels */}
                {/* Padded like a band column (value above, label below) so 0 dB lines up. */}
                <div className="mr-2 pb-[23px]">
                  <div className="flex h-[140px] flex-col justify-between py-0.5 text-[10px] leading-none tabular-nums text-white/35">
                    <span>+12</span>
                    <span>0</span>
                    <span>-12</span>
                  </div>
                </div>
                {/* Band sliders */}
                <div className="flex-1 flex justify-between">
                  {Array.from({ length: EQ_BAND_COUNT }, (_, i) => (
                    <BandSlider
                      key={i}
                      index={i}
                      gain={eqGains[i] ?? 0}
                      label={EQ_LABELS[i]}
                      onChange={handleBandChange}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="border-t border-white/[0.06] px-6 pt-4 pb-5">
              <p className="mb-2.5 text-[12px] font-semibold text-white/55">{t('eq.preset')}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(EQ_PRESETS).map(([id, preset]) => (
                  <PresetBtn
                    key={id}
                    id={id}
                    label={isRu ? preset.labelRu : preset.label}
                    active={eqPreset === id}
                    onClick={handlePreset}
                  />
                ))}
                {eqPreset === 'custom' && (
                  <PresetBtn id="custom" label={t('eq.custom')} active onClick={() => {}} />
                )}
              </div>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
