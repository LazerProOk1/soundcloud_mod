import { useTranslation } from 'react-i18next';
import { monthYear } from '../../lib/formatters';
import { Calendar, Globe, Heart, Music, User, Users } from '../../lib/icons';
import { PILL_BTN } from '../ui/buttonClass';
import { CopyLinkButton } from '../ui/CopyLinkButton';
import { GlassHeroPanel } from '../ui/GlassHeroPanel';
import { AvatarArtifact } from './AvatarArtifact';
import { FollowBtn } from './FollowBtn';
import { StatOrb } from './StatOrb';
import { getWebIcon, InfoChip, ProChip, VerifiedBadge } from './UserChips';

interface IdentityHubProps {
  user: {
    urn: string;
    username: string;
    full_name?: string | null;
    description?: string | null;
    avatar_url?: string | null;
    permalink_url?: string | null;
    plan?: string | null;
    verified?: boolean;
    created_at?: string | null;
    city?: string | null;
    country_code?: string | null;
    followers_count?: number | null;
    followings_count?: number | null;
    track_count?: number | null;
    public_favorites_count?: number | null;
  };
  webProfiles:
    | Array<{ id: number | string; url: string; service: string; title: string }>
    | undefined;
  isOwnProfile: boolean;
}

export function IdentityHub({ user, webProfiles, isOwnProfile }: IdentityHubProps) {
  const { t } = useTranslation();
  const formattedDate = monthYear(user.created_at);
  const country = [user.city, user.country_code].filter(Boolean).join(', ');

  return (
    <GlassHeroPanel>
      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-end">
        <AvatarArtifact username={user.username} avatarUrl={user.avatar_url} />

        <div className="flex-1 min-w-0 flex flex-col gap-4 text-center lg:text-left">
          <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
            {user.verified && <VerifiedBadge title={t('user.verifiedArtist')} />}
            {user.plan && user.plan !== 'Free' && <ProChip plan={user.plan} />}
            {formattedDate && <InfoChip icon={<Calendar size={12} />}>{formattedDate}</InfoChip>}
            {country && <InfoChip icon={<Globe size={12} />}>{country}</InfoChip>}
          </div>

          <div className="flex flex-col items-center lg:items-start gap-2">
            <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight text-white break-words max-w-full">
              {user.username}
            </h1>
            {user.full_name && user.full_name !== user.username && (
              <p className="text-[14px] text-white/50 font-medium">{user.full_name}</p>
            )}
          </div>

          {user.description && (
            <p className="text-[14px] text-white/65 leading-relaxed max-w-2xl line-clamp-3 hover:line-clamp-none">
              {user.description}
            </p>
          )}

          {webProfiles && webProfiles.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              {webProfiles.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={PILL_BTN}
                >
                  {getWebIcon(link.service)}
                  <span className="truncate max-w-[160px]">{link.title}</span>
                </a>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1 justify-center lg:justify-start">
            {!isOwnProfile && <FollowBtn userUrn={user.urn} />}
            {user.permalink_url && <CopyLinkButton url={user.permalink_url} />}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 justify-center lg:justify-start">
        <StatOrb
          icon={<Users size={14} />}
          value={user.followers_count}
          label={t('user.statFollowers', { count: user.followers_count ?? 0 })}
        />
        <StatOrb
          icon={<User size={14} />}
          value={user.followings_count}
          label={t('user.statFollowing', { count: user.followings_count ?? 0 })}
        />
        <StatOrb
          icon={<Music size={14} />}
          value={user.track_count}
          label={t('user.statTracks', { count: user.track_count ?? 0 })}
        />
        <StatOrb
          icon={<Heart size={14} />}
          value={user.public_favorites_count}
          label={t('user.statLikes', { count: user.public_favorites_count ?? 0 })}
        />
      </div>
    </GlassHeroPanel>
  );
}
