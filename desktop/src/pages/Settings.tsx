import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AboutSection } from '../components/settings/AboutSection';
import { AccountSection, BackupSection } from '../components/settings/AccountSection';
import { AppearanceSection } from '../components/settings/AppearanceSection';
import { CacheSection } from '../components/settings/CacheSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import { InterfaceSection } from '../components/settings/InterfaceSection';
import { DiscordSection, PlaybackSection } from '../components/settings/PlaybackSection';
import { TransitionsSection } from '../components/settings/TransitionsSection';
import {
  AudioLines,
  Download,
  Globe,
  Info,
  MessageCircle,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  User,
  Volume2,
  X,
} from '../lib/icons';

/** Side navigation, in page order. `id` matches the section's `SettingsSection id`. */
const NAV: Array<{ id: string; labelKey: string; icon: React.ReactNode }> = [
  { id: 'general', labelKey: 'settings.general', icon: <Globe size={16} /> },
  { id: 'appearance', labelKey: 'settings.appearance', icon: <Palette size={16} /> },
  { id: 'interface', labelKey: 'settings.interface', icon: <SlidersHorizontal size={16} /> },
  { id: 'playback', labelKey: 'settings.playback', icon: <Volume2 size={16} /> },
  { id: 'transitions', labelKey: 'settings.navTransitions', icon: <AudioLines size={16} /> },
  { id: 'discord', labelKey: 'settings.navDiscord', icon: <MessageCircle size={16} /> },
  { id: 'cache', labelKey: 'settings.cache', icon: <Download size={16} /> },
  { id: 'backup', labelKey: 'settings.backup', icon: <RotateCcw size={16} /> },
  { id: 'account', labelKey: 'settings.account', icon: <User size={16} /> },
  { id: 'about', labelKey: 'settings.about', icon: <Info size={16} /> },
];

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

// While a nav click scrolls, the spy stays on the clicked item instead of flicking through
// every section it passes; it takes over again when the scroll ends.
let lockedUntil = 0;

function goTo(id: string, setActive: (id: string) => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setActive(id);
  lockedUntil = Date.now() + 1200;
  document
    .getElementById(`settings-${id}`)
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function Settings() {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(NAV[0].id);

  const sections = useCallback(
    () => [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-settings-id]') ?? [])],
    [],
  );

  // Search: hide every section whose text doesn't contain all the typed words.
  useEffect(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const next = new Set<string>();
    for (const section of sections()) {
      const match = words.every((w) => section.textContent?.toLowerCase().includes(w));
      section.hidden = !match;
      if (!match) next.add(section.dataset.settingsId ?? '');
    }
    setHidden(next);
  }, [query, sections]);

  // Scroll spy: the active item is the last section whose top has passed the upper third.
  // Re-run when the search hides sections, so the highlight never points at a hidden one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `hidden` only triggers a recount
  useEffect(() => {
    const scroller = scrollParent(rootRef.current);
    if (!scroller) return;
    const onScroll = () => {
      if (Date.now() < lockedUntil) return;
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
      let current = sections().find((s) => !s.hidden)?.dataset.settingsId ?? NAV[0].id;
      for (const s of sections()) {
        if (!s.hidden && s.getBoundingClientRect().top <= line)
          current = s.dataset.settingsId ?? current;
      }
      // At the very bottom the last sections can't reach the line: pick the last visible one.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        const visible = sections().filter((s) => !s.hidden);
        current = visible[visible.length - 1]?.dataset.settingsId ?? current;
      }
      setActive(current);
    };
    onScroll();
    const onScrollEnd = () => {
      lockedUntil = 0;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', onScrollEnd);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', onScrollEnd);
    };
  }, [sections, hidden]);

  const nav = NAV.filter((item) => !hidden.has(item.id));
  const nothingFound = query.trim() !== '' && nav.length === 0;

  const navButton = (item: (typeof NAV)[number], compact: boolean) => (
    <button
      key={item.id}
      type="button"
      onClick={() => goTo(item.id, setActive)}
      aria-current={active === item.id ? 'true' : undefined}
      className={`press flex shrink-0 items-center gap-3 rounded-full text-left text-[13px] font-semibold cursor-pointer ${
        compact ? 'h-8 px-3.5' : 'h-9 w-full px-3'
      } ${
        active === item.id
          ? 'bar-control is-active text-white'
          : 'ui-icon text-white/55 hover:text-white'
      }`}
    >
      {!compact && (
        <span className={active === item.id ? 'text-[var(--color-accent)]' : ''}>{item.icon}</span>
      )}
      {t(item.labelKey)}
    </button>
  );

  return (
    <div className="mx-auto flex max-w-5xl gap-10 p-6 pb-4">
      <nav aria-label={t('settings.title')} className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-6 space-y-0.5">{nav.map((item) => navButton(item, false))}</div>
      </nav>

      <div ref={rootRef} className="min-w-0 max-w-2xl flex-1 space-y-6">
        <h1 className="syne text-3xl text-white">{t('settings.title')}</h1>

        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t('settings.searchPlaceholder')}
            className="bar-control h-10 w-full rounded-full border border-transparent pl-10 pr-10 text-[13px] text-white/85 outline-none placeholder:text-white/35 focus:border-white/25 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center ui-icon rounded-full text-white/45 hover:text-white cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Narrow windows: the navigation becomes a row of pills. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {nav.map((item) => navButton(item, true))}
        </div>

        {nothingFound && (
          <p className="py-10 text-center text-[13px] text-white/30">{t('settings.searchEmpty')}</p>
        )}
        <GeneralSection />
        <AppearanceSection />
        <InterfaceSection />
        <PlaybackSection />
        <TransitionsSection />
        <DiscordSection />
        <CacheSection />
        <BackupSection />
        <AccountSection />
        <AboutSection />
      </div>
    </div>
  );
}
