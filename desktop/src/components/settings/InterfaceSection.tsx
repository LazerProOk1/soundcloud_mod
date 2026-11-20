import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from '../../lib/icons';
import {
  FONT_FILE_ACCEPT,
  importFontFile,
  isFontInstalled,
  removeFontFile,
  sanitizeFontName,
} from '../../lib/interface-font';
import { UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from '../../lib/ui-scale';
import { type MusicSourceId, useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { RANGE_CLS } from '../ui/rangeClass';

const btnCls =
  'px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/70 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] hover:text-white transition-colors cursor-pointer';
const inputCls =
  'flex-1 min-w-0 px-3 py-1.5 rounded-lg text-[13px] text-white/85 bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[var(--color-accent)]';

const LiquidGlassRow = React.memo(function LiquidGlassRow() {
  const { t } = useTranslation();
  const liquidGlass = useSettingsStore((s) => s.liquidGlass);
  const setLiquidGlass = useSettingsStore((s) => s.setLiquidGlass);
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-white/70 font-medium">{t('settings.liquidGlass')}</p>
        <p className="text-[11px] text-white/30 mt-0.5">{t('settings.liquidGlassDesc')}</p>
      </div>
      <LiquidSwitch checked={liquidGlass} onChange={setLiquidGlass} />
    </div>
  );
});

const ScaleRow = React.memo(function ScaleRow() {
  const { t } = useTranslation();
  const uiScale = useSettingsStore((s) => s.uiScale);
  const setUiScale = useSettingsStore((s) => s.setUiScale);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-white/70 font-medium">{t('settings.uiScale')}</p>
          <p className="text-[11px] text-white/30 mt-0.5">{t('settings.uiScaleDesc')}</p>
        </div>
        <span className="text-[12px] text-white/50 tabular-nums">{uiScale}%</span>
      </div>
      <input
        type="range"
        min={UI_SCALE_MIN}
        max={UI_SCALE_MAX}
        step={UI_SCALE_STEP}
        value={uiScale}
        onChange={(e) => setUiScale(Number(e.target.value))}
        className={RANGE_CLS}
      />
    </div>
  );
});

const FontRow = React.memo(function FontRow() {
  const { t } = useTranslation();
  const name = useSettingsStore((s) => s.customFontName);
  const file = useSettingsStore((s) => s.customFontFile);
  const setCustomFont = useSettingsStore((s) => s.setCustomFont);
  const [draft, setDraft] = useState(name);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [name]);

  const applyInstalled = () => {
    const clean = sanitizeFontName(draft);
    if (!clean) return;
    if (!isFontInstalled(clean)) {
      toast.error(t('settings.fontNotFound', { name: clean }));
      return;
    }
    void removeFontFile(file);
    setCustomFont(clean, '');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const result = await importFontFile(picked).catch(() => null);
    if (!result) {
      toast.error(t('settings.fontFileFailed'));
      return;
    }
    if (file && file !== result.fileName) void removeFontFile(file);
    setCustomFont(result.family, result.fileName);
  };

  const reset = () => {
    void removeFontFile(file);
    setCustomFont('', '');
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] text-white/70 font-medium">{t('settings.font')}</p>
        <p className="text-[11px] text-white/30 mt-0.5">
          {name ? t('settings.fontCurrent', { name }) : t('settings.fontDesc')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyInstalled()}
          placeholder={t('settings.fontPlaceholder')}
          className={inputCls}
        />
        <button type="button" onClick={applyInstalled} className={btnCls}>
          {t('settings.fontApply')}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={btnCls}>
          {t('settings.fontFromFile')}
        </button>
        {name && (
          <button type="button" onClick={reset} className={btnCls}>
            {t('settings.reset')}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={FONT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => void onFile(e)}
        />
      </div>
    </div>
  );
});

const CSS_PLACEHOLDER = ':root {\n  --color-accent: #8b5cf6;\n}';

