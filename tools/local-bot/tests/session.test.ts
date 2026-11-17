import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameSession } from '../src/game-session.ts';
import { findConflicts, findLogicalHint } from '../../../src/domain/sudoku-engine.js';
import { countSolutions, isValidSolvedBoard } from '../../../src/domain/sudoku-generator.js';

test('a solo session solves a real puzzle without changing clues or repeating moves', () => {
  const session = new GameSession('easy', '3x3');
  const initial = session.snapshot();
  const indices = new Set<number>();
  while (!session.solved) {
    const move = session.advance();
    assert.ok(move);
    assert.equal(initial.givens[move.index], false);
    assert.equal(indices.has(move.index), false);
    indices.add(move.index);
    const current = session.snapshot();
    assert.deepEqual(findConflicts(current.board, current.variant), []);
    initial.givens.forEach((given, index) => {
      if (given) assert.equal(current.board[index], initial.board[index]);
    });
  }
  assert.equal(session.snapshot().status, 'solved');
  assert.equal(session.snapshot().board.includes(0), false);
  assert.equal(session.advance(), null);
});

test('6x6 sessions produce valid complete boards and snapshots do not expose mutable state', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const session = new GameSession(difficulty, '2x3');
    const snapshot = session.snapshot();
    assert.equal(snapshot.board.length, 36);
    snapshot.board.fill(0);
    assert.ok(session.filledCount > 0);
    while (!session.solved) session.advance();
    assert.deepEqual(findConflicts(session.snapshot().board, '2x3'), []);
  }
});

test('elapsed time is included in synchronized game state', () => {
  const session = new GameSession('easy', '3x3');
  session.updateElapsed(42_999);
  assert.equal(session.snapshot().elapsedSeconds, 42);
});

test('all six difficulty/variant combinations have a unique puzzle and valid solution', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const variant of ['3x3', '2x3'] as const) {
      const session = new GameSession(difficulty, variant);
      const state = session.snapshot();
      assert.equal(countSolutions(state.board), 1);
      assert.equal(isValidSolvedBoard(state.solution), true);
      state.givens.forEach((given, index) => {
        if (given) assert.equal(state.board[index], state.solution[index]);
      });
    }
  }
});

test('sessions choose available logical opportunities instead of scanning empty cells', () => {
  let seed = 13;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const session = new GameSession('medium', '3x3', random);
  let outOfOrder = 0;
  while (!session.solved) {
    const before = session.snapshot();
    const logical = findLogicalHint({ ...before, solution: [] });
    const move = session.advance()!;
    if (logical) assert.equal(findLogicalHint({ ...before, solution: [] }, { preferredIndex: move.index })?.index, move.index);
    if (move.index !== before.board.indexOf(0)) outOfOrder++;
  }
  assert.ok(outOfOrder > 5, 'moves must not follow row-major order');
});

test('occasional shifts preserve puzzle validity and subsequent solving in both variants', () => {
  for (const variant of ['3x3', '2x3'] as const) {
    for (const draw of [0.01, 0.3, 0.6, 0.99]) {
      const session = new GameSession('hard', variant, () => draw);
      session.advance();
      const before = session.snapshot();
      const remaining = session.remaining;
      const shift = session.shift();
      assert.ok(shift);
      const after = session.snapshot();
      assert.notDeepEqual(after.board, before.board);
      assert.equal(session.remaining, remaining);
      assert.deepEqual(findConflicts(after.board, variant), []);
      assert.ok(isValidSolvedBoard(after.solution));
      after.givens.forEach((given, index) => { if (given) assert.equal(after.board[index], after.solution[index]); });
      while (!session.solved) session.advance();
      assert.deepEqual(session.snapshot().board, session.snapshot().solution);
      assert.equal(session.shift(), null);
    }
  }
});

