import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrackListPage } from '../components/music/TrackListPage';
import { api } from '../lib/api';
import { listCachedUrns } from '../lib/cache';
import { fetchAllLikedTracks } from '../lib/hooks';
import { Clock, Download, Heart, RefreshCw, RotateCcw } from '../lib/icons';
import { getOfflineLikedTracks, getOfflineTracksByUrns } from '../lib/offline-index';
import { useAppStatusStore } from '../stores/app-status';
import type { Track } from '../stores/player';

interface OfflineLibraryState {
  cachedTracks: Track[];
  likedTracks: Track[];
  cachedUrns: Set<string>;
}

interface PendingStats {
  pending: number;
  failed: number;
}

type OfflineSectionKey = 'likes' | 'cached';

const EMPTY_STATE: OfflineLibraryState = {
  cachedTracks: [],
  likedTracks: [],
  cachedUrns: new Set(),
};

const EMPTY_STATS: PendingStats = { pending: 0, failed: 0 };

function buildPlayableQueue(tracks: Track[], cachedUrns: Set<string>) {
  return tracks.filter((track) => cachedUrns.has(track.urn));
}

const StatusBadge = React.memo(function StatusBadge() {
  const { t } = useTranslation();
  const mode = useAppStatusStore((s) =>
    s.offlineBypass || !s.navigatorOnline || !s.backendReachable ? 'offline' : 'online',
  );

  const isOffline = mode === 'offline';

  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bar-control px-3 text-[12px] font-medium text-white/80">
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOffline ? 'bg-white/40' : 'bg-emerald-400'}`}
      />
      {isOffline ? t('offline.offlineBadge') : t('offline.readyBadge')}
    </span>
  );
});

const PendingBadge = React.memo(function PendingBadge({
  stats,
  syncing,
  onSync,
}: {
  stats: PendingStats;
  syncing: boolean;
  onSync: () => void;
}) {
  const { t } = useTranslation();

  if (stats.pending === 0 && stats.failed === 0) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1.5 rounded-full bar-control px-3 py-1.5 text-[11px] font-semibold text-white/78">
        <Clock size={11} />
        {t('offline.pendingCount', { count: stats.pending })}
        {stats.failed > 0 && (
          <span className="ml-1 text-rose-300/80">
            ({t('offline.failedCount', { count: stats.failed })})
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bar-control px-3 py-1.5 text-[11px] font-semibold text-white/78 transition-all disabled:opacity-50"
      >
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        {t('offline.syncNow')}
      </button>
    </div>
  );
});

export const OfflinePage = React.memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appMode = useAppStatusStore((s) =>
    s.offlineBypass || !s.navigatorOnline || !s.backendReachable ? 'offline' : 'online',
  );
  const [state, setState] = useState<OfflineLibraryState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [pendingStats, setPendingStats] = useState<PendingStats>(EMPTY_STATS);
  const [syncing, setSyncing] = useState(false);
  const [activeSection, setActiveSection] = useState<OfflineSectionKey>('likes');
  const bgFetchDone = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadOffline = async () => {
      try {
        const [likedTracks, cachedUrns] = await Promise.all([
          getOfflineLikedTracks(),
          listCachedUrns(),
        ]);
        const cachedSet = new Set(cachedUrns);
        const cachedTracks = await getOfflineTracksByUrns(cachedUrns);
        if (cancelled) return;

        setState({ likedTracks, cachedTracks, cachedUrns: cachedSet });
      } catch (error) {
        console.warn('[Offline] Failed to load local cache:', error);
        if (cancelled) return;
        setState(EMPTY_STATE);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOffline();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appMode !== 'online' || bgFetchDone.current) {
      return;
    }

    let cancelled = false;

    const syncAllLikes = async () => {
      try {
        const allLikes = await fetchAllLikedTracks();
        bgFetchDone.current = true;
        if (cancelled) return;

        const cachedUrns = await listCachedUrns();
        const cachedSet = new Set(cachedUrns);
        const cachedTracks = await getOfflineTracksByUrns(cachedUrns);
        if (cancelled) return;

        setState({ likedTracks: allLikes, cachedTracks, cachedUrns: cachedSet });
      } catch {
        // Offline mode can continue from local index only.
      }
    };

    void syncAllLikes();

    return () => {
      cancelled = true;
    };
  }, [appMode]);

  useEffect(() => {
    if (appMode !== 'online') {
      setSyncing(false);
      setPendingStats(EMPTY_STATS);
      return;
    }

    let cancelled = false;

    const loadStats = () => {
      api<PendingStats>('/pending-actions/stats', { silent: true })
        .then((stats) => {
          if (!cancelled) {
            setPendingStats(stats);
          }
        })
        .catch(() => {});
    };

    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appMode]);

  useEffect(() => {
    if (
      activeSection === 'likes' &&
      state.likedTracks.length === 0 &&
      state.cachedTracks.length > 0
    ) {
      setActiveSection('cached');
    }

    if (
      activeSection === 'cached' &&
      state.cachedTracks.length === 0 &&
      state.likedTracks.length > 0
    ) {
      setActiveSection('likes');
    }
  }, [activeSection, state.cachedTracks.length, state.likedTracks.length]);

  const handleSync = useCallback(() => {
    if (appMode !== 'online') return;

    setSyncing(true);
    api<{ synced: number; failed: number }>('/pending-actions/sync', {
      method: 'POST',
      silent: true,
    })
      .then(() => {
        api<PendingStats>('/pending-actions/stats', { silent: true })
          .then(setPendingStats)
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [appMode]);

  const likedPlayable = useMemo(
    () => buildPlayableQueue(state.likedTracks, state.cachedUrns),
    [state.likedTracks, state.cachedUrns],
  );
  const tracks = activeSection === 'likes' ? likedPlayable : state.cachedTracks;

  const chip = (key: OfflineSectionKey, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setActiveSection(key)}
      aria-pressed={activeSection === key}
      className={`h-8 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${
        activeSection === key ? 'ui-selected' : 'bar-control text-white/80'
      }`}
    >
      {label} · {count}
    </button>
  );

  return (
    <TrackListPage
      kind={t('nav.offline')}
      title={activeSection === 'likes' ? t('offline.likesTitle') : t('offline.cachedTitle')}
      tile={
        <div
          className="w-full h-full flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #15803d, #86efac)' }}
        >
          {activeSection === 'likes' ? (
            <Heart size={72} fill="currentColor" />
          ) : (
            <Download size={72} />
          )}
        </div>
      }
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge />
          <PendingBadge stats={pendingStats} syncing={syncing} onSync={handleSync} />
          {appMode === 'offline' && (
            <button
              type="button"
              onClick={() => {
                useAppStatusStore.getState().resetConnectivity();
                navigate('/home');
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white hover:underline cursor-pointer"
            >
              <RotateCcw size={13} />
              {t('offline.tryOnline')}
            </button>
          )}
        </div>
      }
      tracks={tracks}
      isLoading={loading}
      actions={
        <div className="flex items-center gap-2 ml-2">
          {chip('likes', t('offline.likesTitle'), likedPlayable.length)}
          {chip('cached', t('offline.cachedTitle'), state.cachedTracks.length)}
        </div>
      }
    />
  );
});
