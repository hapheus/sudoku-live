import React from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.jsx';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.lang = 'en';
    window.history.replaceState({}, '', '/');
});
afterEach(cleanup);

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
