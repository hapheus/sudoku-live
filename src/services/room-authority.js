const PLAYER_ACTIONS = new Set([
    'cell-update', 'cursor', 'active-digit', 'sync', 'ping', 'hint-highlight',
    'new-puzzle-request', 'new-puzzle-accept', 'new-puzzle-decline', 'new-puzzle-cancel',
    'fist-bump', 'retro-mode', 'tic-tac-toe-shift', 'tic-tac-toe-move',
]);
const HOST_ACTIONS = new Set(['init', 'join-response', 'join-policy', 'tic-tac-toe-state']);

/** Anonymous room policy. Broker identity binds a connection, not a human or room owner. */
export function createRoomAuthority(seed = {}) {
    let hostId = seed.hostId || null;
    let joinPolicy = seed.joinPolicy || 'confirm';
    const approved = new Set(seed.approved);
    const members = new Map(seed.members);
    const requests = new Map(seed.requests);

    const roleFor = (id, claimedRole) => {
        if (id === hostId && claimedRole === 'host') return 'host';
        return claimedRole === 'guest' && approved.has(id) ? 'guest' : 'spectator';
    };

    const acceptHostAnnouncement = (data) => {
        joinPolicy = data.join_policy || 'confirm';
        for (const id of data.approvedGuestIds || []) approved.add(id);
        if (joinPolicy === 'auto') {
            for (const member of members.values()) if (member.claimedRole === 'guest') approved.add(member.id);
        }
    };

    return {
        announce(connection, data) {
            if (!connection) return null;
            const hostPresent = [...members.values()].some((member) => roleFor(member.id, member.claimedRole) === 'host');
            if (data.role === 'host' && (!hostId || (approved.has(data.id) && !hostPresent))) hostId = data.id;
            if (data.id === hostId && data.role === 'host') acceptHostAnnouncement(data);
            if (data.role === 'guest' && joinPolicy === 'auto' && hostId) approved.add(data.id);
            const member = { id: data.id, claimedRole: data.role, role: roleFor(data.id, data.role) };
            for (const [key, existing] of members) if (existing.id === data.id && key !== connection) members.delete(key);
            members.set(connection, member);
            return member.role;
        },
        role(connection) {
            const member = members.get(connection);
            return member ? roleFor(member.id, member.claimedRole) : null;
        },
        allows(connection, type, data) {
            const member = members.get(connection);
            if (!member || data.senderId !== member.id) return false;
            const role = roleFor(member.id, member.claimedRole);
            if (type === 'join-request') return data.requesterId === member.id
                && (!requests.has(data.requestId) || requests.get(data.requestId) === member.id);
            if (type === 'join-cancel') return data.requesterId === member.id && requests.get(data.requestId) === member.id;
            if (type === 'hint' || type === 'reaction') return true;
            if (data.nightGhost !== undefined) return type === 'sync' && role === 'host';
            if (HOST_ACTIONS.has(type)) return role === 'host';
            if (!PLAYER_ACTIONS.has(type) || role === 'spectator') return false;
            if (data.role !== undefined && data.role !== role) return false;
            if (data.owner !== undefined && data.owner !== null && data.owner !== role) return false;
            if (data.playerId !== undefined && data.playerId !== member.id) return false;
            return true;
        },
        project(connection, data) {
            if (this.role(connection) === 'host') return data;
            const projected = { ...data };
            for (const field of ['ticTacToe', 'hostCursorIndex', 'hostActiveDigit', 'hintPreview', 'isRetroMode']) delete projected[field];
            return projected;
        },
        observe(type, data) {
            if (type === 'join-request') {
                for (const [key, id] of requests) if (id === data.requesterId) requests.delete(key);
                requests.set(data.requestId, data.requesterId);
            }
            if (type === 'join-cancel' && requests.get(data.requestId) === data.requesterId) requests.delete(data.requestId);
            if (type === 'join-response' && requests.get(data.requestId) === data.requesterId) {
                if (data.accepted) approved.add(data.requesterId);
                requests.delete(data.requestId);
            }
            if (type === 'join-policy') joinPolicy = data.joinPolicy;
        },
        fork: () => createRoomAuthority({ hostId, joinPolicy, approved, members, requests }),
        approvedGuestIds: () => [...approved],
        retainConnections(connections) {
            for (const key of members.keys()) if (!connections.has(key)) members.delete(key);
        },
        leave(connection) { members.delete(connection); },
    };
}
