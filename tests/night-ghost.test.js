import { describe, expect, it } from 'vitest';
import { claimGhostSlot, ghostSlotAt, chooseGhostSwap, applyGhostSwap } from '../src/domain/night-ghost.js';
import { createSudokuGame, serializeGameState } from '../src/domain/sudoku-engine.js';
import { shiftBand, shiftStack } from '../src/domain/sudoku-shifts.js';
import { validateIncomingGameMessage } from '../src/services/message-security.js';
import { createRoomAuthority } from '../src/services/room-authority.js';

describe('night ghost', () => {
    it('recognizes just the four top-of-hour minutes in local time', () => {
        for (const hour of [0, 1, 2, 3]) {
            expect(ghostSlotAt(new Date(2026, 10, 18, hour))).toBe(`2026-11-18/0${hour}`);
            expect(ghostSlotAt(new Date(2026, 10, 18, hour, 1))).toBeNull();
        }
        expect(ghostSlotAt(new Date(2026, 10, 17, 23, 59))).toBeNull();
        expect(ghostSlotAt(new Date(2026, 10, 18, 4))).toBeNull();
    });

    it('keeps each claim across instances and repeated local hours', () => {
        const storage = new Map();
        const reopen = () => ({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
        const summer = new Date('2026-10-25T02:00:00+02:00');
        const winter = new Date('2026-10-25T02:00:00+01:00');
        const localSlot = (date) => ghostSlotAt(new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Vienna' })));
        expect(localSlot(summer)).toBe(localSlot(winter));
        expect(claimGhostSlot(localSlot(summer), reopen())).toBe(true);
        expect(claimGhostSlot(localSlot(winter), reopen())).toBe(false);
        expect(claimGhostSlot('2026-10-26/02', reopen())).toBe(true);
    });

    it('accepts a ghost sync only from the room host', () => {
        const authority = createRoomAuthority();
        authority.announce('host-connection', { id: 'host-player', role: 'host', join_policy: 'auto' });
        authority.announce('guest-connection', { id: 'guest-player', role: 'guest' });
        authority.announce('spectator-connection', { id: 'spectator-player', role: 'spectator' });

        expect(authority.allows('host-connection', 'sync', { senderId: 'host-player', nightGhost: {} })).toBe(true);
        expect(authority.allows('guest-connection', 'sync', { senderId: 'guest-player', nightGhost: {} })).toBe(false);
        expect(authority.allows('spectator-connection', 'sync', { senderId: 'spectator-player', nightGhost: {} })).toBe(false);
        expect(authority.allows('guest-connection', 'sync', { senderId: 'guest-player' })).toBe(true);
    });

    it.each(['3x3', '2x3'])('moves full groups, preserving solution, entries, notes and owners on %s', (variant) => {
        const game = createSudokuGame({ variant });
        const [entry, note] = game.board.flatMap((digit, index) => digit ? [] : [index]);
        game.board[entry] = game.solution[entry];
        game.cellOwners[entry] = 'guest';
        game.notes[note] = [1, 2];
        for (const [draw, operation] of [[0, shiftBand], [0.9, shiftStack]]) {
            const swap = chooseGhostSwap(game, '2026-11-18/00', () => draw);
            const moved = applyGhostSwap(game, swap);
            expect(moved).toEqual(operation(game, swap.from, swap.direction));
            expect(moved.history).toHaveLength(1);
            expect(moved.conflicts).toEqual([]);
            expect(validateIncomingGameMessage('sync', { gameState: serializeGameState(moved), nightGhost: swap })).toBe(true);
            expect(validateIncomingGameMessage('sync', {
                gameState: serializeGameState(moved), nightGhost: { ...swap, from: 4 },
            })).toBe(false);
        }
    });
});
