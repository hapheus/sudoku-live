export const HINT_USED_EVENT = 'hint-used';
export const MAX_CONTRIBUTION_PLAYERS = 256;
export const isContributionPlayerId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64;
export const isContributionName = (name) => typeof name === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(name);
export const isHintCount = (count) => Number.isSafeInteger(count) && count >= 0;

export function cloneCellAuthors(authors, size) {
    return Array.from({ length: size }, (_, index) => isContributionPlayerId(authors?.[index]) ? authors[index] : null);
}

export function mergePlayerContributions(first = [], second = []) {
    const players = new Map();
    for (const player of [...first, ...second]) {
        if (!isContributionPlayerId(player?.id) || !isHintCount(player.hintsUsed)) continue;
        const previous = players.get(player.id);
        if (!previous && players.size >= MAX_CONTRIBUTION_PLAYERS) continue;
        players.set(player.id, {
            id: player.id,
            name: previous?.name || (isContributionName(player.name) ? player.name : null),
            hintsUsed: Math.max(previous?.hintsUsed || 0, player.hintsUsed),
        });
    }
    return [...players.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function recordPlayerContribution(state, { senderId, playerName, hintsUsed = 0 }) {
    if (!isContributionPlayerId(senderId) || !isHintCount(hintsUsed)) return state;
    const player = state.playerContributions?.find(({ id }) => id === senderId);
    if (player && player.hintsUsed >= hintsUsed && (player.name || !playerName)) return state;
    return {
        ...state,
        playerContributions: mergePlayerContributions(state.playerContributions, [{ id: senderId, name: playerName, hintsUsed }]),
    };
}

export function rememberCoopPlayers(state, members) {
    const players = members.filter(({ role }) => role === 'host' || role === 'guest');
    if (!players.some(({ role }) => role === 'guest') || !players.some(({ role }) => role === 'host')) return state;
    const next = players.reduce((game, { id, name }) => recordPlayerContribution(game, {
        senderId: id, playerName: isContributionName(name) ? name : undefined,
    }), state);
    return next.wasMultiplayer ? next : { ...next, wasMultiplayer: true };
}

export function nextHintCount(state, senderId) {
    const previous = state.playerContributions?.find(({ id }) => id === senderId);
    return Math.min(Number.MAX_SAFE_INTEGER, (previous?.hintsUsed || 0) + 1);
}

export function getPlayerResults(state, members = []) {
    const players = new Map((state.playerContributions || []).map(player => [
        player.id, { ...player, cellsSolved: 0 },
    ]));
    for (const member of members) {
        if ((member.role !== 'host' && member.role !== 'guest') || !isContributionPlayerId(member.id)) continue;
        const previous = players.get(member.id);
        players.set(member.id, {
            id: member.id,
            name: member.name || previous?.name,
            hintsUsed: previous?.hintsUsed || 0,
            cellsSolved: 0,
        });
    }
    state.cellAuthors?.forEach((id, index) => {
        if (!id || state.givens[index] || !state.board[index]) return;
        const player = players.get(id) || { id, name: null, hintsUsed: 0, cellsSolved: 0 };
        player.cellsSolved += 1;
        players.set(id, player);
    });
    return [...players.values()].sort((a, b) => a.id.localeCompare(b.id));
}
