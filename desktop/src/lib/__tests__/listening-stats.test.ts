import assert from 'node:assert/strict';
import test from 'node:test';
import type { HistoryEntry } from '../hooks.ts';
import { summarizeListening } from '../listening-stats.ts';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-26T12:00:00.000Z');

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: 'id',
    scTrackId: 'soundcloud:tracks:1',
    title: 'Track',
    artistName: 'Artist',
    artistUrn: 'soundcloud:users:1',
    artworkUrl: null,
    duration: 180_000,
    playedAt: new Date(NOW - HOUR).toISOString(),
    ...overrides,
  };
}

test('counts plays, minutes and unique artists inside the window', () => {
  const stats = summarizeListening(
    [
      entry({ duration: 210_000 }),
      entry({ duration: 90_000, scTrackId: 'soundcloud:tracks:2' }),
      entry({ artistName: 'Other', artistUrn: 'soundcloud:users:2', duration: 60_000 }),
    ],
    { now: NOW },
  );

  assert.equal(stats.plays, 3);
  assert.equal(stats.minutes, 6);
  assert.equal(stats.artists, 2);
});

test('drops plays older than the window and keeps everything when days is 0', () => {
  const old = entry({
    playedAt: new Date(NOW - 40 * 24 * HOUR).toISOString(),
    artistUrn: 'soundcloud:users:9',
    artistName: 'Old',
  });

  assert.equal(summarizeListening([entry({}), old], { now: NOW, days: 30 }).plays, 1);
  assert.equal(summarizeListening([entry({}), old], { now: NOW, days: 0 }).plays, 2);
});

test('ranks artists and tracks by time listened, not by play count', () => {
  const stats = summarizeListening(
    [
      entry({ artistName: 'A', artistUrn: 'u-a', duration: 60_000 }),
      entry({ artistName: 'A', artistUrn: 'u-a', duration: 60_000 }),
      entry({
        artistName: 'B',
        artistUrn: 'u-b',
        duration: 200_000,
        scTrackId: 'soundcloud:tracks:2',
      }),
    ],
    { now: NOW, top: 1 },
  );

  assert.deepEqual(
    stats.topArtists.map((artist) => artist.name),
    ['B'],
  );
  assert.deepEqual(
    stats.topTracks.map((track) => track.urn),
    ['soundcloud:tracks:2'],
  );
});

test('ignores entries without a readable date', () => {
  const broken = entry({ playedAt: 'not a date' });
  assert.equal(summarizeListening([broken], { now: NOW }).plays, 0);
});
