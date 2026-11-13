import { describe, it, expect, beforeEach } from 'vitest';
import { getCellAriaLabel, getCellCoordinates } from '../../resources/js/ui/board-view.js';

describe('BoardView helpers', () => {
    it('computes correct 1-based row and column', () => {
        expect(getCellCoordinates(0)).toEqual({ row: 1, col: 1 });
        expect(getCellCoordinates(4)).toEqual({ row: 2, col: 2 });
        expect(getCellCoordinates(8)).toEqual({ row: 3, col: 3 });
    });

    it('generates WCAG compliant accessible cell labels', () => {
        expect(getCellAriaLabel(0, null, false)).toBe('Row 1, Column 1, empty');
        expect(getCellAriaLabel(4, 'X', false)).toBe('Row 2, Column 2, X');
        expect(getCellAriaLabel(8, 'O', true)).toBe('Row 3, Column 3, O, winning cell');
    });
});
