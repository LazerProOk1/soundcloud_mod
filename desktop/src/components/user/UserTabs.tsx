import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fc } from '../../lib/formatters';
import {
  useInfiniteScroll,
  useUserFollowers,
  useUserFollowings,
  useUserLikedTracks,
  useUserPlaylists,
  useUserPopularTracks,
  useUserTracks,
} from '../../lib/hooks';
import { Loader2, Music } from '../../lib/icons';
import { PlaylistCard } from '../music/PlaylistCard';
import { TrackTableRow } from '../music/TrackTableRow';
import { Avatar } from '../ui/Avatar';
import { VirtualGrid } from '../ui/VirtualGrid';
import { VirtualList } from '../ui/VirtualList';

interface TabWrapperProps {
  isLoading: boolean;
  isEmpty: boolean;
  emptyText?: string;
  /** The request failed: say so and offer a retry, instead of looking like an empty list. */
  onRetry?: () => void;
  children: React.ReactNode;
}

function TabWrapperImpl({ children, isLoading, isEmpty, emptyText, onRetry }: TabWrapperProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[420px]">
      {isLoading ? (
        <div className="py-24 flex justify-center">
          <Loader2 size={28} className="text-white/20 animate-spin" />
        </div>
      ) : isEmpty && onRetry ? (
        <div className="py-24 flex flex-col items-center gap-3">
          <p className="text-[14px] text-white/50">{t('trackList.loadFailed')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="press h-9 rounded-full bar-control px-4 text-[13px] font-semibold text-white/85 cursor-pointer"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : isEmpty ? (
        <div className="py-24 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center ui-card">
            <Music size={24} className="text-white/15" />
          </div>
          <p className="text-white/30 text-sm">{emptyText ?? t('common.empty')}</p>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">{children}</div>
      )}
    </div>
  );
}

export const TabWrapper = React.memo(TabWrapperImpl);

/** A retry handler for a failed query, nothing otherwise. */
const retry = (q: { isError: boolean; refetch: () => unknown }) =>
  q.isError ? () => void q.refetch() : undefined;

export function UserTracksTab({ urn }: { urn: string }) {
  const q = useUserTracks(urn);
  const ref = useInfiniteScroll(!!q.hasNextPage, !!q.isFetchingNextPage, q.fetchNextPage);
  const renderItem = useCallback(
    (track: (typeof q.tracks)[number], i: number) => (
      <TrackTableRow track={track} index={i} queue={q.tracks} />
    ),
    [q.tracks],
  );
  return (
    <TabWrapper isLoading={q.isLoading} isEmpty={q.tracks.length === 0} onRetry={retry(q)}>
      <VirtualList
        items={q.tracks}
        rowHeight={56}
        overscan={8}
        getItemKey={(t) => t.urn}
        renderItem={renderItem}
      />
      <div ref={ref} className="h-16 flex items-center justify-center">
        {q.isFetchingNextPage && <Loader2 size={20} className="text-white/20 animate-spin" />}
      </div>
    </TabWrapper>
  );
}

export function UserPopularTab({ urn }: { urn: string }) {
  const popular = useUserPopularTracks(urn);
  const { data = [], isLoading } = popular;
  const renderItem = useCallback(
    (track: (typeof data)[number], i: number) => (
      <TrackTableRow track={track} index={i} queue={data} />
    ),
    [data],
  );
  return (
    <TabWrapper isLoading={isLoading} isEmpty={data.length === 0} onRetry={retry(popular)}>
      <VirtualList
        items={data}
        rowHeight={56}
        overscan={8}
        getItemKey={(t) => t.urn}
        renderItem={renderItem}
      />
    </TabWrapper>
  );
}

export function UserPlaylistsTab({ urn }: { urn: string }) {
  const q = useUserPlaylists(urn);
  const ref = useInfiniteScroll(!!q.hasNextPage, !!q.isFetchingNextPage, q.fetchNextPage);
  const renderItem = useCallback(
    (p: (typeof q.playlists)[number]) => <PlaylistCard playlist={p} showPlayback />,
    [],
  );
  return (
    <TabWrapper isLoading={q.isLoading} isEmpty={q.playlists.length === 0} onRetry={retry(q)}>
      <VirtualGrid
        items={q.playlists}
        itemHeight={320}
        minColumnWidth={200}
        gap={28}
        overscan={3}
        getItemKey={(p, i) => `${p.urn}-${i}`}
        renderItem={renderItem}
      />
      <div ref={ref} className="h-16 flex items-center justify-center">
        {q.isFetchingNextPage && <Loader2 size={20} className="text-white/20 animate-spin" />}
      </div>
    </TabWrapper>
  );
}

export function UserLikesTab({ urn }: { urn: string }) {
  const q = useUserLikedTracks(urn);
  const ref = useInfiniteScroll(!!q.hasNextPage, !!q.isFetchingNextPage, q.fetchNextPage);
  const renderItem = useCallback(
    (track: (typeof q.tracks)[number], i: number) => (
      <TrackTableRow track={track} index={i} queue={q.tracks} />
    ),
    [q.tracks],
  );
  return (
    <TabWrapper isLoading={q.isLoading} isEmpty={q.tracks.length === 0} onRetry={retry(q)}>
      <VirtualList
        items={q.tracks}
        rowHeight={56}
        overscan={8}
        getItemKey={(t) => t.urn}
        renderItem={renderItem}
      />
      <div ref={ref} className="h-16 flex items-center justify-center">
        {q.isFetchingNextPage && <Loader2 size={20} className="text-white/20 animate-spin" />}
      </div>
    </TabWrapper>
  );
}

export function UserConnectionsTab({
  urn,
  mode,
}: {
  urn: string;
  mode: 'followers' | 'followings';
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const followers = useUserFollowers(mode === 'followers' ? urn : undefined);
  const followings = useUserFollowings(mode === 'followings' ? urn : undefined);
  const q = mode === 'followers' ? followers : followings;
  const ref = useInfiniteScroll(!!q.hasNextPage, !!q.isFetchingNextPage, q.fetchNextPage);

  const renderItem = useCallback(
    (user: (typeof q.users)[number]) => (
      <button
        type="button"
        onClick={() => nav(`/user/${encodeURIComponent(user.urn)}`)}
        className="h-full w-full flex flex-col items-center gap-3 p-6 ui-icon rounded-xl cursor-pointer"
      >
        <div className="w-24 h-24 rounded-full overflow-hidden bg-white/[0.06]">
          <Avatar src={user.avatar_url} alt={user.username} size={96} />
        </div>
        <div className="text-center min-w-0 w-full">
          <p className="text-[14px] font-semibold text-white truncate">{user.username}</p>
          {user.followers_count != null && (
            <p className="text-[12px] text-white/50 mt-1 tabular-nums">
              {fc(user.followers_count)} {t('user.followers')}
            </p>
          )}
        </div>
      </button>
    ),
    [nav, t],
  );

  const emptyText = mode === 'followers' ? t('user.noFollowers') : t('user.noFollowings');

  return (
    <TabWrapper
      isLoading={q.isLoading}
      isEmpty={q.users.length === 0}
      emptyText={emptyText}
      onRetry={retry(q)}
    >
      <VirtualGrid
        items={q.users}
        itemHeight={220}
        minColumnWidth={200}
        gap={20}
        overscan={3}
        getItemKey={(u) => u.urn}
        renderItem={renderItem}
      />
      <div ref={ref} className="h-16 flex items-center justify-center">
        {q.isFetchingNextPage && <Loader2 size={20} className="text-white/20 animate-spin" />}
      </div>
    </TabWrapper>
  );
}
