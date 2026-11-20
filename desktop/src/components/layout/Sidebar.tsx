import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { art } from '../../lib/formatters';
import { useMyPlaylists, usePlaylistCover } from '../../lib/hooks';
import {
  AudioLines,
  Clock,
  Download,
  Heart,
  Library,
  ListMusic,
  PanelLeftClose,
  PanelLeftOpen,
} from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import { useSettingsStore } from '../../stores/settings';
import { Avatar } from '../ui/Avatar';

/**
 * "My library" sidebar (Spotify / Justify style): top-level navigation lives in the
 * titlebar, the sidebar only lists the user's music — wave, likes, history, offline
 * and playlists — as big rows with artwork.
 */

interface RowProps {
  to: string;
  title: string;
  subtitle?: string;
  collapsed: boolean;
  tile: React.ReactNode;
}

const Row = React.memo(function Row({ to, title, subtitle, collapsed, tile }: RowProps) {
  const location = useLocation();
  // Match path *and* query (?tab=likes vs ?tab=history both live on /library).
  const [path, query = ''] = to.split('?');
  const isActive =
    location.pathname === path && (!query || location.search.replace(/^\?/, '').includes(query));
  return (
    <Link
      to={to}
      title={collapsed ? title : undefined}
      className={`group flex items-center gap-3 rounded-lg p-1.5 transition-colors duration-150 ${
        collapsed ? 'justify-center' : ''
      } ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
    >
      <div className="w-11 h-11 rounded-md overflow-hidden shrink-0 bg-white/[0.06]">{tile}</div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[14px] font-semibold ${isActive ? 'text-accent' : 'text-white/90'}`}
          >
            {title}
          </p>
          {subtitle && <p className="truncate text-[12px] text-white/45">{subtitle}</p>}
        </div>
      )}
    </Link>
  );
});

const gradientTile = (from: string, to: string, icon: React.ReactNode) => (
  <div
    className="w-full h-full flex items-center justify-center text-white"
    style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
  >
    {icon}
  </div>
);

export const Sidebar = React.memo(() => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const cachedCount = useCachedUrnsStore((s) => s.urns.size);
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const { playlists } = useMyPlaylists(50);

  return (
    <aside
      data-ui="sidebar"
      className="liquid-panel-heavy shrink-0 flex flex-col m-2 mr-0 rounded-xl overflow-hidden transition-[width] duration-300 ease-[var(--ease-spring)]"
      // Full height minus the 8px margins: `h-full` + margin pushed the profile row off the bottom.
      style={{ width: collapsed ? 72 : 280, height: 'calc(100% - 16px)', boxShadow: 'none' }}
    >
      {/* "My library" header doubles as the collapse toggle (like Spotify). */}
      <button
        type="button"
        onClick={toggleSidebar}
        title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
        className={`group flex items-center gap-2.5 mx-2 mt-2 mb-1 px-2 h-11 rounded-lg text-white/85 hover:text-white hover:bg-white/[0.06] cursor-pointer ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span className="relative w-5 h-5 shrink-0">
          <Library
            size={20}
            className="absolute inset-0 transition-opacity group-hover:opacity-0"
          />
          {collapsed ? (
            <PanelLeftOpen
              size={20}
              className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            />
          ) : (
            <PanelLeftClose
              size={20}
              className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
        </span>
        {!collapsed && <span className="text-[15px] font-bold">{t('sidebar.myLibrary')}</span>}
      </button>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-2 flex flex-col gap-0.5">
        <Row
          to="/home"
          title={t('nav.soundwave')}
          subtitle={t('sidebar.waveSubtitle')}
          collapsed={collapsed}
          tile={gradientTile('#ff5500', '#a21caf', <AudioLines size={20} />)}
        />
        <Row
          to="/liked"
          title={t('library.likedTracks')}
          subtitle={t('sidebar.playlist')}
          collapsed={collapsed}
          tile={gradientTile('#4f46e5', '#a5b4fc', <Heart size={18} fill="currentColor" />)}
        />
        <Row
          to="/history"
          title={t('library.history')}
          collapsed={collapsed}
          tile={gradientTile('#0f766e', '#5eead4', <Clock size={18} />)}
        />
        <Row
          to="/offline"
          title={t('nav.offline')}
          subtitle={cachedCount > 0 ? t('sidebar.cachedCount', { count: cachedCount }) : undefined}
          collapsed={collapsed}
          tile={gradientTile('#15803d', '#86efac', <Download size={18} />)}
        />

        {playlists.length > 0 && !collapsed && <div className="h-px bg-white/[0.06] my-2 mx-2" />}
        {playlists.map((p) => (
          <Row
            key={p.urn}
            to={`/playlist/${encodeURIComponent(p.urn)}`}
            title={p.title}
            subtitle={t('sidebar.playlistTracks', { count: p.track_count ?? 0 })}
            collapsed={collapsed}
            tile={
              <PlaylistTile urn={p.urn} artwork={p.artwork_url ?? p.tracks?.[0]?.artwork_url} />
            }
          />
        ))}
      </div>

      {user && (
        <div className="px-2 pb-2 pt-1 border-t border-white/[0.05]">
          <NavLink
            to={`/user/${encodeURIComponent(user.urn)}`}
            title={collapsed ? user.username : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 p-1.5 rounded-lg transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`
            }
          >
            <Avatar src={user.avatar_url} alt={user.username} size={28} />
            {!collapsed && (
              <span className="text-[13px] text-white/80 truncate font-medium">
                {user.username}
              </span>
            )}
          </NavLink>
        </div>
      )}
    </aside>
  );
});

/** Playlist artwork; playlists without their own cover use the first track's art. */
export function PlaylistTile({ urn, artwork }: { urn: string; artwork?: string | null }) {
  const cover = art(usePlaylistCover(urn, artwork), 't200x200');
  return cover ? (
    <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
  ) : (
    <div className="w-full h-full flex items-center justify-center text-white/40">
      <ListMusic size={18} />
    </div>
  );
}
