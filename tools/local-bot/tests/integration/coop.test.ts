import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { BotManager } from '../../src/bot-manager.ts';
import { OnlineGameClient } from '../../../../src/services/online-game-client.js';

test('real co-op handshake, human edits and notes, guest departure, shifts and completion', { timeout: 30_000 }, async () => {
  const wsUrl = 'ws://127.0.0.1:18081/connection/websocket';
  const manager = new BotManager({ wsUrl, slots: ['hard'], variant: '3x3', notesPolicy: 'always', random: () => 0.5,
    durationRanges: { hard: [1_000, 1_000] } });
  const guest = new OnlineGameClient({ wsConfig: { wsUrl } });
  const watcher = new OnlineGameClient({ wsConfig: { wsUrl } });
  const events: { type: string; data: any }[] = [];
  try {
    await manager.step(0);
    const session = manager.sessions()[0];
    const initial = session.snapshot();
    assert.ok(initial.notes.some(notes => notes.length));
    const observe = (type, data) => events.push({ type, data });
    const room = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online', onEvent: observe });
    const watch = watcher.joinGameChannel(session.id, { role: 'spectator', onEvent: observe });
    await Promise.all([room.ready(5_000), watch.ready(5_000)]);
    await delay(500);
    await guest.broadcastGameEvent(session.id, 'join-request', { requestId: 'real-coop', requesterId: guest.clientId });
    await delay(30);
    await manager.step(1);
    await delay(30);
    assert.ok(events.some(e => e.type === 'join-response' && e.data.requestId === 'real-coop' && e.data.accepted));
    const [cell, noteCell] = initial.board.flatMap((value, index) => value === 0 ? [index] : []);
    await guest.broadcastGameEvent(session.id, 'cell-update', { index: cell, value: initial.solution[cell], notes: [], owner: 'guest' });
    await guest.broadcastGameEvent(session.id, 'cell-update', { index: noteCell, notes: [initial.solution[noteCell]], owner: 'guest' });
    await delay(30);
    await manager.step(2);
    assert.equal(session.snapshot().board[cell], initial.solution[cell]);
    assert.deepEqual(session.snapshot().notes[noteCell], [initial.solution[noteCell]]);
    guest.disconnect();
    await delay(500);
    // Preserve the real post-join grace period before checking resumed shifts.
    await delay(15_000);
    let shifts = 0;
    let before = session.snapshot().givens;
    for (let now = 1_000; now < 200_000 && !session.solved; now += 1_000) {
      await manager.step(now);
      const after = session.snapshot().givens;
      if (JSON.stringify(before) !== JSON.stringify(after)) shifts++;
      before = after;
    }
    assert.ok(shifts > 0);
    assert.equal(session.solved, true);
    await delay(100);
    assert.ok(events.some(e => e.type === 'sync' && e.data.gameState.status === 'solved'));
    assert.ok(events.some(e => e.type === 'cell-update' && e.data.owner === 'host'));
  } finally { guest.disconnect(); watcher.disconnect(); await manager.stop(); }
});
