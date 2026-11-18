import React from 'react';

export function LandscapeArtwork({ artwork, active = true }) {
    return (
        <div className="landscape-artwork" aria-hidden="true">
            {active && artwork && <img src={artwork.src} alt="" className="landscape-artwork__image" />}
        </div>
    );
}
