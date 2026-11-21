import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, LinkIcon as Link } from '../../lib/icons';
import { cleanPermalink } from '../../lib/permalink';

export function CopyLinkButton({
  url,
  size = 'md',
}: {
  url: string | undefined;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!url) return;
    navigator.clipboard.writeText(cleanPermalink(url));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  if (!url) return null;

  const iconSize = size === 'sm' ? 13 : 15;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 font-semibold transition-colors duration-200 cursor-pointer rounded-full ${
        copied ? 'bg-emerald-500/15 text-emerald-300' : 'bar-control text-white/85 hover:text-white'
      } ${size === 'sm' ? 'h-8 px-3.5 text-[12px]' : 'h-11 px-5 text-[13px]'}`}
    >
      {copied ? <Check size={iconSize} className="text-emerald-400" /> : <Link size={iconSize} />}
      {copied ? t('auth.copied') : t('auth.copyLink')}
    </button>
  );
}
