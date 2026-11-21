import React from 'react';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage } from '../../i18n';
import { type StartupPage, useSettingsStore } from '../../stores/settings';
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

/** Language and the page the app opens on. */
export const GeneralSection = React.memo(function GeneralSection() {
  const { t, i18n } = useTranslation();
  const startupPage = useSettingsStore((s) => s.startupPage);
  const setStartupPage = useSettingsStore((s) => s.setStartupPage);

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
    </SettingsSection>
  );
});
