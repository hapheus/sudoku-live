/**
 * Pure state machine for the Konami code easter egg on the shift controls.
 *
 * Phase 1 ('arrows'): ↑ ↑ ↓ ↓ ← → ← →
 * Phase 2 ('ab'): buttons morph into A, B, C, D and expect B -> A.
 */

export const KONAMI_ARROW_SEQUENCE = [
    'up',
    'up',
    'down',
    'down',
    'left',
    'right',
    'left',
    'right',
];

export const KONAMI_BUTTON_LABELS = ['A', 'B', 'C', 'D'];

export function createKonamiState() {
    return {
        phase: 'arrows',
        progress: 0,
    };
}

function findOverlapPrefixLength(sequence, matchedCount, nextInput) {
    const candidate = [...sequence.slice(0, matchedCount), nextInput];
    for (let len = Math.min(sequence.length - 1, candidate.length); len >= 1; len -= 1) {
        let matches = true;
        for (let i = 0; i < len; i += 1) {
            if (candidate[candidate.length - len + i] !== sequence[i]) {
                matches = false;
                break;
            }
        }
        if (matches) return len;
    }
    return 0;
}

export function advanceKonamiState(state = createKonamiState(), input) {
    const phase = state?.phase === 'ab' ? 'ab' : 'arrows';
    const progress = Number.isInteger(state?.progress) ? state.progress : 0;

    if (phase === 'ab') {
        const expected = progress === KONAMI_ARROW_SEQUENCE.length ? 'B' : 'A';
        if (input === expected) {
            if (expected === 'A') {
                return {
                    phase: 'arrows',
                    progress: 0,
                    completed: true,
                    resetFromAb: false,
                };
            }
            return {
                phase: 'ab',
                progress: progress + 1,
                completed: false,
                resetFromAb: false,
            };
        }
        return {
            phase: 'arrows',
            progress: 0,
            completed: false,
            resetFromAb: true,
        };
    }

    const expectedArrow = KONAMI_ARROW_SEQUENCE[progress];
    if (input === expectedArrow) {
        const nextProgress = progress + 1;
        if (nextProgress === KONAMI_ARROW_SEQUENCE.length) {
            return {
                phase: 'ab',
                progress: nextProgress,
                completed: false,
                resetFromAb: false,
            };
        }
        return {
            phase: 'arrows',
            progress: nextProgress,
            completed: false,
            resetFromAb: false,
        };
    }

    return {
        phase: 'arrows',
        progress: findOverlapPrefixLength(KONAMI_ARROW_SEQUENCE, progress, input),
        completed: false,
        resetFromAb: false,
    };
}
