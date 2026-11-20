import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlaylistCard } from '../components/music/PlaylistCard';
import { TrackTableRow } from '../components/music/TrackTableRow';
import { Segmented } from '../components/ui/Segmented';
import { VirtualList } from '../components/ui/VirtualList';
import { UserCard } from '../components/user/UserCard';
import { api } from '../lib/api';
import {
  useInfiniteScroll,
  useSearchPlaylists,
  useSearchTracks,
  useSearchUsers,
} from '../lib/hooks';
import { Clock, ExternalLink, Loader2, Search as SearchIcon, Trash2, X } from '../lib/icons';
import { useSearchHistoryStore } from '../stores/searchHistory';

/* ── Components ───────────────────────────────────────────── */

/* ── URL Detection ───────────────────────────────────────── */

const SC_URL_RE = /^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\/.+/i;

function isSoundCloudUrl(input: string): boolean {
  return SC_URL_RE.test(input.trim());
}

/* ── Resolve Card ────────────────────────────────────────── */

function ResolveCard({ url, onDone }: { url: string; onDone: () => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    api<{ kind: string; urn: string }>(`/resolve?url=${encodeURIComponent(url.trim())}`)
      .then((res) => {
        if (cancelled) return;
        setState('success');
        const kind = res.kind;
        const urn = res.urn;
        if (kind === 'track') {
          navigate(`/track/${encodeURIComponent(urn)}`);
        } else if (kind === 'playlist' || kind === 'system-playlist') {
          navigate(`/playlist/${encodeURIComponent(urn)}`);
        } else if (kind === 'user') {
          navigate(`/user/${encodeURIComponent(urn)}`);
        } else {
          setErrorMsg(`Unknown resource: ${kind}`);
          setState('error');
        }
        onDone();
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.body ? 'Link not found' : 'Failed to resolve');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [url, navigate, onDone]);

  return (
    <div className="max-w-lg mx-auto mt-12 animate-fade-in-up">
      <div className="glass rounded-3xl p-6 border border-white/[0.06]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
            <ExternalLink size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white/80">
              {state === 'loading'
                ? 'Resolving link...'
                : state === 'error'
                  ? 'Could not resolve'
                  : 'Redirecting...'}
            </p>
            <p className="text-[11px] text-white/30 truncate mt-0.5">{url.trim()}</p>
          </div>
          {state === 'loading' && (
            <Loader2 size={20} className="text-accent animate-spin shrink-0" />
          )}
        </div>
        {state === 'error' && <p className="text-[12px] text-red-400/70 mt-3 pl-16">{errorMsg}</p>}
      </div>
    </div>
  );
}

/* ── Search History ──────────────────────────────────────── */

const SearchHistory = React.memo(function SearchHistory({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) {
  const { t } = useTranslation();
  const { queries, removeQuery, clearHistory } = useSearchHistoryStore();

  if (queries.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in-up">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[12px] font-semibold text-white/30 uppercase tracking-wider">
          {t('search.history')}
        </span>
        <button
          type="button"
          onClick={clearHistory}
          className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/60 transition-colors cursor-pointer"
        >
          <Trash2 size={11} />
          {t('search.clearHistory')}
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {queries.map((query) => (
          <div
            key={query}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all duration-200 cursor-pointer"
            onClick={() => onSelect(query)}
          >
            <Clock size={13} className="text-white/20 shrink-0" />
            <span className="flex-1 text-[13px] text-white/60 group-hover:text-white/90 transition-colors truncate">
              {query}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeQuery(query);
              }}
              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-white/20 hover:text-white/60 transition-all cursor-pointer shrink-0"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

/* ── Isolated Search Results ──────────────────────────────── */

const SearchTracksTab = React.memo(function SearchTracksTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const tracksQuery = useSearchTracks(query);
  const sentinelRef = useInfiniteScroll(
    !!tracksQuery.hasNextPage,
    !!tracksQuery.isFetchingNextPage,
    tracksQuery.fetchNextPage,
  );

  return (
    <div className="min-h-[400px]">
      {tracksQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-white/20" />
        </div>
      ) : tracksQuery.isError ? (
        <div className="py-20 text-center text-red-400/60 text-sm">
          {t('search.error', 'Search failed. Try again.')}
        </div>
      ) : tracksQuery.tracks.length === 0 ? (
        <div className="py-20 text-center text-white/30">{t('search.noResults')}</div>
      ) : (
        <VirtualList
          items={tracksQuery.tracks}
          rowHeight={56}
          overscan={8}
          disabled={tracksQuery.tracks.length < 40}
          getItemKey={(track) => track.urn}
          renderItem={(track, index) => (
            <TrackTableRow track={track} index={index} queue={tracksQuery.tracks} />
          )}
        />
      )}
      <div ref={sentinelRef} className="h-20 flex items-center justify-center mt-6">
        {tracksQuery.isFetchingNextPage && (
          <Loader2 size={24} className="text-white/20 animate-spin" />
        )}
      </div>
    </div>
  );
});

const SearchPlaylistsTab = React.memo(function SearchPlaylistsTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const playlistsQuery = useSearchPlaylists(query);
  const sentinelRef = useInfiniteScroll(
    !!playlistsQuery.hasNextPage,
    !!playlistsQuery.isFetchingNextPage,
    playlistsQuery.fetchNextPage,
  );

  return (
    <div className="min-h-[400px]">
      {playlistsQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-white/20" />
        </div>
      ) : playlistsQuery.isError ? (
        <div className="py-20 flex flex-col items-center gap-4">
          <div className="text-white/25 text-sm">
            {t('search.playlistsUnavailable', 'Поиск по плейлистам временно недоступен')}
          </div>
          <button
            type="button"
            onClick={() => playlistsQuery.refetch()}
            className="px-4 py-2 rounded-xl text-[12px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.09] transition-all duration-200 cursor-pointer"
          >
            {t('common.retry', 'Повторить')}
          </button>
        </div>
      ) : playlistsQuery.playlists.length === 0 ? (
        <div className="py-20 text-center text-white/30">{t('search.noResults')}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {playlistsQuery.playlists.map((p, i) => (
            <PlaylistCard key={`${p.urn}-${i}`} playlist={p} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} className="h-20 flex items-center justify-center mt-6">
        {playlistsQuery.isFetchingNextPage && (
          <Loader2 size={24} className="text-white/20 animate-spin" />
        )}
      </div>
    </div>
  );
});

const SearchUsersTab = React.memo(function SearchUsersTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const usersQuery = useSearchUsers(query);
  const sentinelRef = useInfiniteScroll(
    !!usersQuery.hasNextPage,
    !!usersQuery.isFetchingNextPage,
    usersQuery.fetchNextPage,
  );

  return (
    <div className="min-h-[400px]">
      {usersQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-white/20" />
        </div>
      ) : usersQuery.isError ? (
        <div className="py-20 text-center text-red-400/60 text-sm">
          {t('search.error', 'Search failed. Try again.')}
        </div>
      ) : usersQuery.users.length === 0 ? (
        <div className="py-20 text-center text-white/30">{t('search.noResults')}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {usersQuery.users.map((u, i) => (
            <UserCard key={`${u.urn}-${i}`} user={u} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} className="h-20 flex items-center justify-center mt-6">
        {usersQuery.isFetchingNextPage && (
          <Loader2 size={24} className="text-white/20 animate-spin" />
        )}
      </div>
    </div>
  );
});

const SearchEmpty = React.memo(function SearchEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-[400px] text-white/20">
      <SearchIcon size={48} className="mb-4 opacity-50" />
      <p className="text-sm font-medium">{t('search.hint')}</p>
    </div>
  );
});

/* ── Search Page ──────────────────────────────────────────── */

export const Search = React.memo(() => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q')?.trim() ?? '';
  const [inputValue, setInputValue] = useState(urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(() =>
    urlQuery && !isSoundCloudUrl(urlQuery) ? urlQuery : '',
  );
  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists' | 'users'>('tracks');
  const [resolveUrl, setResolveUrl] = useState<string | null>(() =>
    urlQuery && isSoundCloudUrl(urlQuery) ? urlQuery : null,
  );

  const addQuery = useSearchHistoryStore((s) => s.addQuery);

  useEffect(() => {
    if (!urlQuery) return;
    setInputValue(urlQuery);
    if (isSoundCloudUrl(urlQuery)) {
      setDebouncedQuery('');
      setResolveUrl(urlQuery);
    } else {
      setResolveUrl(null);
      setDebouncedQuery(urlQuery);
      addQuery(urlQuery);
    }
  }, [urlQuery, addQuery]);

  const isUrl = isSoundCloudUrl(inputValue);

  // Debounce logic — skip debounce for URLs
  useEffect(() => {
    if (isUrl) {
      setDebouncedQuery('');
      return;
    }
    setResolveUrl(null);
    const handler = setTimeout(() => {
      const q = inputValue.trim();
      setDebouncedQuery(q);
      if (q) addQuery(q);
    }, 500);
    return () => clearTimeout(handler);
  }, [inputValue, isUrl, addQuery]);

  // Handle Enter for URL resolve
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isUrl) {
      setResolveUrl(inputValue.trim());
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (isSoundCloudUrl(pasted)) {
      e.preventDefault();
      setInputValue(pasted);
      setResolveUrl(pasted.trim());
    }
  };

  const handleHistorySelect = (query: string) => {
    setInputValue(query);
    setDebouncedQuery(query);
  };

  const tabs = [
    { id: 'tracks', label: t('search.tracks') },
    { id: 'playlists', label: t('search.playlists') },
    { id: 'users', label: t('search.users') },
  ] as const;

  const historyQueries = useSearchHistoryStore((s) => s.queries);
  const showHistory = !inputValue && !resolveUrl && historyQueries.length > 0;
  const showEmpty = !inputValue && !resolveUrl && historyQueries.length === 0;

  return (
    <div className="p-6 pb-4 space-y-8">
      {/* Search Input */}
      <div className="relative max-w-2xl mx-auto">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {isUrl ? (
            <ExternalLink size={20} className="text-accent" />
          ) : (
            <SearchIcon size={20} className="text-white/40" />
          )}
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t('search.placeholder')}
          className={`h-12 w-full rounded-full border bg-white/[0.07] pl-12 pr-12 text-[16px] text-white outline-none transition-colors placeholder:text-white/35 hover:bg-white/[0.09] focus:bg-white/[0.09] ${
            isUrl ? 'border-[var(--color-accent)]' : 'border-transparent focus:border-white/25'
          }`}
          autoFocus
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setResolveUrl(null);
            }}
            className="absolute inset-y-0 right-4 flex items-center text-white/30 hover:text-white cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        )}
        {isUrl && !resolveUrl && (
          <div className="absolute -bottom-7 left-0 text-[11px] text-accent/60 flex items-center gap-1.5">
            <ExternalLink size={10} />
            {t('search.pressEnterToOpen')}
          </div>
        )}
      </div>

      {/* Tabs */}
      {debouncedQuery && (
        <div className="flex justify-center">
          <Segmented value={activeTab} options={[...tabs]} onChange={setActiveTab} />
        </div>
      )}

      {/* Resolve */}
      {resolveUrl && (
        <ResolveCard
          url={resolveUrl}
          onDone={() => {
            setInputValue('');
            setResolveUrl(null);
          }}
        />
      )}

      {/* History (when input is empty) */}
      {showHistory && <SearchHistory onSelect={handleHistorySelect} />}

      {/* Empty state (when input is empty and no history) */}
      {showEmpty && <SearchEmpty />}

      {/* Results */}
      {!resolveUrl && debouncedQuery && activeTab === 'tracks' && (
        <SearchTracksTab query={debouncedQuery} />
      )}
      {!resolveUrl && debouncedQuery && activeTab === 'playlists' && (
        <SearchPlaylistsTab query={debouncedQuery} />
      )}
      {!resolveUrl && debouncedQuery && activeTab === 'users' && (
        <SearchUsersTab query={debouncedQuery} />
      )}
    </div>
  );
});
