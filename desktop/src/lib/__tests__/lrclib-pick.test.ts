import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickByDuration } from '../lyrics-pick.ts';

const hit = (duration: number, synced = true) => ({
  duration,
  syncedLyrics: synced ? '[00:01.00] a' : null,
});

test('pickByDuration prefers the closest synced hit', () => {
  const list = [hit(200), hit(181, false), hit(183), hit(179)];
  assert.equal(pickByDuration(list, 180, 20, true)?.duration, 179);
});

test('pickByDuration rejects far hits in strict mode only', () => {
  const list = [hit(240)];
  assert.equal(pickByDuration(list, 180, 4, false), null);
  assert.equal(pickByDuration(list, 180, 20, true)?.duration, 240);
});
