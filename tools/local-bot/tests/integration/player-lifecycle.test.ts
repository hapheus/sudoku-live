import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { BotRunner } from '../../src/bot-runner.ts';
import { OnlineGameClient } from '../../../../src/services/online-game-client.js';

// Real subscriptions, real disconnect and real 10-second idle interval; only puzzle play is accelerated.
test('a departing player vanishes, the slot stays offline, and a new identity advertises its new join policy', { timeout: 30_000 }, async () => {
  const wsUrl = 'ws://127.0.0.1:18081/connection/websocket';
  let draw = 0;
  const runner = new BotRunner('random', { wsUrl, random: () => draw, notesPolicy: 'never',
    durationRanges: { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } });
  const observer = new OnlineGameClient({ wsConfig: { wsUrl } });
  const visitor = new OnlineGameClient({ wsConfig: { wsUrl } });
  const rooms = new Map<string, any>();
  const update = room => ['solved', 'finished'].includes(room.status) ? rooms.delete(room.game_id) : rooms.set(room.game_id, room);
  try {
    const lobby = observer.joinLobby({ onLobbyMemberJoin: update, onLobbyUpdate: update,
      onLobbyMemberLeave: room => rooms.delete(room.game_id) });
    await lobby.ready(5_000);
    let now = 0;
    await runner.step(now);
    await delay(50);
    const original = [...rooms.values()][0];
    assert.equal(original.join_policy, 'auto');
    assert.equal(original.variant, '2x3');
    const session = runner.session()!;
    for (let tick = 0; tick < 1_000 && !session.solved; tick++) { now += 250; await runner.step(now); }
    assert.equal(session.solved, true);
    assert.equal(runner.session(), null);
    await delay(50);
    assert.equal(rooms.size, 0);
    assert.equal(Object.keys((await lobby.presence()).clients).length, 1, 'only observer remains connected');
    const gapStarted = performance.now();
    // A new player will choose the opposite variant/policy and a fresh ordinary name.
    draw = 0.999999;
    while (performance.now() - gapStarted < 10_000) {
      await runner.step(now + Math.min(9_999, performance.now() - gapStarted));
      assert.equal(runner.session(), null);
      await delay(200);
    }
    await runner.step(now + 10_000);
    await delay(50);
    const replacement = [...rooms.values()][0];
    assert.ok(replacement);
    assert.notEqual(replacement.id, original.id);
    assert.notEqual(replacement.host_name, original.host_name);
    assert.equal(replacement.variant, '3x3');
    assert.equal(replacement.join_policy, 'disabled');
    const replies: any[] = [];
    const room = visitor.joinGameChannel(replacement.game_id, { role: 'spectator', onEvent: (type, data) => {
      if (type === 'join-response') replies.push(data);
    } });
    await room.ready(5_000);
    await visitor.broadcastGameEvent(replacement.game_id, 'join-request', { requestId: 'disabled-live', requesterId: visitor.clientId });
    await delay(50);
    await runner.step(now + 10_001);
    await delay(50);
    assert.ok(replies.some(reply => reply.requestId === 'disabled-live' && !reply.accepted && reply.reason === 'disabled'));
  } finally { visitor.disconnect(); observer.disconnect(); await runner.stop(); }
});
