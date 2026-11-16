import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Compass, Headphones, Moon, Sparkles, Zap } from '../../../lib/icons';
import { WAVE_VIBES, type WaveMode, type WaveVibeId } from '../../../lib/wave-vibes';

const VIBE_ICON: Record<WaveVibeId, React.ReactNode> = {
  all: <Sparkles size={13} />,
  focus: <Headphones size={13} />,
  energy: <Zap size={13} />,
  chill: <Compass size={13} />,
  night: <Moon size={13} />,
  workout: <Activity size={13} />,
};

interface VibeTunerProps {
  vibe: WaveVibeId;
  mode: WaveMode;
  onVibeChange: (vibe: WaveVibeId) => void;
  onModeChange: (mode: WaveMode) => void;
  compact?: boolean;
}

export const VibeTuner = React.memo(function VibeTuner({
  vibe,
  mode,
  onVibeChange,
  onModeChange,
  compact = false,
}: VibeTunerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      {/* Mood pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {WAVE_VIBES.map((item) => {
          const active = vibe === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onVibeChange(item.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200 cursor-pointer active:scale-95 select-none ${
                compact ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3 text-[12px]'
              } ${
                active
                  ? 'text-white shadow-sm'
                  : 'text-white/55 hover:text-white/85 bg-white/[0.045] hover:bg-white/[0.085] border border-white/[0.07]'
              }`}
              style={
                active
                  ? {
                      background: `color-mix(in srgb, ${item.tint} 22%, rgba(255,255,255,0.08))`,
                      border: `1px solid color-mix(in srgb, ${item.tint} 55%, rgba(255,255,255,0.18))`,
                      boxShadow: `0 4px 16px color-mix(in srgb, ${item.tint} 28%, transparent)`,
                    }
                  : undefined
              }
            >
              <span
                className="shrink-0"
                style={{ color: active ? item.tint : 'rgba(255,255,255,0.5)' }}
              >
                {VIBE_ICON[item.id]}
              </span>
              <span>{t(`soundwave.vibes.${item.id}`)}</span>
            </button>
          );
        })}
      </div>

      {/* Mode switch: Familiar vs Discovery */}
      <div
        role="group"
        aria-label={t('soundwave.modeLabel')}
        className="inline-flex items-center rounded-full p-0.5 bg-white/[0.04] border border-white/[0.08] shrink-0"
      >
        {(['similar', 'diverse'] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              aria-pressed={active}
              className={`rounded-full font-semibold transition-all duration-200 cursor-pointer select-none ${
                compact ? 'px-2.5 py-1 text-[10.5px]' : 'px-3 py-1 text-[11px]'
              } ${
                active
                  ? 'bg-white/[0.14] text-white shadow-sm'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              {t(`soundwave.modes.${m}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
});
