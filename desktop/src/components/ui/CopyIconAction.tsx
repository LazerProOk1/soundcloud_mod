import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, LinkIcon } from '../../lib/icons';
import { cleanPermalink } from '../../lib/permalink';

const VARIANT = {
  /** Action rail: rounded square with a soft hover. */
  rail: {
    base: 'inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ease-[var(--ease-apple)] cursor-pointer',
    copied: 'text-emerald-400 bg-emerald-500/12',
    idle: 'text-white/60 hover:text-white/95 hover:bg-white/[0.07]',
  },
  /** Round icon in a row of other round buttons (same 22 px icons as its neighbours). */
  round: {
    base: 'w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors',
    copied: 'text-emerald-400',
    idle: 'text-white/60 hover:text-white',
  },
} as const;

/** "Copy link" icon (link without utm tags). Hidden when there is no link. */
export const CopyIconAction = React.memo(function CopyIconAction({
  url,
  variant = 'rail',
}: {
  url: string | undefined;
  variant?: keyof typeof VARIANT;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(cleanPermalink(url));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!url) return null;

  const v = VARIANT[variant];
  const iconSize = variant === 'round' ? 22 : 16;
  const label = copied ? t('auth.copied') : t('auth.copyLink');

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      aria-label={label}
      className={`${v.base} ${copied ? v.copied : v.idle}`}
    >
      {copied ? <Check size={iconSize} /> : <LinkIcon size={iconSize} />}
    </button>
  );
});
