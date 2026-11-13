import React from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.jsx';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
});
afterEach(cleanup);

it('opens on a splash and enters a playable puzzle with Watch Live, Hints, and 3x3/2x3 preserved', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sudoku Live' })).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Watch Live/i })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Solo' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Watch Live' })).toBeVisible();
    expect(screen.getByRole('radio', { name: '2×3 (6×6)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Enter 1,/ })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByRole('button', { name: 'Notes On' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fill Candidates' })).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Watch Live' }));
    expect(screen.getByRole('heading', { name: 'Live Sudoku Matches' })).toBeVisible();
});

it('can open Watch Live directly from splash and bypasses splash on /games/:id?watch=1', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Watch Live/i }));
    expect(screen.getByRole('heading', { name: 'Live Sudoku Matches' })).toBeVisible();

    cleanup();
    window.history.replaceState({}, '', '/games/room123?watch=1');
    render(<App />);
    expect(screen.getByText(/Spectating Live Match/i)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Spectator Interactions' })).toBeVisible();
});
