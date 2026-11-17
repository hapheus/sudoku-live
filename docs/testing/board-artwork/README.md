# Board artwork optimization — issue #58

Baseline: `fde0dd5a2a6ab0fef2b34a6b69b6b684dbb3925b` (merged PR #78).
All sizes below are encoded bytes, not filesystem allocation or App Store download estimates.

## Collection and compatibility

The owner selected a **100-image collection with replacements for retired IDs**.
The featured alpine landscape is retained. The other 99 entries sample the sorted
1,249 UUID filenames at evenly spaced indexes `round(i * 1248 / 98)`, `i = 0..98`.
Because the names are UUIDs this selection is independent of visual style; the
[resulting contact sheet](evidence/catalog.webp) was inspected for variety and
includes gardens, villages, mountains, oceans, space and patterned illustrations.
The exact selection is frozen in `src/services/board-background-catalog.json`.

All 100 retained filenames/IDs and the featured image's metadata remain unchanged.
The catalog records the 1,150 retired filenames as migration data, not imported
image assets. A retired ID resolves to `selected[hashSeed(id) % 100]`, using the
existing FNV seed function. This frozen list makes the replacement independent of
discovery order, newly added images, room IDs and random selection. Ordinary unknown
IDs still return null. Saved local/online games and received init/sync/heartbeat
snapshots use that resolver; subsequent persistence stores the replacement's
canonical ID. The same old ID maps to the same image on all updated clients.
A mixed session with an older app can show different artwork because that older
app still has the retired original; Sudoku state/protocol/storage keys are unchanged.
Future catalog edits must retain replacement targets or explicitly migrate them.

## Measurements and encoding decision

| Payload | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Board images / built WebP / copied iOS WebP | 282,650,072 | 20,372,950 | 92.8% |
| Image count | 1,250 | 100 | 92.0% |
| Web production directory | 306,040,991 | 43,676,938 | 85.7% |
| Copied iOS web directory | 306,040,991 | 43,676,938 | 85.7% |

The same retained 100 originals totalled 22,894,968 bytes: re-encoding/resizing
saves a further **11.0%** within that subset. Collection reduction contributes
most of the overall improvement. No original-master archive is shipped.

Before: 1,249 RGB WebPs at 816x816 and one RGB WebP at 1080x1080; no transparency.
After: 99 at 816x816 and the featured image at 1024x1024. No upscaling or cropping.
The encoder preserves aspect ratio and supports lossless alpha if a future source
has transparency. Current files contain no ICC profile or required metadata.

The CSS board maximum is 460 CSS px; the image scales by 1.03 during play.
Headless Chromium measurements found image boxes up to **469.68 CSS px** on ordinary screens and **512.94 CSS px** including the 1.03 gameplay scale in the explicit Duo segment emulation (498 CSS px with reduced motion).
Representative phone portrait/landscape DPR 3, tablet DPR 2, desktop DPR 1/2 and
an intermediate portrait DPR 3 viewport are recorded in `measurements.json`.
Two times the largest measured box is 1025.88 device pixels, motivating a **1024 px cap** for approximately 2x coverage; this is not a strict full-DPR sampling guarantee.
Existing 816 px sources are retained at their native resolution: upscaling them
would add bytes without detail. They already undersample the largest DPR 2/3
boxes; this change does not claim pixel-perfect native 3x artwork. The 100-image
selection makes higher-resolution source replacements affordable later.

Compared on detailed, dark, smooth space/gradient and alpine artwork:

- 640 px / quality 75 saves more bytes but sacrifices resolution on large Retina boards.
- 1024 px maximum / quality 80 can be larger than the original encoding.
- **1024 px maximum / lossy WebP quality 65 / method 6 / exact RGB handling /
  alpha quality 100** retains the native detail of 816 px images and was selected.

[Encoding comparisons](evidence/compression.webp) show each original followed by
640/q75, native-or-1024/q65, and native-or-1024/q80 at a 384 CSS px display size.
`compression.json` records actual dimensions/settings/bytes; the original encoder
quality is unknown. No unacceptable new blocking, color shift or banding was
observed in these local comparisons. Physical-device sign-off remains separate.

Budget: **100 files, at most 1024 px per edge, 280 KiB per image and 24 MiB total**.
The largest resulting file is 266,594 bytes; total is 19.43 MiB. The byte gate is
covered by the existing background test suite; the preparation script also checks
file membership and pixel dimensions. `inventory.csv` records every old filename,
before/after dimensions and bytes, retirement and exact replacement.

## Subtle gameplay presentation

Only the artwork image has 12% opacity during active play. It composites over the
existing theme surface, darkening artwork in the dark theme and lightening it in
the light theme. Existing per-cell scrims reduce the visible image contribution
further: approximately 1.9–3.6% in dark revealed cells and 2.4–3.1% in light cells.
Text, notes, grid lines, focus, selections, hints and conflict layers stay opaque.
Completed puzzles retain the full-color artwork finale (image opacity 1).
Reduced-motion rules continue to disable transitions.

Reviewed comparisons show [dark](evidence/gameplay-dark.webp) and
[light](evidence/gameplay-light.webp) boards with a completed row, numbers,
three notes and selection. The top row uses original image bytes and the old
opacity; the bottom uses optimized bytes and the new opacity. This is controlled
Chromium evidence, not a physical-device capture. New 6x6 multi-note accessibility
checks also exposed adjacent note text being concatenated despite a separated
accessible label; adding text whitespace fixes that mismatch without changing
note values, labels or layout.

## Reproduce preparation

Toolchain used: Python 3, Pillow **13.0.0**, libwebp **1.6.0**. Pillow is an optional
asset-preparation tool; no new application/runtime dependency is introduced.
Always encode from the original masters, never from already compressed output.
For this batch the original files are available at the baseline commit:

```bash
python3 -m venv /tmp/sudoku-artwork-venv
/tmp/sudoku-artwork-venv/bin/pip install Pillow==13.0.0
mkdir /tmp/sudoku-artwork-masters
git archive fde0dd5a2a6ab0fef2b34a6b69b6b684dbb3925b src/assets/boards | tar -x -C /tmp/sudoku-artwork-masters
/tmp/sudoku-artwork-venv/bin/python scripts/board-artwork.py inventory /tmp/sudoku-artwork-masters/src/assets/boards
/tmp/sudoku-artwork-venv/bin/python scripts/board-artwork.py optimize /tmp/sudoku-artwork-masters/src/assets/boards /tmp/sudoku-artwork-output
/tmp/sudoku-artwork-venv/bin/python scripts/board-artwork.py verify /tmp/sudoku-artwork-output
```

`optimize` requires a new output directory and verifies the complete catalog and
budgets before reporting success. Replace `src/assets/boards/` with that verified
output only; retired masters remain in Git history. For future artwork, supply a
new master and deliberately update the catalog/budget rather than re-encoding
this optimized collection. Do not remove historical retirement mappings.

## Verification and outstanding acceptance

- Unit tests cover discovery of exactly the selected 100, every retired-ID mapping,
  order/extension stability, invalid IDs and encoded-byte budgets.
- Headless browser tests cover both themes and four representative images, notes,
  completed units, selection, accessibility, saved-game restore/reload, retired
  ID replacement/persistence, solved artwork and image decoding at phone/tablet/
  desktop/Duo-emulated layouts. Visual assertions are not disabled or masked.
- Production web, itch ZIP and copied iOS web assets are measured separately. The
  copied iOS directory is **not** an IPA or a measured App Store compressed download.
- Existing visual baselines are updated only for the intentional artwork change;
  final comparisons must run without `--update-snapshots`.
- Physical iPhone/iPad visual checks, native WebView rendering and actual Duo
  fold/display geometry remain manual acceptance under #58/#59. The iPad appeared
  in the connected device list; the iPhone was offline. Device listing is not a
  visual test. Keep #58 open for physical-device sign-off; no build was installed,
  submitted or published as part of asset preparation.

## Candidate check results

- Full unit/component coverage suite, TypeScript and lint passed. Quality: **90.7/100**,
  line coverage **88.36%**, duplication **1.53%**, zero lint errors/warnings.
- Production build, development/production Compose configuration validation,
  Capacitor iOS copy and itch ZIP build/verification passed. The ZIP is
  **43,117,924 bytes** with 117 entries. `cap ls` exits successfully and reports
  that listing web plugins is not possible; it is not a native build validation.
- Every compiled WebP reference resolves in web, itch and copied iOS output:
  exactly 100 in each. Re-running the preparation tool from the baseline sources
  reproduced all 100 shipped images byte-for-byte.
- Twelve existing gameplay screenshots were intentionally refreshed; setup,
  Settings, Watch and other unrelated baselines were not changed. Ten new board
  baselines cover active and solved presentation. Representative phone/tablet
  dark/light, completed-board and comparison images were visually inspected.
- Final full headless comparison run: **94 passed, 9 skipped**, with no snapshot
  updates and a dedicated output directory. The skipped cases require the optional
  isolated multiplayer broker; they are not claimed as live-backend evidence here.
  All 13 focused artwork/Settings checks also passed independently.
