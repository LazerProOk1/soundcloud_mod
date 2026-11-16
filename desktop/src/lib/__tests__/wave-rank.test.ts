import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_TASTE,
  mixIn,
  onFinished,
  onMoreLikeThis,
  onNotThis,
  onPlayed,
  onSkip,
  rankWave,
} from '../wave-rank.ts';

const t = (urn: string, artist: string) => ({ urn, user: { urn: artist, username: artist } });

test('a skip hides the song but only nudges the artist', () => {
  let taste = onSkip(EMPTY_TASTE, t('1', 'a'), 3);
  assert.equal(taste.artists.a, -0.3);
  assert.deepEqual(taste.skippedSongs, ['1']);
  taste = onSkip(taste, t('2', 'a'), 20);
  assert.equal(taste.artists.a, -0.4);
  taste = onSkip(taste, t('3', 'a'), 90);
  assert.equal(taste.artists.a, -0.4);
  taste = onFinished(taste, t('4', 'a'));
  assert.equal(taste.artists.a, 0.1);
  const big = Array.from({ length: 20 }, (_, i) => t(String(i), `art${i}`));
  assert.ok(!rankWave(big, taste).some((x) => x.urn === '1'));
});

test('"Not this" bans the track; blocked artists disappear', () => {
  let taste = onNotThis(EMPTY_TASTE, t('x', 'b'));
  taste = onNotThis(taste, t('y', 'b'));
  const out = rankWave([t('x', 'b'), t('y', 'b'), t('z', 'b'), t('k', 'c')], taste);
  assert.deepEqual(
    out.map((x) => x.urn),
    ['k'],
  );
});

test('liked artists move forward, same artist is never back to back', () => {
  const taste = onMoreLikeThis(onMoreLikeThis(EMPTY_TASTE, t('0', 'fav')), t('0', 'fav'));
  const tracks = [t('1', 'a'), t('2', 'a'), t('3', 'b'), t('4', 'c'), t('5', 'fav'), t('6', 'fav')];
  const out = rankWave(tracks, taste).map((x) => x.urn);
  assert.ok(out.indexOf('5') < 4, out.join());
  for (let i = 1; i < out.length; i++) {
    const a = tracks.find((x) => x.urn === out[i - 1])?.user.urn;
    const b = tracks.find((x) => x.urn === out[i])?.user.urn;
    assert.notEqual(a, b, out.join());
  }
});

test('recently played tracks rest only when there is enough else', () => {
  let taste = EMPTY_TASTE;
  for (const u of ['1', '2']) taste = onPlayed(taste, t(u, 'z'));
  const small = [t('1', 'a'), t('2', 'b'), t('3', 'c')];
  assert.equal(rankWave(small, taste).length, 3);
  const big = Array.from({ length: 20 }, (_, i) => t(String(i), `art${i}`));
  const out = rankWave(big, taste).map((x) => x.urn);
  assert.ok(!out.includes('1') && !out.includes('2'));
});

test('mixIn puts one familiar track after every two others', () => {
  const out = mixIn(
    [t('1', 'a'), t('2', 'b'), t('3', 'c'), t('4', 'd')],
    [t('L', 'l'), t('M', 'm')],
  );
  assert.deepEqual(
    out.map((x) => x.urn),
    ['1', '2', 'L', '3', '4', 'M'],
  );
});
