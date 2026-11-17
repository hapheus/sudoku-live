import { describe, expect, it, vi } from 'vitest';
import { OnlineGameClient } from '../src/services/online-game-client.js';

async function room() {
    const handlers = new Map();
    const sub = {
        on: (name, callback) => handlers.set(name, callback), subscribe: vi.fn(), unsubscribe: vi.fn(),
        publish: vi.fn().mockResolvedValue({}), presence: vi.fn().mockResolvedValue({ clients: {} }),
        history: vi.fn().mockResolvedValue({ publications: [] }),
    };
    const client = new OnlineGameClient();
    client.serverClientId = 'self';
    client.client = { newSubscription: () => sub, removeSubscription: vi.fn() };
    const events = vi.fn();
    client.joinGameChannel('boundary-room', { role: 'host', onEvent: events });
    await handlers.get('subscribed')();
    const publish = (type, data, connection = 'peer') => handlers.get('publication')({ info: { client: connection }, data: { type, data } });
    return { client, sub, events, publish, handlers };
}

describe('publication boundary', () => {
    it('rejects unapproved mutations before dedupe/order state and admits a valid correction', async () => {
        const { client, publish, events } = await room();
        publish('presence-announce', { id: 'peer-id', role: 'guest' });
        const move = { senderId: 'peer-id', eventId: 'move', seq: 1, index: 1, value: 2 };
        publish('cell-update', move);
        expect(events).not.toHaveBeenCalled();
        publish('join-request', { senderId: 'peer-id', requestId: 'request', requesterId: 'peer-id' });
        await client.broadcastGameEvent('boundary-room', 'join-response', { requestId: 'request', requesterId: 'peer-id', accepted: true });
        events.mockClear();
        publish('cell-update', { ...move, index: 81, seq: 999 });
        publish('cell-update', move);
        expect(events).toHaveBeenCalledExactlyOnceWith('cell-update', move);
        client.disconnect();
    });
    it('validates presence before binding identity and requires broker connection metadata', async () => {
        const { client, publish, events } = await room();
        publish('presence-announce', { id: 'fake', role: 'admin' });
        publish('presence-announce', { id: 'peer-id', role: 'spectator' });
        publish('reaction', { senderId: 'peer-id', emoji: '🔥' });
        expect(events).toHaveBeenCalledOnce();
        publish('reaction', { senderId: 'peer-id', emoji: '🔥' }, null);
        expect(events).toHaveBeenCalledOnce();
        client.disconnect();
    });
});
