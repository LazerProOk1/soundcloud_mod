import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Disc3, Loader2 } from '../../lib/icons';
import type { ArtistAlbum } from './types';
import { useArtistAlbums } from './useArtistData';

interface ArtistAlbumsTabProps {
  artistId: string;
}

type Bucket = { year: number | null; items: ArtistAlbum[] };

function bucketByYear(items: ArtistAlbum[]): Bucket[] {
  const byYear = new Map<number | 'unknown', ArtistAlbum[]>();
  for (const a of items) {
    const k = a.release_year ?? 'unknown';
    const arr = byYear.get(k) ?? [];
    arr.push(a);
    byYear.set(k, arr);
  }
  const known: Bucket[] = [];
  for (const [k, arr] of byYear) {
    if (k === 'unknown') continue;
    known.push({ year: k as number, items: arr });
  }
  known.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const unknown = byYear.get('unknown');
  if (unknown && unknown.length > 0) known.push({ year: null, items: unknown });
  return known;
}

function ArtistAlbumsTabImpl({ artistId }: ArtistAlbumsTabProps) {
  const { t } = useTranslation();
  const query = useArtistAlbums(artistId);
  const items = query.data ?? [];
  const buckets = useMemo(() => bucketByYear(items), [items]);

  if (query.isLoading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 size={28} className="text-white/20 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.04]">
          <Disc3 size={24} className="text-white/15" />
        </div>
        <p className="text-white/30 text-sm">{t('artist.noAlbums')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12 py-2">
      {buckets.map((bucket, idx) => (
        <YearGroup key={bucket.year ?? `unknown-${idx}`} year={bucket.year} items={bucket.items} />
      ))}
    </div>
  );
}

const YearGroup = memo(({ year, items }: { year: number | null; items: ArtistAlbum[] }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col md:flex-row md:gap-8 gap-4">
      {/* Year marker */}
      <div className="md:w-[200px] md:shrink-0 flex md:flex-col md:items-end items-center md:sticky md:top-24 self-start">
        <div className="flex items-baseline gap-3 md:flex-col md:items-end md:gap-1 min-w-0 max-w-full">
          <span className="font-black leading-none tabular-nums tracking-tight whitespace-nowrap text-white text-[clamp(40px,6vw,64px)]">
            {year ?? '∞'}
          </span>
          <span className="text-[12px] text-white/45 md:text-right whitespace-nowrap">
            {year != null ? t('artist.releaseYear') : t('artist.unknownYear')} · {items.length}
          </span>
        </div>
      </div>

      {/* Albums grid */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
        {items.map((al) => (
          <AlbumCard key={al.id} album={al} />
        ))}
      </div>
    </div>
  );
});

const AlbumCard = memo(({ album }: { album: ArtistAlbum }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const kind = (album.type ?? 'album').toLowerCase();
  const kindLabel = t(`artist.kind.${kind}`, { defaultValue: kind });

  return (
    <button
      type="button"
      onClick={() => navigate(`/album/${encodeURIComponent(album.id)}`)}
      className="group relative flex flex-col gap-2 text-left p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.06]"
    >
      <div className="aspect-square rounded-md overflow-hidden relative bg-white/[0.06]">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-full h-full object-cover"
            decoding="async"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 size={40} className="text-white/15" />
          </div>
        )}
      </div>
      <div className="px-1 min-w-0">
        <p className="text-[14px] font-semibold text-white truncate">{album.title}</p>
        <p className="text-[13px] text-white/55 truncate">
          {album.role === 'primary' ? kindLabel : t('artist.featured')}
          {album.release_year != null && ` · ${album.release_year}`}
        </p>
      </div>
    </button>
  );
});

export const ArtistAlbumsTab = memo(ArtistAlbumsTabImpl);
