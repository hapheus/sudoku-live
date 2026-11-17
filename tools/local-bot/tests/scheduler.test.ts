import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMovePause, pickTargetDuration } from '../src/move-scheduler.ts';

const base = { remaining: 30, totalMoves: 45, technique: 'naked_single', candidateCount: 1 };
const pause = (context = {}, budget = 90_000, draw = 0.5) => nextMovePause({ ...base, ...context }, budget, 135_000, () => draw);

test('actual difficulty sets a bounded starting pace for both variants', () => {
  assert.ok(pickTargetDuration('easy', '3x3', () => 0.5) < pickTargetDuration('hard', '3x3', () => 0.5));
  assert.equal(pickTargetDuration('easy', '2x3', () => 0.5), Math.round(135_000 * 36 / 81));
  assert.ok(pickTargetDuration('easy', '3x3', () => 0.5, [480_000, 900_000]) <= 180_000);
  assert.throws(() => pickTargetDuration('easy', '3x3', () => 1));
  assert.throws(() => pickTargetDuration('easy', '3x3', Math.random, [20, 10]));
});

test('a simple visible placement is faster than searching a hidden single or advanced deduction', () => {
  const full = pause({ technique: 'full_house' });
  const naked = pause();
  const hidden = pause({ technique: 'hidden_single', candidateCount: 3 });
  const advanced = pause({ technique: 'locked_candidate', candidateCount: 3 });
  const fallback = pause({ technique: 'fallback', candidateCount: 6 });
  assert.ok(full < naked && naked < hidden && hidden < advanced && advanced < fallback);
});

test('the current board and a run of nearby opportunities change the actual next placement deadline', () => {
  const dense = pause({ opportunities: 0, averageCandidates: 5, nearFocus: false, flowStreak: 0 });
  const opening = pause({ opportunities: 8, averageCandidates: 2, nearFocus: true, flowStreak: 3 });
  assert.ok(dense > opening * 1.5);
  assert.ok(pause({ tempo: 1.15 }) > pause({ tempo: 0.85 }));
});

test('the last obvious cell never waits out a nominal whole-game budget', () => {
  const end = pause({ technique: 'full_house', remaining: 1, opportunities: 1 }, 120_000);
  assert.ok(end < 3_000, `last cell stalled for ${end}ms`);
  assert.ok(end < pause({ technique: 'full_house' }, 120_000));
});

test('runtime pauses include short fluent runs and longer thinking without catch-up bursts', () => {
  let seed = 15;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pauses = Array.from({ length: 100 }, () => nextMovePause(base, 90_000, 135_000, random));
  assert.ok(Math.max(...pauses) > Math.min(...pauses) * 2.5);
  assert.ok(Math.min(...pauses) >= 350);
  assert.ok(Math.max(...pauses) <= 18_000);
  assert.ok(pause({}, 0) > 0);
});
