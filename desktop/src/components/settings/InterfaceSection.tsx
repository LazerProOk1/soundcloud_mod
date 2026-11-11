import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  FONT_FILE_ACCEPT,
  importFontFile,
  isFontInstalled,
  removeFontFile,
  sanitizeFontName,
} from '../../lib/interface-font';
import { UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from '../../lib/ui-scale';
import { useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';

const rangeCls =
  'w-full accent-[var(--color-accent)] h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg';
const btnCls =
  'px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/70 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] hover:text-white transition-colors cursor-pointer';
const inputCls =
  'flex-1 min-w-0 px-3 py-1.5 rounded-lg text-[13px] text-white/85 bg-white/[0.04] border border-white/[0.08] outline-none focus:border-[var(--color-accent)]';

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
        className={rangeCls}
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

export const InterfaceSection = React.memo(function InterfaceSection() {
  const { t } = useTranslation();
  return (
    <section className="glass-card p-6 space-y-6">
      <h3 className="text-[15px] font-bold text-white/80 tracking-tight">
        {t('settings.interface')}
      </h3>
      <ScaleRow />
      <FontRow />
      <CssRow />
    </section>
  );
});
