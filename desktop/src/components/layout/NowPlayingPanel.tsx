import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { art, fc } from '../../lib/formatters';
import { useUser } from '../../lib/hooks';
import { Ellipsis, Music, PanelRight, X } from '../../lib/icons';
import { getArtistTarget, useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { openTrackMenu } from '../../lib/useTrackContextMenu';
import { type Track, usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';
import { LikeButton } from '../music/LikeButton';

/**
 * Spotify-style "Now playing" column on the right: big cover, title, artist card
 * and the next track. Toggled from the player bar; state persists in settings.
 */

const iconBtn =
  'w-8 h-8 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer';

const NextUp = React.memo(function NextUp({ onOpenQueue }: { onOpenQueue: () => void }) {
  const { t } = useTranslation();
  const next = usePlayerStore((s) => s.queue[s.queueIndex + 1] as Track | undefined);
  if (!next) return null;
  const cover = art(next.artwork_url, 't200x200');
  return (
    <section className="glass-flat rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-white/90">{t('nowPlaying.nextUp')}</h3>
        <button
          type="button"
          onClick={onOpenQueue}
          className="text-[12px] font-semibold text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          {t('nowPlaying.openQueue')}
        </button>
      </div>
      <button
        type="button"
        onClick={() => usePlayerStore.getState().next()}
        onContextMenu={(e) => openTrackMenu(e, next)}
        className="w-full flex items-center gap-3 p-1.5 -m-1.5 rounded-xl hover:bg-white/[0.05] transition-colors text-left cursor-pointer"
      >
        <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white/[0.05]">
          {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white/90 truncate">{next.title}</p>
          <p className="text-[12px] text-white/45 truncate">{next.user?.username}</p>
        </div>
      </button>
    </section>
  );
});

const AboutArtist = React.memo(function AboutArtist({ track }: { track: Track }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const artist = useArtistDisplay(track);
  const { data: user } = useUser(track.user?.urn);
  const avatar = art(user?.avatar_url ?? track.user?.avatar_url, 't500x500');
  const target = getArtistTarget(track) ?? `/user/${encodeURIComponent(track.user.urn)}`;

  return (
    <section className="glass-flat rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => navigate(target)}
        className="relative block w-full aspect-[4/3] overflow-hidden cursor-pointer group/artist"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover/artist:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full bg-white/[0.04]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute left-4 top-3 text-[13px] font-bold text-white drop-shadow">
          {t('nowPlaying.aboutArtist')}
        </span>
      </button>
      <div className="p-4 space-y-2">
        <p className="text-[16px] font-bold text-white truncate">{artist.primary}</p>
        {user?.followers_count != null && (
          <p className="text-[12px] text-white/50">
            {t('nowPlaying.followers', { count: fc(user.followers_count) })}
          </p>
        )}
        {user?.description && (
          <p className="text-[12px] leading-relaxed text-white/60 line-clamp-4 whitespace-pre-line">
            {user.description}
          </p>
        )}
      </div>
    </section>
  );
});

export const NowPlayingPanel = React.memo(function NowPlayingPanel({
  onOpenQueue,
}: {
  onOpenQueue: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const track = usePlayerStore((s) => s.currentTrack);
  const close = useSettingsStore((s) => s.setNowPlayingPanel);
  const title = useDisplayTitle(track ?? ({ title: '' } as Track));
  const artist = useArtistDisplay(track ?? ({} as Track));

  if (!track) return null;
  const cover = art(track.artwork_url, 't500x500');
  const artistTarget = getArtistTarget(track);

  return (
    <aside
      data-ui="now-playing"
      className="liquid-panel-heavy animate-panel-slide-in hidden lg:block shrink-0 w-[290px] xl:w-[340px] h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
      style={{ borderLeft: '1px solid rgba(255,255,255,0.055)', boxShadow: 'none' }}
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-white truncate">{t('nowPlaying.title')}</h2>
          <div className="flex items-center">
            <button
              type="button"
              title={t('trackMenu.menuLabel')}
              onClick={(e) => openTrackMenu(e, track)}
              className={iconBtn}
            >
              <Ellipsis size={18} />
            </button>
            <button
              type="button"
              title={t('nowPlaying.hide')}
              onClick={() => close(false)}
              className={iconBtn}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          className="group/cover aspect-square rounded-2xl overflow-hidden bg-white/[0.04] shadow-[0_20px_50px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06] cursor-pointer"
          onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
          onContextMenu={(e) => openTrackMenu(e, track)}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover transition-transform duration-500 ease-[var(--ease-spring)] group-hover/cover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <Music size={48} />
            </div>
          )}
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
              className="block max-w-full text-left text-[22px] leading-tight font-bold text-white truncate hover:underline cursor-pointer"
            >
              {title}
            </button>
            <button
              type="button"
              disabled={!artistTarget}
              onClick={() => artistTarget && navigate(artistTarget)}
              className="block max-w-full text-left text-[14px] text-white/55 truncate mt-1 enabled:hover:text-white enabled:hover:underline enabled:cursor-pointer"
            >
              {artist.primary}
            </button>
          </div>
          <div className="pt-1 shrink-0">
            <LikeButton track={track} variant="always" title={t('track.likes')} />
          </div>
        </div>

        <AboutArtist track={track} />
        <NextUp onOpenQueue={onOpenQueue} />
      </div>
    </aside>
  );
});

export const NowPlayingPanelButton = React.memo(function NowPlayingPanelButton({
  className,
}: {
  className: (active: boolean) => string;
}) {
  const { t } = useTranslation();
  const set = useSettingsStore((s) => s.setNowPlayingPanel);
  const open = useSettingsStore((s) => s.nowPlayingPanel);
  return (
    <button
      type="button"
      title={t('nowPlaying.title')}
      onClick={() => set(!open)}
      className={className(open)}
    >
      <PanelRight size={16} />
    </button>
  );
});
