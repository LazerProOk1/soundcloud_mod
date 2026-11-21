import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Globe, ListMusic, MicVocal, Music, Users } from '../../lib/icons';
import { PILL_BTN } from '../ui/buttonClass';
import { GlassHeroPanel } from '../ui/GlassHeroPanel';
import { AvatarArtifact } from '../user/AvatarArtifact';
import { StatOrb } from '../user/StatOrb';
import { InfoChip, VerifiedBadge } from '../user/UserChips';
import { SocialIcon, socialLabel } from './socials';
import type { ArtistDetail } from './types';

const SocialChip = memo(({ kind, url, title }: { kind: string; url: string; title: string }) => (
  <a href={url} target="_blank" rel="noreferrer" className={PILL_BTN}>
    <SocialIcon kind={kind} size={14} />
    <span className="truncate max-w-[140px]">{title}</span>
  </a>
));

const ScAccountChip = memo(
  ({ scUserId, role, verified }: { scUserId: string; role: string; verified: boolean }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const label =
      role === 'main' ? t('artist.mainAccount') : role === 'demo' ? t('artist.demoAccount') : role;
    return (
      <button
        type="button"
        onClick={() => navigate(`/user/${encodeURIComponent(`soundcloud:users:${scUserId}`)}`)}
        className={PILL_BTN}
        title={role}
      >
        <SocialIcon kind="soundcloud" size={14} className="text-orange-400" />
        <span className="truncate max-w-[120px]">{label}</span>
        {verified && <Check size={12} className="text-emerald-400 shrink-0" strokeWidth={3} />}
      </button>
    );
  },
);

function ArtistHeroImpl({ artist }: { artist: ArtistDetail }) {
  const { t } = useTranslation();
  const [bioExpanded, setBioExpanded] = useState(false);

  return (
    <GlassHeroPanel>
      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-end">
        <AvatarArtifact username={artist.name} avatarUrl={artist.avatar_url} />

        <div className="flex-1 min-w-0 flex flex-col gap-4 text-center lg:text-left">
          <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
            {artist.confidence >= 0.7 && (
              <VerifiedBadge
                title={t('track.verifiedArtist', { confidence: artist.confidence.toFixed(2) })}
              />
            )}
            <InfoChip icon={<MicVocal size={12} />}>{t('artist.title')}</InfoChip>
            {artist.country && <InfoChip icon={<Globe size={12} />}>{artist.country}</InfoChip>}
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight text-white break-words max-w-full">
            {artist.name}
          </h1>

          {artist.bio && (
            <button
              type="button"
              onClick={() => setBioExpanded((v) => !v)}
              className="group text-left cursor-pointer"
            >
              <p
                className={`text-[14px] text-white/65 leading-relaxed max-w-2xl ${
                  bioExpanded ? '' : 'line-clamp-2'
                }`}
              >
                {artist.bio}
              </p>
              <span className="inline-flex items-center gap-1 mt-1 text-[12px] font-semibold text-white/40 group-hover:text-white/70">
                <ChevronDown
                  size={12}
                  className={`transition-transform ${bioExpanded ? 'rotate-180' : ''}`}
                />
                {bioExpanded ? t('common.collapse') : t('common.expand')}
              </span>
            </button>
          )}

          {(artist.socials.length > 0 || artist.sc_accounts.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              {artist.sc_accounts.map((acc) => (
                <ScAccountChip
                  key={acc.sc_user_id}
                  scUserId={acc.sc_user_id}
                  role={acc.role}
                  verified={acc.verified}
                />
              ))}
              {artist.socials.map((s) => (
                <SocialChip key={s.url} kind={s.kind} url={s.url} title={socialLabel(s.kind)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 justify-center lg:justify-start">
        <StatOrb
          icon={<Music size={14} />}
          value={artist.track_count_primary}
          label={t('artist.statsTracks')}
        />
        <StatOrb
          icon={<MicVocal size={14} />}
          value={artist.track_count_featured}
          label={t('artist.statsFeatured')}
        />
        <StatOrb
          icon={<ListMusic size={14} />}
          value={artist.album_count}
          label={t('artist.statsAlbums')}
        />
        <StatOrb
          icon={<Users size={14} />}
          value={artist.related_artists.length}
          label={t('artist.statsRelated')}
        />
      </div>
    </GlassHeroPanel>
  );
}

export const ArtistHero = memo(ArtistHeroImpl);
