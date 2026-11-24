import { useQueryClient } from '@tanstack/react-query';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PlaylistTile } from '../components/layout/Sidebar';
import { TrackTableRow } from '../components/music/TrackTableRow';
import { LetterAvatar } from '../components/ui/LetterAvatar';
import { isUrnDisliked, toggleDislike, useDislikedCount, useDislikedTracks } from '../lib/dislikes';
import { art } from '../lib/formatters';
import {
  type Playlist,
  type SCUser,
  useMyFollowings,
  useMyLikedPlaylists,
  useMyPlaylists,
} from '../lib/hooks';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Download,
  Heart,
  LayoutGrid,
  List,
  Loader2,
  Search as SearchIcon,
  ThumbsDown,
  X,
} from '../lib/icons';
import { useAuthStore } from '../stores/auth';
import { importCounts, useImportsStore } from '../stores/imports';
import { useLibraryLocalStore } from '../stores/library-local';
import type { Track } from '../stores/player';

type Kind = 'playlist' | 'artist' | 'album' | 'import';
type Filter = 'all' | Kind;
type Sort = 'recent' | 'az';
type View = 'grid' | 'list';

interface Item {
  key: string;
  kind: Kind;
  title: string;
  subtitle: string;
  to: string;
  playlist?: Playlist;
  user?: SCUser;
}

const ALBUM_TYPES = /album|^ep$|single|compilation/i;

/** Remembered per device: how the library is shown. */
const VIEW_KEY = 'sc-library-view';

/** Loads every page of an infinite list (collections are small). */
function useAllPages(q: {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => unknown;
}) {
  useEffect(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);
}

/* ── Page ─────────────────────────────────────────────────── */

export const Library = React.memo(() => {
  const user = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  if (!user) return null;
  return params.get('show') === 'dislikes' ? <DislikesView /> : <Collection />;
});

/** Everything you keep, except single tracks (those live in Liked tracks and History). */
function Collection() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query).trim().toLowerCase();

  const own = useMyPlaylists(50);
  const liked = useMyLikedPlaylists(50);
  const follows = useMyFollowings(50);
  useAllPages(own);
  useAllPages(liked);
  useAllPages(follows);
  const imports = useImportsStore((s) => s.jobs);
  const loading = own.isLoading || liked.isLoading || follows.isLoading;

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const job of imports) {
      const c = importCounts(job);
      out.push({
        key: job.id,
        kind: 'import',
        title: job.title,
        subtitle:
          job.status === 'done'
            ? t('import.sidebarDone', { found: c.found, total: c.total })
            : t('import.sidebarProgress', { done: c.done, total: c.total }),
        to: `/import/${job.id}`,
      });
    }
    const ownUrns = new Set(own.playlists.map((p) => p.urn));
    const ownSorted = [...own.playlists].sort(
      (a, b) =>
        Date.parse(b.last_modified || b.created_at) - Date.parse(a.last_modified || a.created_at),
    );
    for (const p of ownSorted) {
      out.push({
        key: p.urn,
        kind: 'playlist',
        title: p.title,
        subtitle: t('library.byYou'),
        to: `/playlist/${encodeURIComponent(p.urn)}`,
        playlist: p,
      });
    }
    for (const p of liked.playlists) {
      if (ownUrns.has(p.urn)) continue;
      const album = ALBUM_TYPES.test(p.playlist_type ?? '');
      out.push({
        key: p.urn,
        kind: album ? 'album' : 'playlist',
        title: p.title,
        subtitle: t(album ? 'library.albumBy' : 'library.playlistBy', {
          name: p.user?.username ?? '',
        }),
        to: `/playlist/${encodeURIComponent(p.urn)}`,
        playlist: p,
      });
    }
    for (const u of follows.users) {
      out.push({
        key: u.urn,
        kind: 'artist',
        title: u.username,
        subtitle: t('library.artist'),
        to: `/user/${encodeURIComponent(u.urn)}`,
        user: u,
      });
    }
    return out;
  }, [imports, own.playlists, liked.playlists, follows.users, t]);

  const shown = useMemo(() => {
    let list = filter === 'all' ? items : items.filter((i) => i.kind === filter);
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q),
      );
    }
    if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [items, filter, q, sort]);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { playlist: 0, artist: 0, album: 0, import: 0 };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: t('library.all') },
    { id: 'playlist', label: t('library.playlists') },
    { id: 'artist', label: t('library.artists') },
    { id: 'album', label: t('library.albums') },
    { id: 'import', label: t('library.imports') },
  ];

  const setViewSaved = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-device convenience only */
    }
  };

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-[34px] font-extrabold tracking-tight text-white">
          {t('sidebar.myLibrary')}
        </h1>
        <p className="mt-1 text-[14px] text-white/55">
          {(['playlist', 'artist', 'album'] as const)
            .filter((k) => counts[k] > 0)
            .map((k) => t(`library.count.${k}`, { count: counts[k] }))
            .join(' · ')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {chips.map((c) =>
          c.id === 'all' || counts[c.id] > 0 ? (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`h-9 px-4 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${
                filter === c.id ? 'ui-selected' : 'bar-control text-white'
              }`}
            >
              {c.label}
            </button>
          ) : null,
        )}
        <div className="flex-1" />
        <div className="relative w-[240px] max-w-full">
          <SearchIcon
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.searchHere')}
            className="h-9 w-full rounded-full bar-control pl-9 pr-8 text-[13px] text-white outline-none placeholder:text-white/35 focus:outline focus:outline-white/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              title={t('common.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSort(sort === 'recent' ? 'az' : 'recent')}
          className="h-9 px-4 rounded-full bar-control text-[13px] font-semibold text-white cursor-pointer"
        >
          {sort === 'recent' ? t('library.sortRecent') : t('library.sortAz')}
        </button>
        <div className="flex rounded-full ui-track p-0.5">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewSaved(v)}
              title={t(v === 'grid' ? 'library.viewGrid' : 'library.viewList')}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
                view === v ? 'ui-selected' : 'text-white/60 hover:text-white'
              }`}
            >
              {v === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-20 text-white/30">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-white/40">
          {q ? t('library.noMatches') : t('library.empty')}
        </p>
      ) : view === 'grid' ? (
        <div className="grid gap-x-4 gap-y-6 grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
          {shown.map((item) => (
            <GridCard key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {shown.map((item) => (
            <ListRow key={item.key} item={item} />
          ))}
        </div>
      )}

      <MoreLinks />
    </div>
  );
}

/* ── Items ────────────────────────────────────────────────── */

function Cover({ item, className }: { item: Item; className: string }) {
  if (item.kind === 'import') {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gradient-to-br from-[#ff5500] to-[#7c3aed] text-white`}
      >
        <Download size={28} />
      </div>
    );
  }
  if (item.user)
    return (
      <LetterAvatar
        name={item.user.username}
        src={art(item.user.avatar_url, 't300x300')}
        className={className}
      />
    );
  const p = item.playlist;
  return (
    <div className={`${className} overflow-hidden bg-white/[0.06]`}>
      {p && <PlaylistTile urn={p.urn} artwork={p.artwork_url ?? p.tracks?.[0]?.artwork_url} />}
    </div>
  );
}

