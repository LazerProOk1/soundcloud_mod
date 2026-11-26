import { QueryClientProvider } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import ReactDOM from 'react-dom/client';
// First: keeps recent warnings and errors for "Report a problem".
import './lib/report';
import App from './App';
import { AppErrorBoundary, CrashScreen } from './components/AppErrorBoundary';
import { changeAppLanguage, ensureLocaleLoaded } from './i18n';
import { setupCacheMaintenance } from './lib/cache';
import { setServerPorts } from './lib/constants';
import { trackedInvoke as invoke, setupUiWatchdog } from './lib/diagnostics';
import { queryClient } from './lib/query-client';
import { initUiScale } from './lib/ui-scale';
import './index.css';
import { installPressRipple } from './lib/press-ripple';
import { useSettingsStore } from './stores/settings';

// Sync language from persisted settings → i18n after tauriStorage rehydration
useSettingsStore.persist.onFinishHydration((state) => {
  if (state.language) {
    void changeAppLanguage(state.language);
  }
});

function scheduleAfterFirstPaint(task: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => task(), { timeout: 1500 });
      } else {
        setTimeout(task, 1);
      }
    });
  });
}

function startDeferredRuntime() {
  scheduleAfterFirstPaint(() => {
    setupUiWatchdog();
    setupCacheMaintenance();
    void import('./lib/scproxy');
    void import('./lib/tray');
    void import('./lib/audio');
    void import('./lib/discord');
  });
}

/** Set by bootstrap right before React takes over, so a late failure does not mount twice. */
let appRendered = false;

async function showStartupFailure(error: unknown) {
  console.error('[Startup] bootstrap failed:', error);
  const root = document.getElementById('root');
  if (!root || appRendered) return;
  // The locale is best effort here: i18n may be the step that failed.
  await ensureLocaleLoaded(useSettingsStore.getState().language).catch(() => undefined);
  ReactDOM.createRoot(root).render(<CrashScreen error={error} />);
}

async function bootstrap() {
  // The tray popup window loads this page too but only needs its menu.
  if (getCurrentWindow().label === 'tray-menu') {
    const root = document.getElementById('root')!;
    root.style.background = 'transparent';
    const { TrayMenu } = await import('./components/TrayMenu');
    ReactDOM.createRoot(root).render(<TrayMenu />);
    return;
  }
  await initUiScale();
  await useSettingsStore.persist.rehydrate();

  const settings = useSettingsStore.getState();
  await changeAppLanguage(settings.language);

  const [staticPort, proxyPort] = await invoke<[number, number]>('get_server_ports');
  setServerPorts(staticPort, proxyPort);

  installPressRipple();
  appRendered = true;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  );

  void startDeferredRuntime();
}

void bootstrap().catch(showStartupFailure);
