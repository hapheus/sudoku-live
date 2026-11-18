import { getBoardBackgrounds, selectBoardBackground } from './board-backgrounds.js';

const modules = import.meta.glob(
    ['../assets/landscape/*.webp', '../assets/landscape/*.png', '../assets/landscape/*.jpg',
        '../assets/landscape/*.jpeg', '../assets/landscape/*.avif'],
    { eager: true, import: 'default' },
);

// Reuse the board image discovery/selection rules with an independent image pool.
export function getLandscapeArtworks(discovered = modules) {
    return getBoardBackgrounds(discovered, {});
}

export function selectLandscapeArtwork({ backgrounds = getLandscapeArtworks(), ...options } = {}) {
    return selectBoardBackground({ ...options, backgrounds });
}
