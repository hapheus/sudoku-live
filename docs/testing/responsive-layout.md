# Responsive region contract

Gameplay uses two equal grid tracks in landscape, with reported horizontal segments, and at widths of at least 900 CSS px with heights of at least 540 CSS px. Each track is `minmax(0, 1fr)`: content cannot determine its width. The measurement excludes the shared gutter and the body padding, which includes safe-area insets. A difference of at most one CSS pixel is allowed for rounding. Split layouts use the larger left/right safe-area inset on **both** outer edges, so an asymmetric notch inset cannot shift the column boundary away from the physical display midpoint. On reported dual segments, the segment-coordinate padding below takes precedence.

Landscape screens and browsers reporting two horizontal viewport segments use two equal regions. The existing wide-screen gameplay split also remains available at widths of at least 900 CSS px and heights of at least 540 CSS px.

| Screen | Left region | Right region |
| --- | --- | --- |
| Start / setup | Decorative landscape artwork | Title, variant, difficulty, music, Play/Resume and footer |
| Settings | Decorative landscape artwork | All identity, appearance, language, joins, audio and guide controls |
| Watch directory | Decorative landscape artwork | Connection, pending join, filters and complete room list |
| Privacy / legal notice | Decorative landscape artwork | Navigation and complete article |
| Gameplay / spectator / solved | Board or Tic Tac Toe | Status, controls, hints or solve summary; opening the guide replaces this region |

Navigation remains within the right content region on non-game screens. Landscape artwork is discovered from [`src/assets/landscape/`](../../src/assets/landscape/README.md), independently of board images, and selected once per app mount. The reserved panel remains empty until the owner adds images. Images are not mounted in portrait, and returning to landscape retains the selection.

The in-game guide is a non-modal dialog in the right grid column, not a fixed overlay. It replaces status and controls, keeps the board visible and retains the puzzle. Close/Escape restores controls and focus. Rotating to portrait uses the normal modal dialog; rotating back uses the right pane without creating duplicate guides. Settings retains its existing guide dialog.

On two horizontal viewport segments, the smaller segment defines the equal usable widths. Extra width on an asymmetric display remains outside the content. Segment coordinates define the central unavailable gap; both sides use the same padding, including the larger horizontal safe-area inset. Non-game navigation stays in the second segment; guide dialogs stay in the second segment. During gameplay, confirmations, join requests and general action feedback are rendered at the top of the right region, above status or the open guide. They never occupy a full-width row above the board. Board-local celebrations, reactions, fist bumps and mini-game effects remain on the board. These rules use reported display geometry rather than a device-name heuristic.

Ordinary portrait screens retain their existing single-column flow. Controls can scroll vertically at compact heights; touch targets are not reduced to force everything above the fold.

## Regression checks

```bash
npx playwright test tests/qa/split-layout.spec.ts tests/qa/storage-denied.spec.ts
npm run e2e -- --ignore-snapshots
```

The Duo regression applies a 62 CSS px safe-area inset to each side separately at 951×669. Before the fix, a region crossed the display midpoint by 21 CSS px despite equal track widths; the corrected layout keeps both regions on their own side and centers the gutter. Compact Settings checks at 320, 360, 390 and 466 CSS px require single-line join legends and aligned option rows in English and German. The visible auto-admission heading is “Auto-accept” / “Automatisch”; its radio group retains the full accessible name. These are headless browser reproductions; the owner will retest on the physical Duo.

The region tests measure equal widths and horizontal containment of descendants in both Sudoku variants at 667×375, 812×375, 844×390, 1024×768 and 1440×900. They repeat geometry checks after portrait/landscape resizing and assert preservation of the displayed puzzle. Another case traverses setup, Settings, Watch and the privacy page. Chromium display-feature emulation tests unequal segments with a 30 px hinge, including help-dialog placement. This is emulated geometry, not physical-device evidence. Existing end-to-end tests exercise completion, spectator interactions, localization, keyboard controls, zoom and accessibility.

Visual baselines for the changed layouts are refreshed alongside the geometry checks. Saved-game screenshot fixtures pin an existing background ID so random artwork does not produce unrelated image differences; the app retains its normal random selection. Baseline comparisons still cover the artwork and controls without new masks.

## Remaining device acceptance (#45 / #59)

- The owner's physical-iPhone overlap still needs exact device/OS/viewport/content reproduction and physical verification of the fix.
- The iPhone Duo iOS 27.2 simulator is installed. On 2026-11-17, initial boot monitoring reported `Data Migration Failed`; the device subsequently reached Booted and Safari displayed the local setup page. This is a setup-page smoke check only, not completed native or orientation QA.
- Verify segment reporting in the actual Duo WebView and every supported folded/unfolded configuration. A single-screen Safari view does not establish the two-region contract on the inner display.
- Configurations reporting two **vertical** viewport segments still require a defined and verified arrangement; the current two-column rules do not handle that fold axis.
- Native lifecycle/resume, open overlays during device rotation, and the complete physical iPhone/iPad/Duo matrix remain in #45/#59.

Keep #45 open until that acceptance evidence is complete. Do not treat Chromium emulation or this page's screen inventory as native/device certification.
