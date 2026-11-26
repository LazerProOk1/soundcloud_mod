import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { reportProblem } from '../lib/report';
import { PILL_BTN } from './ui/buttonClass';

/** Rendered whenever the UI cannot continue: a startup failure or an error inside React. */
export function CrashScreen({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const details = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  ).slice(0, 400);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
      <div className="ui-card flex w-full max-w-lg flex-col gap-4 rounded-2xl p-6">
        <h1 className="text-[17px] font-semibold text-white">
          {t('errors.crashTitle', 'Something went wrong')}
        </h1>
        <p className="text-[13px] leading-relaxed text-white/60">
          {t(
            'errors.crashBody',
            'The screen hit an unexpected error. Reload to continue; the details are below if it happens again.',
          )}
        </p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-[12px] text-white/45">
          {details}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="ui-primary press inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold text-black"
            onClick={() => window.location.reload()}
          >
            {t('errors.reload', 'Reload')}
          </button>
          <button type="button" className={PILL_BTN} onClick={() => reportProblem('ui crash')}>
            {t('errors.report', 'Report a problem')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface State {
  error: unknown;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[UI] Render failed:', error, info.componentStack);
  }

  render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
