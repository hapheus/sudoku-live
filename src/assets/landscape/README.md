# Landscape artwork

Place decorative images here for the right-hand panel of non-game landscape
screens (Setup, Settings, Watch directory and legal pages). This is a separate
pool from `src/assets/boards/`; adding files here does not change board artwork.

Supported formats: WebP, PNG, JPG, JPEG and AVIF, with lowercase extensions.
Files directly in this folder are discovered automatically by Vite, just like
board images. Rebuild and redistribute the web/native app after adding images;
this is a bundled asset directory, not a runtime upload endpoint.

One image is selected randomly per app mount and retained across screen changes
and rotation. The panel uses `object-fit: contain` so the whole image is visible;
it stays within its half of the screen. Images are decorative and hidden from
assistive technology. Portrait screens do not show the panel. Until images are
added, the reserved panel remains empty without a broken image or placeholder
text. Prefer optimized WebP/AVIF files to avoid inflating native and web downloads.
