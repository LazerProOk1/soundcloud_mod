import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uniqueSocials } from '../../components/artist/social-links.ts';

const s = (kind: string, url: string, verified = false) => ({ kind, url, source: 'x', verified });

test('one link per service, soundcloud dropped when accounts shown, ordered', () => {
  const out = uniqueSocials(
    [
      s('facebook', 'f1'),
      s('apple_music', 'a1'),
      s('apple_music', 'a2', true),
      s('facebook', 'f2'),
      s('soundcloud', 'sc'),
      s('X', 'x1'),
      s('spotify', 'sp'),
    ],
    true,
  );
  assert.deepEqual(
    out.map((l) => `${l.kind}:${l.url}`),
    ['spotify:sp', 'apple_music:a2', 'twitter:x1', 'facebook:f1'],
  );
  assert.equal(uniqueSocials([s('soundcloud', 'sc')], false).length, 1);
});
