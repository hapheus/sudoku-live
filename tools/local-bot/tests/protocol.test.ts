import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BotManager } from '../src/bot-manager.ts';
import { memoryWebSocket } from './support/memory-websocket.ts';
import { validateIncomingGameMessage, validateLobbyUpdateMessage } from '../../../src/services/message-security.js';
import { isValidPlayerName } from '../../../src/services/player-name.js';
import { PROTOCOL_VERSION, SUPPORTED_MULTIPLAYER_FEATURES } from '../../../src/services/multiplayer-protocol.js';

test('all bot publications carry current envelopes, valid notes, presence and lobby metadata', async () => {
  const network = memoryWebSocket();
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = network.Socket as unknown as typeof WebSocket;
  const manager = new BotManager({ wsUrl: 'ws://memory.test', slots: ['hard'], notesPolicy: 'always' });
  try {
    await manager.step(0);
    await manager.step(200_000);
    const state = manager.sessions()[0].snapshot();
    for (const { data: payload } of network.publications) {
      if (payload.type === 'presence-announce') {
        assert.equal(isValidPlayerName(payload.data.name), true);
        assert.doesNotMatch(payload.data.name, /bot|[0-9_-]/i);
        continue;
      }
      assert.equal(payload.data.protocolVersion, PROTOCOL_VERSION);
      if (payload.type === 'lobby-update') {
        assert.equal(validateLobbyUpdateMessage(payload.data), true);
        assert.deepEqual(payload.data.features, SUPPORTED_MULTIPLAYER_FEATURES);
        assert.equal(isValidPlayerName(payload.data.host_name), true);
        assert.doesNotMatch(payload.data.host_name, /bot|[0-9_-]/i);
      } else {
        assert.ok(payload.data.eventId);
        assert.ok(payload.data.senderId);
        assert.ok(payload.data.seq > 0);
        assert.equal(validateIncomingGameMessage(payload.type, payload.data, state.board.length, state.variant === '2x3' ? 6 : 9), true, payload.type);
      }
    }
  } finally { await manager.stop(); globalThis.WebSocket = previous; }
});
