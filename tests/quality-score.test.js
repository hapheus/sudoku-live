import { describe, expect, it } from 'vitest';
import { calculateQualityScore, formatSummaryMarkdown, minimumQualityScore } from '../scripts/quality-score.mjs';

describe('quality-score', () => {
    it('enforces at least 90 even when a caller asks for a lower gate', () => {
        expect(minimumQualityScore([])).toBe(90);
        expect(minimumQualityScore(['--min-score=95'])).toBe(95);
        for (const value of ['70', 'NaN', '-1', '101', '']) {
            expect(() => minimumQualityScore([`--min-score=${value}`])).toThrow();
        }
    });
    it('computes weighted score and grade A for high coverage, low duplication, and zero lint issues', () => {
        const result = calculateQualityScore({
            lineCoveragePct: 95,
            duplicatedPct: 1.0,
            eslintErrors: 0,
            eslintWarnings: 2,
        });

        expect(result.coverageScore).toBeCloseTo(38.0, 1);
        expect(result.dryScore).toBeCloseTo(27.0, 1);
        expect(result.lintScore).toBeCloseTo(29.0, 1);
        expect(result.totalScore).toBeCloseTo(94.0, 1);
        expect(result.grade).toBe('A');
    });

    it('clamps component scores at zero and assigns grade F when quality is poor', () => {
        const result = calculateQualityScore({
            lineCoveragePct: 20,
            duplicatedPct: 15,
            eslintErrors: 30,
            eslintWarnings: 40,
        });

        expect(result.dryScore).toBe(0);
        expect(result.lintScore).toBe(0);
        expect(result.totalScore).toBeCloseTo(8.0, 1);
        expect(result.grade).toBe('F');
    });

    it('formats a readable Markdown summary table', () => {
        const summary = formatSummaryMarkdown({
            lineCoveragePct: 81.82,
            duplicatedPct: 2.08,
            eslintErrors: 0,
            eslintWarnings: 10,
            coverageScore: 32.7,
            dryScore: 23.8,
            lintScore: 25.0,
            totalScore: 81.5,
            grade: 'B',
        });

        expect(summary).toContain('Code Quality Score: 81.5 / 100 (Grade B)');
        expect(summary).toContain('81.82%');
        expect(summary).toContain('2.08%');
    });
});
