import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { BotManager } from '../src/bot-manager.ts';
import { memoryWebSocket } from './support/memory-websocket.ts';

// Focused protocol/timing cases use explicit profiles; production defaults are random.
function createManager(options: ConstructorParameters<typeof BotManager>[0]) {
  return new BotManager({ slots: ['easy', 'medium', 'hard'], variant: '3x3', joinPolicy: 'auto', ...options });
}

test('three fixed solo slots publish compatible snapshots and valid moves independently', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test/connection/websocket', random: () => 0.5 });
  try {
    await manager.step(0);
    const rooms = manager.sessions();
    assert.equal(rooms.length, 3);
    assert.equal(new Set(rooms.map(s => s.id)).size, 3);
    assert.deepEqual(rooms.map(s => s.snapshot().requestedDifficulty), ['easy', 'medium', 'hard']);
    const lobby = network.publications.filter(p => p.channel === 'sudoku:lobby');
    for (const room of rooms) {
      assert.ok(lobby.some(p => p.data.data.game_id === room.id && p.data.data.game_mode === 'solo'
        && p.data.data.join_policy === 'auto'));
      assert.ok(network.publications.some(p => p.channel === `sudoku:game.${room.id}` && p.data.type === 'sync'));
    }
    const hosts = network.publications.filter(p => p.data.type === 'presence-announce' && p.data.data.role === 'host');
    assert.equal(new Set(hosts.map(p => p.data.data.id)).size, 3);
    await manager.step(200_000);
    assert.equal(network.publications.filter(p => p.data.type === 'cell-update').length, 3);
  } finally {
    await manager.stop();
    globalThis.WebSocket = previous;
  }
  assert.equal(network.sockets.size, 0);
});

