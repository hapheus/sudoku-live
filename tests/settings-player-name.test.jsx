import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsPanel } from '../src/components/SettingsPanel.jsx';

describe('SettingsPanel player name controls', () => {
    it('displays current player name, saves custom names, and supports randomize', () => {
        const onChangePlayerName = vi.fn();
        const onRandomizePlayerName = vi.fn(() => 'BoldFalcon');

        render(
            <SettingsPanel
                theme="dark"
                language="en"
                playerName="SwiftFox"
                playerTag="SwiftFox#abcd"
                onChangeTheme={vi.fn()}
                onChangeLanguage={vi.fn()}
                onChangePlayerName={onChangePlayerName}
                onRandomizePlayerName={onRandomizePlayerName}
                onOpenGuide={vi.fn()}
            />,
        );

        expect(document.getElementById('player-tag-display')).toHaveTextContent('SwiftFox#abcd');

        const input = screen.getByLabelText('Player Name');
        expect(input).toHaveValue('SwiftFox');

        fireEvent.change(input, { target: { value: '  Alice  ' } });
        expect(onChangePlayerName).toHaveBeenCalledWith('Alice');

        const randomizeBtn = screen.getByRole('button', { name: 'Randomize player name' });
        fireEvent.click(randomizeBtn);
        expect(onRandomizePlayerName).toHaveBeenCalledTimes(1);
    });
});
