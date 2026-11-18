import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { applyGhostSwap, chooseGhostSwap, claimGhostSlot, ghostSlotAt } from '../domain/night-ghost.js';

const MINUTE = 60_000;

export function canScheduleNightGhost(visible, isSpectating, mode, role) {
    return visible && !isSpectating && (mode === 'solo' || role === 'host');
}

export function isNightGhostScene({ navTab, isPlayingGame, isSpectating, gameState, ticTacToeActive }, legalPage) {
    if (legalPage || ticTacToeActive || gameState.status !== 'in_progress') return false;
    return navTab === 'play' ? isPlayingGame : navTab === 'watch' && isSpectating;
}

const PHASES = [
    [540, 'hover'],
    [940, 'swap'],
    [1560, 'grin'],
    [1930, 'exit'],
];

export function useNightGhost({ stateRef, soundEffectsRef, announce, scene, visible, solution }) {
    const [appearance, setAppearance] = useState(null);
    const scope = visible ? scene : null;
    const [previousScope, setPreviousScope] = useState(scope);
    if (previousScope !== scope) {
        setPreviousScope(scope);
        setAppearance(null);
    }
    const seen = useRef(new Map());
    const active = useRef(null);
    const timers = useRef([]);

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);

    const dismiss = useCallback(() => {
        clearTimers();
        active.current = null;
        setAppearance(null);
    }, [clearTimers]);

    useEffect(() => {
        if (!visible) return;
        const handleVisibility = () => {
            if (document.hidden) dismiss();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            clearTimers();
            active.current = null;
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [clearTimers, dismiss, scene, visible]);

    const show = useCallback((swap, game) => {
        const cur = stateRef.current;
        if (!visible || document.hidden || game.status === 'solved') return;
        const key = JSON.stringify([cur.onlineGameId, swap.slot]);
        if (seen.current.has(key)) return;
        seen.current.set(key, true);
        if (seen.current.size > 32) seen.current.delete(seen.current.keys().next().value);

        clearTimers();
        const event = { swap, game, layout: game.solution.join(','), phase: 'enter' };
        active.current = event;
        setAppearance(event);
        soundEffectsRef.current?.playNightGhost?.();
        for (const [delay, phase] of PHASES) {
            timers.current.push(setTimeout(() => {
                if (active.current !== event || stateRef.current.gameState.solution.join(',') !== event.layout) return;
                setAppearance({ ...event, phase });
                if (phase === 'swap') {
                    soundEffectsRef.current?.playNightGhostSwap?.();
                    const message = swap.axis === 'band' ? 'nightGhostBands' : 'nightGhostStacks';
                    announce(stateRef.current.messages[message]);
                }
            }, delay));
        }
        timers.current.push(setTimeout(dismiss, 2490));
    }, [announce, clearTimers, dismiss, soundEffectsRef, stateRef, visible]);

    const matchesLayout = appearance && appearance.layout === solution.join(',');
    const effect = visible && matchesLayout ? appearance : null;
    return { nightGhost: effect, showNightGhost: show, dismissNightGhost: dismiss };
}

function useNightGhostClock(active, onSlot) {
    const trigger = useEffectEvent(onSlot);
    useEffect(() => {
        if (!active) return;
        let timer;
        const arm = () => {
            clearTimeout(timer);
            if (document.hidden) return;
            const boundary = Math.floor(Date.now() / MINUTE + 1) * MINUTE;
            timer = setTimeout(() => {
                const now = Date.now();
                // Skip throttled timers and jumps over a boundary.
                if (!document.hidden && now >= boundary && now - boundary < 1500) {
                    const slot = ghostSlotAt(new Date(boundary));
                    if (slot) trigger(slot);
                }
                arm();
            }, boundary - Date.now());
        };
        arm();
        document.addEventListener('visibilitychange', arm);
        window.addEventListener('pageshow', arm);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', arm);
            window.removeEventListener('pageshow', arm);
        };
    }, [active]);
}

export function useScheduledNightGhost({
    active, stateRef, onlineClientRef, setGameState, setHintsMap,
    clearPendingHint, clearHintHighlight, clearUnitCelebration,
    showNightGhost, persistSnapshotIfNeeded, buildSyncPayload,
}) {
    useNightGhostClock(active, (slot) => {
        const cur = stateRef.current;
        if (!active || cur.gameState.status !== 'in_progress' || cur.ticTacToeActive || !claimGhostSlot(slot)) return;
        const swap = chooseGhostSwap(cur.gameState, slot);
        const next = applyGhostSwap(cur.gameState, swap);
        clearPendingHint(false);
        clearHintHighlight();
        clearUnitCelebration();
        cur.hintsMap = new Map();
        setHintsMap(cur.hintsMap);
        cur.gameState = next;
        setGameState(next);
        showNightGhost(swap, next);
        persistSnapshotIfNeeded(next);
        if (cur.myRole === 'host' && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', {
                ...buildSyncPayload(),
                hintPreview: null,
                nightGhost: swap,
            });
        }
    });
}
