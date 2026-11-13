import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WatchDirectory } from '../src/components/WatchDirectory.jsx';

describe('WatchDirectory React component', () => {
    it('renders empty state when no live Sudoku matches exist', () => {
        render(<WatchDirectory rooms={[]} onRefresh={vi.fn()} onWatchGame={vi.fn()} />);

        expect(screen.getByText('No live Sudoku matches right now.')).toBeInTheDocument();
    });

    it('safely renders valid Solo and Co-op rooms and filters solved or invalid rooms', () => {
        const onWatch = vi.fn();
        render(
            <WatchDirectory
                rooms={[
                    { id: '1', game_id: 'solo-room-1', game_mode: 'solo', status: 'waiting', difficulty: 'medium', filled_count: 34 },
                    { id: '2', game_id: 'coop-room-1', game_mode: 'online', status: 'waiting', difficulty: 'easy', filled_count: 40 },
                    { id: '3', game_id: '"><img src=x onerror=alert(1)>', status: 'in_progress', difficulty: 'easy', filled_count: 30 },
                    { id: '4', game_id: 'solved-room', status: 'solved', difficulty: 'expert', filled_count: 81 },
                ]}
                onRefresh={vi.fn()}
                onWatchGame={onWatch}
            />,
        );

        expect(document.querySelector('img')).toBeNull();
        expect(screen.getByText('Room #solo-roo')).toBeInTheDocument();
        expect(screen.getByText('Solo • Medium • Solving live • 34/81')).toBeInTheDocument();
        expect(screen.getByText('Co-op • Easy • Waiting for partner • 40/81')).toBeInTheDocument();

        const watchButtons = screen.getAllByRole('button', { name: 'Watch Live' });
        expect(watchButtons).toHaveLength(2);
        fireEvent.click(watchButtons[0]);
        expect(onWatch).toHaveBeenCalledWith('solo-room-1');
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
});
