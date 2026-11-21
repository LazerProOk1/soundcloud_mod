import React from 'react';
import { useTranslation } from 'react-i18next';
import { type CrossfadeCurve, useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { RANGE_CLS } from '../ui/rangeClass';
import { Segmented } from '../ui/Segmented';
import { SettingRow, SettingsSection } from './SettingsKit';

/** Same shapes as the audio engine: fade-in of the next track; the current one mirrors it. */
function fadeIn(t: number, curve: CrossfadeCurve) {
  if (curve === 'linear') return t;
  if (curve === 'scurve') return 0.5 * (1 - Math.cos(Math.PI * t));
  return Math.sin((t * Math.PI) / 2);
}

const W = 600;
const H = 120;

function curvePath(fn: (t: number) => number) {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push(`${(t * W).toFixed(1)},${(H - fn(t) * (H - 8) - 4).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

/** Live picture of the transition: white = current track, accent = next track. */
const CurveGraph = React.memo(function CurveGraph({ curve }: { curve: CrossfadeCurve }) {
  const { t } = useTranslation();
  const next = curvePath((x) => fadeIn(x, curve));
  const current = curvePath((x) => fadeIn(1 - x, curve));
  return (
    <div className="rounded-xl bg-black/30 p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" preserveAspectRatio="none">
        <path d={`${next} L${W},${H} L0,${H} Z`} fill="var(--color-accent)" opacity="0.14" />
        <path
          d={current}
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          className="xfade-line"
        />
        <path
          d={next}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          className="xfade-line"
        />
      </svg>
      <div className="flex gap-5 mt-2 text-[12px] text-white/60">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-white" />
          {t('transitions.current')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-accent" />
          {t('transitions.next')}
        </span>
      </div>
    </div>
  );
});

/** Track transitions: off / smooth overlap, length, volume shape and a few rules. */
export const TransitionsSection = React.memo(function TransitionsSection() {
  const { t } = useTranslation();
  const s = useSettingsStore();
  const on = s.crossfadeDuration > 0;

  return (
    <SettingsSection id="transitions" title={t('transitions.title')}>
      <div className="flex flex-wrap items-center gap-4">
        <Segmented
          value={on ? 'smooth' : 'off'}
          options={[
            { id: 'off', label: t('transitions.off') },
            { id: 'smooth', label: t('transitions.smooth') },
          ]}
          onChange={(v) => s.setCrossfadeDuration(v === 'off' ? 0 : 6)}
        />
        <p className="flex-1 min-w-[220px] text-[13px] text-white/60">
          {on ? t('transitions.smoothDesc') : t('transitions.offDesc')}
        </p>
      </div>

      {on && (
        <>
          <CurveGraph curve={s.crossfadeCurve} />
          <SettingRow title={t('transitions.duration')} desc={t('transitions.durationDesc')}>
            <div className="flex items-center gap-3 w-[260px]">
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={s.crossfadeDuration}
                onChange={(e) => s.setCrossfadeDuration(Number(e.target.value))}
                className={`${RANGE_CLS} flex-1`}
              />
              <span className="w-10 text-right text-[14px] tabular-nums text-white/80">
                {s.crossfadeDuration} {t('common.sec', 'с')}
              </span>
            </div>
          </SettingRow>
          <SettingRow title={t('transitions.shape')} desc={t('transitions.shapeDesc')}>
            <Segmented
              value={s.crossfadeCurve}
              options={[
                { id: 'equal', label: t('transitions.equal') },
                { id: 'linear', label: t('transitions.linear') },
                { id: 'scurve', label: t('transitions.scurve') },
              ]}
              onChange={s.setCrossfadeCurve}
            />
          </SettingRow>
          <SettingRow title={t('transitions.keepAlbums')} desc={t('transitions.keepAlbumsDesc')}>
            <LiquidSwitch checked={s.crossfadeKeepAlbums} onChange={s.setCrossfadeKeepAlbums} />
          </SettingRow>
        </>
      )}
      <SettingRow title={t('transitions.trimSilence')} desc={t('transitions.trimSilenceDesc')}>
        <LiquidSwitch checked={s.trimSilence} onChange={s.setTrimSilence} />
      </SettingRow>
      <SettingRow title={t('transitions.onSkip')} desc={t('transitions.onSkipDesc')}>
        <LiquidSwitch checked={s.crossfadeOnSkip} onChange={s.setCrossfadeOnSkip} />
      </SettingRow>
    </SettingsSection>
  );
});
