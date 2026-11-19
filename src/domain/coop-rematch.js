export const COMPLETED_COOP_GRACE_MS = 30_000;

export function hasRematchPartner(role, members) {
    if (role === 'host') return members.some(member => member.role === 'guest');
    if (role === 'guest') return members.some(member => member.role === 'host');
    return false;
}
