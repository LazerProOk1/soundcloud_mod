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
              data-vibe-active={active}
              className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors duration-200 cursor-pointer select-none ${
                compact ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3.5 text-[12.5px]'
              } ${active ? 'ui-primary' : 'bar-control text-white/75 hover:text-white'}`}
            >
              <span className="shrink-0" style={{ color: active ? '#000' : item.tint }}>
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
        className="ui-track inline-flex items-center rounded-full p-0.5 shrink-0"
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
              } ${active ? 'ui-selected' : 'text-white/60 hover:text-white'}`}
            >
              {t(`soundwave.modes.${m}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
});
