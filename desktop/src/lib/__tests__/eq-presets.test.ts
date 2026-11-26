import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPresetGains, customPresetId, normalizePresetName } from '../eq-presets.ts';
import { EQ_BAND_COUNT } from '../equalizer.ts';

test('ids are unique per call and never collide with built-in preset ids', () => {
  const first = customPresetId(1_000);
  const second = customPresetId(2_000);
  assert.notEqual(first, second);
  assert.equal(first.startsWith('custom:'), true);
});

test('names are trimmed and inner whitespace is collapsed', () => {
  assert.equal(normalizePresetName('  Bass   boost '), 'Bass boost');
  assert.equal(normalizePresetName('   '), null);
  assert.equal(normalizePresetName('x'.repeat(41)), null);
});

test('gains are clamped to the EQ range and padded to every band', () => {
  const gains = clampPresetGains([20, -30, 3.5]);
  assert.equal(gains.length, EQ_BAND_COUNT);
  assert.deepEqual(gains.slice(0, 4), [12, -12, 3.5, 0]);
});

test('non-numeric gaps become silence instead of NaN', () => {
  const gains = clampPresetGains([Number.NaN, 2]);
  assert.equal(gains[0], 0);
  assert.equal(gains[1], 2);
});
