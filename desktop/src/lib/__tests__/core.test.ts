import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hasCachedTrack } from '../../stores/cached-urns.ts';
import {
  AURAS,
  artistAuraForId,
  auraFromHex,
  DEFAULT_AURA,
  hexToRgb,
  isLight,
  resolveAura,
} from '../aura.ts';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildProfileBackupPayload,
  parseProfileBackupPayload,
} from '../backup-schema.ts';
import { hslToHex, hueOfHex } from '../color.ts';
import {
  type CommandPaletteEntry,
  filterCommandItems,
  groupCommandItems,
} from '../command-palette.ts';
import { EQ_BAND_COUNT, EQ_MAX_GAIN, EQ_MIN_GAIN, EQ_PRESETS } from '../equalizer.ts';
import { isHealthy, markHealthy, markUnhealthy } from '../host-health.ts';
import { cleanPermalink } from '../permalink.ts';
import { isNewerVersion } from '../semver.ts';
import { isPresetWallpaper, PRESET_WALLPAPERS, resolveWallpaperUrl } from '../wallpapers.ts';
import {
  interleaveByArtist,
  scoreTrackForVibe,
  tuneWaveTracks,
  WAVE_VIBES,
} from '../wave-vibes.ts';

test('buildProfileBackupPayload keeps only whitelisted settings keys', () => {
  const payload = buildProfileBackupPayload({
    settings: {
      accentColor: '#ff5500',
      eqEnabled: true,
      eqGains: [1, 0, -1, 0, 2, 0, 0, 0, 0, 0],
      unknownSecretField: 'should-not-leak',
      setAccentColor: () => {},
    },
    libraryLocal: {
      superlikes: [{ urn: 'soundcloud:tracks:1', title: 'Track 1' }],
      disliked: [],
      likesTop: ['soundcloud:tracks:1'],
      likesBottom: [],
    },
    playerPreferences: {
      volume: 85,
      playbackRate: 1.0,
      pitchSemitones: 0,
      pitchControlMode: 'auto',
      shuffle: false,
      repeat: 'off',
    },
  });

  assert.equal(payload.format, BACKUP_FORMAT);
  assert.equal(payload.version, BACKUP_VERSION);
  assert.equal(payload.settings.accentColor, '#ff5500');
  assert.equal(payload.settings.eqEnabled, true);
  assert.equal('unknownSecretField' in payload.settings, false);
  assert.equal('setAccentColor' in payload.settings, false);
});

