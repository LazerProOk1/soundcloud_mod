import * as Dialog from '@radix-ui/react-dialog';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { changeAppLanguage } from '../../i18n';
import { handlePrev } from '../../lib/audio';
import {
  type CommandPaletteEntry,
  type CommandPaletteGroup,
  filterCommandItems,
  groupCommandItems,
} from '../../lib/command-palette';
import { EQ_PRESETS } from '../../lib/equalizer';
import {
  AudioLines,
  Clock,
  Compass,
  CornerDownLeft,
  Download,
  Globe,
  Home,
  Library,
  ListMusic,
  MicVocal,
  Palette,
  PanelLeftClose,
  Pause,
  Play,
  Repeat,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  User,
} from '../../lib/icons';
import { isMac } from '../../lib/platform';
import { PRESET_WALLPAPERS } from '../../lib/wallpapers';
import { WAVE_VIBES } from '../../lib/wave-vibes';
import { useAuthStore } from '../../stores/auth';
import { useLyricsStore } from '../../stores/lyrics';
import { usePlayerStore } from '../../stores/player';
import { THEME_PRESETS, type ThemePreset, useSettingsStore } from '../../stores/settings';

interface PaletteItem extends CommandPaletteEntry {
  icon: React.ReactNode;
}

const GROUP_LABELS: Record<CommandPaletteGroup, { key: string; fallback: string }> = {
  navigation: { key: 'commandPalette.groupNavigation', fallback: 'Navigation' },
  playback: { key: 'commandPalette.groupPlayback', fallback: 'Playback' },
  audio: { key: 'commandPalette.groupAudio', fallback: 'Audio & EQ' },
  appearance: { key: 'commandPalette.groupAppearance', fallback: 'Appearance' },
};

