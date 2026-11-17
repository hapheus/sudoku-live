import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BotRunner } from '../src/bot-runner.ts';
import { OnlineGameClient } from '../../../src/services/online-game-client.js';
import { memoryWebSocket } from './support/memory-websocket.ts';
import { setTimeout as delay } from 'node:timers/promises';

const fast = { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } as const;

for (const quota of [1, 2, 3]) {
  test(`one player finishes exactly ${quota} puzzles, leaves, then a new player starts after the gap`, async () => {
    const network = memoryWebSocket();
    const previous = globalThis.WebSocket;
    globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
    const draws = [0, 0, 0, 0, (quota - 0.5) / 3, 0.5];
    const runner = new BotRunner('random', { wsUrl: 'ws://memory.test', random: () => draws.shift() ?? 0.5, durationRanges: fast });
    const latest = () => network.publications.findLast(p => p.channel === 'sudoku:lobby')!.data.data;
    try {
      let now = 0;
      await runner.step(now);
      const original = { ...latest() };
      const games = new Set<string>();
      for (let puzzle = 0; puzzle < quota; puzzle++) {
        const session = runner.session()!;
        games.add(session.id);
        assert.equal(latest().id, original.id);
        assert.equal(latest().host_name, original.host_name);
        assert.equal(latest().variant, original.variant);
        assert.equal(latest().join_policy, original.join_policy);
        assert.equal(session.snapshot().requestedDifficulty, 'easy');
        for (let tick = 0; tick < 1_000 && !session.solved; tick++) { now += 250; await runner.step(now); }
        assert.equal(session.solved, true);
        if (puzzle < quota - 1) {
          await runner.step(now + 4_999);
          assert.equal(runner.session()?.id, session.id, 'briefly keep an intermediate completed board visible');
          now += 5_000;
          await runner.step(now);
        }
        assert.ok(network.publications.some(p => p.data.data.game_id === session.id && p.data.data.status === 'finished'));
        if (puzzle < quota - 1) assert.notEqual(runner.session()?.id, session.id, 'same player starts the next puzzle');
      }
      assert.equal(games.size, quota);
      assert.equal(runner.session(), null);
      assert.equal(network.sockets.size, 0, 'departed player is disconnected during the gap');
      const gapStart = now;
      await runner.step(gapStart + 19_999);
      assert.equal(runner.session(), null);
      await runner.step(gapStart + 20_000);
      assert.ok(runner.session());
      assert.notEqual(latest().id, original.id);
      assert.notEqual(latest().host_name, original.host_name);
      assert.equal(latest().variant, '3x3');
      assert.equal(latest().join_policy, 'disabled');
      assert.equal(runner.session()!.snapshot().requestedDifficulty, 'hard');
    } finally { await runner.stop(); globalThis.WebSocket = previous; }
  });
}

test('No Joins Allowed rejects the handshake and ignores guest edits while spectators remain supported', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const runner = new BotRunner('easy', { wsUrl: 'ws://memory.test', joinPolicy: 'disabled', random: () => 0.5 });
  const visitor = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://memory.test' } });
  try {
    await runner.step(0);
    const session = runner.session()!;
    const before = session.snapshot();
    const room = visitor.joinGameChannel(session.id, { role: 'guest' });
    await room.ready(1_000);
    await delay(10);
    const index = before.board.indexOf(0);
    await room.publish({ type: 'join-request', data: visitor.buildOutgoingEnvelope({ requestId: 'blocked', requesterId: visitor.clientId }) });
    await room.publish({ type: 'cell-update', data: visitor.buildOutgoingEnvelope({ index, value: before.solution[index], owner: 'guest' }) });
    await runner.step(1);
    const response = network.publications.findLast(p => p.data.type === 'join-response')!.data.data;
    assert.equal(response.accepted, false);
    assert.equal(response.reason, 'disabled');
    assert.equal(session.snapshot().board[index], 0);
    const lobby = network.publications.findLast(p => p.channel === 'sudoku:lobby')!.data.data;
    assert.equal(lobby.join_policy, 'disabled');
    assert.equal(lobby.has_guest, false);
    assert.equal(lobby.game_mode, 'solo');
    assert.ok(network.publications.some(p => p.data.type === 'sync' && p.channel.endsWith(session.id)));
    const presence = network.publications.find(p => p.data.type === 'presence-announce' && p.data.data.role === 'host')!;
    assert.equal(presence.data.data.join_policy, 'disabled');
  } finally { visitor.disconnect(); await runner.stop(); globalThis.WebSocket = previous; }
});

test('stopping during the replacement gap never starts another player', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const runner = new BotRunner('easy', { wsUrl: 'ws://memory.test', variant: '2x3', random: () => 0, durationRanges: fast });
  try {
    let now = 0;
    await runner.step(now);
    const session = runner.session()!;
    for (let tick = 0; tick < 1_000 && !session.solved; tick++) { now += 250; await runner.step(now); }
    assert.equal(session.solved, true);
    assert.equal(runner.session(), null);
    await runner.stop();
    const publications = network.publications.length;
    await runner.step(now + 60_000);
    assert.equal(network.publications.length, publications);
    assert.equal(network.sockets.size, 0);
  } finally { await runner.stop(); globalThis.WebSocket = previous; }
});
