import * as Dialog from '@radix-ui/react-dialog';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RefreshCw, Smartphone, X } from '../../lib/icons';
import { encodeQrPayload } from '../../lib/qr-link';
import { QrCode } from './QrCode';
import { useQrLink } from './useQrLink';

interface QrLinkSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'pull' | 'push';
  onSuccess?: (sessionId: string) => void;
}

export const QrLinkSheet = React.memo(
  ({ open, onOpenChange, mode, onSuccess }: QrLinkSheetProps) => {
    const { t } = useTranslation();
    const { state, start, reset } = useQrLink(mode, onSuccess);
    const [now, setNow] = useState(Date.now());

    // Auto-start when opened, reset when closed.
    useEffect(() => {
      if (open) start();
      else reset();
    }, [open, start, reset]);

    // Tick every second to update remaining-time.
    useEffect(() => {
      if (state.status !== 'pending') return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [state.status]);

    const remainingSec = state.expiresAt
      ? Math.max(0, Math.floor((state.expiresAt.getTime() - now) / 1000))
      : 0;

    const titleKey = mode === 'pull' ? 'qrLink.pullTitle' : 'qrLink.pushTitle';
    const subtitleKey = mode === 'pull' ? 'qrLink.pullSubtitle' : 'qrLink.pushSubtitle';

    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[100] animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,0.65)' }}
          />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl overflow-hidden outline-none bg-[#282828] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
            <div className="relative p-7" style={{ isolation: 'isolate' }}>
              <Dialog.Close className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer">
                <X size={18} />
              </Dialog.Close>

              <div className="flex flex-col mb-6 pr-8">
                <Dialog.Title className="flex items-center gap-2.5 text-[24px] font-bold text-white tracking-tight">
                  <Smartphone size={22} />
                  {t(titleKey)}
                </Dialog.Title>
                <p className="text-[14px] text-white/60 mt-2 leading-relaxed">{t(subtitleKey)}</p>
              </div>

              {(state.status === 'creating' || state.status === 'idle') && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-accent animate-spin" />
                  <p className="text-[11.5px] text-white/30">{t('qrLink.preparing')}</p>
                </div>
              )}

              {state.status === 'pending' && state.claimToken && (
                <div className="flex flex-col items-center gap-4">
                  <QrCode payload={encodeQrPayload(state.claimToken, mode)} size={260} />
                  <div className="flex items-center gap-1.5 text-[13px] text-white/50">
                    <span>
                      {t('qrLink.expiresIn', {
                        seconds: remainingSec,
                      })}
                    </span>
                  </div>
                </div>
              )}

              {state.status === 'claimed' && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center bg-emerald-500">
                    <Check size={26} className="text-black" />
                  </div>
                  <p className="text-[13px] text-white/70">
                    {mode === 'pull' ? t('qrLink.pullSuccess') : t('qrLink.pushSuccess')}
                  </p>
                </div>
              )}

              {(state.status === 'failed' || state.status === 'expired') && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-[12.5px] text-red-400/80 text-center max-w-[280px]">
                    {state.error || t('qrLink.failed')}
                  </p>
                  <button
                    type="button"
                    onClick={() => start()}
                    className="flex items-center gap-1.5 h-10 px-5 rounded-full bg-white text-black text-[14px] font-semibold cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    {t('qrLink.retry')}
                  </button>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);
QrLinkSheet.displayName = 'QrLinkSheet';
