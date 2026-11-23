import React from 'react';
import { useTranslation } from 'react-i18next';
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

/** Language, the page the app opens on and offline mode. */
export const GeneralSection = React.memo(function GeneralSection() {
  const { t, i18n } = useTranslation();
  const startupPage = useSettingsStore((s) => s.startupPage);
  const setStartupPage = useSettingsStore((s) => s.setStartupPage);
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
      <SettingRow title={t('settings.offlineMode')} desc={t('settings.offlineModeDesc')}>
        <LiquidSwitch checked={offline} onChange={setOffline} />
      </SettingRow>
    </SettingsSection>
  );
});
