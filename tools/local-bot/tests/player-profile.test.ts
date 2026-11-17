import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choosePlayerProfile, replacementDelay } from '../src/player-profile.ts';

test('player starts sample both board sizes, all difficulties, both join policies and 1..3 puzzles', () => {
  const profiles = [0, 0.26, 0.51, 0.76, 0.999999].map(draw => choosePlayerProfile({ difficulty: 'random' }, () => draw));
  assert.deepEqual(new Set(profiles.map(p => p.variant)), new Set(['2x3', '3x3']));
  assert.deepEqual(new Set(profiles.map(p => p.difficulty)), new Set(['easy', 'medium', 'hard', 'expert']));
  assert.deepEqual(new Set(profiles.map(p => p.joinPolicy)), new Set(['auto', 'disabled']));
  assert.deepEqual(new Set(profiles.map(p => p.puzzles)), new Set([1, 2, 3]));
});

test('replacement gaps stay within 10..30 seconds, including both endpoints', () => {
  assert.equal(replacementDelay(() => 0), 10_000);
  assert.equal(replacementDelay(() => 0.999999), 30_000);
  let seed = 7;
  for (let i = 0; i < 1_000; i++) {
    const pause = replacementDelay(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
    assert.ok(pause >= 10_000 && pause <= 30_000);
  }
});
