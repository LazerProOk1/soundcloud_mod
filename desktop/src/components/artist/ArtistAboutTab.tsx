import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Globe, MicVocal } from '../../lib/icons';
import { SocialIcon, socialLabel } from './socials';
import type { ArtistDetail } from './types';

interface ArtistAboutTabProps {
  artist: ArtistDetail;
}

function ArtistAboutTabImpl({ artist }: ArtistAboutTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="grid lg:grid-cols-3 gap-6 py-2">
      {/* Bio */}
      <div className="lg:col-span-2 p-6 rounded-2xl ui-card">
        <h3 className="text-[15px] font-bold text-white mb-3 flex items-center gap-2">
          <MicVocal size={15} className="text-white/50" /> {t('artist.aboutTitle')}
        </h3>
        {artist.bio ? (
          <p className="text-[15px] text-white/75 leading-relaxed whitespace-pre-line">
            {artist.bio}
          </p>
        ) : (
          <p className="text-[13px] text-white/30 italic">{t('artist.noBio')}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {artist.country && (
            <Stat icon={<Globe size={12} />} label={t('artist.country')} value={artist.country} />
          )}
          <Stat
            icon={<Check size={12} className="text-emerald-400" />}
            label={t('artist.confidence')}
            value={`${(artist.confidence * 100).toFixed(0)}%`}
          />
        </div>
      </div>

      {/* Side: SC accounts + extra socials */}
      <div className="flex flex-col gap-6">
        {artist.sc_accounts.length > 0 && (
          <div className="p-5 rounded-2xl ui-card">
            <h3 className="text-[15px] font-bold text-white mb-3 flex items-center gap-2">
              <SocialIcon kind="soundcloud" size={15} className="text-orange-400" />
              {t('artist.scAccounts')}
            </h3>
            <div className="flex flex-col gap-2">
              {artist.sc_accounts.map((acc) => (
                <button
                  key={acc.sc_user_id}
                  type="button"
                  onClick={() =>
                    navigate(`/user/${encodeURIComponent(`soundcloud:users:${acc.sc_user_id}`)}`)
                  }
                  className="group flex items-center gap-3 px-3 py-2.5 ui-icon rounded-lg text-left cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-md flex items-center justify-center ui-card">
                    <SocialIcon kind="soundcloud" size={14} className="text-orange-300" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate">
                      {acc.role === 'main'
                        ? t('artist.mainAccount')
                        : acc.role === 'demo'
                          ? t('artist.demoAccount')
                          : acc.role}
                    </p>
                    <p className="text-[12px] text-white/45 tabular-nums truncate">
                      ID {acc.sc_user_id}
                    </p>
                  </div>
                  {acc.verified && <Check size={12} className="text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {artist.socials.length > 0 && (
          <div className="p-5 rounded-2xl ui-card">
            <h3 className="text-[15px] font-bold text-white mb-3">{t('artist.links')}</h3>
            <div className="flex flex-col gap-1">
              {artist.socials.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 px-3 py-2 ui-icon rounded-lg text-[14px] text-white/75 hover:text-white"
                >
                  <span className="w-6 h-6 rounded-md flex items-center justify-center text-white/45 group-hover:text-white">
                    <SocialIcon kind={s.kind} size={13} />
                  </span>
                  <span className="flex-1 truncate font-medium">{socialLabel(s.kind)}</span>
                  <span className="text-[12px] text-white/35">{s.source}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Stat = memo(
  ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bar-control text-[12px] font-semibold">
      <span className="text-white/45">{icon}</span>
      <span className="text-white/50">{label}</span>
      <span className="text-white/85">{value}</span>
    </span>
  ),
);

export const ArtistAboutTab = memo(ArtistAboutTabImpl);