function GridCard({ item }: { item: Item }) {
  return (
    <Link
      to={item.to}
      className="group block p-2 -m-2 rounded-xl hover:bg-white/[0.05] transition-colors"
    >
      <Cover
        item={item}
        className={`aspect-square w-full shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
          item.kind === 'artist' ? 'rounded-full' : 'rounded-lg'
        }`}
      />
      <p className="mt-3 truncate text-[14px] font-semibold text-white">{item.title}</p>
      <p className="mt-0.5 truncate text-[13px] text-white/50">{item.subtitle}</p>
    </Link>
  );
}

function ListRow({ item }: { item: Item }) {
  return (
    <Link
      to={item.to}
      className="flex items-center gap-3 h-14 px-2 rounded-lg hover:bg-white/[0.05] transition-colors"
    >
      <Cover
        item={item}
        className={`w-11 h-11 shrink-0 ${item.kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}
      />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-white">{item.title}</span>
        <span className="block truncate text-[13px] text-white/50">{item.subtitle}</span>
      </span>
    </Link>
  );
}

/** Single tracks have their own pages; dislikes live only here. */
function MoreLinks() {
  const { t } = useTranslation();
  // The server's count once its ids are in; the device's own list until then (or offline).
  const local = useLibraryLocalStore((s) => s.disliked.length);
  const dislikes = Math.max(useDislikedCount(), local);
  const links = [
    {
      to: '/liked',
      icon: <Heart size={16} fill="currentColor" />,
      label: t('library.likedTracks'),
    },
    { to: '/history', icon: <Clock size={16} />, label: t('library.history') },
    {
      to: '/library?show=dislikes',
      icon: <ThumbsDown size={16} />,
      label: t('library.dislikes'),
      count: dislikes,
    },
  ];
  return (
    <div className="mt-12 pt-6 border-t border-white/[0.06] flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full bar-control text-[13px] font-semibold text-white"
        >
          <span className="text-white/70">{l.icon}</span>
          {l.label}
          {l.count ? <span className="text-white/45 tabular-nums">{l.count}</span> : null}
          <ChevronRight size={14} className="text-white/40" />
        </Link>
      ))}
    </div>
  );
}

/* ── Dislikes ─────────────────────────────────────────────── */

/** A dislikes row plays the picked track on its own. */
const DislikeRow = React.memo(function DislikeRow({
  track,
  index,
}: {
  track: Track;
  index: number;
}) {
  const queue = useMemo(() => [track], [track]);
  return <TrackTableRow track={track} index={index} queue={queue} />;
});

function DislikesView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // The server keeps every dislike (from any client on this account); this device's own list
  // fills in while it loads or without a connection. Removed ones drop out of both.
  const local = useLibraryLocalStore((s) => s.disliked);
  const server = useDislikedTracks();
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    // Server rows can be a moment stale after an undo: drop the ones no longer disliked.
    const fromServer = server.tracks.filter((tr) => isUrnDisliked(tr.urn));
    return [...fromServer, ...local].filter((tr) => {
      if (seen.has(tr.urn)) return false;
      seen.add(tr.urn);
      return true;
    });
  }, [server.tracks, local]);
  useDislikedCount(); // re-render when a dislike is removed
  return (
    <div className="px-8 py-8">
      <Link
        to="/library"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white mb-4"
      >
        <ArrowLeft size={15} />
        {t('sidebar.myLibrary')}
      </Link>
      <h1 className="text-[34px] font-extrabold tracking-tight text-white mb-6">
        {t('library.dislikes')}
      </h1>
      {tracks.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-white/40">{t('library.noDislikes')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {tracks.map((track, i) => (
            <div key={track.urn} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <DislikeRow track={track} index={i} />
              </div>
              <button
                type="button"
                title={t('library.undislike')}
                onClick={() => void toggleDislike(qc, track, false)}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white ui-icon cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