test('heartbeats republish current snapshots and lobby presence without making extra moves', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5 });
  try {
    await manager.step(0);
    // Pause placements on a partner's mistake, isolating heartbeat from move timing.
    for (const session of manager.sessions()) {
      const state = session.snapshot();
      const index = state.board.indexOf(0);
      session.applyGuestPatch({ index, value: state.solution[index] % 9 + 1, owner: 'guest' });
    }
    await manager.step(9_900);
    network.publications.length = 0;
    await manager.step(10_000);
    assert.equal(network.publications.filter(p => p.data.type === 'sync').length, 3);
    assert.equal(network.publications.filter(p => p.data.type === 'lobby-update').length, 3);
    assert.equal(network.publications.filter(p => p.data.type === 'cell-update').length, 0);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('overlapping ticks cannot duplicate moves and a failed slot retries the same event without blocking others', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5 });
  try {
    await manager.step(0);
    const initial = manager.sessions().map(s => s.filledCount);
    const id = manager.sessions()[0].id;
    network.fail(true, 'cell-update', `sudoku:game.${id}`);
    await Promise.all(Array.from({ length: 5 }, () => manager.step(200_000)));
    assert.equal(network.publications.filter(p => p.data.type === 'cell-update').length, 2);
    assert.deepEqual(manager.sessions().map(s => s.filledCount), initial.map(n => n + 1));
    network.fail(false);
    await manager.step(202_000);
    assert.equal(network.publications.filter(p => p.data.type === 'cell-update').length, 3);
    assert.deepEqual(manager.sessions().map(s => s.filledCount), initial.map(n => n + 1));
    const attempts = network.attempts.filter(p => p.channel === `sudoku:game.${id}` && p.data.type === 'cell-update');
    assert.equal(attempts.length, 2);
    assert.equal(new Set(attempts.map(p => p.data.data.eventId)).size, 1);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('reconnected subscriptions resynchronize the same RAM games before the next heartbeat', { timeout: 10_000 }, async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5 });
  try {
    await manager.step(0);
    await manager.step(200_000);
    const ids = manager.sessions().map(s => s.id);
    const boards = manager.sessions().map(s => s.snapshot().board);
    for (const socket of [...network.sockets]) socket.close();
    for (let attempt = 0; attempt < 40 && network.sockets.size < 3; attempt++) await delay(50);
    assert.equal(network.sockets.size, 3);
    await delay(20);
    network.publications.length = 0;
    await manager.step(201_000);
    assert.deepEqual(manager.sessions().map(s => s.id), ids);
    assert.equal(network.publications.filter(p => p.data.type === 'sync').length, 3);
    const recovered = network.publications.filter(p => p.data.type === 'sync');
    for (let index = 0; index < 3; index++) {
      assert.deepEqual((recovered[index].data.data.gameState as { board: number[] }).board, boards[index]);
    }
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('custom target durations are used and a stopped worker cannot restart its slots', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5,
    durationRanges: { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } });
  try {
    await manager.step(0);
    await manager.step(500);
    assert.equal(network.publications.filter(p => p.data.type === 'cell-update').length, 3);
    const ids = manager.sessions().map(s => s.id);
    await manager.stop();
    const count = network.publications.length;
    await manager.step(1_000_000);
    assert.equal(network.publications.length, count);
    const fresh = createManager({ wsUrl: 'ws://memory.test' });
    try {
      await fresh.step(0);
      assert.equal(fresh.sessions().some(s => ids.includes(s.id)), false);
    } finally { await fresh.stop(); }
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('managed games are not reported ready until publication acknowledgements succeed', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5 });
  try {
    network.fail(true);
    await manager.step(0);
    assert.equal(manager.sessions().length, 3);
    assert.equal(manager.readySlots(), 0);
    network.fail(false);
    await manager.step(2_000);
    assert.equal(manager.readySlots(), 3);
    await manager.stop();
    assert.equal(manager.readySlots(), 0);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('retry diagnostics expose safe SDK codes and connection states without server messages', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const failures: unknown[] = [];
  const manager = createManager({ wsUrl: 'ws://memory.test',
    onError: (difficulty, diagnostic) => failures.push({ difficulty, ...diagnostic }) });
  try {
    network.fail(true);
    await manager.step(0);
    assert.deepEqual(failures.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), ['easy', 'hard', 'medium'].map(difficulty => ({
      difficulty, reason: 'operation-failed', code: 100,
      connectionState: 'connected', roomState: 'subscribed', lobbyState: 'subscribed',
    })));
    assert.equal(JSON.stringify(failures).includes('injected outage'), false);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('slots occasionally shift and retry the same shifted snapshot without a second permutation', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5,
    durationRanges: { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } });
  try {
    await manager.step(0);
    for (let tick = 1; tick <= 9; tick++) await manager.step(tick * 500);
    const boards = manager.sessions().map(session => session.snapshot().board);
    const counts = manager.sessions().map(session => session.filledCount);
    network.fail(true, 'sync');
    const offset = network.attempts.length;
    await manager.step(5_000);
    const shifted = manager.sessions().map(session => session.snapshot().board);
    assert.deepEqual(manager.sessions().map(session => session.filledCount), counts);
    shifted.forEach((board, index) => assert.notDeepEqual(board, boards[index]));
    const failed = network.attempts.slice(offset).filter(p => p.data.type === 'sync');
    assert.equal(failed.length, 3);
    network.fail(false);
    await manager.step(7_000);
    assert.deepEqual(manager.sessions().map(session => session.snapshot().board), shifted);
    for (const attempt of failed) {
      assert.equal(network.attempts.filter(p => p.data.data.eventId === attempt.data.data.eventId).length, 2);
      const delivered = network.publications.find(p => p.data.data.eventId === attempt.data.data.eventId);
      assert.deepEqual(delivered?.data.data.gameState, attempt.data.data.gameState);
    }
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('host cursors are visible before moves, hesitate occasionally and survive heartbeat snapshots', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.1 });
  try {
    await manager.step(0);
    const room = `sudoku:game.${manager.sessions()[0].id}`;
    const initial = network.publications.find(p => p.channel === room && p.data.type === 'sync')!;
    assert.ok(Number.isInteger(initial.data.data.hostCursorIndex));
    const target = initial.data.data.hostCursorIndex;
    for (let tick = 1; tick <= 60; tick++) await manager.step(tick * 250);
    const events = network.publications.filter(p => p.channel === room && p.data.type === 'cursor');
    assert.ok(events.length >= 3);
    assert.ok(events.some(event => event.data.data.index !== target), 'scan another cell while considering moves');
    assert.ok(network.publications.some(event => event.channel === room && event.data.type === 'cell-update'
      && event.data.data.index === target), 'place the considered digit on the real board');
    const offset = network.publications.length;
    await manager.step(25_000);
    const heartbeat = network.publications.slice(offset).find(p => p.channel === room && p.data.type === 'sync')!;
    assert.ok(Number.isInteger(heartbeat.data.data.hostCursorIndex));
    for (const move of network.publications.filter(p => p.channel === room && p.data.type === 'cell-update')) {
      const earlier = network.publications.slice(0, network.publications.indexOf(move));
      const cursor = earlier.findLast(p => p.channel === room && p.data.type === 'cursor');
      assert.equal(cursor?.data.data.index, move.data.data.index);
      assert.equal(cursor?.data.data.role, 'host');
      assert.equal(typeof cursor?.data.data.senderId, 'string');
      const digit = earlier.findLast(p => p.channel === room && p.data.type === 'active-digit');
      assert.equal(digit?.data.data.digit, move.data.data.value);
    }
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('all three bots automatically accept joins and preserve co-op placements without shifting the partner board', async () => {
  const { OnlineGameClient } = await import('../../../src/services/online-game-client.js');
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5,
    durationRanges: { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } });
  const guests: InstanceType<typeof OnlineGameClient>[] = [];
  try {
    await manager.step(0);
    const sessions = manager.sessions();
    const initialGivens = sessions.map(session => session.snapshot().givens);
    for (const session of sessions) {
      const guest = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
      guests.push(guest);
      const room = guest.joinGameChannel(session.id, { role: 'spectator', gameMode: 'solo', joinPolicy: 'auto' });
      await room.ready(1_000);
      // Subscription readiness precedes the async presence exchange.
      await delay(10);
      await room.publish({ type: 'join-request', data: guest.buildOutgoingEnvelope({ requestId: `join-${session.id}`, requesterId: guest.clientId }) });
    }
    await manager.step(250);
    for (const session of sessions) {
      assert.ok(network.publications.some(p => p.channel === `sudoku:game.${session.id}`
        && p.data.type === 'join-response' && p.data.data.accepted === true
        && p.data.data.requestId === `join-${session.id}`));
    }
    const edits: { index: number; value: number }[] = [];
    for (const [index, guest] of guests.entries()) {
      const session = sessions[index];
      const room = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online', joinPolicy: 'auto' });
      await room.ready(1_000);
      await delay(10);
      const cell = session.snapshot().board.indexOf(0);
      const value = session.snapshot().solution[cell];
      edits.push({ index: cell, value });
      await room.publish({ type: 'cell-update', data: guest.buildOutgoingEnvelope({ index: cell, value, notes: [], owner: 'guest', eventId: `human-${session.id}` }) });
    }
    for (let tick = 1; tick <= 12; tick++) await manager.step(250 + tick * 500);
    sessions.forEach((session, index) => {
      const snapshot = session.snapshot();
      assert.equal(snapshot.board[edits[index].index], edits[index].value);
      assert.equal(snapshot.cellOwners[edits[index].index], 'guest');
      assert.ok(network.publications.some(p => p.channel === 'sudoku:lobby' && p.data.data.game_id === session.id
        && p.data.data.join_policy === 'auto' && p.data.data.has_guest === true && p.data.data.game_mode === 'online'));
      assert.deepEqual(snapshot.givens, initialGivens[index]);
    });
  } finally {
    guests.forEach(guest => guest.disconnect());
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('a solved bot takes one little victory lap without changing the completed board', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', variant: '2x3', random: () => 0.5 });
  try {
    let now = 0;
    await manager.step(now);
    for (let tick = 0; tick < 80 && !manager.sessions()[0].solved; tick++) {
      now += 200_000;
      await manager.step(now);
    }
    const session = manager.sessions()[0];
    assert.ok(session.solved);
    const board = session.snapshot().board;
    const room = `sudoku:game.${session.id}`;
    const offset = network.publications.length;
    for (let step = 1; step <= 4; step++) await manager.step(now + step * 900);
    const lap = network.publications.slice(offset).filter(p => p.channel === room && p.data.type === 'cursor');
    assert.deepEqual(lap.map(p => p.data.data.index), [5, 35, 30, 18]);
    assert.deepEqual(session.snapshot().board, board);
    assert.equal(network.publications.slice(offset).some(p => p.channel === room && p.data.type === 'cell-update'), false);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});

test('a human edit wins over a failed bot publication and survives a failed join reply', async () => {
  const { OnlineGameClient } = await import('../../../src/services/online-game-client.js');
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5 });
  const guest = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
  try {
    await manager.step(0);
    const session = manager.sessions()[0];
    const channel = `sudoku:game.${session.id}`;
    network.fail(true, 'cell-update', channel);
    await manager.step(200_000);
    const pending = network.attempts.find(p => p.channel === channel && p.data.type === 'cell-update')!;
    const index = Number(pending.data.data.index);
    const value = Number(pending.data.data.value) % 9 + 1;
    const room = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online', joinPolicy: 'auto' });
    await room.ready(1_000);
    await delay(10);
    network.fail(false);
    await room.publish({ type: 'cell-update', data: guest.buildOutgoingEnvelope({ index, value, owner: 'guest', eventId: 'human-correction' }) });
    await room.publish({ type: 'join-request', data: guest.buildOutgoingEnvelope({ requestId: 'second-join', requesterId: guest.clientId }) });
    network.fail(true, 'join-response', channel);
    await manager.step(202_000);
    network.fail(false);
    await manager.step(205_000);
    assert.equal(session.snapshot().board[index], value);
    assert.equal(session.snapshot().cellOwners[index], 'guest');
    assert.equal(network.publications.some(p => p.data.data.eventId === pending.data.data.eventId), false);
    assert.ok(network.publications.some(p => p.channel === channel && p.data.type === 'join-response'
      && p.data.data.requestId === 'second-join' && p.data.data.accepted === true));
    guest.disconnect();
    await delay(10);
    await manager.step(206_000);
    const lobby = network.publications.findLast(p => p.channel === 'sudoku:lobby' && p.data.data.game_id === session.id)!;
    assert.equal(lobby.data.data.has_guest, false);
    assert.equal(lobby.data.data.game_mode, 'solo');
  } finally {
    guest.disconnect();
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('bots emit real hint-highlight preview/solve events, sync hintPreview, and clear on guest edits', async () => {
  const { OnlineGameClient } = await import('../../../src/services/online-game-client.js');
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', slots: ['expert'], notesPolicy: 'never', random: () => 0.04 });
  const guest = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
  const watcher = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
  try {
    await manager.step(0);
    const session = manager.sessions()[0];
    const room = `sudoku:game.${session.id}`;
    // Step until hint-highlight preview fires
    let previewEvent: (typeof network.publications)[number] | undefined;
    let now = 0;
    for (; now <= 120_000; now += 250) {
      await manager.step(now);
      previewEvent = network.publications.find(p => p.channel === room && p.data.type === 'hint-highlight' && p.data.data.mode === 'preview');
      if (previewEvent) break;
    }
    assert.ok(previewEvent, 'expected hint-highlight preview before move');
    assert.equal(previewEvent.data.data.role, 'host');
    assert.ok(Array.isArray(previewEvent.data.data.contextEntries));
    assert.ok(previewEvent.data.data.contextEntries.some(([idx, delay]: [number, number]) => idx === previewEvent!.data.data.index && delay === 0));

    // A late-joining watcher triggers a sync that carries hintPreview
    const syncOffset = network.publications.length;
    const watchRoom = watcher.joinGameChannel(session.id, { role: 'spectator', gameMode: 'solo', joinPolicy: 'auto' });
    await watchRoom.ready(1_000);
    await delay(10);
    await manager.step(now + 10);
    const syncWithPreview = network.publications.slice(syncOffset).find(p => p.channel === room && p.data.type === 'sync');
    const hintPreview = syncWithPreview?.data.data.hintPreview as { mode?: string; index?: number } | undefined;
    assert.equal(hintPreview?.mode, 'preview');
    assert.equal(hintPreview?.index, previewEvent.data.data.index);

    // Advance until the move is placed and solve highlight fires
    for (; now <= 240_000; now += 250) {
      await manager.step(now);
      if (network.publications.some(p => p.channel === room && p.data.type === 'hint-highlight' && p.data.data.mode === 'solve')) break;
    }
    const solveEvent = network.publications.find(p => p.channel === room && p.data.type === 'hint-highlight' && p.data.data.mode === 'solve')!;
    assert.ok(solveEvent, 'expected hint-highlight solve on move');
    assert.equal(solveEvent.data.data.index, previewEvent.data.data.index);
    const matchingMove = network.publications.find(p => p.channel === room && p.data.type === 'cell-update' && p.data.data.index === solveEvent.data.data.index);
    assert.ok(matchingMove, 'solve highlight matches placed move');

    // Wait for next preview, then have a guest edit the board to verify hint-highlight clear
    const clearOffset = network.publications.length;
    let nextPreview: (typeof network.publications)[number] | undefined;
    for (; now <= 480_000; now += 250) {
      await manager.step(now);
      nextPreview = network.publications.slice(clearOffset).find(p => p.channel === room && p.data.type === 'hint-highlight' && p.data.data.mode === 'preview');
      if (nextPreview) break;
    }
    assert.ok(nextPreview, 'expected another hint-highlight preview');
    const guestRoom = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online', joinPolicy: 'auto' });
    await guestRoom.ready(1_000);
    await delay(10);
    const emptyIdx = session.snapshot().board.findIndex(v => v === 0);
    await guestRoom.publish({ type: 'cell-update', data: guest.buildOutgoingEnvelope({ index: emptyIdx, value: session.snapshot().solution[emptyIdx], owner: 'guest', eventId: 'guest-clear-hint' }) });
    await delay(10);
    await manager.step(now + 10);
    const clearEvent = network.publications.slice(clearOffset).find(p => p.channel === room && p.data.type === 'hint-highlight' && p.data.data.mode === 'clear');
    assert.ok(clearEvent, 'expected hint-highlight clear when guest edits');
  } finally {
    watcher.disconnect();
    guest.disconnect();
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('guest Fill Candidates note updates (value: null, no owner) persist across bot moves and syncs', async () => {
  const { OnlineGameClient } = await import('../../../src/services/online-game-client.js');
  const { getCandidateDigits } = await import('../../../src/domain/sudoku-engine.js');
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.5,
    durationRanges: { easy: [2_000, 2_000], medium: [2_000, 2_000], hard: [2_000, 2_000], expert: [2_000, 2_000] } });
  const guest = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
  try {
    await manager.step(0);
    const session = manager.sessions()[0];
    const room = `sudoku:game.${session.id}`;
    const guestRoom = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online', joinPolicy: 'auto' });
    await guestRoom.ready(1_000);
    await delay(10);

    const snapshot = session.snapshot();
    const emptyCells = snapshot.board.flatMap((v, idx) => v === 0 ? [idx] : []);
    assert.ok(emptyCells.length >= 2);
    for (const idx of emptyCells) {
      await guestRoom.publish({
        type: 'cell-update',
        data: guest.buildOutgoingEnvelope({ index: idx, value: null, notes: getCandidateDigits(snapshot.board, idx, snapshot.variant), eventId: `fill-${idx}` }),
      });
    }
    await delay(10);
    await manager.step(500);
    // Advance until bot places a move and triggers a heartbeat sync
    await manager.step(1_000);
    await manager.step(10_000);

    const latestSync = network.publications.findLast(p => p.channel === room && p.data.type === 'sync')!;
    const syncedState = latestSync.data.data.gameState as { board: number[]; notes: number[][] };
    const remainingEmpty = syncedState.board.flatMap((v, idx) => v === 0 ? [idx] : []);
    assert.ok(remainingEmpty.length > 0);
    for (const idx of remainingEmpty) {
      assert.ok(syncedState.notes[idx].length > 0, `expected candidate notes preserved at cell ${idx}`);
    }
  } finally {
    guest.disconnect();
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('three slots follow distinct notes policies: easy never, medium later, hard always', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = createManager({ wsUrl: 'ws://memory.test', random: () => 0.25 });
  try {
    await manager.step(0);
    const [easy, medium, hard] = manager.sessions();
    assert.equal(easy.hasNotes, false);
    assert.equal(medium.hasNotes, false);
    assert.equal(hard.hasNotes, true);

    for (let now = 1_000; now <= 90_000; now += 1_000) {
      await manager.step(now);
      if (medium.hasNotes) break;
    }
    assert.equal(easy.hasNotes, false);
    assert.equal(medium.hasNotes, true);
    const mediumRoom = `sudoku:game.${medium.id}`;
    assert.ok(network.publications.some(p => p.channel === mediumRoom && p.data.type === 'cell-update'
      && p.data.data.value === undefined && Array.isArray(p.data.data.notes)));
  } finally {
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('randomized bot pool spawns 2..10 bots with mixed difficulties, 9x9/6x6 variants, and notes policies', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  let step = 0;
  const values = [0.05, 0.45, 0.85, 0.2, 0.65, 0.95];
  const random = () => values[step++ % values.length];
  const manager = createManager({
    wsUrl: 'ws://memory.test',
    slots: Array.from({ length: 6 }, () => 'random' as const),
    variant: 'random',
    notesPolicy: 'random',
    random,
  });
  try {
    await manager.step(0);
    const sessions = manager.sessions();
    assert.equal(sessions.length, 6);
    assert.ok(new Set(sessions.map(s => s.difficulty)).size >= 2);
    assert.ok(new Set(sessions.map(s => s.variant)).size === 2);
    assert.ok(sessions.some(s => s.hasNotes) && sessions.some(s => !s.hasNotes));
  } finally {
    await manager.stop();
    globalThis.WebSocket = previous;
  }
});

test('the normal scheduler plays a complete game with visible thinking, varied deadlines and no endgame stall', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  let seed = 42;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const manager = createManager({ wsUrl: 'ws://memory.test', slots: ['expert'], variant: '2x3', notesPolicy: 'never', random });
  try {
    await manager.step(0);
    const session = manager.sessions()[0];
    const channel = `sudoku:game.${session.id}`;
    const placements: number[] = [];
    let cursorChanges = 0;
    for (let now = 250; now <= 900_000 && !session.solved; now += 250) {
      const offset = network.publications.length;
      await manager.step(now);
      for (const event of network.publications.slice(offset).filter(event => event.channel === channel)) {
        if (event.data.type === 'cursor') cursorChanges++;
        if (event.data.type === 'cell-update' && Number(event.data.data.value) > 0) placements.push(now);
      }
    }
    assert.equal(session.solved, true, 'normal runtime must complete instead of only moving its cursor');
    const gaps = placements.map((at, index) => at - (placements[index - 1] ?? 0));
    assert.ok(placements.length > 5);
    assert.ok(cursorChanges > placements.length * 2, 'search and selection are visible between placements');
    assert.ok(new Set(gaps).size > 3, 'moves are not metronomic');
    assert.ok(Math.max(...gaps) <= 40_000, 'thought and shift pauses remain bounded');
    assert.ok(gaps.at(-1)! < 18_000, 'last cell is placed without waiting out the game target');
    assert.deepEqual(session.snapshot().board, session.snapshot().solution);
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});
