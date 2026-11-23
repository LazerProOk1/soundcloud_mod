import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { AppShell } from './components/layout/AppShell';
import { MiniPlayer } from './components/layout/MiniPlayer';
import { ReAuthOverlay } from './components/ReAuthOverlay';
import { ThemeProvider } from './components/ThemeProvider';
import { AppTooltip } from './components/ui/AppTooltip';
import { LiquidGlassDefs } from './components/ui/LiquidGlassDefs';
import { ApiError } from './lib/api';
import { CHECK_UPDATES } from './lib/constants';
import { WifiOff } from './lib/icons';
import { resumeImports } from './lib/link-import';
import { initSleepTimer } from './lib/sleep-timer';
import { checkForAppUpdate, type GithubRelease } from './lib/update-check';
import { getAppMode, useAppStatusStore } from './stores/app-status';
import { useAuthStore } from './stores/auth';
import { useCachedUrnsStore } from './stores/cached-urns';
import { useMiniPlayerStore } from './stores/mini-player';
import { useSessionExpiryStore } from './stores/session-expiry';
import { type StartupPage, useSettingsStore } from './stores/settings';

/* ── Hydration guard ─────────────────────────────────────────────
 * tauriStorage reads from disk asynchronously. Until the auth and
 * settings stores have loaded their persisted data, the app renders
 * with hard-coded defaults (orange accent, no sessionId). This causes
 * a flash of wrong theme AND the login screen. Show a loading spinner
 * instead.                                                         */
function useStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated() && useSettingsStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    let pending = 2;
    const done = () => {
      if (--pending === 0) setHydrated(true);
    };
    const u1 = useAuthStore.persist.onFinishHydration(done);
    const u2 = useSettingsStore.persist.onFinishHydration(done);
    // If already hydrated by the time we subscribe, fire immediately
    if (useAuthStore.persist.hasHydrated()) done();
    if (useSettingsStore.persist.hasHydrated()) done();
    return () => {
      u1();
      u2();
    };
  }, [hydrated]);
  return hydrated;
}

