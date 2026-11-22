import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { proxiedAssetUrl } from '../lib/asset-url';
import { APP_VERSION } from '../lib/constants';
import { ExternalLink, X } from '../lib/icons';
import { openExternalUrl } from '../lib/open-external';
import {
  canSelfUpdate,
  type GithubRelease,
  installAppUpdate,
  stripLeadingV,
} from '../lib/update-check';

const IMAGE = /!\[[^\]]*\]\(([^)]+)\)/;
/** Shown when a release has no picture of its own (patch releases). */
const DEFAULT_BANNER =
  'https://raw.githubusercontent.com/LazerProOk1/soundcloud_mod/main/docs/banner.webp';

/** **bold** and [links](url) inside one line of release notes. */
function inline(text: string, key: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null = pattern.exec(text);
  while (m !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, bold, label, url] = m;
    if (bold) {
      parts.push(
        <strong key={`${key}-${m.index}`} className="font-semibold text-white">
          {bold}
        </strong>,
      );
    } else {
      parts.push(
        <button
          key={`${key}-${m.index}`}
          type="button"
          onClick={() => openExternalUrl(url)}
          className="inline text-accent hover:underline cursor-pointer"
        >
          {label}
        </button>,
      );
    }
    last = pattern.lastIndex;
    m = pattern.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * The release body is written for the GitHub page. In the app only "what's new" matters: the
 * banner becomes the header picture, the title is the dialog's own, and the commit list and the
 * "which file to download" section are dropped.
 */
function parseNotes(body: string) {
  const banner = body.match(IMAGE)?.[1] ?? DEFAULT_BANNER;
  const cut = body.search(/<details|^###\s+(Какой файл скачать|Which file)/im);
  const lines = (cut >= 0 ? body.slice(0, cut) : body)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !IMAGE.test(l) && !/^#\s|^##\s/.test(l));
  return { banner, lines };
}

export function UpdateChecker({
  release,
  onDismiss,
}: {
  release: GithubRelease;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { banner, lines } = useMemo(() => parseNotes(release.body ?? ''), [release.body]);
  const [selfUpdate, setSelfUpdate] = useState(false);
  // null = idle, otherwise download progress 0..1.
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    void canSelfUpdate().then(setSelfUpdate);
  }, []);

  const install = async () => {
    setProgress(0);
    try {
      if (!(await installAppUpdate(setProgress))) openExternalUrl(release.html_url);
    } catch (e) {
      console.error('[update]', e);
      toast.error(t('update.installFailed'));
      openExternalUrl(release.html_url);
    } finally {
      setProgress(null);
    }
  };

  const version = stripLeadingV(release.tag_name);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65">
      <div className="relative w-[560px] max-w-[94vw] max-h-[88vh] flex flex-col rounded-2xl app-surface overflow-hidden">
        {/* Positioned by a wrapper: Liquid Glass makes .ui-float `position: relative`. */}
        <div className="absolute top-3 right-3 z-10">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('update.later')}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white ui-float cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {banner && (
          <img
            src={proxiedAssetUrl(banner) ?? banner}
            alt=""
            decoding="async"
            className="w-full aspect-[2/1] object-cover shrink-0"
          />
        )}

        <div className="px-7 pt-6 pb-2 shrink-0">
          <h2 className="text-[24px] font-bold text-white tracking-tight">
            {t('update.title', { version })}
          </h2>
          <p className="text-[14px] text-white/50 mt-1">
            {t('update.current', { version: stripLeadingV(APP_VERSION) })}
          </p>
        </div>

        {lines.length > 0 && (
          <div className="px-7 py-3 overflow-y-auto min-h-0 space-y-2 text-[14px] leading-relaxed text-white/70">
            {lines.map((line, i) =>
              line.startsWith('### ') ? (
                <h3 key={i} className="pt-2 text-[15px] font-semibold text-white">
                  {line.slice(4)}
                </h3>
              ) : line.startsWith('- ') || line.startsWith('* ') ? (
                <p key={i} className="relative pl-4">
                  <span className="absolute left-0 text-accent">•</span>
                  {inline(line.slice(2), `l${i}`)}
                </p>
              ) : (
                <p key={i}>{inline(line, `p${i}`)}</p>
              ),
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-4 px-7 pt-4 pb-6 shrink-0">
          <button
            type="button"
            onClick={onDismiss}
            disabled={progress !== null}
            className="text-[15px] font-bold text-white/70 hover:text-white cursor-pointer disabled:opacity-40"
          >
            {t('update.later')}
          </button>
          <button
            type="button"
            disabled={progress !== null}
            onClick={() => (selfUpdate ? void install() : openExternalUrl(release.html_url))}
            className="relative overflow-hidden h-12 min-w-[180px] px-7 rounded-full ui-accent text-[15px] font-bold cursor-pointer flex items-center justify-center gap-2"
          >
            {progress !== null && (
              <span
                className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {progress !== null ? (
                t('update.installing', { percent: Math.round(progress * 100) })
              ) : selfUpdate ? (
                t('update.install')
              ) : (
                <>
                  {t('update.download')}
                  <ExternalLink size={15} />
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
