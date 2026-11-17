import { createJoinTransitions } from '../src/services/join-transitions.js';
import { describe, expect, it, vi } from 'vitest';
import { hydrateGameState } from '../src/domain/sudoku-engine.js';
import boardCatalog from '../src/services/board-background-catalog.json';
import { createRemoteEventRouter as createRouter } from '../src/services/remote-event-router.js';

describe('remote-event-router', () => {
    it.each(['init', 'sync'])('migrates retired artwork in %s and avoids resetting it on every heartbeat', (type) => {
        const raw = { variant: '3x3', board: Array(81).fill(0), givens: Array(81).fill(false), status: 'in_progress' };
        const stateRef = { current: { gameState: hydrateGameState(raw), myRole: 'spectator', isSpectating: true } };
        const setBoardBackground = vi.fn();
        const persistSnapshotIfNeeded = vi.fn();
        const router = createRemoteEventRouter({
            stateRef, setBoardBackground, persistSnapshotIfNeeded, setGameState: vi.fn(), setSelectedIndex: vi.fn(),
        });
        const payload = { gameState: raw, boardBackgroundId: boardCatalog.retired[0] };
        router(type, payload);
        const replacement = stateRef.current.boardBackground;
        expect(boardCatalog.selected).toContain(replacement.id);
        expect(persistSnapshotIfNeeded).toHaveBeenCalledWith(expect.any(Object), undefined, replacement.id);
        router('ping', payload);
        expect(setBoardBackground).toHaveBeenCalledTimes(1);
    });

    it('routes join-policy and reaction events cleanly', () => {
        const setHostJoinPolicy = vi.fn();
        const triggerFloatingReaction = vi.fn();
        const router = createRemoteEventRouter({
            stateRef: { current: { isSpectating: true } },
            onlineClientRef: { current: { clientId: 'c1' } },
            setHostJoinPolicy,
            triggerFloatingReaction,
        });

        router('join-policy', { joinPolicy: 'auto' });
        expect(setHostJoinPolicy).toHaveBeenCalledWith('auto');

        router('reaction', { emoji: '🔥' });
        expect(triggerFloatingReaction).toHaveBeenCalledWith('🔥');
    });

    it('ignores unknown event types safely', () => {
        const router = createRemoteEventRouter({
            stateRef: { current: {} },
            onlineClientRef: { current: null },
        });
        expect(() => router('unknown-event', {})).not.toThrow();
    });

    it('routes fist-bump events to triggerFistBumpEffect for players and spectators', () => {
        const triggerFistBumpEffect = vi.fn();
        const router = createRemoteEventRouter({
            stateRef: { current: { isSpectating: true } },
            onlineClientRef: { current: { clientId: 'spectator-1' } },
            triggerFistBumpEffect,
        });

        router('fist-bump', { index: 4, phraseKey: 'fistBumpAmazing', senderId: 'host-1' });
        expect(triggerFistBumpEffect).toHaveBeenCalledWith({
            index: 4,
            value: null,
            phraseKey: 'fistBumpAmazing',
        });
    });

    it('captures requesterName on incoming join-request and syncs elapsedSeconds on ping for non-hosts', () => {
        const setIncomingJoinRequests = vi.fn();
        const announce = vi.fn();
        const setGameState = vi.fn();
        const board = Array(81).fill(0);
        const givens = Array(81).fill(false);

        const stateRef = {
            current: {
                myRole: 'host',
                isSpectating: false,
                isPlayingGame: true,
                onlineGameId: 'room-1',
                joinPolicy: 'confirm',
                incomingJoinRequests: [],
                gameState: {
                    board,
                    givens,
                    filledCount: 0,
                    status: 'in_progress',
                    elapsedSeconds: 10,
                    variant: '3x3',
                },
            },
        };

        const router = createRemoteEventRouter({
            stateRef,
            onlineClientRef: { current: { clientId: 'host-1' } },
            setIncomingJoinRequests,
            announce,
            setGameState,
            setSelectedIndex: vi.fn(),
            persistSnapshotIfNeeded: vi.fn(),
        });

        router('join-request', {
            requestId: 'req-1',
            requesterId: 'guest-1',
            requesterName: 'BrightPanda',
        });

        expect(setIncomingJoinRequests).toHaveBeenCalledWith([
            {
                requestId: 'req-1',
                requesterId: 'guest-1',
                requesterName: 'BrightPanda',
                gameId: 'room-1',
            },
        ]);

        // Now test spectator/guest receiving ping with updated elapsedSeconds
        stateRef.current.myRole = 'spectator';
        stateRef.current.isSpectating = true;
        router('ping', {
            gameState: {
                board,
                givens,
                status: 'in_progress',
                elapsedSeconds: 42,
                variant: '3x3',
            },
        });

        expect(setGameState).toHaveBeenCalled();
        expect(stateRef.current.gameState.elapsedSeconds).toBe(42);
    });

    it('drops malformed game actions without mutating state', () => {
        const setGameState = vi.fn();
        const triggerFloatingReaction = vi.fn();
        const setHostCursorIndex = vi.fn();
        const router = createRemoteEventRouter({
            stateRef: {
                current: {
                    isSpectating: true,
                    gameState: { board: Array(81).fill(0), givens: Array(81).fill(false) },
                },
            },
            onlineClientRef: { current: { clientId: 'c1' } },
            setGameState,
            triggerFloatingReaction,
            setHostCursorIndex,
        });

        router('cell-update', { index: 999, value: 5 });
        router('cell-update', { index: 0, value: 99 });
        router('reaction', { emoji: 'malicious' });
        router('cursor', { index: -5, role: 'host' });
        router('ping', { gameState: 'not-an-object' });

        expect(setGameState).not.toHaveBeenCalled();
        expect(triggerFloatingReaction).not.toHaveBeenCalled();
        expect(setHostCursorIndex).not.toHaveBeenCalled();
    });
});

