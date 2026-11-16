import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WatchDirectory } from '../src/components/WatchDirectory.jsx';

describe('WatchDirectory React component', () => {
    it('identifies rooms playing Tic Tac Toe', () => {
        render(<WatchDirectory rooms={[{ game_id: 'coop-room-1', status: 'in_progress', tic_tac_toe: true }]} onRefresh={vi.fn()} onWatchGame={vi.fn()} />);
        expect(screen.getByText(/Tic Tac Toe/)).toBeInTheDocument();
    });

    it('renders empty state when no live Sudoku matches exist', () => {
        render(<WatchDirectory rooms={[]} onRefresh={vi.fn()} onWatchGame={vi.fn()} />);

        expect(screen.getByText('No live Sudoku matches right now.')).toBeInTheDocument();
    });

    it('safely renders valid 3x3 and 2x3 rooms with Join and Watch Live actions and filters solved/invalid rooms', () => {
        const onWatch = vi.fn();
        const onJoin = vi.fn();
        render(
            <WatchDirectory
                rooms={[
                    { id: '1', game_id: 'solo-room-1', game_mode: 'solo', status: 'in_progress', difficulty: 'medium', variant: '3x3', filled_count: 34, has_guest: false },
                    { id: '2', game_id: 'coop-room-1', game_mode: 'online', status: 'in_progress', difficulty: 'easy', variant: '2x3', total_cells: 36, filled_count: 16, has_guest: true },
                    { id: '3', game_id: '"><img src=x onerror=alert(1)>', status: 'in_progress', difficulty: 'easy', filled_count: 30 },
                    { id: '4', game_id: 'solved-room', status: 'solved', difficulty: 'expert', filled_count: 81 },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={onWatch}
                onJoinGame={onJoin}
            />,
        );

        expect(document.querySelector('img')).toBeNull();
        expect(screen.getByText('Room #solo-roo')).toBeInTheDocument();
        expect(screen.getByText('3×3 • Medium • Open to join • 34/81')).toBeInTheDocument();
        expect(screen.getByText('2×3 • Easy • Co-op live • 16/36')).toBeInTheDocument();

        const watchButtons = screen.getAllByRole('button', { name: 'Watch Live' });
        expect(watchButtons).toHaveLength(2);
        fireEvent.click(watchButtons[0]);
        expect(onWatch).toHaveBeenCalledWith('solo-room-1');

        const joinButtons = screen.getAllByRole('button', { name: 'Join' });
        expect(joinButtons).toHaveLength(2);
        expect(joinButtons[0]).not.toBeDisabled();
        expect(joinButtons[1]).not.toBeDisabled();
        fireEvent.click(joinButtons[0]);
        expect(onJoin).toHaveBeenCalledWith('solo-room-1');
        fireEvent.click(joinButtons[1]);
        expect(onJoin).toHaveBeenCalledWith('coop-room-1');
    });

    it('renders offline notice and Reconnect button when disconnected', () => {
        const onReconnect = vi.fn();
        render(
            <WatchDirectory
                rooms={[]}
                connectionStatus="disconnected"
                onReconnect={onReconnect}
                onRefresh={vi.fn()}
                onWatchGame={vi.fn()}
            />,
        );

        expect(screen.getByText('Disconnected')).toBeInTheDocument();
        expect(screen.getByText('Not connected to the live server right now.')).toBeInTheDocument();
        const reconnectBtn = screen.getByRole('button', { name: 'Reconnect' });
        fireEvent.click(reconnectBtn);
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('renders join policy states (approval needed, joins disabled) and pending join cancel banner', () => {
        const onJoin = vi.fn();
        const onCancel = vi.fn();
        const { rerender } = render(
            <WatchDirectory
                rooms={[
                    { id: '1', game_id: 'confirm-room-1', game_mode: 'solo', status: 'in_progress', difficulty: 'medium', variant: '3x3', filled_count: 20, has_guest: false, join_policy: 'confirm' },
                    { id: '2', game_id: 'closed-room-1', game_mode: 'solo', status: 'in_progress', difficulty: 'hard', variant: '3x3', filled_count: 25, has_guest: false, join_policy: 'disabled' },
                    { id: '3', game_id: 'coop-closed-1', game_mode: 'online', status: 'in_progress', difficulty: 'easy', variant: '3x3', filled_count: 15, has_guest: true, join_policy: 'disabled' },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={vi.fn()}
                onJoinGame={onJoin}
            />,
        );

        expect(screen.getByText('3×3 • Medium • Approval needed • 20/81')).toBeInTheDocument();
        expect(screen.getByText('3×3 • Hard • Watching only • 25/81')).toBeInTheDocument();
        expect(screen.getByText('3×3 • Easy • Co-op live • 15/81')).toBeInTheDocument();

        const joinBtn = screen.getByRole('button', { name: 'Join' });
        const closedBtns = screen.getAllByRole('button', { name: 'Closed' });
        expect(joinBtn).not.toBeDisabled();
        expect(closedBtns).toHaveLength(2);
        expect(closedBtns[0]).toBeDisabled();
        expect(closedBtns[1]).toBeDisabled();

        rerender(
            <WatchDirectory
                rooms={[
                    { id: '1', game_id: 'confirm-room-1', game_mode: 'solo', status: 'in_progress', difficulty: 'medium', variant: '3x3', filled_count: 20, has_guest: false, join_policy: 'confirm' },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={vi.fn()}
                onJoinGame={onJoin}
                pendingJoinGameId="confirm-room-1"
                onCancelJoinRequest={onCancel}
            />,
        );

        expect(screen.getByText('Waiting for host approval...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('displays host name and formatted game duration, and supports search and filters', () => {
        render(
            <WatchDirectory
                rooms={[
                    {
                        id: 'client_abcd1234',
                        game_id: 'alpha-room-1',
                        host_name: 'SwiftFox',
                        game_mode: 'solo',
                        status: 'in_progress',
                        difficulty: 'medium',
                        variant: '3x3',
                        filled_count: 30,
                        has_guest: false,
                        join_policy: 'auto',
                        elapsed_seconds: 135,
                    },
                    {
                        id: 'client_ef012345',
                        game_id: 'beta-room-2',
                        host_name: 'CalmOwl',
                        game_mode: 'online',
                        status: 'in_progress',
                        difficulty: 'hard',
                        variant: '2x3',
                        total_cells: 36,
                        filled_count: 18,
                        has_guest: true,
                        join_policy: 'confirm',
                        elapsed_seconds: 65,
                    },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={vi.fn()}
                onJoinGame={vi.fn()}
            />,
        );

        const hasTitle = (expected) => Array.from(document.querySelectorAll('.live-game-card__title'))
            .some((el) => el.textContent === expected);

        expect(hasTitle('SwiftFox#abcd')).toBe(true);
        expect(screen.getByText('3×3 • Medium • Open to join • 30/81 • 02:15')).toBeInTheDocument();
        expect(screen.getByText('2×3 • Hard • Co-op live • 18/36 • 01:05')).toBeInTheDocument();

        // Filter by Co-op
        fireEvent.click(screen.getByRole('button', { name: 'Co-op' }));
        expect(hasTitle('SwiftFox#abcd')).toBe(false);
        expect(hasTitle('CalmOwl#ef01')).toBe(true);

        // Filter back to All, then filter by 3×3
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        fireEvent.click(screen.getByRole('button', { name: '3×3' }));
        expect(hasTitle('SwiftFox#abcd')).toBe(true);
        expect(hasTitle('CalmOwl#ef01')).toBe(false);

        // Search by name+hex tag
        const searchInput = screen.getByRole('searchbox', { name: 'Search live games' });
        fireEvent.click(screen.getByRole('button', { name: 'All sizes' }));
        fireEvent.change(searchInput, { target: { value: 'CalmOwl#ef01' } });
        expect(hasTitle('CalmOwl#ef01')).toBe(true);
        expect(hasTitle('SwiftFox#abcd')).toBe(false);

        // Search by name with no match, then clear filters
        fireEvent.change(searchInput, { target: { value: 'NoSuchPlayer' } });
        expect(screen.getByText('No matching live games.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
        expect(hasTitle('SwiftFox#abcd')).toBe(true);
        expect(hasTitle('CalmOwl#ef01')).toBe(true);
    });

    it('disables Join and Watch with an update message for incompatible protocol rooms', () => {
        render(
            <WatchDirectory
                rooms={[
                    {
                        game_id: 'future-room-1',
                        host_name: 'FutureHost',
                        status: 'in_progress',
                        difficulty: 'medium',
                        variant: '3x3',
                        filled_count: 10,
                        protocolVersion: 99,
                        minProtocolVersion: 99,
                    },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={vi.fn()}
                onJoinGame={vi.fn()}
            />,
        );

        expect(screen.getByText(/Update required/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Watch Live' })).toBeDisabled();
    });
});
