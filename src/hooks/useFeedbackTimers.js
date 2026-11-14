import { useCallback, useEffect, useRef, useState } from 'react';
import { detectNewlyCompletedUnits } from '../domain/sudoku-engine.js';

export function useFeedbackTimers({ messagesRef = null, onBroadcastHintClear = null } = {}) {
    const [announcement, setAnnouncement] = useState('');
    const [actionFeedback, setActionFeedback] = useState('');
    const [unitCelebration, setUnitCelebration] = useState(() => ({ id: 0, cellDelays: new Map() }));
    const [hintHighlight, setHintHighlight] = useState(() => ({
        id: 0,
        mode: 'solve',
        targetIndex: null,
        contextDelays: new Map(),
    }));
    const [pendingHint, setPendingHint] = useState(null);
    const [floatingReactions, setFloatingReactions] = useState([]);

    const pendingHintRef = useRef(null);
    pendingHintRef.current = pendingHint;

    const feedbackTimerRef = useRef(null);
    const unitCelebrationTimerRef = useRef(null);
    const hintHighlightTimerRef = useRef(null);
    const reactionSeqRef = useRef(0);

    useEffect(() => () => {
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        if (unitCelebrationTimerRef.current) clearTimeout(unitCelebrationTimerRef.current);
        if (hintHighlightTimerRef.current) clearTimeout(hintHighlightTimerRef.current);
    }, []);

    const announce = useCallback((msg) => {
        if (msg) setAnnouncement(msg);
    }, []);

    const showFeedback = useCallback((msg) => {
        if (!msg) return;
        setActionFeedback(msg);
        setAnnouncement(msg);
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }
        feedbackTimerRef.current = setTimeout(() => {
            setActionFeedback('');
        }, 3200);
    }, []);

    const clearHintHighlight = useCallback(() => {
        if (hintHighlightTimerRef.current) {
            clearTimeout(hintHighlightTimerRef.current);
            hintHighlightTimerRef.current = null;
        }
        setHintHighlight((prev) => (prev.contextDelays.size > 0 || prev.targetIndex !== null
            ? { id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }
            : prev));
    }, []);

    const clearUnitCelebration = useCallback(() => {
        if (unitCelebrationTimerRef.current) {
            clearTimeout(unitCelebrationTimerRef.current);
            unitCelebrationTimerRef.current = null;
        }
        setPendingHint(null);
        pendingHintRef.current = null;
        setUnitCelebration((prev) => (prev.cellDelays.size > 0 ? { id: prev.id, cellDelays: new Map() } : prev));
        clearHintHighlight();
    }, [clearHintHighlight]);

    const clearPendingHint = useCallback((shouldBroadcast = true) => {
        const hadPending = Boolean(pendingHintRef.current);
        if (hadPending) {
            setPendingHint(null);
            pendingHintRef.current = null;
        }
        setHintHighlight((prev) => (prev.mode === 'preview' && (prev.contextDelays.size > 0 || prev.targetIndex !== null)
            ? { id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }
            : prev));
        if (shouldBroadcast && hadPending) {
            onBroadcastHintClear?.();
        }
    }, [onBroadcastHintClear]);

    const triggerHintHighlight = useCallback((hintResult, highlightMode = 'solve') => {
        if (!hintResult || !Number.isInteger(hintResult.index)) return;
        if (hintHighlightTimerRef.current) {
            clearTimeout(hintHighlightTimerRef.current);
            hintHighlightTimerRef.current = null;
        }
        const delays = hintResult.contextDelays instanceof Map
            ? hintResult.contextDelays
            : new Map([[hintResult.index, 0]]);
        const maxDelay = delays.size > 0 ? Math.max(0, ...delays.values()) : 0;
        setHintHighlight((prev) => ({
            id: prev.id + 1,
            mode: highlightMode,
            targetIndex: hintResult.index,
            contextDelays: delays,
        }));
        if (highlightMode !== 'preview') {
            hintHighlightTimerRef.current = setTimeout(() => {
                hintHighlightTimerRef.current = null;
                setHintHighlight((prev) => ({ id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }));
            }, maxDelay + 1650);
        }
    }, []);

    const triggerUnitCelebration = useCallback((prevBoard, nextState, pivotIndex = null) => {
        if (!prevBoard || !nextState?.board) return false;
        const result = detectNewlyCompletedUnits(prevBoard, nextState.board, nextState.variant, pivotIndex);
        if (!result.hasAny) return false;

        if (unitCelebrationTimerRef.current) {
            clearTimeout(unitCelebrationTimerRef.current);
        }
        const maxDelay = Math.max(0, ...result.cellDelays.values());
        setUnitCelebration((prev) => ({ id: prev.id + 1, cellDelays: result.cellDelays }));
        unitCelebrationTimerRef.current = setTimeout(() => {
            unitCelebrationTimerRef.current = null;
            setUnitCelebration((prev) => ({ id: prev.id, cellDelays: new Map() }));
        }, maxDelay + 760);

        if (nextState.status !== 'solved') {
            const m = messagesRef?.current;
            const parts = [];
            if (result.rows.length > 0 && m?.unitCompletedRow) parts.push(m.unitCompletedRow);
            if (result.cols.length > 0 && m?.unitCompletedCol) parts.push(m.unitCompletedCol);
            if (result.boxes.length > 0 && m?.unitCompletedBox) parts.push(m.unitCompletedBox);
            if (parts.length > 0) {
                announce(parts.join(', '));
            }
        }
        return true;
    }, [announce, messagesRef]);

    const addFloatingReaction = useCallback((reaction) => {
        const id = ++reactionSeqRef.current;
        setFloatingReactions((prev) => [...prev.slice(-14), { id, reaction }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
        }, 2000);
    }, []);

    return {
        announcement,
        setAnnouncement,
        actionFeedback,
        unitCelebration,
        hintHighlight,
        pendingHint,
        setPendingHint,
        floatingReactions,
        announce,
        showFeedback,
        clearHintHighlight,
        clearUnitCelebration,
        clearPendingHint,
        triggerHintHighlight,
        triggerUnitCelebration,
        addFloatingReaction,
    };
}