describe('heartbeat recovery without advancing the puzzle clock', () => {
    it.each([36, 81])('recovers added and cleared notes and ownership for %s cells', (cells) => {
        const raw = {
            board: Array(cells).fill(0), givens: Array(cells).fill(false),
            notes: Array.from({ length: cells }, () => []), cellOwners: Array(cells).fill(null),
            elapsedSeconds: 0, status: 'in_progress', variant: cells === 36 ? '2x3' : '3x3',
        };
        raw.board[1] = 1;
        const stateRef = { current: {
            gameState: hydrateGameState(raw), myRole: 'spectator', isSpectating: true,
        } };
        const setGameState = vi.fn();
        const router = createRemoteEventRouter({
            stateRef, setGameState, setSelectedIndex: vi.fn(), persistSnapshotIfNeeded: vi.fn(),
        });
        const update = (changes) => router('ping', { gameState: { ...raw, ...changes } });
        const notes = raw.notes.map((entry, i) => i === 0 ? [2, 3] : entry);
        update({ notes });
        expect(stateRef.current.gameState.notes[0]).toEqual([2, 3]);
        update({ notes: raw.notes });
        expect(stateRef.current.gameState.notes[0]).toEqual([]);
        const owners = raw.cellOwners.map((owner, i) => i === 1 ? 'guest' : owner);
        update({ cellOwners: owners });
        expect(stateRef.current.gameState.cellOwners[1]).toBe('guest');
        update({ cellOwners: raw.cellOwners });
        expect(stateRef.current.gameState.cellOwners[1]).toBeNull();
        expect(setGameState).toHaveBeenCalledTimes(4);
        expect(stateRef.current.gameState.elapsedSeconds).toBe(0);
        stateRef.current.myRole = 'host';
        stateRef.current.mode = 'online';
        router('ping', { gameState: { ...raw, notes }, stateVector: { guest: 2 } });
        expect(stateRef.current.gameState.notes[0]).toEqual([2, 3]);
    });
});

function createRemoteEventRouter(context) {
    return createRouter({ ...context, joinRequests: createJoinTransitions(context) });
}
