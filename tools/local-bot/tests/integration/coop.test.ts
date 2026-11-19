import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { BotManager } from '../../src/bot-manager.ts';
import { OnlineGameClient } from '../../../../src/services/online-game-client.js';

for (const [random, teamSize] of [[0.25, 2], [0.75, 3]] as const) {
  test(`the fifth hosted game has ${teamSize} bots playing as distinct room participants`, { timeout: 30_000 }, async () => {
    const wsUrl = 'ws://127.0.0.1:18081/connection/websocket';
    const manager = new BotManager({ wsUrl, slots: Array(5).fill('easy'), joinPolicy: 'disabled',
      random: () => random, durationRanges: { easy: [2_000, 2_000] } });
    const watcher = new OnlineGameClient({ wsConfig: { wsUrl } });
    const placements = new Set<string>();
    try {
      await manager.step(0);
      const sessions = manager.sessions();
      assert.equal(sessions.length, 5);
      assert.ok(sessions.slice(0, 4).every(session => !session.snapshot().wasMultiplayer));
      const fifth = sessions[4];
      const watch = watcher.joinGameChannel(fifth.id, { role: 'spectator', onEvent: (type, data) => {
        if (type === 'cell-update' && data.value > 0) placements.add(data.senderId);
      } });
      await watch.ready(5_000);
      const guestCount = () => (watcher.getGameMembers() ?? []).filter(member => member.role === 'guest').length;
      for (let retry = 0; retry < 40 && guestCount() < teamSize - 1; retry++) await delay(50);
      assert.equal(guestCount(), teamSize - 1);
      for (let step = 1; step <= teamSize + 2 && placements.size < teamSize; step++) {
        await manager.step(step * 5_000);
        await delay(100);
      }
      assert.equal(placements.size, teamSize);
      const snapshot = fifth.snapshot();
      assert.equal(snapshot.wasMultiplayer, true);
      assert.equal(snapshot.playerContributions.length, teamSize);
      assert.deepEqual(new Set(snapshot.cellAuthors.filter(Boolean)), placements);
      for (let step = teamSize + 3; step <= 100 && !fifth.solved; step++) await manager.step(step * 5_000);
      assert.equal(fifth.solved, true);
      await manager.step(505_000);
      const remainingBots = () => (watcher.getGameMembers() ?? []).filter(member => placements.has(member.id));
      for (let retry = 0; retry < 40 && remainingBots().length > 0; retry++) await delay(50);
      assert.deepEqual(remainingBots(), []);
    } finally { watcher.disconnect(); await manager.stop(); }
  });
}

test('real co-op handshake, human edits and notes, guest departure, shifts and completion', { timeout: 30_000 }, async () => {
  const wsUrl = 'ws://127.0.0.1:18081/connection/websocket';
  const manager = new BotManager({ wsUrl, slots: ['hard'], joinPolicy: 'auto', variant: '3x3', notesPolicy: 'always', random: () => 0.5,
    durationRanges: { hard: [1_000, 1_000], expert: [1_000, 1_000] } });
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
    await guest.broadcastGameEvent(session.id, 'hint-used', { hintsUsed: 1, playerName: 'GuestPlayer' });
    await guest.broadcastGameEvent(session.id, 'cell-update', { index: cell, value: initial.solution[cell], notes: [], owner: 'guest' });
    await guest.broadcastGameEvent(session.id, 'cell-update', { index: noteCell, notes: [initial.solution[noteCell]], owner: 'guest' });
    await delay(30);
    await manager.step(2);
    assert.equal(session.snapshot().board[cell], initial.solution[cell]);
    assert.deepEqual(session.snapshot().notes[noteCell], [initial.solution[noteCell]]);
    assert.equal(session.snapshot().cellAuthors[cell], guest.clientId);
    assert.equal(session.snapshot().playerContributions.find(({ id }) => id === guest.clientId)?.hintsUsed, 1);
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
    assert.equal(session.snapshot().cellAuthors.filter(id => id === guest.clientId).length, 1);
    await delay(100);
    assert.ok(events.some(e => e.type === 'sync' && e.data.gameState.status === 'solved'));
    assert.ok(events.some(e => e.type === 'cell-update' && e.data.owner === 'host'));
  } finally { guest.disconnect(); watcher.disconnect(); await manager.stop(); }
});
