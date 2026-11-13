import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobbyView } from '../../resources/js/ui/lobby-view.js';

describe('LobbyView', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
    });

    it('renders empty state when no live Sudoku matches exist', () => {
        const view = new LobbyView({ containerElement: container });
        view.render([]);

        expect(container.textContent).toContain('No live Sudoku matches right now.');
    });

    it('safely renders valid Sudoku rooms without interpreting HTML in game_id', () => {
        const onWatch = vi.fn();
        const view = new LobbyView({ containerElement: container, onWatchGame: onWatch });

        view.render([
            { id: '1', game_id: 'valid-room-1', status: 'in_progress', difficulty: 'hard', filled_count: 42 },
            { id: '2', game_id: '"><img src=x onerror=alert(1)>', status: 'in_progress', difficulty: 'easy', filled_count: 30 },
            { id: '3', game_id: 'solved-room', status: 'solved', difficulty: 'expert', filled_count: 81 },
        ]);

        const cards = container.querySelectorAll('.live-game-card');
        expect(cards).toHaveLength(1);
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('Room #valid-ro');
        expect(container.textContent).toContain('Co-op • Hard • Solving live • 42/81');

        const watchBtn = container.querySelector('[data-watch-id="valid-room-1"]');
        watchBtn.click();
        expect(onWatch).toHaveBeenCalledWith('valid-room-1');
    });

    it('renders Solo rooms as Solving live without Waiting for partner', () => {
        const view = new LobbyView({ containerElement: container });

        view.render([
            { id: '1', game_id: 'solo-room-1', game_mode: 'solo', status: 'waiting', difficulty: 'medium', filled_count: 34 },
            { id: '2', game_id: 'coop-room-1', game_mode: 'online', status: 'waiting', difficulty: 'easy', filled_count: 40 },
        ]);

        const cards = container.querySelectorAll('.live-game-card');
        expect(cards).toHaveLength(2);
        expect(cards[0].textContent).toContain('Solo • Medium • Solving live • 34/81');
        expect(cards[0].textContent).not.toContain('Waiting for partner');
        expect(cards[1].textContent).toContain('Co-op • Easy • Waiting for partner • 40/81');
    });
});
