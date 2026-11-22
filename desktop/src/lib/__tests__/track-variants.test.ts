import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dedupeSongs, isVariant, sameSong, songKey } from '../track-variants.ts';

const tr = (title: string, username = 'artist', extra: Record<string, unknown> = {}) =>
  ({ title, user: { username }, ...extra }) as never;

test('fan versions are detected in title and uploader', () => {
  for (const t of [
    'Bandana (slowed + reverb)',
    'Bandana sped up',
    'BANDANA SPEED UP',
    'Bandana [Nightcore]',
    'Bandana 8D Audio',
    'Bandana (Phonk Remix)',
    'Бандана (замедленная версия)',
    'Бандана ремикс',
    'Bandana (Cover)',
    'Bandana (TikTok version)',
  ]) {
    assert.equal(isVariant(tr(t)), true, t);
  }
  assert.equal(isVariant(tr('Bandana', 'slowed songs')), true);
});

test('originals pass', () => {
  for (const t of [
    'Bandana',
    'Reverberation',
    'Cover Me Up',
    'Speedway',
    'Last Friday Night (T.G.I.F.)',
  ]) {
    assert.equal(isVariant(tr(t)), false, t);
  }
});

test('songKey ignores uploader prefix, brackets and feat', () => {
  assert.equal(songKey(tr('kizaru - Bandana (feat. X)')), 'bandana');
  assert.equal(songKey(tr('Bandana')), 'bandana');
});

test('dedupe keeps the most played upload, leaves short titles alone', () => {
  const a = tr('Bandana', 'kizaru', { playback_count: 1000, urn: 'a' });
  const b = tr('kizaru - Bandana', 'reupload', { playback_count: 10, urn: 'b' });
  const i1 = tr('Intro', 'x', { urn: 'i1' });
  const i2 = tr('Intro', 'y', { urn: 'i2' });
  assert.deepEqual(dedupeSongs([b, a, i1, i2]), [a, i1, i2]);
});

test('the same song retitled by the same artist is one song', () => {
  const a = {
    urn: 'a',
    title: 'World Cup (Champions)',
    duration: 180000,
    playback_count: 10,
    user: { username: 'IShowSpeed' },
  };
  const b = {
    urn: 'b',
    title: 'Champions',
    duration: 181500,
    playback_count: 99,
    user: { username: 'iShowSpeed' },
  };
  const other = {
    urn: 'c',
    title: 'Champions League',
    duration: 240000,
    user: { username: 'Queen' },
  };
  assert.ok(sameSong(a as never, b as never));
  assert.ok(!sameSong(a as never, other as never));
  // "Champions (WC 26)" is the same song by the key (brackets dropped).
  const c = {
    urn: 'd',
    title: 'Champions (WC 26)',
    duration: 180500,
    playback_count: 5,
    user: { username: 'IShowSpeed' },
  };
  assert.equal(dedupeSongs([a, b, c] as never[]).length, 1);
  // The more played upload stays.
  assert.deepEqual(
    dedupeSongs([a, b, other] as never[]).map((t: { urn: string }) => t.urn),
    ['b', 'c'],
  );
});
