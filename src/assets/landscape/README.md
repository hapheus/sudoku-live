# Landscape artwork

Place decorative images here for the left-hand panel of non-game landscape
screens (Setup, Settings, Watch directory and legal pages). This is a separate
pool from `src/assets/boards/`; adding files here does not change board artwork.

Supported formats: WebP, PNG, JPG, JPEG and AVIF, with lowercase extensions.
Files directly in this folder are discovered automatically by Vite, just like
board images. Rebuild and redistribute the web/native app after adding images;
this is a bundled asset directory, not a runtime upload endpoint.

One image is selected randomly per app mount and retained across screen changes
and rotation. The panel uses `object-fit: contain` so the whole image is visible;
it stays within its half of the screen. Images are decorative and hidden from
assistive technology. Portrait screens do not show the panel. If the image pool is empty, the reserved panel remains empty without a broken
image or placeholder text. Prefer optimized WebP/AVIF files to avoid inflating native and web downloads.

## Bundled neon artwork

`neon-number-mosaic.webp` is the supplied “Neon-Zahlenmosaik mit versteckten
Symbolen.png”, optimized with the board-artwork settings: Pillow 13.0.0 /
libwebp 1.6.0, EXIF orientation normalization, aspect-preserving LANCZOS resize
to at most 1024 px per edge (no cropping/upscaling), WebP quality 65, method 6,
exact RGB handling and alpha quality 100. The artwork is displayed at full
opacity in its own panel; the board's gameplay scrim is not applied.

- Source: 1254×1254, 2,229,524 bytes.
- Shipped: 1024×1024, 95,078 bytes (92.85 KiB), 95.7% smaller.
- Source SHA-256: `d6430486772a5f2027908e90063a1942bba75f3502a1518eda927a9d35d96ab6`.

Only the optimized WebP is bundled. The original master is left untouched outside
the asset folder and is not added to Git. With this single image in the pool it
is selected for every landscape session; additional files join the random pool.
