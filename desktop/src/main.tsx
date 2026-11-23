import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { changeAppLanguage } from './i18n';
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

async function bootstrap() {
  await initUiScale();
  await useSettingsStore.persist.rehydrate();

  const settings = useSettingsStore.getState();
  await changeAppLanguage(settings.language);

  const [staticPort, proxyPort] = await invoke<[number, number]>('get_server_ports');
  setServerPorts(staticPort, proxyPort);

  installPressRipple();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );

  void startDeferredRuntime();
}

void bootstrap();
