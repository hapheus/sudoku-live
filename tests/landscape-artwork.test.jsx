import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandscapeArtwork } from '../src/components/LandscapeArtwork.jsx';
import { getLandscapeArtworks, selectLandscapeArtwork } from '../src/services/landscape-artwork.js';

describe('independent landscape artwork pool', () => {
    it('discovers supplied images using board naming/sorting, without board metadata', () => {
        const artworks = getLandscapeArtworks({
            '../assets/landscape/view-2.webp': '/assets/view-2.webp',
            '../assets/landscape/view-1.jpg': '/assets/view-1.jpg',
            '../assets/landscape/README.md': undefined,
        });
        expect(artworks.map(image => image.id)).toEqual(['view-1.jpg', 'view-2.webp']);
        expect(selectLandscapeArtwork({ backgrounds: artworks, random: () => 0 })).toBe(artworks[0]);
        expect(selectLandscapeArtwork({ backgrounds: artworks, random: () => 0.99 })).toBe(artworks[1]);
    });
    it('reserves an empty decorative panel until images are added', () => {
        expect(selectLandscapeArtwork({ backgrounds: [] })).toBeNull();
        const { container, rerender } = render(<LandscapeArtwork artwork={null} />);
        expect(container.querySelector('img')).toBeNull();
        rerender(<LandscapeArtwork artwork={{ src: '/assets/landscape.webp' }} />);
        expect(container.querySelector('img')).toHaveAttribute('src', '/assets/landscape.webp');
        expect(screen.queryByRole('img')).toBeNull();
        rerender(<LandscapeArtwork artwork={{ src: '/assets/landscape.webp' }} active={false} />);
        expect(container.querySelector('img')).toBeNull();
    });
});
