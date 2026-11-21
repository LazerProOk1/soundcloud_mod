import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { downloadProfileBackup, restoreProfileBackupFromText } from '../../lib/backup';
import { Download, Upload } from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { PILL_BTN } from '../ui/buttonClass';
import { SettingsSection } from './SettingsKit';

export const BackupSection = React.memo(function BackupSection() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    try {
      downloadProfileBackup();
      toast.success(t('settings.backupExported'));
    } catch {
      toast.error(t('common.error'));
    }
  }, [t]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const ok = restoreProfileBackupFromText(await file.text());
        if (ok) toast.success(t('settings.backupImported'));
        else toast.error(t('settings.backupInvalid'));
      } catch {
        toast.error(t('settings.backupInvalid'));
      }
    },
    [t],
  );

  return (
    <SettingsSection id="backup" title={t('settings.backup')} desc={t('settings.backupDesc')}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleExport} className={PILL_BTN}>
          <Download size={13} />
          {t('settings.exportBackup')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={PILL_BTN}>
          <Upload size={13} />
          {t('settings.importBackup')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </SettingsSection>
  );
});

const QrLinkSheetLazy = React.lazy(() =>
  import('../auth/QrLinkSheet').then((m) => ({ default: m.QrLinkSheet })),
);

export const AccountSection = React.memo(function AccountSection() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <SettingsSection id="account" title={t('settings.account')}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setTransferOpen(true)}
          className="press h-10 px-5 rounded-full text-[14px] font-semibold ui-primary text-black cursor-pointer"
        >
          {t('qrLink.transferSession')}
        </button>
        <button
          type="button"
          onClick={logout}
          className="press h-10 px-5 rounded-full text-[14px] font-semibold bar-control ui-danger text-white/80 cursor-pointer"
        >
          {t('auth.signOut')}
        </button>
      </div>
      {transferOpen && (
        <React.Suspense fallback={null}>
          <QrLinkSheetLazy open={transferOpen} onOpenChange={setTransferOpen} mode="push" />
        </React.Suspense>
      )}
    </SettingsSection>
  );
});
