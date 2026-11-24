import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { changeAppLanguage } from '../../i18n';
import { useAppStatusStore } from '../../stores/app-status';
import { type StartupPage, useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { Segmented } from '../ui/Segmented';
import { SettingRow, SettingsSection } from './SettingsKit';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;

const STARTUP_PAGES: Array<{ id: StartupPage; labelKey: string }> = [
  { id: 'home', labelKey: 'nav.home' },
  { id: 'search', labelKey: 'nav.search' },
  { id: 'library', labelKey: 'nav.library' },
  { id: 'settings', labelKey: 'nav.settings' },
];

interface AutostartState {
  supported: boolean;
  enabled: boolean;
  minimized: boolean;
}

/** Launch at login and start hidden in the tray; read from and written to the system. */
function AutostartRows() {
  const { t } = useTranslation();
  const [state, setState] = useState<AutostartState | null>(null);
  useEffect(() => {
    void invoke<AutostartState>('autostart_get')
      .then(setState)
      .catch(() => {});
  }, []);
  if (!state?.supported) return null;

  const apply = (enabled: boolean, minimized: boolean) => {
    const prev = state;
    setState({ ...state, enabled, minimized });
    void invoke('autostart_set', { enabled, minimized }).catch((e) => {
      setState(prev);
      toast.error(String(e));
    });
  };
  return (
    <>
      <SettingRow title={t('settings.autostart')} desc={t('settings.autostartDesc')}>
        <LiquidSwitch checked={state.enabled} onChange={(on) => apply(on, state.minimized)} />
      </SettingRow>
      <SettingRow title={t('settings.startMinimized')} desc={t('settings.startMinimizedDesc')}>
        {/* Only means something with autostart on: off and inactive until then. */}
        <LiquidSwitch
          checked={state.enabled && state.minimized}
          disabled={!state.enabled}
          onChange={(on) => apply(true, on)}
        />
      </SettingRow>
    </>
  );
}

/** Language, the page the app opens on, launch at login, hotkeys and offline mode. */
export const GeneralSection = React.memo(function GeneralSection() {
  const { t, i18n } = useTranslation();
  const startupPage = useSettingsStore((s) => s.startupPage);
  const setStartupPage = useSettingsStore((s) => s.setStartupPage);
  const globalHotkeys = useSettingsStore((s) => s.globalHotkeys);
  const setGlobalHotkeys = useSettingsStore((s) => s.setGlobalHotkeys);
  const offline = useAppStatusStore((s) => s.offlineBypass);
  const setOffline = (on: boolean) => {
    if (on) useAppStatusStore.getState().setOfflineBypass(true);
    // Back online: forget the offline flags so the next request decides.
    else useAppStatusStore.getState().resetConnectivity();
  };

  return (
    <SettingsSection id="general" title={t('settings.general')}>
      <SettingRow title={t('settings.language')} stacked>
        <Segmented
          value={i18n.language}
          options={LANGUAGES.map((lang) => ({ id: lang.code, label: lang.label }))}
          onChange={(code) => void changeAppLanguage(code)}
        />
      </SettingRow>
      <SettingRow title={t('settings.startup')} desc={t('settings.startupPageDesc')} stacked>
        <Segmented
          value={startupPage}
          options={STARTUP_PAGES.map((page) => ({ id: page.id, label: t(page.labelKey) }))}
          onChange={setStartupPage}
        />
      </SettingRow>
      <AutostartRows />
      <SettingRow title={t('settings.globalHotkeys')} desc={t('settings.globalHotkeysDesc')}>
        <LiquidSwitch checked={globalHotkeys} onChange={setGlobalHotkeys} />
      </SettingRow>
      <SettingRow title={t('settings.offlineMode')} desc={t('settings.offlineModeDesc')}>
        <LiquidSwitch checked={offline} onChange={setOffline} />
      </SettingRow>
    </SettingsSection>
  );
});
