import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeReleases,
  freshReleases,
  hasTrendSignal,
  rankChart,
  realImage,
  releaseBaseTitle,
} from '../discover-utils.ts';

test('dedupeReleases drops repeated covers and same artist + title', () => {
  const a = { id: '1', title: 'Night', cover_url: 'c1', primary_artist: { name: 'X' } };
  const sameCover = { id: '2', title: 'Other', cover_url: 'c1', primary_artist: { name: 'Y' } };
  const sameName = { id: '3', title: 'night ', cover_url: 'c3', primary_artist: { name: 'x' } };
  const fresh = { id: '4', title: 'Day', primary_artist: { name: 'X' } };
  assert.deepEqual(
    dedupeReleases([a, sameCover, sameName, fresh, a]).map((r) => r.id),
    ['1', '4'],
  );
});

test('rankChart keeps full tracks, most played first, no duplicates', () => {
  const tracks = [
    { urn: 'a', duration: 200_000, playback_count: 10 },
    { urn: 'b', duration: 30_000, playback_count: 999 },
    { urn: 'c', duration: 200_000, playback_count: 50, likes_count: 1 },
    { urn: 'd', duration: 200_000, playback_count: 50, likes_count: 5 },
    { urn: 'a', duration: 200_000, playback_count: 10 },
  ];
  assert.deepEqual(
    rankChart(tracks, 3).map((t) => t.urn),
    ['d', 'c', 'a'],
  );
});

test('releaseBaseTitle folds editions into one title', () => {
  for (const t of [
    'Legends Never Die (5 Year Anniversary Edition)',
    'Legends Never Die [Deluxe]',
    'legends never die*',
    'Legends Never Die - Deluxe Edition',
  ]) {
    assert.equal(releaseBaseTitle(t), 'legends never die');
  }
  assert.equal(releaseBaseTitle('? (Deluxe)'), '?');
});

test('dedupeReleases keeps one edition per artist', () => {
  const ids = dedupeReleases([
    {
      id: '1',
      title: 'Goodbye & Good Riddance (5 Year Anniversary Edition)',
      primary_artist: { name: 'Juice WRLD' },
    },
    { id: '2', title: 'Goodbye & Good Riddance', primary_artist: { name: 'Juice WRLD' } },
    { id: '3', title: 'Goodbye & Good Riddance', primary_artist: { name: 'Someone Else' } },
  ]).map((r) => r.id);
  assert.deepEqual(ids, ['1', '3']);
});

test('freshReleases keeps the last 12 months by release date, newest first', () => {
  const now = new Date(2026, 10, 24); // November 2026
  const items = [
    { id: 'old', title: 'Old', release_year: 2017, release_month: 2 },
    { id: 'aug', title: 'Aug', release_year: 2026, release_month: 8 },
    { id: 'nov', title: 'Nov', release_year: 2026, release_month: 11 },
    { id: 'dec25', title: 'Dec', release_year: 2025, release_month: 12 },
    { id: 'nov25', title: 'Nov25', release_year: 2025, release_month: 11 },
    { id: 'future', title: 'Future', release_year: 2027, release_month: 1 },
    { id: 'none', title: 'Undated' },
  ];
  assert.deepEqual(
    freshReleases(items, now).map((r) => r.id),
    ['nov', 'aug', 'dec25'],
  );
});

test('realImage drops the Genius placeholder cover', () => {
  assert.equal(realImage('https://assets.genius.com/images/default_cover_image.png?17'), undefined);
  assert.equal(realImage('https://images.genius.com/a.jpg'), 'https://images.genius.com/a.jpg');
  assert.equal(realImage(undefined), undefined);
});

test('hasTrendSignal needs listeners, not just a flat score', () => {
  assert.equal(hasTrendSignal([{ monthly_listeners: 1 }, { monthly_listeners: 2 }]), false);
  assert.equal(hasTrendSignal([{ monthly_listeners: 1 }, { monthly_listeners: 5000 }]), true);
});
