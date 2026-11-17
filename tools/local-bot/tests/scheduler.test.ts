import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateMoveFactor, nextMovePause, planPauses } from '../src/move-scheduler.ts';

test('natural pauses vary, stay bounded and meet the difficulty duration range', () => {
  for (const [difficulty, min, max] of [
    ['easy', 90_000, 180_000], ['medium', 150_000, 270_000], ['hard', 210_000, 420_000],
  ] as const) {
    let seed = 15;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pauses = planPauses(difficulty, '3x3', 50, random);
    const total = pauses.reduce((a, b) => a + b, 0);
    assert.ok(total >= min && total <= max);
    assert.equal(pauses.length, 50);
    assert.ok(new Set(pauses).size > 10);
    assert.ok(pauses.every(pause => pause >= total / 50 * 0.25 - 1 && pause <= total / 50 * 3.5 + 1));
  }
});

test('6x6 scales duration by cell count and invalid inputs are rejected', () => {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  assert.equal(sum(planPauses('easy', '2x3', 20, () => 0.5)), Math.round(135_000 * 36 / 81));
  assert.deepEqual(planPauses('hard', '3x3', 0), []);
  assert.throws(() => planPauses('easy', '3x3', -1));
  assert.throws(() => planPauses('easy', '3x3', 10, () => 1));
  assert.throws(() => planPauses('easy', '3x3', 10, Math.random, [20, 10]));
});

test('legacy long duration settings cannot make the natural profile crawl', () => {
  const pauses = planPauses('easy', '3x3', 45, () => 0.5, [480_000, 900_000]);
  assert.ok(pauses.reduce((a, b) => a + b, 0) <= 180_000);
  assert.equal(planPauses('easy', '3x3', 10, () => 0.5, [1_000, 1_000]).reduce((a, b) => a + b, 0), 1_000);
});

test('move pause scales with solving strategy difficulty and speeds up in endgame', () => {
  const base = { remaining: 30, totalMoves: 45 };
  const fullHouse = nextMovePause({ ...base, technique: 'full_house', candidateCount: 1 }, 90_000, 135_000, () => 0.5);
  const hiddenBox = nextMovePause({ ...base, technique: 'hidden_single', unitType: 'box', candidateCount: 2 }, 90_000, 135_000, () => 0.5);
  const nakedSingle = nextMovePause({ ...base, technique: 'naked_single', candidateCount: 1 }, 90_000, 135_000, () => 0.5);
  const locked = nextMovePause({ ...base, technique: 'locked_candidate', candidateCount: 2 }, 90_000, 135_000, () => 0.5);
  assert.ok(fullHouse < hiddenBox);
  assert.ok(hiddenBox < nakedSingle);
  assert.ok(nakedSingle < locked);
  assert.ok(estimateMoveFactor({ technique: 'naked_single', candidateCount: 1, remaining: 4, totalMoves: 45 })
    < estimateMoveFactor({ technique: 'naked_single', candidateCount: 1, remaining: 25, totalMoves: 45 }));
});