const CssRow = React.memo(function CssRow() {
  const { t } = useTranslation();
  const css = useSettingsStore((s) => s.customCss);
  const enabled = useSettingsStore((s) => s.customCssEnabled);
  const setCss = useSettingsStore((s) => s.setCustomCss);
  const setEnabled = useSettingsStore((s) => s.setCustomCssEnabled);
  const [draft, setDraft] = useState(css);
  const dirty = draft !== css;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-white/70 font-medium">{t('settings.customCss')}</p>
          <p className="text-[11px] text-white/30 mt-0.5">{t('settings.customCssDesc')}</p>
        </div>
        <LiquidSwitch checked={enabled} onChange={setEnabled} />
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setCss(draft);
          }
        }}
        spellCheck={false}
        rows={8}
        placeholder={CSS_PLACEHOLDER}
        className="w-full px-3 py-2.5 rounded-xl font-mono text-[12px] leading-relaxed text-white/85 bg-black/30 border border-white/[0.08] outline-none focus:border-[var(--color-accent)] resize-y"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => setCss(draft)}
          className={`${btnCls} disabled:opacity-40 disabled:cursor-default`}
        >
          {t('settings.customCssApply')}
        </button>
        <span className="text-[11px] text-white/30">Ctrl+S</span>
      </div>
    </div>
  );
});

const SOURCE_META: Record<MusicSourceId, { label: string; dot: string }> = {
  soundcloud: { label: 'SoundCloud', dot: '#ff5500' },
  zaycev: { label: 'Зайцев.нет', dot: '#3b82f6' },
  youtube: { label: 'YouTube Music', dot: '#ef4444' },
};

/** Ordered list of download sources: arrows change the priority, switches turn them off. */
const SourceRow = React.memo(function SourceRow() {
  const { t } = useTranslation();
  const sources = useSettingsStore((s) => s.musicSources);
  const setSources = useSettingsStore((s) => s.setMusicSources);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sources.length) return;
    const next = [...sources];
    [next[i], next[j]] = [next[j], next[i]];
    setSources(next);
  };
  const toggle = (i: number) =>
    setSources(sources.map((s, k) => (k === i ? { ...s, enabled: !s.enabled } : s)));
  const arrow =
    'w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] cursor-pointer disabled:opacity-20 disabled:pointer-events-none';
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] text-white/70 font-medium">{t('settings.sources')}</p>
        <p className="text-[11px] text-white/30 mt-0.5">{t('settings.sourcesDesc')}</p>
      </div>
      <div className="flex flex-col">
        {sources.map((src, i) => {
          const meta = SOURCE_META[src.id];
          return (
            <div
              key={src.id}
              className="source-row flex items-center gap-3 h-12 px-2 rounded-lg hover:bg-white/[0.04]"
            >
              <span className="w-5 text-[13px] tabular-nums text-white/40 text-center">
                {i + 1}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: meta.dot }}
              />
              <span
                className={`flex-1 text-[14px] font-semibold ${src.enabled ? 'text-white' : 'text-white/35'}`}
              >
                {meta.label}
              </span>
              <button
                type="button"
                className={arrow}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t('settings.sourceUp')}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                className={arrow}
                disabled={i === sources.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t('settings.sourceDown')}
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={src.enabled}
                onClick={() => toggle(i)}
                className={`relative w-10 h-6 rounded-full cursor-pointer transition-colors ${
                  src.enabled ? 'bg-accent' : 'bg-white/[0.15]'
                }`}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow"
                  style={{
                    transform: `translateX(${src.enabled ? 16 : 0}px)`,
                    transition: 'transform 0.4s var(--spring-bouncy)',
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const InterfaceSection = React.memo(function InterfaceSection() {
  const { t } = useTranslation();
  return (
    <section className="settings-section space-y-6">
      <h3 className="text-[22px] font-bold text-white tracking-tight">{t('settings.interface')}</h3>
      <LiquidGlassRow />
      <SourceRow />
      <ScaleRow />
      <FontRow />
      <CssRow />
    </section>
  );
});
