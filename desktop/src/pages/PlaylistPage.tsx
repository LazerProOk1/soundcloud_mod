import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { TrackListPage } from '../components/music/TrackListPage';
import { TrackTableRow } from '../components/music/TrackTableRow';
import { CopyIconAction } from '../components/ui/CopyIconAction';
import { api } from '../lib/api';
import { art, dateFormatted, fc } from '../lib/formatters';
import {
  useDeletePlaylist,
  useInfiniteScroll,
  usePlaylist,
  usePlaylistTracks,
  useUpdatePlaylistTracks,
} from '../lib/hooks';
import { AlertCircle, Heart, ListMusic, Loader2, Trash2, X } from '../lib/icons';
import { getOfflinePlaylist, rememberPlaylist } from '../lib/offline-index';
import { useAuthStore } from '../stores/auth';
import type { Track } from '../stores/player';

/* ── Playlist Like chip (compact icon+count) ─────────────── */

const PlaylistLikeBtn = React.memo(
  ({ playlistUrn, count }: { playlistUrn: string; count?: number }) => {
    const { t } = useTranslation();
    const { data: likeStatus } = useQuery({
      queryKey: ['likes', 'playlist', playlistUrn],
      queryFn: () => api<{ liked: boolean }>(`/likes/playlists/${encodeURIComponent(playlistUrn)}`),
      staleTime: 1000 * 60 * 5,
    });

    const [liked, setLiked] = useState(false);
    const [localCount, setLocalCount] = useState(count ?? 0);
    const qc = useQueryClient();

    useEffect(() => {
      if (likeStatus) setLiked(likeStatus.liked);
    }, [likeStatus]);
    useEffect(() => {
      setLocalCount(count ?? 0);
    }, [count]);

    const toggle = async () => {
      const next = !liked;
      setLiked(next);
      setLocalCount((c) => c + (next ? 1 : -1));
      try {
        await api(`/likes/playlists/${encodeURIComponent(playlistUrn)}`, {
          method: next ? 'POST' : 'DELETE',
        });
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['likes', 'playlist', playlistUrn] });
          qc.invalidateQueries({ queryKey: ['me', 'likes', 'playlists'] });
        }, 3000);
      } catch {
        setLiked(!next);
        setLocalCount((c) => c + (next ? -1 : 1));
      }
    };

    return (
      <button
        type="button"
        onClick={toggle}
        title={t('track.likes')}
        aria-pressed={liked}
        className={`inline-flex items-center gap-1.5 h-10 px-2 rounded-full text-[13px] font-semibold tabular-nums cursor-pointer transition-colors ${
          liked ? 'text-accent' : 'text-white/60 hover:text-white'
        }`}
      >
        <Heart
          size={22}
          fill={liked ? 'currentColor' : 'none'}
          className={liked ? 'heart-pop' : ''}
        />
        {localCount > 0 && <span>{fc(localCount)}</span>}
      </button>
    );
  },
);

/* ── Copy-link icon button (inline for the rail) ────────── */

/* ── Sortable row for own playlists (drag anywhere on the row) ── */

const SortableRow = React.memo(function SortableRow({
  track,
  index,
  queue,
  onRemove,
  removeLabel,
}: {
  track: Track;
  index: number;
  queue: Track[];
  onRemove: (track: Track) => void;
  removeLabel: string;
}) {
  // No `attributes`: their role=button would get the global press-squeeze on the whole row.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.urn,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 50 : undefined,
        position: 'relative',
      }}
      {...listeners}
    >
      <TrackTableRow
        track={track}
        index={index}
        queue={queue}
        onRemove={onRemove}
        removeLabel={removeLabel}
      />
    </div>
  );
});

/* ── Main: PlaylistPage ──────────────────────────────────── */

