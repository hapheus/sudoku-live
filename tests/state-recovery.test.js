import { describe, expect, it } from 'vitest';
import { createStateRecovery } from '../src/services/state-recovery.js';
import { validateIncomingGameMessage } from '../src/services/message-security.js';

const snapshot = (stateVector) => ({ gameState: {}, stateVector });

describe('causal snapshot recovery', () => {
    it.each(['cell-update', 'sync', 'new-puzzle-accept', 'new-puzzle-request', 'new-puzzle-cancel'])(
        'protects an accepted %s from stale snapshots across senders', (type) => {
            const guard = createStateRecovery();
            guard.observe(type, { senderId: 'guest', seq: 4 });
            expect(guard.accepts('ping', snapshot({ host: 100, guest: 3 }))).toBe(false);
            expect(guard.accepts('sync', snapshot({ host: 100 }))).toBe(false);
            expect(guard.accepts('init', snapshot({ guest: 4 }))).toBe(true);
            expect(guard.accepts('ping', snapshot({ guest: 5 }))).toBe(true);
            expect(guard.accepts('ping', snapshot(undefined))).toBe(false);
        },
    );

    it('carries recovered knowledge forward and rejects already-covered history patches', () => {
        const guard = createStateRecovery();
        guard.observe('sync', { ...snapshot({ guest: 5 }), senderId: 'host', seq: 10 });
        expect(guard.vector()).toEqual({ guest: 5, host: 10 });
        expect(guard.accepts('cell-update', { senderId: 'guest', seq: 4 })).toBe(false);
        expect(guard.accepts('cell-update', { senderId: 'guest', seq: 6 })).toBe(true);
        expect(guard.accepts('ping', snapshot({ guest: 5 }))).toBe(false);
        expect(guard.accepts('ping', snapshot({ guest: 5, host: 10 }))).toBe(true);
    });

    it('prefers the host when both players know the same edits', () => {
        const guard = createStateRecovery();
        guard.observe('cell-update', { senderId: 'guest', seq: 5 });
        expect(guard.accepts('ping', snapshot({ guest: 5 }), false)).toBe(false);
        expect(guard.accepts('ping', snapshot({ guest: 5 }), true)).toBe(true);
        expect(guard.accepts('ping', snapshot({ guest: 6 }), false)).toBe(true);
    });

    it('does not use cursor, heartbeat, wall clock or elapsed time as a mutation revision', () => {
        const guard = createStateRecovery();
        guard.observe('cursor', { senderId: 'host', seq: 100 });
        guard.observe('ping', { senderId: 'host', seq: 101 });
        expect(guard.vector()).toEqual({});
        expect(guard.accepts('ping', snapshot(undefined))).toBe(true);
        guard.observe('cell-update', {});
        expect(guard.accepts('ping', snapshot({ host: 102 }))).toBe(false);
    });

    it.each([null, [], { host: 0 }, { host: -1 }, { host: 1.5 }, { host: Infinity },
        { ['x'.repeat(65)]: 1 }, Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`id-${i}`, 1]))])(
        'rejects malformed or oversized network vectors: %j', (stateVector) => {
            expect(validateIncomingGameMessage('cell-update', { index: 0, value: 1, stateVector })).toBe(false);
        },
    );
});

describe('puzzle generation boundaries', () => {
    it('rejects delayed edits from an unseen actor after an accepted rematch', () => {
        const guard = createStateRecovery();
        guard.observe('new-puzzle-accept', { gameState: {}, senderId: 'host', seq: 10,
            eventId: 'next-puzzle', puzzleGeneration: 'next-puzzle', stateVector: {} });
        expect(guard.generation()).toBe('next-puzzle');
        expect(guard.accepts('cell-update', { senderId: 'unseen', seq: 100, puzzleGeneration: null })).toBe(false);
        expect(guard.accepts('cell-update', { senderId: 'unseen', seq: 100, puzzleGeneration: 'next-puzzle' })).toBe(true);
        expect(guard.accepts('ping', { gameState: {}, stateVector: { host: 10 }, puzzleGeneration: 'old' })).toBe(false);
    });

    it('requires a new rematch token to identify its own event and include known changes', () => {
        const guard = createStateRecovery();
        guard.observe('cell-update', { senderId: 'guest', seq: 5 });
        const rematch = { gameState: {}, senderId: 'host', seq: 10, eventId: 'rematch',
            puzzleGeneration: 'rematch', stateVector: { guest: 5 } };
        expect(guard.accepts('new-puzzle-accept', rematch)).toBe(true);
        expect(guard.accepts('new-puzzle-accept', { ...rematch, puzzleGeneration: 'other' })).toBe(false);
        expect(guard.accepts('new-puzzle-accept', { ...rematch, stateVector: {} })).toBe(false);
        expect(guard.generation()).toBeNull();
    });
});

