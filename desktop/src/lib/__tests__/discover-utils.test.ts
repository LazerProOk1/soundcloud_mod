import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeReleases, rankChart } from '../discover-utils.ts';

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