export const PlaylistPage = React.memo(() => {
  const { urn } = useParams<{ urn: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myUrn = useAuthStore((s) => s.user?.urn);
  const { data: livePlaylist, isLoading: playlistLoading } = usePlaylist(urn);
  const {
    tracks: playlistTracks,
    isLoading: tracksLoading,
    isError: tracksFailed,
    refetch: refetchTracks,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePlaylistTracks(urn);
  const updateTracks = useUpdatePlaylistTracks(urn);
  const deletePlaylist = useDeletePlaylist();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // The last copy seen online opens the page at once (and without a network); the server
  // answer replaces it when it arrives.
  const { data: saved } = useQuery({
    queryKey: ['offline-playlist', urn],
    queryFn: () => getOfflinePlaylist<NonNullable<typeof livePlaylist>>(urn!),
    enabled: !!urn,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const playlist = livePlaylist ?? saved?.playlist;
  const onlineReady = !!livePlaylist && !playlistLoading && !tracksLoading;
  const isOwner = !!playlist && !!myUrn && playlist.user.urn === myUrn;

  const serverTracks: Track[] = React.useMemo(() => {
    if (onlineReady && livePlaylist) {
      return playlistTracks.length > 0 ? playlistTracks : (livePlaylist.tracks ?? []);
    }
    return saved?.tracks ?? [];
  }, [onlineReady, livePlaylist, playlistTracks, saved]);

  // Save the full list once every page is in, for the next (possibly offline) visit.
  useEffect(() => {
    if (!onlineReady || !livePlaylist || hasNextPage || tracksFailed) return;
    const list = playlistTracks.length > 0 ? playlistTracks : (livePlaylist.tracks ?? []);
    if (list.length > 0) void rememberPlaylist(livePlaylist, list);
  }, [onlineReady, livePlaylist, playlistTracks, hasNextPage, tracksFailed]);

  // Local track order for DnD
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  // Skip server sync while a debounced mutation is pending
  const pendingMutationRef = useRef(false);
  useEffect(() => {
    if (!pendingMutationRef.current) setLocalTracks(serverTracks);
  }, [serverTracks]);

  // Debounced mutation: accumulate rapid changes, only send the latest state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(null!);
  const debouncedUpdate = useCallback(
    (tracks: Track[], successMsg?: string) => {
      pendingMutationRef.current = true;
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        updateTracks.mutate(
          tracks.map((t) => t.urn),
          {
            onSuccess: () => {
              pendingMutationRef.current = false;
              if (successMsg) toast.success(successMsg);
            },
            onError: () => {
              pendingMutationRef.current = false;
              // Revert to server state on error
              setLocalTracks(serverTracks);
            },
          },
        );
      }, 600);
    },
    [updateTracks, serverTracks],
  );

  const tracks = isOwner ? localTracks : serverTracks;
  const scrollRef = useInfiniteScroll(hasNextPage ?? false, isFetchingNextPage, fetchNextPage);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localTracks.findIndex((t) => t.urn === active.id);
    const newIndex = localTracks.findIndex((t) => t.urn === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newTracks = [...localTracks];
    const [moved] = newTracks.splice(oldIndex, 1);
    newTracks.splice(newIndex, 0, moved);
    setLocalTracks(newTracks);
    debouncedUpdate(newTracks, t('playlist.reordered'));
  };

  const handleRemoveTrack = useCallback(
    (track: Track) => {
      setLocalTracks((prev) => {
        const next = prev.filter((x) => x.urn !== track.urn);
        debouncedUpdate(next, t('playlist.trackRemoved'));
        return next;
      });
    },
    [debouncedUpdate, t],
  );

  if (!playlist) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="text-white/15 animate-spin" />
      </div>
    );
  }
  const cover = art(playlist.artwork_url, 't500x500') ?? art(tracks[0]?.artwork_url, 't500x500');

  const handleDelete = () => {
    deletePlaylist.mutate(playlist.urn, {
      onSuccess: () => {
        toast.success(t('playlist.deleted'));
        navigate(-1);
      },
    });
  };

  const iconBtn =
    'w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors';

  return (
    <>
      <TrackListPage
        kind={playlist.playlist_type || t('sidebar.playlist')}
        title={playlist.title}
        colorFrom={cover}
        tile={
          cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.06]">
              <ListMusic size={56} className="text-white/30" />
            </div>
          )
        }
        subtitle={
          <button
            type="button"
            onClick={() => navigate(`/user/${encodeURIComponent(playlist.user.urn)}`)}
            className="inline-flex items-center gap-2 font-semibold hover:underline cursor-pointer"
          >
            {playlist.user.avatar_url && (
              <img
                src={art(playlist.user.avatar_url, 'small') ?? ''}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            )}
            {playlist.user.username}
            {playlist.created_at && (
              <span className="font-normal text-white/60">
                · {dateFormatted(playlist.created_at)}
              </span>
            )}
          </button>
        }
        description={playlist.description ?? undefined}
        tracks={tracks}
        totalCount={playlist.track_count ?? tracks.length}
        onRetry={tracksFailed ? () => void refetchTracks() : undefined}
        downloadable
        actions={
          <>
            <PlaylistLikeBtn playlistUrn={playlist.urn} count={playlist.likes_count} />
            <CopyIconAction url={playlist.permalink_url} variant="round" />
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                title={t('playlist.delete')}
                aria-label={t('playlist.delete')}
                className={`${iconBtn} text-white/60 hover:text-red-400`}
              >
                <Trash2 size={22} />
              </button>
            )}
          </>
        }
        renderRows={
          isOwner
            ? (shown) => (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={shown.map((x) => x.urn)}
                    strategy={verticalListSortingStrategy}
                  >
                    {shown.map((track, i) => (
                      <SortableRow
                        key={track.urn}
                        track={track}
                        index={i}
                        queue={shown}
                        onRemove={handleRemoveTrack}
                        removeLabel={t('playlist.removeTrack')}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )
            : undefined
        }
        footer={
          hasNextPage ? (
            <div ref={scrollRef} className="flex justify-center py-4">
              {isFetchingNextPage && <Loader2 size={20} className="animate-spin text-white/30" />}
            </div>
          ) : null
        }
      />

      {/* ── Delete confirmation ────────────────────── */}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[380px] rounded-2xl app-surface  p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-red-400" />
              </div>
              <Dialog.Title className="text-[15px] font-bold text-white/90">
                {t('playlist.delete')}
              </Dialog.Title>
              <Dialog.Close className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 ui-icon transition-all">
                <X size={14} />
              </Dialog.Close>
            </div>
            <p className="text-[13px] text-white/50 leading-relaxed">
              {t('playlist.deleteConfirm', { title: playlist.title })}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <Dialog.Close className="px-4 py-2 rounded-xl text-[13px] font-medium text-white/50 hover:text-white/80 ui-icon transition-all cursor-pointer">
                {t('common.cancel') ?? 'Cancel'}
              </Dialog.Close>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePlaylist.isPending}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {deletePlaylist.isPending ? t('common.loading') : t('playlist.delete')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
});
