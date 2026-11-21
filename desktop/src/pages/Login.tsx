import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SocialIcon } from '../components/artist/socials';
import { QrLinkSheet } from '../components/auth/QrLinkSheet';
import { PILL_BTN } from '../components/ui/buttonClass';
import {
  AlertCircle,
  Check,
  ChevronRight,
  ClipboardCopy,
  Disc3,
  Download,
  RefreshCw,
  Smartphone,
} from '../lib/icons';
import { queryClient } from '../lib/query-client';
import type { OAuthFlowError } from '../lib/use-oauth-flow';
import { useOAuthFlow } from '../lib/use-oauth-flow';
import { useAppStatusStore } from '../stores/app-status';
import { useAuthStore } from '../stores/auth';

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const setOfflineBypass = useAppStatusStore((s) => s.setOfflineBypass);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [flowError, setFlowError] = useState<OAuthFlowError | null>(null);

  const handleEnterOffline = () => {
    setOfflineBypass(true);
    navigate('/offline', { replace: true });
  };

  const onLoginSuccess = async (sessionId: string) => {
    setSession(sessionId);
    await fetchUser();
    queryClient.invalidateQueries();
  };

  const handleFlowError = (err: OAuthFlowError) => {
    setFlowError(err);
  };

  const { startLogin, authUrl, isPolling, step } = useOAuthFlow(onLoginSuccess, handleFlowError);

  const handleLogin = async () => {
    setFlowError(null);
    try {
      await startLogin();
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  const stepLabel =
    step === 'token'
      ? t('auth.stepToken')
      : step === 'profile'
        ? t('auth.stepProfile')
        : step === 'session'
          ? t('auth.stepSession')
          : t('auth.stepWaiting');

  return (
    <div className="h-screen flex items-center justify-center relative overflow-hidden">
      {/* One soft accent wash from the top: colour without blur layers or glow. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 70% at 50% -10%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center max-w-[400px] w-full mx-6 animate-liquid-reveal">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center text-black">
          <Disc3 size={34} strokeWidth={1.75} />
        </div>

        <h1 className="mt-6 text-[40px] font-black leading-none tracking-tight text-white">
          SoundCloud Mod
        </h1>
        <p className="mt-3 text-[15px] text-white/55">
          {isPolling ? t('auth.signingIn') : t('auth.tagline')}
        </p>

        {flowError && (
          <div className="mt-8 w-full rounded-2xl bg-red-500/10 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-red-300">
                  {flowError.kind === 'expired'
                    ? t('auth.errorExpiredTitle')
                    : flowError.kind === 'unreachable'
                      ? t('auth.errorServerTitle')
                      : t('auth.errorFailedTitle')}
                </p>
                <p className="text-[13px] text-red-300/70 mt-0.5 break-words">
                  {flowError.kind === 'unreachable' ? t('auth.errorServerDesc') : flowError.message}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogin}
                className="press shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-red-500/15 hover:bg-red-500/25 text-[13px] font-semibold text-red-300 cursor-pointer"
              >
                <RefreshCw size={13} />
                {t('auth.retry')}
              </button>
            </div>
          </div>
        )}

        {isPolling ? (
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/[0.08] border-t-accent animate-spin" />
            <p className="text-[14px] text-white/55">{stepLabel}</p>
            {authUrl && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(authUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={PILL_BTN}
              >
                {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {copied ? t('auth.copied') : t('auth.copyLink')}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-stretch gap-3 w-full">
            <button
              type="button"
              onClick={handleLogin}
              className="press w-full h-12 inline-flex items-center justify-center gap-2.5 rounded-full bg-accent text-[15px] font-bold text-black hover:bg-accent-hover cursor-pointer"
            >
              <SocialIcon kind="soundcloud" size={20} />
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="press w-full h-12 inline-flex items-center justify-center gap-2 rounded-full bg-white/[0.07] text-[15px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white cursor-pointer"
            >
              <Smartphone size={17} />
              {t('qrLink.scanQr')}
            </button>

            <div className="my-3 flex items-center gap-4 text-[13px] text-white/35">
              <div className="h-px flex-1 bg-white/[0.08]" />
              {t('auth.orSeparator')}
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <OfflineEntryCard onClick={handleEnterOffline} />
          </div>
        )}
      </div>
      <QrLinkSheet open={qrOpen} onOpenChange={setQrOpen} mode="pull" onSuccess={onLoginSuccess} />
    </div>
  );
}

/** Secondary way in: a flat row card, like the list rows elsewhere in the app. */
function OfflineEntryCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-4 p-3 pr-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-left transition-colors hover:bg-white/[0.07] cursor-pointer"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
        <Download size={20} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-white">
          {t('auth.continueOffline')}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-white/50">
          {t('auth.continueOfflineDesc')}
        </span>
      </span>
      <ChevronRight
        size={18}
        className="shrink-0 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70"
      />
    </button>
  );
}
