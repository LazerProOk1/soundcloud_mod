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

test('prefers the original over mashups and edits', () => {
  const want = {
    artist: 'Tame Impala',
    title: 'New Person, Same Old Mistakes',
    durationMs: 361000,
  };
  const original = matchScore(want, {
    title: 'New Person, Same Old Mistakes',
    duration: 362000,
    user: { username: 'Tame Impala' },
  } as never);
  const mashup = matchScore(want, {
    title: 'Rihanna X Tame Impala - New Person, Same Old Mistakes (mixed)',
    duration: 328000,
    user: { username: 'danielrekai' },
  } as never);
  const sped = matchScore(want, {
    title: 'New Person, Same Old Mistakes (sped up)',
    duration: 300000,
    user: { username: 'Tame Impala' },
  } as never);
  assert.ok(mashup < 2, `mashup scored ${mashup}`);
  assert.ok(sped < original);
  // Asked for a remix: a remix is not penalised.
  const remixWant = { artist: 'Justin Bieber', title: 'Yummy (Summer Walker Remix)' };
  const remix = matchScore(remixWant, {
    title: 'Yummy (Summer Walker Remix)',
    duration: 209000,
    user: { username: 'Justin Bieber' },
  } as never);
  assert.ok(remix >= 5);
});