test('previewing the next move keeps the board unchanged and matches the later placement', () => {
  const session = new GameSession('medium', '3x3', () => 0.5);
  const before = session.snapshot();
  const preview = session.preview();
  assert.ok(preview);
  assert.deepEqual(session.snapshot(), before);
  assert.deepEqual(session.preview(), preview);
  assert.ok(preview.hint);
  assert.equal(preview.hint.index, preview.index);
  assert.equal(preview.hint.digit, preview.value);
  assert.ok(preview.hint.contextDelays instanceof Map);
  assert.equal(preview.hint.contextDelays.get(preview.index), 0);
  const move = session.advance()!;
  assert.equal(move.index, preview.index);
  assert.equal(move.value, preview.value);
});

test('guest patches protect clues, accept notes and pause autoplay on mistakes instead of erasing them', () => {
  for (const variant of ['3x3', '2x3'] as const) {
    const session = new GameSession('medium', variant, () => 0.5);
    const initial = session.snapshot();
    const cell = initial.board.indexOf(0);
    const clue = initial.givens.indexOf(true);
    const max = variant === '2x3' ? 6 : 9;
    for (const patch of [
      { index: -1, value: 1 }, { index: 0.5, value: 1 }, { index: clue, value: 0 },
      { index: cell, value: 1.5 }, { index: cell, value: max + 1 }, { index: cell, notes: [max + 1] },
    ]) assert.equal(session.applyGuestPatch({ ...patch, owner: 'guest' }), false);
    assert.deepEqual(session.snapshot(), initial);
    assert.equal(session.applyGuestPatch({ index: cell, value: null, notes: [1, 2], owner: 'host' }), false);
    assert.ok(session.applyGuestPatch({ index: cell, value: null, notes: [1, 2] }));
    assert.deepEqual(session.snapshot().notes[cell], [1, 2]);
    assert.ok(session.applyGuestPatch({ index: cell, notes: [1, 2], owner: 'guest' }));
    assert.deepEqual(session.snapshot().notes[cell], [1, 2]);
    const wrong = initial.solution[cell] % max + 1;
    assert.ok(session.applyGuestPatch({ index: cell, value: wrong, owner: 'guest' }));
    assert.equal(session.advance(), null);
    assert.equal(session.snapshot().board[cell], wrong);
    assert.ok(session.applyGuestPatch({ index: cell, value: initial.solution[cell], owner: 'guest' }));
    assert.ok(session.advance());
    assert.equal(session.snapshot().cellOwners[cell], 'guest');
  }
});

test('fillCandidates populates empty cell notes and preview prioritizes single-note cells', () => {
  const session = new GameSession('medium', '3x3', () => 0.5);
  const updates = session.fillCandidates();
  assert.ok(updates.length > 0);
  assert.ok(updates.every(u => u.value === null && u.notes.length >= 1));
  assert.equal(session.hasNotes, true);
  // Force a single-candidate note on an empty cell and verify preview picks a 1-note cell
  const snap = session.snapshot();
  const emptyIdx = snap.board.indexOf(0);
  session.applyGuestPatch({ index: emptyIdx, value: null, notes: [snap.solution[emptyIdx]] });
  const next = session.preview()!;
  assert.equal(next.hint?.technique, 'note_single');
  assert.equal(session.snapshot().notes[next.index].length, 1);
});

test('timing describes the current board and is recalculated after notes and placements', () => {
  const session = new GameSession('medium', '3x3', () => 0.5);
  const before = session.snapshot();
  const first = session.preview()!;
  assert.ok(first.averageCandidates >= 1);
  assert.ok(first.opportunities >= 0);
  assert.equal(first.nearFocus, false);
  const other = before.board.findIndex((value, index) => value === 0 && index !== first.index);
  session.applyGuestPatch({ index: other, notes: [before.solution[other]] });
  const noted = session.preview()!;
  assert.equal(noted.index, other);
  assert.equal(noted.hint?.technique, 'note_single');
  assert.equal(noted.opportunities, 1);
  session.advance();
  const after = session.preview()!;
  assert.notEqual(after.index, other);
  assert.ok(after.averageCandidates >= 1);
});
