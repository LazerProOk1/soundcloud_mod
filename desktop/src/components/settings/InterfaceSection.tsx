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
import { type MusicSourceId, type PanelStyle, useSettingsStore } from '../../stores/settings';
import { PILL_BTN } from '../ui/buttonClass';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { RANGE_CLS } from '../ui/rangeClass';
import { Segmented } from '../ui/Segmented';
import { SettingRow, SettingsSection } from './SettingsKit';

const btnCls = PILL_BTN;
const inputCls =
  'bar-control h-9 flex-1 min-w-0 rounded-full border border-transparent px-4 text-[13px] text-white/85 outline-none placeholder:text-white/35 focus:border-white/25';

const PANEL_STYLES: PanelStyle[] = ['liquid', 'gloss', 'flat'];

const LiquidGlassRow = React.memo(function LiquidGlassRow() {
  const { t } = useTranslation();
  const panelStyle = useSettingsStore((s) => s.panelStyle);
  const setPanelStyle = useSettingsStore((s) => s.setPanelStyle);
  return (
    <SettingRow
      title={t('settings.liquidGlass')}
      desc={t(`settings.panelStyleDesc_${panelStyle}`)}
      stacked
    >
      <Segmented
        value={panelStyle}
        options={PANEL_STYLES.map((id) => ({ id, label: t(`settings.panelStyle_${id}`) }))}
        onChange={setPanelStyle}
      />
    </SettingRow>
  );
});

const SidebarRow = React.memo(function SidebarRow() {
  const { t } = useTranslation();
  const on = useSettingsStore((s) => s.sidebarLikedPlaylists);
  const set = useSettingsStore((s) => s.setSidebarLikedPlaylists);
  return (
    <SettingRow
      title={t('settings.sidebarLikedPlaylists')}
      desc={t('settings.sidebarLikedPlaylistsDesc')}
    >
      <LiquidSwitch checked={on} onChange={set} />
    </SettingRow>
  );
});

const ScaleRow = React.memo(function ScaleRow() {
  const { t } = useTranslation();
  const uiScale = useSettingsStore((s) => s.uiScale);
  const setUiScale = useSettingsStore((s) => s.setUiScale);
  return (
    <SettingRow
      title={t('settings.uiScale')}
      desc={t('settings.uiScaleDesc')}
      value={`${uiScale}%`}
      stacked
    >
      <input
        type="range"
        min={UI_SCALE_MIN}
        max={UI_SCALE_MAX}
        step={UI_SCALE_STEP}
        value={uiScale}
        onChange={(e) => setUiScale(Number(e.target.value))}
        className={RANGE_CLS}
      />
    </SettingRow>
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
    <SettingRow
      title={t('settings.font')}
      desc={name ? t('settings.fontCurrent', { name }) : t('settings.fontDesc')}
      stacked
    >
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
    </SettingRow>
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
    'ui-icon w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white cursor-pointer disabled:opacity-20 disabled:pointer-events-none';
  return (
    <SettingRow title={t('settings.sources')} desc={t('settings.sourcesDesc')} stacked>
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
                className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${src.enabled ? 'text-white' : 'text-white/35'}`}
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
              <LiquidSwitch checked={src.enabled} onChange={() => toggle(i)} />
            </div>
          );
        })}
      </div>
    </SettingRow>
  );
});

export const InterfaceSection = React.memo(function InterfaceSection() {
  const { t } = useTranslation();
  return (
    <SettingsSection id="interface" title={t('settings.interface')}>
      <LiquidGlassRow />
      <SidebarRow />
      <SourceRow />
      <ScaleRow />
      <FontRow />
    </SettingsSection>
  );
});
