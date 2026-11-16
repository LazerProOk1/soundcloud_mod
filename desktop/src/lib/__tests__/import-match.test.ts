import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchScore, normalize, parseTextList } from '../import-match.ts';

test('parses "Artist - Title" lines, numbering and plain titles', () => {
  const text = ['1. kizaru - Bandana', 'Монеточка — гори гори гори', '', 'Just A Title'];
  assert.deepEqual(parseTextList(text.join('\n')), [
    { artist: 'kizaru', title: 'Bandana' },
    { artist: 'Монеточка', title: 'гори гори гори' },
    { artist: '', title: 'Just A Title' },
  ]);
});

test('normalize drops brackets, punctuation and ё', () => {
  assert.equal(normalize('Ёлка (feat. X) — Новый Год!'), 'елка новый год');
});

test('scores the right song above noise', () => {
  const want = { artist: 'kizaru', title: 'Bandana', durationMs: 180000 };
  const good = matchScore(want, {
    title: 'Bandana',
    duration: 181000,
    user: { username: 'kizaru' },
  } as never);
  const cover = matchScore(want, {
    title: 'Bandana (cover)',
    duration: 250000,
    user: { username: 'someone' },
  } as never);
  const other = matchScore(want, {
    title: 'Hoodie',
    duration: 180000,
    user: { username: 'kizaru' },
  } as never);
  assert.ok(good >= 5);
  assert.ok(cover < good);
  assert.equal(other, -1);
});
