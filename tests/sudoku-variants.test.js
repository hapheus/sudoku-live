import { describe, expect, it } from 'vitest';
import {
    getBoxIndex,
    getCellCoords,
    getUnitsForVariant,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from '../src/domain/sudoku-variants.js';

describe('sudoku-variants', () => {
    it('normalizes and infers variants', () => {
        expect(normalizeVariant('6x6')).toBe('2x3');
        expect(normalizeVariant('2x3')).toBe('2x3');
        expect(normalizeVariant('3x3')).toBe('3x3');
        expect(normalizeVariant('unknown')).toBe('3x3');
        expect(inferVariantFromBoardLength(36)).toBe('2x3');
        expect(inferVariantFromBoardLength(81)).toBe('3x3');
    });

    it('computes variant specs, coordinates, box indices, and units', () => {
        const spec6 = getVariantSpec('2x3');
        expect(spec6.gridSize).toBe(6);
        expect(spec6.boxesPerRow).toBe(2);
        expect(getBoxIndex(2, 3, '2x3')).toBe(3);
        expect(getCellCoords(8, '2x3')).toEqual({ row: 1, col: 2, box: 0 });

        const units9 = getUnitsForVariant(getVariantSpec('3x3'));
        expect(units9).toHaveLength(27);
        const units6 = getUnitsForVariant(spec6);
        expect(units6).toHaveLength(18);
    });
});