export const CommandPalette = React.memo(function CommandPalette({
  open,
  onOpenChange,
  onOpenQueue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenQueue: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const user = useAuthStore((s) => s.user);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  const eqPreset = useSettingsStore((s) => s.eqPreset);
  const normalizeVolume = useSettingsStore((s) => s.normalizeVolume);
  const highQualityStreaming = useSettingsStore((s) => s.highQualityStreaming);
  const themePreset = useSettingsStore((s) => s.themePreset);
  const backgroundImage = useSettingsStore((s) => s.backgroundImage);
  const panelStyle = useSettingsStore((s) => s.panelStyle);
  const soundwaveVibe = useSettingsStore((s) => s.soundwaveVibe);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const runAndClose = useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const isRu = i18n.language === 'ru';
    const player = usePlayerStore.getState();
    const settings = useSettingsStore.getState();

    const list: PaletteItem[] = [
      // Navigation
      {
        id: 'nav-home',
        group: 'navigation',
        title: t('nav.home'),
        subtitle: '/home',
        keywords: ['home', 'main', 'главная', 'домой'],
        icon: <Home size={15} />,
        run: () => navigate('/home'),
      },
      {
        id: 'nav-search',
        group: 'navigation',
        title: t('nav.search'),
        subtitle: '/search',
        keywords: ['search', 'find', 'поиск', 'найти'],
        shortcut: '/',
        icon: <Search size={15} />,
        run: () => navigate('/search'),
      },
      {
        id: 'nav-soundwave',
        group: 'navigation',
        title: t('nav.soundwave'),
        subtitle: '/home',
        keywords: ['soundwave', 'wave', 'radio', 'волна', 'поток'],
        icon: <AudioLines size={15} />,
        run: () => navigate('/home'),
      },
      {
        id: 'nav-discover',
        group: 'navigation',
        title: t('nav.discover'),
        subtitle: '/discover',
        keywords: ['discover', 'charts', 'обзор', 'новинки', 'рекомендации'],
        icon: <Compass size={15} />,
        run: () => navigate('/discover'),
      },
      {
        id: 'nav-library',
        group: 'navigation',
        title: t('nav.library'),
        subtitle: '/library',
        keywords: ['library', 'likes', 'playlists', 'библиотека', 'лайки', 'плейлисты'],
        icon: <Library size={15} />,
        run: () => navigate('/library'),
      },
      {
        id: 'nav-history',
        group: 'navigation',
        title: t('library.history'),
        subtitle: '/history',
        keywords: ['history', 'recent', 'история', 'недавние'],
        icon: <Clock size={15} />,
        run: () => navigate('/history'),
      },
      {
        id: 'nav-offline',
        group: 'navigation',
        title: t('nav.offline'),
        subtitle: '/offline',
        keywords: ['offline', 'cache', 'downloaded', 'офлайн', 'кэш', 'скачанные'],
        icon: <Download size={15} />,
        run: () => navigate('/offline'),
      },
      {
        id: 'nav-settings',
        group: 'navigation',
        title: t('nav.settings'),
        subtitle: '/settings',
        keywords: ['settings', 'preferences', 'настройки', 'параметры'],
        icon: <Settings size={15} />,
        run: () => navigate('/settings'),
      },
    ];

    if (user?.urn) {
      list.push({
        id: 'nav-profile',
        group: 'navigation',
        title: user.username,
        subtitle: t('user.profile', 'Profile'),
        keywords: ['profile', 'user', 'профиль'],
        icon: <User size={15} />,
        run: () => navigate(`/user/${encodeURIComponent(user.urn)}`),
      });
    }

    // Playback
    list.push(
      {
        id: 'play-toggle',
        group: 'playback',
        title: isPlaying ? t('player.pause', 'Pause') : t('player.play', 'Play'),
        subtitle: currentTrack
          ? `${currentTrack.title} — ${currentTrack.user.username}`
          : undefined,
        keywords: ['play', 'pause', 'toggle', 'пауза', 'играть', 'воспроизведение'],
        shortcut: 'Space',
        icon: isPlaying ? <Pause size={15} /> : <Play size={15} />,
        run: () => player.togglePlay(),
      },
      {
        id: 'play-next',
        group: 'playback',
        title: t('kb.nextTrack'),
        keywords: ['next', 'skip', 'следующий', 'дальше'],
        shortcut: 'N',
        icon: <SkipForward size={15} />,
        run: () => player.next(),
      },
      {
        id: 'play-prev',
        group: 'playback',
        title: t('kb.prevTrack'),
        keywords: ['previous', 'back', 'предыдущий', 'назад'],
        shortcut: 'P',
        icon: <SkipBack size={15} />,
        run: () => handlePrev(),
      },
      {
        id: 'play-shuffle',
        group: 'playback',
        title: t('kb.shuffle'),
        badge: shuffle ? 'ON' : 'OFF',
        keywords: ['shuffle', 'random', 'перемешать'],
        shortcut: 'S',
        icon: <Shuffle size={15} />,
        run: () => player.toggleShuffle(),
      },
      {
        id: 'play-repeat',
        group: 'playback',
        title: t('kb.repeat'),
        badge: repeat.toUpperCase(),
        keywords: ['repeat', 'loop', 'повтор'],
        shortcut: 'R',
        icon: <Repeat size={15} />,
        run: () => player.toggleRepeat(),
      },
      {
        id: 'panel-queue',
        group: 'playback',
        title: t('kb.queue'),
        keywords: ['queue', 'up next', 'очередь'],
        shortcut: 'Q',
        icon: <ListMusic size={15} />,
        run: () => onOpenQueue(),
      },
      {
        id: 'panel-lyrics',
        group: 'playback',
        title: t('kb.lyrics'),
        keywords: ['lyrics', 'text', 'comments', 'текст', 'комментарии'],
        shortcut: 'L',
        icon: <MicVocal size={15} />,
        run: () => useLyricsStore.getState().toggle(),
      },
    );

    for (const vibeItem of WAVE_VIBES) {
      const label = t(`soundwave.vibes.${vibeItem.id}`);
      list.push({
        id: `wave-vibe-${vibeItem.id}`,
        group: 'playback',
        title: `${t('soundwave.myWave', 'My Wave')}: ${label}`,
        badge: soundwaveVibe === vibeItem.id ? 'ACTIVE' : undefined,
        keywords: ['soundwave', 'wave', 'vibe', 'mood', vibeItem.id, label, 'волна', 'настроение'],
        icon: <AudioLines size={15} />,
        run: () => {
          settings.setSoundwaveVibe(vibeItem.id);
          navigate('/home');
        },
      });
    }

    // Audio & EQ
    list.push(
      {
        id: 'audio-eq-toggle',
        group: 'audio',
        title: t('commandPalette.toggleEq', 'Toggle Equalizer'),
        badge: eqEnabled ? 'ON' : 'OFF',
        keywords: ['eq', 'equalizer', 'эквалайзер'],
        icon: <SlidersHorizontal size={15} />,
        run: () => settings.setEqEnabled(!eqEnabled),
      },
      {
        id: 'audio-normalize',
        group: 'audio',
        title: t('settings.normalizeVolume'),
        badge: normalizeVolume ? 'ON' : 'OFF',
        keywords: ['normalize', 'loudness', 'нормализация', 'громкость'],
        icon: <SlidersHorizontal size={15} />,
        run: () => settings.setNormalizeVolume(!normalizeVolume),
      },
      {
        id: 'audio-hq',
        group: 'audio',
        title: t('settings.highQualityStreaming'),
        badge: highQualityStreaming ? 'HQ' : 'STD',
        keywords: ['hq', 'high quality', 'streaming', 'качество', 'стриминг'],
        icon: <Sparkles size={15} />,
        run: () => settings.setHighQualityStreaming(!highQualityStreaming),
      },
    );

    for (const [presetKey, preset] of Object.entries(EQ_PRESETS)) {
      const label = isRu ? preset.labelRu : preset.label;
      list.push({
        id: `eq-preset-${presetKey}`,
        group: 'audio',
        title: `${t('commandPalette.eqPrefix', 'EQ')}: ${label}`,
        badge: eqEnabled && eqPreset === presetKey ? 'ACTIVE' : undefined,
        keywords: ['eq', 'equalizer', 'preset', preset.label, preset.labelRu, 'пресет'],
        icon: <SlidersHorizontal size={15} />,
        run: () => {
          settings.setEqEnabled(true);
          settings.setEqGains([...preset.gains]);
          settings.setEqPreset(presetKey);
        },
      });
    }

    // Appearance
    list.push(
      {
        id: 'app-sidebar',
        group: 'appearance',
        title: t('kb.sidebar'),
        keywords: ['sidebar', 'collapse', 'expand', 'панель', 'меню'],
        shortcut: '[',
        icon: <PanelLeftClose size={15} />,
        run: () => settings.toggleSidebar(),
      },
      {
        id: 'app-liquid-glass',
        group: 'appearance',
        title: t('settings.liquidGlass'),
        badge: t(`settings.panelStyle_${panelStyle}`),
        keywords: ['liquid', 'glass', 'blur', 'performance', 'стекло', 'размытие'],
        icon: <Sparkles size={15} />,
        // Cycles Plain → Frosted glass → Liquid Glass.
        run: () =>
          settings.setPanelStyle(
            panelStyle === 'flat' ? 'gloss' : panelStyle === 'gloss' ? 'liquid' : 'flat',
          ),
      },
      {
        id: 'app-lang',
        group: 'appearance',
        title: t('commandPalette.switchLanguage', 'Switch Language (RU / EN)'),
        badge: i18n.language.toUpperCase(),
        keywords: ['language', 'russian', 'english', 'язык', 'русский', 'english'],
        icon: <Globe size={15} />,
        run: () => {
          void changeAppLanguage(i18n.language === 'ru' ? 'en' : 'ru');
        },
      },
    );

    for (const [id, def] of Object.entries(THEME_PRESETS)) {
      const presetId = id as Exclude<ThemePreset, 'custom'>;
      list.push({
        id: `theme-${presetId}`,
        group: 'appearance',
        title: `${t('commandPalette.themePrefix', 'Theme')}: ${def.name}`,
        badge: themePreset === presetId ? 'ACTIVE' : undefined,
        keywords: ['theme', 'color', 'accent', def.name, id, 'тема', 'цвет'],
        icon: <Palette size={15} />,
        run: () => settings.setThemePreset(presetId),
      });
    }

    for (const preset of PRESET_WALLPAPERS) {
      list.push({
        id: `wallpaper-${preset.id}`,
        group: 'appearance',
        title: `${t('commandPalette.wallpaperPrefix', 'Wallpaper')}: ${t(preset.labelKey, preset.fallbackLabel)}`,
        badge: backgroundImage === preset.id ? 'ACTIVE' : undefined,
        keywords: ['wallpaper', 'background', 'glass', preset.fallbackLabel, 'обои', 'фон'],
        icon: <Sparkles size={15} />,
        run: () => settings.setBackgroundImage(backgroundImage === preset.id ? '' : preset.id),
      });
    }

    return list;
  }, [
    t,
    i18n.language,
    navigate,
    user,
    isPlaying,
    currentTrack,
    shuffle,
    repeat,
    onOpenQueue,
    eqEnabled,
    eqPreset,
    normalizeVolume,
    highQualityStreaming,
    themePreset,
    backgroundImage,
    panelStyle,
    soundwaveVibe,
  ]);

  const trimmedQuery = query.trim();
  const filteredItems = useMemo(
    () => filterCommandItems(items, trimmedQuery),
    [items, trimmedQuery],
  );

  const searchFallbackItem = useMemo<PaletteItem | null>(() => {
    if (!trimmedQuery) return null;
    return {
      id: 'search-query-jump',
      group: 'navigation',
      title: t('commandPalette.searchFor', {
        query: trimmedQuery,
        defaultValue: `Search SoundCloud for "${trimmedQuery}"`,
      }),
      subtitle: t('commandPalette.openSearchPage', 'Open full search results'),
      keywords: [trimmedQuery],
      shortcut: 'Enter',
      icon: <Search size={15} className="text-accent" />,
      run: () => navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`),
    };
  }, [trimmedQuery, t, navigate]);

  const flatItems = useMemo(() => {
    if (searchFallbackItem) {
      return [searchFallbackItem, ...filteredItems];
    }
    return filteredItems;
  }, [searchFallbackItem, filteredItems]);

  const groupedSections = useMemo(() => groupCommandItems(filteredItems), [filteredItems]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % flatItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatItems[activeIndex] ?? flatItems[0];
      if (target) {
        runAndClose(target.run);
      }
    }
  };

  const shortcutHint = isMac() ? '⌘ K' : 'Ctrl K';

  // Map item id -> flat index so keyboard highlight works across grouped sections
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    for (let idx = 0; idx < flatItems.length; idx++) {
      map.set(flatItems[idx].id, idx);
    }
    return map;
  }, [flatItems]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="dialog-content app-surface fixed z-[90] top-[16%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[600px] rounded-2xl overflow-hidden"
        >
          <Dialog.Title className="sr-only">
            {t('commandPalette.title', 'Command Palette')}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {t(
              'commandPalette.description',
              'Quickly search tracks, navigate pages, and control playback',
            )}
          </Dialog.Description>

          {/* Search Bar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
            <Search size={18} className="text-white/45 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={t(
                'commandPalette.placeholder',
                'Search tracks, commands, EQ, themes...',
              )}
              className="flex-1 bg-transparent text-[16px] text-white placeholder:text-white/35 outline-none"
            />
            <kbd className="text-[11px] px-2 py-0.5 rounded-md bar-control text-white/50 shrink-0">
              Esc
            </kbd>
          </div>

          {/* Results List */}
          <div className="max-h-[55vh] overflow-y-auto px-3 py-3 space-y-3">
            {searchFallbackItem && (
              <CommandRow
                item={searchFallbackItem}
                selected={(indexById.get(searchFallbackItem.id) ?? -1) === activeIndex}
                onHover={() => setActiveIndex(indexById.get(searchFallbackItem.id) ?? 0)}
                onSelect={() => runAndClose(searchFallbackItem.run)}
              />
            )}

            {groupedSections.map((section) => (
              <div key={section.group}>
                <div className="px-3 pb-1.5 text-[12px] font-semibold text-white/40">
                  {t(GROUP_LABELS[section.group].key, GROUP_LABELS[section.group].fallback)}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const idx = indexById.get(item.id) ?? -1;
                    return (
                      <CommandRow
                        key={item.id}
                        item={item}
                        selected={idx === activeIndex}
                        onHover={() => idx >= 0 && setActiveIndex(idx)}
                        onSelect={() => runAndClose(item.run)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {flatItems.length === 0 && (
              <div className="py-10 text-center text-[13px] text-white/35">
                {t('commandPalette.empty', 'No matching commands')}
              </div>
            )}
          </div>

          {/* Footer Hints */}
          <div className="px-5 py-2.5 border-t border-white/[0.06] flex items-center justify-between text-[12px] text-white/35">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bar-control text-[11px]">↑↓</kbd>
                {t('commandPalette.hintNavigate', 'navigate')}
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft size={10} />
                {t('commandPalette.hintRun', 'run')}
              </span>
            </div>
            <span className="text-[11px]">{shortcutHint}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

const CommandRow = React.memo(function CommandRow({
  item,
  selected,
  onHover,
  onSelect,
}: {
  item: PaletteItem;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
        selected ? 'bg-white/[0.09] text-white' : 'text-white/75 hover:bg-white/[0.05]'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          selected ? 'bar-control is-active text-white' : 'bar-control text-white/55'
        }`}
      >
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate">{item.title}</p>
        {item.subtitle && <p className="text-[12px] text-white/40 truncate">{item.subtitle}</p>}
      </div>
      {item.badge && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bar-control text-white/65 shrink-0">
          {item.badge}
        </span>
      )}
      {item.shortcut && (
        <kbd className="text-[11px] px-1.5 py-0.5 rounded-md bar-control text-white/50 shrink-0">
          {item.shortcut}
        </kbd>
      )}
    </button>
  );
});
