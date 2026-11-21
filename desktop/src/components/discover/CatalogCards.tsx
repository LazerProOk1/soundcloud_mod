import type React from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { CatalogAlbum, CatalogArtist, SpotlightItem } from '../../lib/discover';
import { fc } from '../../lib/formatters';
import { ChevronRight, Disc3 } from '../../lib/icons';
import { Avatar } from '../ui/Avatar';
import { HorizontalScroll } from '../ui/HorizontalScroll';
import { ShelfSkeleton } from '../ui/ShelfSkeleton';

/** Section title with an optional "See all" link and controls on the right. */
export function CatalogSection({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[24px] font-bold tracking-tight text-white">
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A horizontal shelf that shows skeletons while loading. */
export function Shelf({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return <HorizontalScroll>{loading ? <ShelfSkeleton count={7} /> : children}</HorizontalScroll>;
}

/** Pill row used for genres, tags and years. */
export function Pills<T extends string | number>({
  items,
  value,
  onChange,
  label = (v) => String(v),
}: {
  items: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  label?: (v: T) => string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <button
          key={String(item)}
          type="button"
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={`press h-8 rounded-full px-3.5 text-[13px] font-semibold capitalize cursor-pointer ${
            value === item
              ? 'bg-white text-black'
              : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.11] hover:text-white'
          }`}
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}

function Cover({ src, alt, round }: { src?: string; alt: string; round?: boolean }) {
  return (
    <div
      className={`relative aspect-square overflow-hidden bg-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
        round ? 'rounded-full' : 'rounded-md'
      }`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.05]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Disc3 size={36} className="text-white/25" />
        </div>
      )}
    </div>
  );
}

export const AlbumTile = memo(function AlbumTile({
  album,
  className = 'w-[180px] shrink-0',
}: {
  album: CatalogAlbum;
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const kind = t(`artist.kind.${album.type ?? 'album'}`, { defaultValue: album.type ?? '' });
  return (
    <div className={`group flex flex-col gap-3 cursor-pointer select-none ${className}`}>
      <button
        type="button"
        onClick={() => navigate(`/album/${encodeURIComponent(album.id)}`)}
        className="text-left cursor-pointer"
        title={album.title}
      >
        <Cover src={album.cover_url} alt={album.title} />
      </button>
      <div className="min-w-0 px-1">
        <button
          type="button"
          onClick={() => navigate(`/album/${encodeURIComponent(album.id)}`)}
          className="block w-full truncate text-left text-[14px] font-semibold leading-snug text-white/90 hover:text-white cursor-pointer"
        >
          {album.title}
        </button>
        <p className="mt-1 truncate text-[12px] text-white/40">
          {album.primary_artist?.id ? (
            <button
              type="button"
              onClick={() => navigate(`/artist/${encodeURIComponent(album.primary_artist.id)}`)}
              className="hover:text-white/80 hover:underline cursor-pointer"
            >
              {album.primary_artist.name}
            </button>
          ) : (
            album.primary_artist?.name
          )}
          {` · ${kind}`}
          {album.release_year != null && ` · ${album.release_year}`}
        </p>
      </div>
    </div>
  );
});

export const ArtistTile = memo(function ArtistTile({
  artist,
  className = 'w-[160px] shrink-0',
}: {
  artist: CatalogArtist;
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listeners = artist.monthly_listeners ?? 0;
  return (
    <button
      type="button"
      onClick={() => navigate(`/artist/${encodeURIComponent(artist.id)}`)}
      className={`group flex flex-col items-center gap-3 text-center cursor-pointer select-none ${className}`}
    >
      <div className="w-full">
        {artist.avatar_url ? (
          <Cover src={artist.avatar_url} alt={artist.name} round />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center">
            <Avatar alt={artist.name} size={120} />
          </div>
        )}
      </div>
      <div className="w-full min-w-0 px-1">
        <p className="truncate text-[14px] font-semibold text-white/90 group-hover:text-white">
          {artist.name}
        </p>
        <p className="mt-1 truncate text-[12px] text-white/40">
          {listeners > 0 ? t('discover.listeners', { value: fc(listeners) }) : t('discover.artist')}
        </p>
      </div>
    </button>
  );
});

/** Wide spotlight card: big artwork with the name over a dark fade. */
export const SpotlightCard = memo(function SpotlightCard({ item }: { item: SpotlightItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isArtist = item.kind === 'artist';
  const id = isArtist ? item.artist.id : item.album.id;
  const title = isArtist ? item.artist.name : item.album.title;
  const image = isArtist ? item.artist.avatar_url : item.album.cover_url;
  const subtitle = isArtist
    ? t('discover.artist')
    : `${item.album.primary_artist?.name ?? ''} · ${t(`artist.kind.${item.album.type ?? 'album'}`, {
        defaultValue: item.album.type ?? '',
      })}`;
  return (
    <button
      type="button"
      onClick={() => navigate(`/${isArtist ? 'artist' : 'album'}/${encodeURIComponent(id)}`)}
      className="group relative h-[220px] w-[340px] shrink-0 overflow-hidden rounded-xl bg-white/[0.06] text-left cursor-pointer select-none"
    >
      {image ? (
        <img
          src={image}
          alt={title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.04]"
        />
      ) : (
        <Disc3 size={48} className="absolute inset-0 m-auto text-white/20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
          {subtitle}
        </p>
        <p className="mt-1 flex items-center gap-1 truncate text-[20px] font-bold text-white">
          <span className="truncate">{title}</span>
          <ChevronRight
            size={16}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </p>
      </div>
    </button>
  );
});
