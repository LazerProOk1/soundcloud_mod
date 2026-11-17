import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackListPage } from '../components/music/TrackListPage';
import { api } from '../lib/api';
import { historyEntryToTrack } from '../lib/history';
import { useHistory, useInfiniteScroll } from '../lib/hooks';
import { Clock, Loader2, Trash2 } from '../lib/icons';
import type { Track } from '../stores/player';

/** Listening history as a regular track list (latest first, each track once). */
export function HistoryPage() {
  const { t } = useTranslation();
  const history = useHistory();
  const sentinelRef = useInfiniteScroll(
    !!history.hasNextPage,
    !!history.isFetchingNextPage,
    history.fetchNextPage,
  );
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const entry of history.entries) {
      if (seen.has(entry.scTrackId)) continue;
      seen.add(entry.scTrackId);
      out.push(historyEntryToTrack(entry));
    }
    return out;
  }, [history.entries]);

  return (
    <TrackListPage
      kind={t('sidebar.playlist')}
      title={t('library.history')}
      tile={
        <div
          className="w-full h-full flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #0f766e, #5eead4)' }}
        >
          <Clock size={72} />
        </div>
      }
      tracks={tracks}
      isLoading={history.isLoading}
      actions={
        tracks.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              await api('/history', { method: 'DELETE' });
              void history.refetch();
            }}
            title={t('library.clearHistory')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-red-400 cursor-pointer transition-colors"
          >
            <Trash2 size={20} />
          </button>
        )
      }
      footer={
        <div ref={sentinelRef} className="h-12 flex items-center justify-center">
          {history.isFetchingNextPage && (
            <Loader2 size={20} className="text-white/30 animate-spin" />
          )}
        </div>
      }
    />
  );
}
