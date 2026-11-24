import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dur } from '../../lib/formatters';
import { Calendar, Clock, Disc3, ListMusic } from '../../lib/icons';
import { Avatar } from '../ui/Avatar';
import { GlassHeroPanel } from '../ui/GlassHeroPanel';
import { InfoChip } from '../user/UserChips';
import { AlbumCoverArtifact } from './AlbumCoverArtifact';
import { AlbumPlayButton } from './AlbumPlayButton';
import type { AlbumArtist, AlbumDetail } from './types';

const ROLE_LABEL_KEY: Record<string, string> = {
  primary: 'album.primaryArtist',
  featured: 'album.featured',
  remixer: 'album.remixer',
  producer: 'album.producer',
};

const ArtistChip = memo(function ArtistChip({
  id,
  name,
  role,
  avatarUrl,
}: {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const subLabel = ROLE_LABEL_KEY[role] ? t(ROLE_LABEL_KEY[role]) : role;
  return (
    <button
      type="button"
      onClick={() => navigate(`/artist/${encodeURIComponent(id)}`)}
      title={subLabel}
      className="press inline-flex items-center gap-2 h-9 pl-1 pr-4 rounded-full bar-control text-[13px] font-semibold text-white/85 hover:text-white cursor-pointer"
    >
      <span className="w-7 h-7 rounded-full overflow-hidden">
        <Avatar src={avatarUrl} alt={name} size={28} />
      </span>
      {name}
      {role !== 'primary' && <span className="font-normal text-white/45">{subLabel}</span>}
    </button>
  );
});

function AlbumHeroImpl({ album }: { album: AlbumDetail }) {
  const { t } = useTranslation();
  const kind = (album.type ?? 'album').toLowerCase();
  const kindLabel = t(`artist.kind.${kind}`, { defaultValue: kind });

  const { totalDuration, indexedCount, featured } = useMemo(() => {
    let total = 0;
    let indexed = 0;
    const feat: AlbumArtist[] = [];
    for (const tr of album.tracks) {
      total += tr.duration ?? 0;
      if (tr.enrichment?.availability !== 'wanted') indexed++;
    }
    for (const a of album.artists) if (a.role !== 'primary') feat.push(a);
    return { totalDuration: total, indexedCount: indexed, featured: feat };
  }, [album.tracks, album.artists]);

  return (
    <GlassHeroPanel>
      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-end">
        <AlbumCoverArtifact title={album.title} coverUrl={album.cover_url} />

        <div className="flex-1 min-w-0 flex flex-col gap-4 text-center lg:text-left">
          <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
            <InfoChip icon={<Disc3 size={12} />}>{kindLabel}</InfoChip>
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight text-white wrap-break-word max-w-full">
            {album.title}
          </h1>

          {(album.primary_artist || featured.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start items-center">
              {album.primary_artist && (
                <ArtistChip
                  id={album.primary_artist.id}
                  name={album.primary_artist.name}
                  role="primary"
                  avatarUrl={album.primary_artist.avatar_url}
                />
              )}
              {featured.map((a) => (
                <ArtistChip
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  role={a.role}
                  avatarUrl={a.avatar_url}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
            {album.release_year && (
              <InfoChip icon={<Calendar size={12} />}>{album.release_year}</InfoChip>
            )}
            <InfoChip icon={<ListMusic size={12} />}>
              {t('album.tracksCount', { count: album.tracks.length })}
            </InfoChip>
            {totalDuration > 0 && (
              <InfoChip icon={<Clock size={12} />}>{dur(totalDuration)}</InfoChip>
            )}
            {indexedCount < album.tracks.length && (
              <span className="inline-flex items-center h-7 px-3 rounded-full bar-control text-[12px] font-semibold text-white/70">
                {t('album.availability', {
                  indexed: indexedCount,
                  total: album.tracks.length,
                })}
              </span>
            )}
          </div>

          <div className="pt-1 flex justify-center lg:justify-start">
            <AlbumPlayButton tracks={album.tracks} />
          </div>
        </div>
      </div>
    </GlassHeroPanel>
  );
}

export const AlbumHero = memo(AlbumHeroImpl);
