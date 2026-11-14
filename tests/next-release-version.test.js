import { describe, expect, it } from 'vitest';
import {
    computeNextVersion,
    determineBump,
    parseSemver,
} from '../scripts/next-release-version.mjs';

describe('next-release-version', () => {
    it('parses valid semver tags with or without v prefix', () => {
        expect(parseSemver('v1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
        expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
        expect(parseSemver('invalid')).toBeNull();
        expect(parseSemver(null)).toBeNull();
    });

    it('returns 1.0.0 when no previous tag exists', () => {
        expect(computeNextVersion(null, ['ci: add release workflow'])).toBe('1.0.0');
        expect(computeNextVersion(null, [])).toBe('1.0.0');
    });

    it('determines major, minor, patch, or null from conventional commits', () => {
        expect(determineBump(['chore: update deps', 'docs: readme'])).toBeNull();
        expect(determineBump(['fix(ui): align button'])).toBe('patch');
        expect(determineBump(['perf: speed up solver', 'fix: typo'])).toBe('patch');
        expect(determineBump(['fix: bug', 'feat(game): add hint'])).toBe('minor');
        expect(determineBump(['feat!: drop legacy format', 'fix: bug'])).toBe('major');
        expect(
            determineBump(['feat: api change\n\nBREAKING CHANGE: payload changed'])
        ).toBe('major');
    });

    it('computes the bumped version from the latest tag', () => {
        expect(computeNextVersion('v1.0.0', ['fix: mobile layout (#15)'])).toBe('1.0.1');
        expect(computeNextVersion('v1.0.1', ['feat(coop): spectator reactions'])).toBe('1.1.0');
        expect(computeNextVersion('v1.2.4', ['feat!: overhaul room protocol'])).toBe('2.0.0');
        expect(computeNextVersion('v1.2.4', ['ci: tweak workflow', 'docs: update'])).toBeNull();
    });
});
