import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { API_HOSTS, APP_VERSION, GITHUB_OWNER, GITHUB_REPO } from '../../lib/constants';
import { isHealthy, markHealthy } from '../../lib/host-health';
import { ExternalLink, Loader2, RefreshCw, Wifi } from '../../lib/icons';
import { openExternalUrl } from '../../lib/open-external';
import { checkForAppUpdate, type GithubRelease } from '../../lib/update-check';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import { UpdateChecker } from '../UpdateChecker';

// The API hosts tracks and pages come from, in order (the second is the fallback mirror).

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
    for (const url of API_HOSTS) markHealthy(url);
    setRefreshTick((n) => n + 1);
    toast.success(t('settings.hostsReset', 'Streaming host health reset'));
  }, [t]);

  const releasesUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

  return (
    <>
      <section
        id="settings-about"
        data-settings-id="about"
        className="settings-section space-y-6 scroll-mt-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[22px] font-bold tracking-tight text-white">SoundCloud Mod</h3>
              <span className="bar-control rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white/70">
                v{APP_VERSION}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-white/40">
              {isTauri
                ? t('settings.envDesktop', 'Tauri Native Desktop')
                : t('settings.envBrowser', 'Web Preview Mode')}
              {cachedCount > 0
                ? ` · ${t('settings.cachedTracksCount', { count: cachedCount })}`
                : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckUpdates}
              disabled={checking}
              className="press flex h-9 items-center gap-2 rounded-full ui-primary px-4 text-[13px] font-semibold text-black disabled:opacity-60 cursor-pointer"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('settings.checkUpdates', 'Check for updates')}
            </button>
            <button
              type="button"
              onClick={() => openExternalUrl(releasesUrl)}
              className="press flex h-9 items-center gap-2 rounded-full bar-control px-4 text-[13px] font-semibold text-white/80 hover:text-white cursor-pointer"
              title="GitHub Releases"
            >
              <ExternalLink size={14} />
              GitHub
            </button>
          </div>
        </div>

        {/* Streaming host status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[13px] font-medium text-white/50">
              <Wifi size={14} />
              {t('settings.streamingStatus', 'Streaming endpoints')}
            </p>
            <button
              type="button"
              onClick={handleResetHosts}
              className="text-[12px] text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              {t('settings.reset')}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {API_HOSTS.map((url, i) => {
              const healthy = isHealthy(url);
              return (
                <div
                  key={url}
                  className="flex items-center justify-between gap-3 rounded-xl ui-card px-3.5 py-2.5"
                >
                  <p className="min-w-0 truncate text-[13px] font-semibold text-white/85">
                    {/* Numbered, not named: the hosts themselves aren't worth showing. */}
                    {t('settings.streamServer', { n: i + 1 })}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-white/60">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    />
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
          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-white/50">
              {t('settings.whatsNewTitle', { version: APP_VERSION })}
            </p>
            <ul className="space-y-2 text-[13px] text-white/70">
              {changelogItems.map((entry, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/40" />
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
