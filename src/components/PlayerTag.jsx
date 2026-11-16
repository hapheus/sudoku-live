import React from 'react';

/**
 * Renders a player handle (`Name#abcd`) with a muted hash suffix.
 */
export function PlayerTag({ tag }) {
    if (!tag) return null;
    const hashIdx = tag.indexOf('#');
    if (hashIdx === -1) {
        return <>{tag}</>;
    }
    return (
        <>
            {tag.slice(0, hashIdx)}
            <span className="player-tag__hash">{tag.slice(hashIdx)}</span>
        </>
    );
}
