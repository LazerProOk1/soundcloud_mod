import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Globe, Users } from '../../lib/icons';
import { Avatar } from '../ui/Avatar';
import type { RelatedArtist } from './types';

interface ArtistRelatedTabProps {
  related: RelatedArtist[];
}

function ArtistRelatedTabImpl({ related }: ArtistRelatedTabProps) {
  const { t } = useTranslation();
  if (related.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.04]">
          <Users size={24} className="text-white/15" />
        </div>
        <p className="text-white/30 text-sm">{t('artist.noRelated')}</p>
      </div>
    );
  }

  const max = Math.max(...related.map((r) => r.weight), 1);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {related.map((a) => (
        <RelatedCard key={a.id} item={a} maxWeight={max} />
      ))}
    </div>
  );
}

const RelatedCard = memo(({ item, maxWeight }: { item: RelatedArtist; maxWeight: number }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pct = Math.max(0.08, Math.min(1, item.weight / maxWeight));
  return (
    <button
      type="button"
      onClick={() => navigate(`/artist/${encodeURIComponent(item.id)}`)}
      className="group flex flex-col items-center gap-3 p-5 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.06]"
    >
      <div className="w-24 h-24 rounded-full overflow-hidden bg-white/[0.06]">
        <Avatar src={item.avatar_url} alt={item.name} size={96} />
      </div>
      <div className="text-center min-w-0 w-full">
        <p className="text-[14px] font-semibold text-white truncate">{item.name}</p>
        {item.country && (
          <p className="inline-flex items-center gap-1 text-[12px] text-white/50 mt-0.5">
            <Globe size={11} /> {item.country}
          </p>
        )}
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden bg-white/[0.06]">
        <div className="h-full rounded-full bg-white/50" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-[12px] text-white/45">
        {t('artist.affinity')} {(pct * 100).toFixed(0)}%
      </span>
    </button>
  );
});

export const ArtistRelatedTab = memo(ArtistRelatedTabImpl);
