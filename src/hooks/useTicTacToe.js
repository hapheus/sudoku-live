import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShiftChallenge, isValidChallenge, playMove, recordShift } from '../domain/tic-tac-toe.js';
import { getDefaultStorage, loadJson, saveJson } from '../utils/storage.js';

const TRANSITION_MS = 2500;
const RESULT_MS = 3500;
const RETURN_MS = 2500;

export function useTicTacToe({ stateRef, onlineClientRef }) {
    const [challenge, setChallenge] = useState(createShiftChallenge);
    const challengeRef = useRef(challenge);
    const roomRef = useRef(null);
    const timerRef = useRef(null);

    const update = useCallback((next) => {
        if (!isValidChallenge(next)) return;
        challengeRef.current = next;
        setChallenge(next);
        const cur = stateRef.current;
        if (cur.myRole === 'host' && cur.onlineGameId) {
            saveJson(`sudoku_tic_tac_toe_${cur.onlineGameId}`, next, getDefaultStorage('session'));
        }
    }, [stateRef]);

    const publish = useCallback((next) => {
        update(next);
        const cur = stateRef.current;
        if (cur.myRole === 'host' && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'tic-tac-toe-state', { challenge: next });
        }
    }, [onlineClientRef, stateRef, update]);

    const reset = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        update(createShiftChallenge());
    }, [update]);

    const receiveShift = useCallback((shift) => {
        const cur = stateRef.current;
        if (cur.myRole !== 'host' || cur.isSpectating || challengeRef.current.game
            || onlineClientRef.current?.supportsFeature?.('tic-tac-toe') === false) return;
        const next = recordShift(challengeRef.current, shift, cur.currentMembers);
        if (next.game) next.game.phase = 'transition';
        if (next.game) publish(next);
        else update(next);
    }, [onlineClientRef, publish, stateRef, update]);

    const onShift = useCallback((shift) => {
        const cur = stateRef.current;
        const client = onlineClientRef.current;
        if (!cur.onlineGameId || cur.isSpectating || !client?.clientId) return;
        const data = { ...shift, playerId: client.clientId };
        if (cur.myRole === 'host') receiveShift(data);
        else if (cur.myRole === 'guest') client.broadcastGameEvent(cur.onlineGameId, 'tic-tac-toe-shift', data);
    }, [onlineClientRef, receiveShift, stateRef]);

    const applyMove = useCallback((playerId, index) => {
        const cur = stateRef.current;
        const game = challengeRef.current.game;
        if (cur.myRole !== 'host' || !game || game.phase !== 'playing') return;
        const players = cur.currentMembers.filter((member) => member.role === 'host' || member.role === 'guest');
        if (players.length !== 2 || !players.some((member) => member.id === playerId)
            || !players.some((member) => member.id === game.players.X)
            || !players.some((member) => member.id === game.players.O)) return;
        const nextGame = playMove(game, playerId, index);
        if (nextGame !== game) publish({ ...challengeRef.current, game: nextGame });
    }, [publish, stateRef]);

    const onMove = useCallback((index) => {
        const cur = stateRef.current;
        const client = onlineClientRef.current;
        if (cur.isSpectating || !client?.clientId || !cur.onlineGameId) return;
        if (cur.myRole === 'host') applyMove(client.clientId, index);
        else if (cur.myRole === 'guest') client.broadcastGameEvent(cur.onlineGameId, 'tic-tac-toe-move', { playerId: client.clientId, index });
    }, [applyMove, onlineClientRef, stateRef]);

    const onMembersChange = useCallback((members) => {
        if (onlineClientRef.current?.supportsFeature?.('tic-tac-toe') === false) {
            if (challengeRef.current.game || challengeRef.current.shifts.length) {
                update({ ...challengeRef.current, game: null, shifts: [] });
            }
            return;
        }
        if (stateRef.current.myRole !== 'host') return;
        const players = members.filter((member) => member.role === 'host' || member.role === 'guest');
        const game = challengeRef.current.game;
        const valid = players.length === 2 && new Set(players.map((member) => member.id)).size === 2;
        if (game && game.phase !== 'return' && (!valid || !players.some((member) => member.id === game.players.X)
            || !players.some((member) => member.id === game.players.O))) {
            publish({ ...challengeRef.current, game: { ...game, phase: 'return' } });
        } else if (!game && !valid && challengeRef.current.shifts.length) {
            update({ ...challengeRef.current, shifts: [] });
        }
    }, [onlineClientRef, publish, stateRef, update]);

    const onHostLeave = useCallback(() => {
        const game = challengeRef.current.game;
        if (game && stateRef.current.myRole !== 'host') {
            update({ ...challengeRef.current, game: { ...game, phase: 'return' } });
        }
    }, [stateRef, update]);

    const onEvent = useCallback((type, data) => {
        const cur = stateRef.current;
        if (type === 'tic-tac-toe-shift') receiveShift(data);
        else if (type === 'tic-tac-toe-move') applyMove(data?.playerId, data?.index);
        else if (type === 'tic-tac-toe-state' && cur.myRole !== 'host' && data?.challenge) update(data.challenge);
    }, [applyMove, receiveShift, stateRef, update]);

    useEffect(() => {
        clearTimeout(timerRef.current);
        const game = challenge.game;
        if (!game) return undefined;
        const cur = stateRef.current;
        const abandoned = game.phase === 'return' && !cur.currentMembers.some((member) => member.role === 'host');
        if (cur.myRole !== 'host' && !abandoned) return undefined;
        let delay;
        let next;
        if (game.phase === 'transition') {
            delay = TRANSITION_MS;
            next = { ...game, phase: 'playing' };
        } else if (game.phase === 'return') {
            delay = RETURN_MS;
            next = null;
        } else if (game.winner || game.draw) {
            delay = RESULT_MS;
            next = { ...game, phase: 'return' };
        } else return undefined;
        timerRef.current = setTimeout(() => publish({ ...challengeRef.current, game: next }), delay);
        return () => clearTimeout(timerRef.current);
    }, [challenge, publish, stateRef]);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const setRoom = useCallback((roomId) => {
        if (roomRef.current !== roomId) {
            roomRef.current = roomId;
            clearTimeout(timerRef.current);
            const cur = stateRef.current;
            const saved = roomId && cur.myRole === 'host'
                ? loadJson(`sudoku_tic_tac_toe_${roomId}`, null, getDefaultStorage('session'))
                : null;
            update(isValidChallenge(saved) ? saved : createShiftChallenge());
        }
    }, [stateRef, update]);

    return useMemo(() => ({ challenge, challengeRef, onShift, onMove, onEvent, onMembersChange, onHostLeave, reset, setRoom, update }),
        [challenge, onShift, onMove, onEvent, onMembersChange, onHostLeave, reset, setRoom, update]);
}
