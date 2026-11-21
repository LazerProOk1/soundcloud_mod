import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users } from '../../lib/icons';
import { Avatar } from '../ui/Avatar';
import type { AlbumArtist } from './types';

interface AlbumCastProps {
  artists: AlbumArtist[];
}

const ROLE_BUCKETS = ['primary', 'featured', 'remixer', 'producer'] as const;
const ROLE_LABEL_KEY: Record<string, string> = {
  primary: 'album.primaryArtist',
  featured: 'album.featured',
  remixer: 'album.remixer',
  producer: 'album.producer',
};

interface CastGroup {
  role: string;
  items: AlbumArtist[];
}

function groupByRole(artists: AlbumArtist[]): CastGroup[] {
  const map = new Map<string, AlbumArtist[]>();
  for (const a of artists) {
    const arr = map.get(a.role) ?? [];
    arr.push(a);
    map.set(a.role, arr);
  }
  const ordered: CastGroup[] = [];
  for (const k of ROLE_BUCKETS) {
    const items = map.get(k);
    if (items && items.length > 0) ordered.push({ role: k, items });
    map.delete(k);
  }
  for (const [k, items] of map) {
    if (items.length > 0) ordered.push({ role: k, items });
  }
  return ordered;
}

const CastCard = memo(function CastCard({
  artist,
  roleLabel,
}: {
  artist: AlbumArtist;
  roleLabel: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/artist/${encodeURIComponent(artist.id)}`)}
      className="flex items-center gap-3 p-2.5 ui-icon rounded-xl cursor-pointer text-left"
    >
      <span className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-white/[0.06]">
        <Avatar src={artist.avatar_url} alt={artist.name} size={48} />
      </span>
      <span className="min-w-0 flex flex-col leading-tight">
        <span className="text-[14px] font-semibold text-white truncate">{artist.name}</span>
        <span className="text-[12px] text-white/50">{roleLabel}</span>
      </span>
    </button>
  );
});

const CastRow = memo(function CastRow({ role, items }: { role: string; items: AlbumArtist[] }) {
  const { t } = useTranslation();
  const roleLabel = ROLE_LABEL_KEY[role] ? t(ROLE_LABEL_KEY[role]) : role;
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] text-white/50">
        {roleLabel} · {items.length}
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((artist) => (
          <CastCard key={artist.id} artist={artist} roleLabel={roleLabel} />
        ))}
      </div>
    </div>
  );
});

function AlbumCastImpl({ artists }: AlbumCastProps) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupByRole(artists), [artists]);

  if (artists.length === 0) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 mb-4 text-[22px] font-bold text-white">
        <Users size={20} className="text-white/50" />
        {t('album.cast')}
        <span className="text-[15px] font-semibold text-white/40">{artists.length}</span>
      </h2>

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <CastRow key={g.role} role={g.role} items={g.items} />
        ))}
      </div>
    </section>
  );
}

export const AlbumCast = memo(AlbumCastImpl);
