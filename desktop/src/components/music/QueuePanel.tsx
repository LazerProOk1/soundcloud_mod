import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { art, dur, durLong } from '../../lib/formatters';
import {
  CheckCircle2,
  GripVertical,
  pauseTextWhite12,
  playIcon32,
  Trash2,
  X,
} from '../../lib/icons';
import { getArtistDisplay, useArtistDisplay, useDisplayTitle } from '../../lib/track-display';
import { openTrackMenu } from '../../lib/useTrackContextMenu';
import { useCachedUrnsStore } from '../../stores/cached-urns';
import { usePlayerStore } from '../../stores/player';
import { UploadKindDot } from './UploadKindDot';

/* ── Now Playing (single, non-draggable) ─────────────────────────── */
const NowPlayingItem = React.memo(() => {
  const { currentTrack, isPlaying } = usePlayerStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      isPlaying: s.isPlaying,
    })),
  );

  if (!currentTrack) return null;
  const artwork = art(currentTrack.artwork_url, 't200x200');

  const handleClick = () => {
    const { pause, resume } = usePlayerStore.getState();
    isPlaying ? pause() : resume();
  };

  return (
    <div
      className="flex items-center gap-3.5 px-2 py-2 rounded-lg hover:bg-white/[0.06] cursor-pointer"
      onClick={handleClick}
    >
      <div className="w-14 h-14 rounded-md overflow-hidden shrink-0 relative bg-white/[0.04]">
        {artwork ? (
          <img src={artwork} alt="" className="w-full h-full object-cover" decoding="async" />
        ) : (
          <div className="w-full h-full" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          {isPlaying ? (
            <div className="flex items-end gap-[2px] h-3.5">
              <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
              <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
              <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
            </div>
          ) : (
            pauseTextWhite12
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-accent font-semibold truncate leading-snug">
          {currentTrack.title}
        </p>
        <p className="text-[13px] text-white/55 truncate mt-0.5">
          {getArtistDisplay(currentTrack).primary}
        </p>
      </div>
      <span className="text-[12px] text-white/45 tabular-nums shrink-0">
        {dur(currentTrack.duration)}
      </span>
    </div>
  );
});

/* ── Draggable queue list ────────────────────────────────────────── */
const QueueRow = React.memo(function QueueRow({
  track,
  absIdx,
}: {
  track: ReturnType<typeof usePlayerStore.getState>['queue'][number];
  absIdx: number;
}) {
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isCurrent = absIdx === queueIndex;
  const artwork = art(track.artwork_url, 't200x200');

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(absIdx),
  });

  const handleClick = () => {
    const { playFromQueue, pause, resume } = usePlayerStore.getState();
    if (absIdx === queueIndex && isPlaying) pause();
    else if (absIdx === queueIndex) resume();
    else playFromQueue(absIdx);
  };

  const handleRemove = () => {
    usePlayerStore.getState().removeFromQueue(absIdx);
  };

  return (
    <div
      onContextMenu={(e) => openTrackMenu(e, track, absIdx)}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 pl-1 pr-2 py-1.5 rounded-lg group select-none transition-colors duration-150 ${
        isDragging ? 'opacity-40' : isCurrent ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
      }`}
    >
      <div
        className="text-transparent group-hover:text-white/35 hover:!text-white/70 cursor-grab active:cursor-grabbing transition-colors touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </div>

      <div
        className="w-11 h-11 rounded-md overflow-hidden shrink-0 relative bg-white/[0.04] cursor-pointer"
        onClick={handleClick}
      >
        {artwork ? (
          <img src={artwork} alt="" className="w-full h-full object-cover" decoding="async" />
        ) : (
          <div className="w-full h-full" />
        )}
        {isCurrent && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            {isPlaying ? (
              <div className="flex items-end gap-[2px] h-3.5">
                <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
                <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
                <div className="eq-bar w-[2px] h-full bg-accent rounded-full" />
              </div>
            ) : (
              pauseTextWhite12
            )}
          </div>
        )}
      </div>

      <QueueTrackRowBody track={track} isCurrent={isCurrent} onClick={handleClick} />

      <span className="text-[12px] text-white/45 tabular-nums shrink-0 group-hover:hidden">
        {dur(track.duration)}
      </span>

      <button
        type="button"
        aria-label="Remove from queue"
        onClick={(e) => {
          e.stopPropagation();
          handleRemove();
        }}
        className="hidden group-hover:flex w-8 h-8 rounded-full items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] cursor-pointer shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
});

const QueueTrackRowBody = React.memo(function QueueTrackRowBody({
  track,
  isCurrent,
  onClick,
}: {
  track: import('../../stores/player').Track;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const artistDisplay = useArtistDisplay(track);
  const displayTitle = useDisplayTitle(track);
  const isCachedOffline = useCachedUrnsStore((s) => s.urns.has(track.urn));
  return (
    <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
      <p
        className={`text-[14px] truncate leading-snug ${isCurrent ? 'text-accent font-semibold' : 'text-white'}`}
      >
        {displayTitle}
      </p>
      <p className="text-[12.5px] text-white/55 truncate mt-0.5 flex items-center gap-1">
        <UploadKindDot kind={artistDisplay.uploadKind} />
        <span className="truncate">{artistDisplay.primary}</span>
        {isCachedOffline && (
          <span
            title={t('offline.cachedBadge')}
            className="inline-flex items-center text-emerald-400/80 shrink-0"
          >
            <CheckCircle2 size={10} />
          </span>
        )}
      </p>
    </div>
  );
});

const DraggableQueue = React.memo(({ startIndex }: { startIndex: number }) => {
  const queue = usePlayerStore((s) => s.queue);
  const items = queue.slice(startIndex);
  const itemIds = items.map((_, localIdx) => String(startIndex + localIdx));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        usePlayerStore.getState().moveInQueue(Number(active.id), Number(over.id));
      }}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-0.5">
          {items.map((track, localIdx) => (
            <QueueRow
              key={`${track.urn}-${startIndex + localIdx}`}
              track={track}
              absIdx={startIndex + localIdx}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
});

/* ── Panel ───────────────────────────────────────────────────────── */
export const QueuePanel = React.memo(
  ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const { t } = useTranslation();
    const { currentTrack, queue, queueIndex } = usePlayerStore(
      useShallow((s) => ({
        currentTrack: s.currentTrack,
        queue: s.queue,
        queueIndex: s.queueIndex,
      })),
    );

    const upcoming = queue.slice(queueIndex + 1);
    const upNextCount = upcoming.length;
    const upNextDurationMs = upcoming.reduce((acc, tr) => acc + (tr.duration || 0), 0);

    return (
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/45 z-[55] transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />

        {/* Panel */}
        <div
          className="app-surface fixed top-3 right-3 bottom-3 w-[min(380px,calc(100vw-24px))] z-[60] flex flex-col overflow-hidden rounded-2xl animate-panel-slide-in"
          style={{
            transform: open ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
            visibility: open ? 'visible' : 'hidden',
            transition: 'transform 340ms cubic-bezier(0.16, 1, 0.3, 1), visibility 340ms',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-[22px] font-bold tracking-tight text-white">{t('player.queue')}</h2>
            <div className="flex items-center gap-1">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => usePlayerStore.getState().clearQueue()}
                  className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  {t('player.clearQueue')}
                </button>
              )}
              <button
                type="button"
                aria-label={t('common.close', 'Close')}
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Now Playing (single item, not draggable) */}
          {currentTrack && (
            <div className="px-4 pb-2">
              <p className="text-[14px] text-white font-bold mb-1.5 px-2">
                {t('player.nowPlaying')}
              </p>
              <NowPlayingItem />
            </div>
          )}

          {/* Up Next (draggable) */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {upNextCount > 0 && (
              <>
                <div className="flex items-center justify-between mb-1.5 mt-4 px-2">
                  <p className="text-[14px] text-white font-bold">
                    {t('player.upNext')}
                    <span className="ml-2 text-[12.5px] font-normal text-white/50 tabular-nums">
                      {upNextCount}
                      {upNextDurationMs > 0 ? ` · ${durLong(upNextDurationMs)}` : ''}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => usePlayerStore.getState().clearUpcoming()}
                    className="text-[12.5px] font-semibold text-white/55 hover:text-white transition-colors cursor-pointer"
                  >
                    {t('player.clearUpcoming')}
                  </button>
                </div>
                <DraggableQueue startIndex={queueIndex + 1} />
              </>
            )}

            {queue.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-white/15">
                {playIcon32}
                <p className="text-sm mt-3">Queue is empty</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  },
);