// Start the 1-second sleep-timer tick immediately (safe to call multiple times)
initSleepTimer();
// Imports that were still searching when the app closed carry on in the background.
resumeImports();

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Library = lazy(() =>
  import('./pages/Library').then((module) => ({ default: module.Library })),
);
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const PlaylistPage = lazy(() =>
  import('./pages/PlaylistPage').then((module) => ({ default: module.PlaylistPage })),
);
const OfflinePage = lazy(() =>
  import('./pages/OfflinePage').then((module) => ({ default: module.OfflinePage })),
);
const Search = lazy(() => import('./pages/Search').then((module) => ({ default: module.Search })));
const Settings = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings })),
);
const TrackPage = lazy(() =>
  import('./pages/TrackPage').then((module) => ({ default: module.TrackPage })),
);
const UserPage = lazy(() =>
  import('./pages/UserPage').then((module) => ({ default: module.UserPage })),
);
const ArtistPage = lazy(() =>
  import('./pages/ArtistPage').then((module) => ({ default: module.ArtistPage })),
);
const ImportPage = lazy(() =>
  import('./pages/ImportPage').then((module) => ({ default: module.ImportPage })),
);
const AlbumPage = lazy(() =>
  import('./pages/AlbumPage').then((module) => ({ default: module.AlbumPage })),
);
const Discover = lazy(() =>
  import('./pages/Discover').then((module) => ({ default: module.Discover })),
);
const LikedPage = lazy(() =>
  import('./pages/LikedPage').then((module) => ({ default: module.LikedPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const UpdateChecker = lazy(() =>
  import('./components/UpdateChecker').then((module) => ({ default: module.UpdateChecker })),
);

const STARTUP_PAGE_ROUTES: Record<StartupPage, string> = {
  home: '/home',
  search: '/search',
  library: '/library',
  settings: '/settings',
};

function StartPageRedirect() {
  const startupPage = useSettingsStore((s) => s.startupPage);
  return <Navigate to={STARTUP_PAGE_ROUTES[startupPage]} replace />;
}

export default function App() {
  const hydrated = useStoresHydrated();
  const { isAuthenticated, sessionId, fetchUser } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      sessionId: s.sessionId,
      fetchUser: s.fetchUser,
    })),
  );
  const [availableRelease, setAvailableRelease] = useState<GithubRelease | null>(null);
  const dismissedReleaseTagRef = useRef<string | null>(null);
  const handleUpdateDismiss = useCallback(() => {
    setAvailableRelease((prev) => {
      if (prev) dismissedReleaseTagRef.current = prev.tag_name;
      return null;
    });
  }, []);
  const appMode = useAppStatusStore((s) =>
    s.offlineBypass || !s.navigatorOnline || !s.backendReachable ? 'offline' : 'online',
  );
  // Offline-only shell (limited routes + forced /offline redirect) should only appear when
  // the device is actually offline OR the user explicitly chose offline bypass. A transient
  // backend failure should NOT block the login page — the user must be able to retry.
  const showOfflineOnlyShell = useAppStatusStore(
    (s) => !isAuthenticated && !sessionId && (!s.navigatorOnline || s.offlineBypass),
  );

  const isMini = useMiniPlayerStore((s) => s.isMini);
  const panelStyle = useSettingsStore((s) => s.panelStyle);
  const hasLocalSession = Boolean(sessionId);
  const canUseMainShell = isAuthenticated || hasLocalSession;
  // Toggle body.mini so CSS can make #root transparent (enables real backdrop-filter glass)
  // Also clip <html> to border-radius so WebView corners are truly transparent (not square cutouts)
  useEffect(() => {
    document.body.classList.toggle('mini', isMini);
  }, [isMini]);

  // Panel style: html.no-glass = flat, html.liquid-glass = see-through glass, neither = gloss.
  useEffect(() => {
    const root = document.documentElement.classList;
    root.toggle('no-glass', panelStyle === 'flat');
    root.toggle('liquid-glass', panelStyle === 'liquid');
  }, [panelStyle]);

  useEffect(() => {
    void useCachedUrnsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const syncOnline = () => {
      const online = navigator.onLine;
      const appStatus = useAppStatusStore.getState();
      appStatus.setNavigatorOnline(online);
      // When the browser comes back online, optimistically assume the backend is reachable
      // so that the fetchUser effect can re-run and re-authenticate.
      if (online) {
        appStatus.setBackendReachable(true);
      }
    };

    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || appMode !== 'online') {
      return;
    }

    let cancelled = false;

    fetchUser().catch((error) => {
      if (cancelled) return;

      if (error instanceof ApiError && error.status === 401) {
        useSessionExpiryStore.getState().setSessionExpired(true);
        return;
      }

      if (getAppMode() !== 'online') {
        return;
      }

      console.warn('[Auth] Keeping local session after /me bootstrap failure:', error);
      useAuthStore.setState({ isAuthenticated: true });
    });

    void import('./lib/dislikes').then(({ loadAllDislikedIds }) => {
      if (!cancelled) void loadAllDislikedIds();
    });

    return () => {
      cancelled = true;
    };
  }, [appMode, fetchUser, sessionId]);

  // Periodic connectivity recovery: if the backend became unreachable but the browser is still
  // online, retry every 15 s so that a transient server blip doesn't leave the app in offline
  // mode forever (the retry just marks backendReachable=true optimistically; the next real API
  // call will confirm or deny).
  useEffect(() => {
    if (appMode === 'online') return; // already online, nothing to do

    const id = setInterval(() => {
      const { navigatorOnline, offlineBypass } = useAppStatusStore.getState();
      if (navigatorOnline && !offlineBypass) {
        useAppStatusStore.getState().setBackendReachable(true);
      }
    }, 15_000);

    return () => clearInterval(id);
  }, [appMode]);

  useEffect(() => {
    if (!CHECK_UPDATES || !isAuthenticated || appMode !== 'online') {
      setAvailableRelease(null);
      return;
    }

    let cancelled = false;
    const checkUpdates = () => {
      checkForAppUpdate()
        .then((release) => {
          if (cancelled) return;
          if (release && release.tag_name === dismissedReleaseTagRef.current) return;
          setAvailableRelease(release);
        })
        .catch(() => {});
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(checkUpdates, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    const id = setTimeout(checkUpdates, 1);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [appMode, isAuthenticated]);

  // Wait for stores to load from disk before rendering — prevents flash of
  // default theme/login screen while tauriStorage is reading files.
  if (!hydrated) {
    return (
      <ThemeProvider>
        <LiquidGlassDefs />
        <AppLoadingScreen fullscreen />
      </ThemeProvider>
    );
  }

  // Mini-player: render a compact standalone view, bypassing all routing/shell
  if (isMini) {
    return (
      <ThemeProvider>
        <LiquidGlassDefs />
        <MiniPlayer />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LiquidGlassDefs />
      <AppTooltip />
      <Toaster
        theme="light"
        position="top-center"
        offset={56}
        toastOptions={{
          // Plain white pill with a coloured status icon, calm and readable.
          className: 'app-toast',
          style: {
            background: '#fff',
            border: 'none',
            color: '#111',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          },
        }}
      />
      <ReAuthOverlay />
      <BrowserRouter>
        {showOfflineOnlyShell ? (
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/offline" replace />} />
              <Route
                path="offline"
                element={
                  <RouteLoader>
                    <OfflinePage />
                  </RouteLoader>
                }
              />
              <Route
                path="settings"
                element={
                  <RouteLoader>
                    <Settings />
                  </RouteLoader>
                }
              />
              <Route path="*" element={<Navigate to="/offline" replace />} />
            </Route>
          </Routes>
        ) : !canUseMainShell ? (
          <Suspense fallback={<AppLoadingScreen fullscreen />}>
            <Login />
          </Suspense>
        ) : (
          <>
            {availableRelease && (
              <Suspense fallback={null}>
                <UpdateChecker release={availableRelease} onDismiss={handleUpdateDismiss} />
              </Suspense>
            )}
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<StartPageRedirect />} />
                <Route
                  path="home"
                  element={
                    <RouteLoader online>
                      <Home />
                    </RouteLoader>
                  }
                />
                <Route
                  path="search"
                  element={
                    <RouteLoader online>
                      <Search />
                    </RouteLoader>
                  }
                />
                <Route
                  path="liked"
                  element={
                    <RouteLoader>
                      <LikedPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="history"
                  element={
                    <RouteLoader>
                      <HistoryPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="library"
                  element={
                    <RouteLoader>
                      <Library />
                    </RouteLoader>
                  }
                />
                <Route
                  path="offline"
                  element={
                    <RouteLoader>
                      <OfflinePage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="track/:urn"
                  element={
                    <RouteLoader online>
                      <TrackPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="playlist/:urn"
                  element={
                    <RouteLoader>
                      <PlaylistPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="user/:urn"
                  element={
                    <RouteLoader online>
                      <UserPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="artist/:id"
                  element={
                    <RouteLoader online>
                      <ArtistPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="import/:id"
                  element={
                    <RouteLoader>
                      <ImportPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="album/:id"
                  element={
                    <RouteLoader online>
                      <AlbumPage />
                    </RouteLoader>
                  }
                />
                <Route
                  path="discover"
                  element={
                    <RouteLoader online>
                      <Discover />
                    </RouteLoader>
                  }
                />
                {/* SoundWave lives at the top of Home; the old separate page redirects there. */}
                <Route path="soundwave" element={<Navigate to="/home" replace />} />
                <Route
                  path="settings"
                  element={
                    <RouteLoader>
                      <Settings />
                    </RouteLoader>
                  }
                />
              </Route>
            </Routes>
          </>
        )}
      </BrowserRouter>
    </ThemeProvider>
  );
}

/** `online` pages only load from the server, so offline they show a notice instead. */
function RouteLoader({ children, online = false }: { children: ReactNode; online?: boolean }) {
  // Not on `backendReachable`: a server blip should leave the page able to retry.
  const offline = useAppStatusStore((s) => online && (s.offlineBypass || !s.navigatorOnline));
  if (offline) return <OfflineNotice />;
  return <Suspense fallback={<AppLoadingScreen />}>{children}</Suspense>;
}

function OfflineNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bypass = useAppStatusStore((s) => s.offlineBypass);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff size={28} className="text-white/40" />
      <p className="text-[17px] font-semibold text-white/85">{t('offline.pageTitle')}</p>
      <p className="max-w-sm text-[13px] text-white/50">{t('offline.pageDesc')}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/offline')}
          className="press h-9 rounded-full ui-primary px-4 text-[13px] font-semibold text-black cursor-pointer"
        >
          {t('offline.openLibrary')}
        </button>
        {bypass && (
          <button
            type="button"
            onClick={() => useAppStatusStore.getState().setOfflineBypass(false)}
            className="press h-9 rounded-full bar-control px-4 text-[13px] font-semibold text-white/85 cursor-pointer"
          >
            {t('offline.tryOnline')}
          </button>
        )}
      </div>
    </div>
  );
}

function AppLoadingScreen({ fullscreen = false }: { fullscreen?: boolean }) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-4 px-6 py-8 ${fullscreen ? 'h-screen' : 'min-h-[42vh]'}`}
    >
      {fullscreen && (
        <p className="text-[22px] font-bold tracking-tight text-white">SoundCloud Mod</p>
      )}
      {/* Same bouncing bars as the "now playing" marker in track lists. */}
      <span className="flex h-6 items-end gap-[3px]" aria-hidden>
        <span className="eq-bar h-full w-[4px] rounded-sm bg-accent" />
        <span className="eq-bar h-full w-[4px] rounded-sm bg-accent" />
        <span className="eq-bar h-full w-[4px] rounded-sm bg-accent" />
      </span>
      <p className="text-[13px] font-medium text-white/45">{t('common.loading')}</p>
    </div>
  );
}
