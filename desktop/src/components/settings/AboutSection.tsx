import { openUrl } from '@tauri-apps/plugin-opener';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  APP_VERSION,
  GITHUB_OWNER,
  GITHUB_REPO,
  STREAMING_BASE,
  STREAMING_PREMIUM_BASE,
} from '../../lib/constants';
import { isHealthy, markHealthy } from '../../lib/host-health';
import { ExternalLink, Info, Loader2, RefreshCw, Sparkles, Wifi } from '../../lib/icons';
import { checkForAppUpdate, type GithubRelease } from '../../lib/update-check';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import { UpdateChecker } from '../UpdateChecker';

function openExternalUrl(url: string) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void openUrl(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

const STREAM_HOSTS = [
  { id: 'premium', label: 'Stream Premium', url: STREAMING_PREMIUM_BASE },
  { id: 'primary', label: 'Stream Primary', url: STREAMING_BASE },
] as const;

export const AboutSection = React.memo(function AboutSection() {
  const { t } = useTranslation();
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const cachedCount = useCachedUrnsStore((s) => s.urns.size);
  const [checking, setChecking] = useState(false);
  const [foundRelease, setFoundRelease] = useState<GithubRelease | null>(null);
  const [, setRefreshTick] = useState(0);

  const changelogItems = t('settings.whatsNewItems', {
    returnObjects: true,
    defaultValue: [],
  }) as string[];

  const handleCheckUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const release = await checkForAppUpdate();
      if (release) {
        setFoundRelease(release);
      } else {
        toast.success(t('settings.upToDate', { version: APP_VERSION }));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setChecking(false);
    }
  }, [t]);

  const handleResetHosts = useCallback(() => {
    for (const host of STREAM_HOSTS) {
      markHealthy(host.url);
    }
    setRefreshTick((n) => n + 1);
    toast.success(t('settings.hostsReset', 'Streaming host health reset'));
  }, [t]);

  const releasesUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

  return (
    <>
      <section className="settings-section space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
              <Info size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-white/90 tracking-tight">
                  SoundCloud Mod
                </h3>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-white/35 mt-0.5">
                {isTauri
                  ? t('settings.envDesktop', 'Tauri Native Desktop')
                  : t('settings.envBrowser', 'Web Preview Mode')}
                {cachedCount > 0
                  ? ` · ${t('settings.cachedTracksCount', { count: cachedCount })}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckUpdates}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold bg-white/[0.06] text-white/80 hover:text-white hover:bg-white/[0.1] border border-white/[0.07] transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t('settings.checkUpdates', 'Check for updates')}
            </button>
            <button
              type="button"
              onClick={() => openExternalUrl(releasesUrl)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold bg-white/[0.04] text-white/55 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-all duration-200 cursor-pointer"
              title="GitHub Releases"
            >
              <ExternalLink size={13} />
              GitHub
            </button>
          </div>
        </div>

        {/* Streaming host status */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/35 flex items-center gap-1.5">
              <Wifi size={12} />
              {t('settings.streamingStatus', 'Streaming endpoints')}
            </span>
            <button
              type="button"
              onClick={handleResetHosts}
              className="text-[11px] text-white/35 hover:text-white/75 transition-colors cursor-pointer"
            >
              {t('settings.reset')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STREAM_HOSTS.map((host) => {
              const healthy = isHealthy(host.url);
              return (
                <div
                  key={host.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/25 border border-white/[0.05]"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-white/75">{host.label}</p>
                    <p className="text-[10px] text-white/30 truncate font-mono">
                      {host.url.replace(/^https?:\/\//, '')}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      healthy
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                    }`}
                  >
                    {healthy
                      ? t('settings.hostHealthy', 'Ready')
                      : t('settings.hostCooldown', 'Cooldown')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* What's new */}
        {Array.isArray(changelogItems) && changelogItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/35 flex items-center gap-1.5">
              <Sparkles size={12} className="text-accent" />
              {t('settings.whatsNewTitle', { version: APP_VERSION })}
            </p>
            <ul className="space-y-1.5 text-[12px] text-white/55">
              {changelogItems.map((entry, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/80 shrink-0" />
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {foundRelease && (
        <UpdateChecker release={foundRelease} onDismiss={() => setFoundRelease(null)} />
      )}
    </>
  );
});
