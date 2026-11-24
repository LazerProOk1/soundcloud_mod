/**
 * "Report a problem" / "Suggest an idea": opens a new GitHub issue from the repo's templates,
 * with the version, system, interface style and the last errors already filled in, so the user
 * only writes what happened.
 */
import { useSettingsStore } from '../stores/settings';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO } from './constants';
import { openExternalUrl } from './open-external';

const KEEP = 15;
/** GitHub rejects very long URLs; the log part is cut to fit. */
const MAX_LOG_CHARS = 2500;
const recent: string[] = [];

/** Query strings and tokens never leave the app: only the address part of a URL is kept. */
function scrub(line: string): string {
  return line
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1')
    .replace(/(token|session|auth|key)=\S+/gi, '$1=…');
}

function remember(level: string, args: unknown[]) {
  const text = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
    .join(' ');
  const time = new Date().toTimeString().slice(0, 8);
  recent.push(`${time} ${level} ${scrub(text).slice(0, 300)}`);
  if (recent.length > KEEP) recent.shift();
}

// Keep the last warnings and errors in memory for the report (console output is unchanged).
if (typeof window !== 'undefined') {
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      remember(level.toUpperCase(), args);
      original(...args);
    };
  }
}

function systemName(): string {
  const ua = navigator.userAgent;
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  if (/Mac OS X/.test(ua)) return 'macOS';
  return ua;
}

/** The environment block put into the issue's details field. */
export function reportDetails(context?: string): string {
  const { panelStyle, language } = useSettingsStore.getState();
  let log = recent.join('\n');
  if (log.length > MAX_LOG_CHARS) log = `…${log.slice(-MAX_LOG_CHARS)}`;
  return [
    context ? `**Где:** ${context}` : '',
    `**Система:** ${systemName()}`,
    `**Стиль:** ${panelStyle} · **Язык:** ${language}`,
    log
      ? `\n<details><summary>Последние ошибки</summary>\n\n\`\`\`\n${log}\n\`\`\`\n</details>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const NEW_ISSUE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new`;

/** Opens a bug report; `context` says where it came from (a failed track, the tray…). */
export function reportProblem(context?: string): void {
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: '[BUG] ',
    version: APP_VERSION,
    extra: reportDetails(context),
  });
  openExternalUrl(`${NEW_ISSUE}?${params}`);
}

/** Opens the idea template. */
export function suggestIdea(): void {
  openExternalUrl(`${NEW_ISSUE}?${new URLSearchParams({ template: 'feature_request.yml' })}`);
}
