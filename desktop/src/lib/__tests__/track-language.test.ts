import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesLanguages } from '../track-language.ts';

const t = (title: string, username: string, extra: Record<string, string> = {}) =>
  ({ title, user: { username }, ...extra }) as never;

test('cyrillic title is Russian', () => {
  assert.equal(matchesLanguages(t('Я тебя не отдам', 'SEREBRO'), ['ru']), true);
  assert.equal(matchesLanguages(t('Я тебя не отдам', 'SEREBRO'), ['en']), false);
});

test('latin title with cyrillic description counts as Russian, not English', () => {
  const track = t('MONEY LONG', 'kizaru', { description: 'новый альбом' });
  assert.equal(matchesLanguages(track, ['ru']), true);
  assert.equal(matchesLanguages(track, ['en']), false);
});

test('latin-only track is English-ish', () => {
  assert.equal(matchesLanguages(t('Blinding Lights', 'The Weeknd'), ['en']), true);
  assert.equal(matchesLanguages(t('Blinding Lights', 'The Weeknd'), ['ru']), false);
});

test('empty selection keeps everything; korean by script', () => {
  assert.equal(matchesLanguages(t('x', 'y'), []), true);
  assert.equal(matchesLanguages(t('봄날', 'BTS'), ['ko']), true);
});