test('parseProfileBackupPayload rejects invalid headers and clamps player values', () => {
  assert.equal(parseProfileBackupPayload(null), null);
  assert.equal(parseProfileBackupPayload({ format: 'other', version: 1 }), null);
  assert.equal(
    parseProfileBackupPayload({
      format: BACKUP_FORMAT,
      version: 99,
      settings: {},
      libraryLocal: {},
    }),
    null,
  );

  const parsed = parseProfileBackupPayload({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-11-15T00:00:00.000Z',
    settings: {
      panelStyle: 'flat',
      injectedKey: 'ignored',
    },
    libraryLocal: {
      superlikes: [{ urn: 'soundcloud:tracks:42', title: 'Valid' }, { title: 'Missing URN' }],
      disliked: ['not-an-object'],
      likesTop: ['soundcloud:tracks:42', 123],
      likesBottom: [],
    },
    playerPreferences: {
      volume: 999,
      playbackRate: 10,
      pitchSemitones: -40,
      pitchControlMode: 'manual',
      shuffle: true,
      repeat: 'all',
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.settings.panelStyle, 'flat');
  assert.equal('injectedKey' in parsed.settings, false);
  assert.equal(parsed.libraryLocal.superlikes.length, 1);
  assert.equal(parsed.libraryLocal.disliked.length, 0);
  assert.deepEqual(parsed.libraryLocal.likesTop, ['soundcloud:tracks:42']);
  assert.equal(parsed.playerPreferences.volume, 200);
  assert.equal(parsed.playerPreferences.playbackRate, 3);
  assert.equal(parsed.playerPreferences.pitchSemitones, -12);
  assert.equal(parsed.playerPreferences.pitchControlMode, 'manual');
  assert.equal(parsed.playerPreferences.shuffle, true);
  assert.equal(parsed.playerPreferences.repeat, 'all');
});

test('host-health marks hosts unhealthy and restores them', () => {
  const host = 'stream.example.test';
  assert.equal(isHealthy(host), true);
  markUnhealthy(host);
  assert.equal(isHealthy(host), false);
  markHealthy(host);
  assert.equal(isHealthy(host), true);
});

test('semver compares versions accurately', () => {
  assert.equal(isNewerVersion('1.3.1', '1.3.0'), true);
  assert.equal(isNewerVersion('1.3.0', '1.3.0'), false);
  assert.equal(isNewerVersion('1.2.9', '1.3.0'), false);
});

test('resolveWallpaperUrl supports preset wallpapers and blocks path traversal', () => {
  assert.equal(isPresetWallpaper('preset:solar-amber.png'), true);
  assert.equal(isPresetWallpaper('wallpaper_123.jpg'), false);
  assert.equal(resolveWallpaperUrl('preset:solar-amber.png', null), '/wallpapers/solar-amber.png');
  assert.equal(resolveWallpaperUrl('preset:../secret.png', null), null);
  assert.equal(resolveWallpaperUrl('wallpaper_123.jpg', null), null);
  assert.equal(
    resolveWallpaperUrl('wallpaper_123.jpg', 9876),
    'http://127.0.0.1:9876/wallpapers/wallpaper_123.jpg',
  );

  for (const preset of PRESET_WALLPAPERS) {
    const filePath = path.resolve(import.meta.dirname, '../../../public/wallpapers', preset.file);
    assert.equal(fs.existsSync(filePath), true, `Missing preset wallpaper file: ${preset.file}`);
    assert.equal(resolveWallpaperUrl(preset.id, null), `/wallpapers/${preset.file}`);
  }
});

test('aura helpers resolve presets, custom hex, luminance, and deterministic artist auras', () => {
  assert.equal(AURAS.length >= 7, true);
  assert.deepEqual(hexToRgb('#ff5500'), [255, 85, 0]);
  assert.equal(hexToRgb('bad'), null);

  const custom = auraFromHex('#22c55e');
  assert.ok(custom);
  assert.equal(custom.id, 'custom');
  assert.deepEqual(custom.accent, [34, 197, 94]);

  assert.equal(resolveAura('cyber', null).id, 'cyber');
  assert.equal(resolveAura('custom', '#0ea5e9').id, 'custom');
  assert.equal(resolveAura('unknown', null).id, DEFAULT_AURA.id);

  assert.equal(isLight(AURAS.find((a) => a.id === 'void')!), true);
  assert.equal(isLight(AURAS.find((a) => a.id === 'aurora')!), false);

  const a1 = artistAuraForId('artist-42');
  const a2 = artistAuraForId('artist-42');
  assert.equal(a1.id, a2.id);
  assert.equal(artistAuraForId(undefined).id, DEFAULT_AURA.id);
});

test('en and ru locale files stay structurally valid and aligned on updated sections', () => {
  const localesDir = path.resolve(import.meta.dirname, '../../i18n/locales');
  const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
  const ru = JSON.parse(fs.readFileSync(path.join(localesDir, 'ru.json'), 'utf8'));

  for (const key of ['starBadge', 'starProfile', 'auraTitle', 'auraCustom']) {
    assert.ok(en.user[key], `Missing en.user.${key}`);
    assert.ok(ru.user[key], `Missing ru.user.${key}`);
  }
  for (const key of ['recentlyPlayed', 'freshReleases', 'recommended', 'discover']) {
    assert.ok(en.home[key], `Missing en.home.${key}`);
    assert.ok(ru.home[key], `Missing ru.home.${key}`);
  }
  for (const key of ['startWave', 'statusLive', 'statusStandby', 'modeLabel']) {
    assert.ok(en.soundwave[key], `Missing en.soundwave.${key}`);
    assert.ok(ru.soundwave[key], `Missing ru.soundwave.${key}`);
  }
  for (const vibe of WAVE_VIBES) {
    assert.ok(en.soundwave.vibes?.[vibe.id], `Missing en.soundwave.vibes.${vibe.id}`);
    assert.ok(ru.soundwave.vibes?.[vibe.id], `Missing ru.soundwave.vibes.${vibe.id}`);
  }
  for (const mode of ['similar', 'diverse']) {
    assert.ok(en.soundwave.modes?.[mode], `Missing en.soundwave.modes.${mode}`);
    assert.ok(ru.soundwave.modes?.[mode], `Missing ru.soundwave.modes.${mode}`);
  }
  assert.ok(en.settings.liquidGlass);
  assert.ok(en.settings.panelStyleDesc_liquid);
  assert.ok(ru.settings.liquidGlass);
  assert.ok(ru.settings.panelStyleDesc_liquid);

  assert.ok(en.offline.cachedBadge);
  assert.ok(ru.offline.cachedBadge);
  assert.ok(en.kb.commandPalette);
  assert.ok(ru.kb.commandPalette);
  for (const key of [
    'title',
    'placeholder',
    'empty',
    'groupNavigation',
    'groupPlayback',
    'groupAudio',
    'groupAppearance',
    'searchFor',
  ]) {
    assert.ok(en.commandPalette[key], `Missing en.commandPalette.${key}`);
    assert.ok(ru.commandPalette[key], `Missing ru.commandPalette.${key}`);
  }
  assert.equal(
    Array.isArray(en.settings.whatsNewItems) && en.settings.whatsNewItems.length > 0,
    true,
  );
  assert.equal(
    Array.isArray(ru.settings.whatsNewItems) && ru.settings.whatsNewItems.length > 0,
    true,
  );
});

test('command palette filtering ranks exact/prefix matches first and groups properly', () => {
  const noop = () => {};
  const entries: CommandPaletteEntry[] = [
    {
      id: 'theme-neon',
      group: 'appearance',
      title: 'Theme: Neon',
      keywords: ['color', 'accent'],
      run: noop,
    },
    {
      id: 'eq-bass',
      group: 'audio',
      title: 'EQ: Bass Boost',
      keywords: ['equalizer', 'bass'],
      run: noop,
    },
    {
      id: 'nav-soundwave',
      group: 'navigation',
      title: 'SoundWave',
      subtitle: '/soundwave',
      keywords: ['wave', 'radio'],
      run: noop,
    },
    {
      id: 'play-next',
      group: 'playback',
      title: 'Next track',
      keywords: ['skip'],
      run: noop,
    },
  ];

  assert.equal(filterCommandItems(entries, '').length, 4);
  const bassMatches = filterCommandItems(entries, 'bass eq');
  assert.equal(bassMatches.length, 1);
  assert.equal(bassMatches[0].id, 'eq-bass');

  const waveMatches = filterCommandItems(entries, 'soundwave');
  assert.equal(waveMatches[0].id, 'nav-soundwave');

  const grouped = groupCommandItems(entries);
  assert.deepEqual(
    grouped.map((g) => g.group),
    ['navigation', 'playback', 'audio', 'appearance'],
  );
});

test('hasCachedTrack checks Set membership safely', () => {
  const urns = new Set(['soundcloud:tracks:101', 'soundcloud:tracks:202']);
  assert.equal(hasCachedTrack(urns, 'soundcloud:tracks:101'), true);
  assert.equal(hasCachedTrack(urns, 'soundcloud:tracks:999'), false);
  assert.equal(hasCachedTrack(urns, null), false);
  assert.equal(hasCachedTrack(urns, undefined), false);
});

test('wave-vibes scores moods, interleaves artists in diverse mode, and preserves fallback tracks', () => {
  const sample = [
    {
      urn: 't:1',
      title: 'Midnight Phonk Sprint',
      genre: 'Phonk',
      tag_list: 'gym workout bass',
      duration: 150_000,
      user: { urn: 'u:a', username: 'ArtistA' },
    },
    {
      urn: 't:2',
      title: 'Heavy Gym Pump',
      genre: 'Phonk',
      tag_list: 'workout hard',
      duration: 160_000,
      user: { urn: 'u:a', username: 'ArtistA' },
    },
    {
      urn: 't:3',
      title: 'Rainy Study Piano',
      genre: 'Ambient',
      tag_list: 'lofi focus instrumental',
      duration: 240_000,
      user: { urn: 'u:b', username: 'ArtistB' },
    },
    {
      urn: 't:4',
      title: 'Deep Midnight Noir',
      genre: 'Deep House',
      tag_list: 'night atmospheric',
      duration: 210_000,
      user: { urn: 'u:c', username: 'ArtistC' },
    },
  ];

  assert.equal(scoreTrackForVibe(sample[2], 'focus') > scoreTrackForVibe(sample[0], 'focus'), true);
  assert.equal(
    scoreTrackForVibe(sample[0], 'workout') > scoreTrackForVibe(sample[2], 'workout'),
    true,
  );
  assert.equal(scoreTrackForVibe(sample[3], 'night') > 0, true);

  const focusRanked = tuneWaveTracks([...sample, sample[2]], 'focus', 'similar');
  assert.equal(focusRanked.length, 4); // deduplicated
  assert.equal(focusRanked[0].urn, 't:3');

  const interleaved = interleaveByArtist([sample[0], sample[1], sample[2]]);
  assert.deepEqual(
    interleaved.map((t) => t.urn),
    ['t:1', 't:3', 't:2'],
  );

  const diverseWorkout = tuneWaveTracks(sample, 'workout', 'diverse');
  assert.equal(diverseWorkout[0].urn, 't:1');
  assert.equal(diverseWorkout[1].urn, 't:2');
});

test('equalizer presets and cleanPermalink conform to invariants', () => {
  for (const [id, preset] of Object.entries(EQ_PRESETS)) {
    assert.equal(preset.gains.length, EQ_BAND_COUNT, `Preset ${id} band count mismatch`);
    assert.ok(preset.label.length > 0 && preset.labelRu.length > 0);
    for (const g of preset.gains) {
      assert.equal(g >= EQ_MIN_GAIN && g <= EQ_MAX_GAIN, true, `Preset ${id} out of range`);
    }
  }

  assert.equal(
    cleanPermalink('https://soundcloud.com/artist/track?utm_source=x&utm_medium=y&in=playlist'),
    'https://soundcloud.com/artist/track?in=playlist',
  );
  assert.equal(
    cleanPermalink('https://soundcloud.com/artist/track?utm_campaign=promo'),
    'https://soundcloud.com/artist/track',
  );
});

test('backup-schema includes soundwaveVibe and soundwaveMode', () => {
  const payload = buildProfileBackupPayload({
    settings: {
      soundwaveVibe: 'night',
      soundwaveMode: 'diverse',
      panelStyle: 'flat',
    },
    libraryLocal: { superlikes: [], disliked: [], likesTop: [], likesBottom: [] },
    playerPreferences: {},
  });
  const parsed = parseProfileBackupPayload(payload);
  assert.ok(parsed);
  assert.equal(parsed.settings.soundwaveVibe, 'night');
  assert.equal(parsed.settings.soundwaveMode, 'diverse');
  assert.equal(parsed.settings.panelStyle, 'flat');
});

test('accent picker colour round trip', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 50), '#00ff00');
  assert.equal(hueOfHex('#0000ff'), 240);
  assert.equal(hueOfHex('#ff5500'), 20);
  assert.equal(hueOfHex('#808080'), 0);
  assert.equal(hueOfHex(hslToHex(200, 90, 55)), 200);
});