describe('deterministic concurrent mutation ordering', () => {
    const edit = (actor, index = 0) => ({ senderId: actor, stateActor: actor, seq: 1,
        stateClock: 1, index, value: 1, puzzleGeneration: null });
    it('converges the same-cell winner regardless of optimistic local delivery order', () => {
        const a = createStateRecovery(); const b = createStateRecovery();
        const left = edit('actor-a'); const right = edit('actor-b');
        a.observe('cell-update', left); b.observe('cell-update', right);
        expect(a.accepts('cell-update', right)).toBe(true);
        a.observe('cell-update', right);
        expect(b.accepts('cell-update', left)).toBe(false);
        b.supersede('cell-update', left);
        expect(a.vector()).toEqual(b.vector());
        expect(a.accepts('cell-update', edit('actor-c', 1))).toBe(true);
    });
    it('resolves concurrent full replacements and retains superseded causal knowledge', () => {
        const a = createStateRecovery(); const b = createStateRecovery();
        const left = { ...edit('actor-a'), gameState: {}, stateVector: {} };
        const right = { ...edit('actor-b'), gameState: {}, stateVector: {} };
        a.observe('sync', left); b.observe('sync', right);
        expect(a.accepts('sync', right)).toBe(true); a.observe('sync', right);
        expect(b.accepts('sync', left)).toBe(false); b.supersede('sync', left);
        expect(a.vector()).toEqual(b.vector());
        expect(a.accepts('cell-update', left)).toBe(false);
        expect(a.nextClock()).toBe(2);
    });
});

describe('field and recovery revision contracts', () => {
    const value = { senderId: 'a', stateActor: 'a', stateClock: 2, seq: 2, index: 0, value: 3, notes: [], puzzleGeneration: null };
    const notes = { senderId: 'b', stateActor: 'b', stateClock: 2, seq: 2, index: 0, value: null, notes: [1], puzzleGeneration: null };
    it('orders notes separately from numeric edits without turning null into erase', () => {
        const a = createStateRecovery(); const b = createStateRecovery();
        a.observe('cell-update', value); b.observe('cell-update', notes);
        expect(a.accepts('cell-update', notes)).toBe(true);
        expect(a.project('cell-update', notes)).toMatchObject({ value: null, notes: [1] });
        expect(b.accepts('cell-update', value)).toBe(true);
        expect(b.project('cell-update', value).value).toBe(3);
        expect(b.project('cell-update', value).notes).toBeUndefined();
    });
    it('carries cell winners into a late viewer snapshot', () => {
        const source = createStateRecovery(); source.observe('cell-update', value);
        const viewer = createStateRecovery();
        viewer.observe('ping', { gameState: {}, stateVector: source.vector(), stateRevisions: source.revisions() });
        expect(viewer.accepts('cell-update', { ...value, senderId: '0', stateActor: '0' })).toBe(false);
    });
    it('recovers a missed generation after history exhaustion despite old offline changes', () => {
        const guard = createStateRecovery();
        guard.observe('new-puzzle-accept', { gameState: {}, eventId: 'old', puzzleGeneration: 'old', puzzleRevision: [1, 'host'], senderId: 'host', seq: 1, stateClock: 1 });
        guard.observe('cell-update', { ...value, stateClock: 100, puzzleGeneration: 'old' });
        const fresh = { gameState: {}, puzzleGeneration: 'new', puzzleRevision: [20, 'host'],
            stateVector: { host: 20 }, stateRevisions: { replacement: [20, 'host'], latest: [20, 'host'], cells: [] } };
        expect(guard.accepts('ping', fresh)).toBe(true); guard.observe('ping', fresh);
        expect(guard.generation()).toBe('new');
        expect(guard.vector()).toEqual({ host: 20 });
        expect(guard.accepts('cell-update', { ...value, puzzleGeneration: 'old' })).toBe(false);
    });
});

describe('spectator metadata cannot change gameplay revisions', () => {
    it('ignores clocks and boards attached to ancillary spectator events', () => {
        const guard = createStateRecovery();
        guard.observe('reaction', { stateClock: Number.MAX_SAFE_INTEGER, gameState: {}, puzzleGeneration: 'forged' });
        guard.observe('hint', { stateClock: Number.MAX_SAFE_INTEGER });
        expect(guard.nextClock()).toBe(1);
        expect(guard.generation()).toBeNull();
        expect(validateIncomingGameMessage('reaction', { emoji: '🔥', gameState: {} })).toBe(false);
    });
});
