import { useTranslation } from 'react-i18next';
import { useCacheKind } from '../../lib/cache-kind';
import { CheckCircle2, Clock } from '../../lib/icons';

/**
 * Downloaded-track marker. Green check: saved with likes, never cleaned up automatically.
 * Grey clock: only in the temporary cache, removed when the cache limit is reached.
 */
export function CacheBadge({ urn, size = 12 }: { urn: string; size?: number }) {
  const { t } = useTranslation();
  const kind = useCacheKind(urn);
  if (!kind) return null;
  return kind === 'liked' ? (
    <span title={t('offline.cachedBadge')} className="inline-flex shrink-0 text-emerald-400/85">
      <CheckCircle2 size={size} />
    </span>
  ) : (
    <span title={t('offline.tempCachedBadge')} className="inline-flex shrink-0 text-white/40">
      <Clock size={size} />
    </span>
  );
}
