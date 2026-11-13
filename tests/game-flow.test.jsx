import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { createSudokuGame, setCellValue } from '../src/domain/sudoku-engine.js';
import { saveSoloGameSnapshot } from '../src/services/online-state-storage.js';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.lang = 'en';
    window.history.replaceState({}, '', '/');
});
afterEach(() => {
    vi.useRealTimers();
    cleanup();
});

it('renders classic BottomNav and flows cleanly from Play Setup (3x3/2x3 + difficulty) to the clean Game Screen', () => {
    render(<App />);

    // Classic bottom bar with Play, Watch, Settings
    expect(screen.getByRole('tab', { name: 'Play' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Watch' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeVisible();

    // Setup screen: pick 2x3 and Hard, board not rendered yet
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '2×3 (6×6)' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // Clean active game screen without Variant/Difficulty clutter
    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.queryByRole('radio', { name: '2×3 (6×6)' })).not.toBeInTheDocument();
    expect(document.getElementById('game-status-text')).toHaveTextContent('2×3 Hard • Solo');
    expect(screen.getByRole('button', { name: 'Hint' })).toBeVisible();
    expect(document.getElementById('back-to-setup-btn')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByRole('button', { name: 'Notes On' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fill Candidates' })).toBeVisible();
});

it('switches cleanly between Watch lobby, Spectator view, and Settings (Light mode & Deutsch)', () => {
    render(<App />);

    // Start a game first
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('grid')).toBeVisible();

    // Switch to Settings -> Light mode + Deutsch
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('sudoku_theme')).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(document.documentElement.lang).toBe('de');
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Spielen' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Zuschauen' })).toBeVisible();

    // Returning to Play keeps active game screen intact (in German!)
    fireEvent.click(screen.getByRole('tab', { name: 'Spielen' }));
    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hinweis' })).toBeVisible();

    // Switch to Watch tab
    fireEvent.click(screen.getByRole('tab', { name: 'Zuschauen' }));
    expect(screen.getByRole('heading', { name: 'Aktive Live-Spiele' })).toBeVisible();

    // Direct /games/:id?watch=1 opens Watch Spectator screen with interaction buttons
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, '', '/games/room123?watch=1');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Watch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Spectating Live Match/i)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Spectator Interactions' })).toBeVisible();
});

it('briefly highlights a completed row as a reward when the player fills its last cell', () => {
    vi.useFakeTimers();

    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const puzzle2x3 = [...solution2x3];
    puzzle2x3[0] = 0; // finishes row 0 (0..5)
    puzzle2x3[6] = 0; // keeps box 0 open
    puzzle2x3[12] = 0; // keeps col 0 open
    puzzle2x3[13] = 0; // filled below as saved user progress

    let savedState = createSudokuGame({
        difficulty: 'easy',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });
    savedState = setCellValue(savedState, 13, 6);
    saveSoloGameSnapshot(savedState, 'roomcelebrate1');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));

    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[0]);
    fireEvent.click(document.querySelector('.numpad-btn[data-digit="1"]'));

    const updatedCells = screen.getAllByRole('gridcell');
    for (let i = 0; i < 6; i++) {
        expect(updatedCells[i]).toHaveClass('sudoku-cell--unit-complete');
    }
    expect(updatedCells[6]).not.toHaveClass('sudoku-cell--unit-complete');
    expect(document.getElementById('game-announcements')).toHaveTextContent('Row completed');

    act(() => {
        vi.advanceTimersByTime(1000);
    });

    const clearedCells = screen.getAllByRole('gridcell');
    expect(clearedCells[0]).not.toHaveClass('sudoku-cell--unit-complete');
});
