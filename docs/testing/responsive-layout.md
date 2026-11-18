# Responsive region contract

Gameplay and menu screens use two equal columns in landscape and two equal rows in portrait. Both tracks divide the usable area after the gutter and safe-area insets. Track sizes round down together to a whole CSS pixel where supported, with any leftover space centered. Artwork and gameplay panes share the same sizing rule. Scrolling, status messages and guide content stay inside their pane and do not affect the split. Unequal portrait safe-area insets use the larger inset above and below. In landscape, the larger horizontal inset is applied on both edges. Reported segment geometry takes precedence at the hinge.

| Screen | Left region | Right region |
| --- | --- | --- |
| Start / setup | Decorative landscape artwork | Title, variant, difficulty, music, Play/Resume and footer |
| Settings | Decorative landscape artwork | All identity, appearance, language, joins, audio and guide controls |
| Watch directory | Decorative landscape artwork | Connection, pending join, filters and complete room list |
| Privacy / legal notice | Decorative landscape artwork | Navigation and complete article |
| Gameplay / spectator / solved | Board or Tic Tac Toe | Status, controls, hints or solve summary; opening the guide replaces this region |

Landscape primary navigation sits above the content in the right pane. Gameplay and spectator actions sit above the play area. Landscape artwork is discovered from [`src/assets/landscape/`](../../src/assets/landscape/README.md), independently of board images, and selected once per app mount. The supplied neon mosaic is bundled as an optimized 1024px WebP. It fills its landscape pane at full height, and centered `cover` cropping preserves proportions. Reported dual segments bound the image to the first segment, keeping the hinge clear. The artwork occupies a grid track alongside the menu. An empty image collection still leaves the artwork pane in place. Portrait places the same artwork in the top half, with the menu and bottom navigation in the lower half.

The in-game guide is a non-modal dialog in the right grid column, not a fixed overlay. It replaces status and controls, keeps the board visible and retains the puzzle. Close/Escape restores controls and focus. Rotating to portrait uses the normal modal dialog; rotating back uses the right pane without creating duplicate guides. In landscape Settings, Open Guide likewise replaces the right-hand Settings content with a non-modal guide while leaving the left artwork visible. Settings stays mounted but hidden so draft/preferences state is preserved; closing restores the opener focus. The guide scrolls with the pane content below navigation. Portrait Settings retains the normal modal dialog.

On two horizontal viewport segments, the smaller segment defines the equal usable widths. Extra width on an asymmetric display remains outside the content. Segment coordinates define the central unavailable gap; both sides use the same padding, including the larger horizontal safe-area inset. Non-game navigation stays in the second segment; guide dialogs stay in the second segment. During gameplay, confirmations, join requests and general action feedback are rendered at the top of the right region, above status or the open guide. They never occupy a full-width row above the board. Board-local celebrations, reactions, fist bumps and mini-game effects remain on the board. These rules use reported display geometry rather than a device-name heuristic.

Portrait keeps the gameplay actions at the bottom of the lower pane. The control area can scroll independently of the toolbar and the board.

## Regression checks

```bash
npx playwright test tests/qa/orientation-layout.spec.ts tests/qa/split-layout.spec.ts tests/qa/storage-denied.spec.ts
npm run e2e -- --ignore-snapshots
```

The Duo regression applies a 62 CSS px safe-area inset to each side separately at 951×669. Before the fix, a region crossed the display midpoint by 21 CSS px despite equal track widths; the corrected layout keeps both regions on their own side and centers the gutter. Compact Settings checks at 320, 360, 390 and 466 CSS px require single-line join legends and aligned option rows in English and German. The visible auto-admission heading is “Auto-accept” / “Automatisch”; its radio group retains the full accessible name. These are headless browser reproductions; the owner will retest on the physical Duo.

The region tests require exactly equal widths and check horizontal containment of descendants in both Sudoku variants at 667×375, 812×375, 844×390, 1024×768 and 1440×900. They require exactly equal portrait heights, including after rotation and after growing or scrolling the pane content. They also assert preservation of the displayed puzzle. Another case traverses setup, Settings, Watch and the privacy page. Chromium display-feature emulation tests unequal segments with a 30 px hinge, including help-dialog placement. This is emulated geometry, not physical-device evidence. Existing end-to-end tests exercise completion, spectator interactions, localization, keyboard controls, zoom and accessibility.

Visual baselines for the changed layouts are refreshed alongside the geometry checks. Saved-game screenshot fixtures pin an existing background ID so random artwork does not produce unrelated image differences; the app retains its normal random selection. Baseline comparisons still cover the artwork and controls without new masks.

## Remaining device acceptance (#45 / #59)

- The owner's physical-iPhone overlap still needs exact device/OS/viewport/content reproduction and physical verification of the fix.
- The iPhone Duo iOS 27.2 simulator is installed. On 2026-11-17, initial boot monitoring reported `Data Migration Failed`; the device subsequently reached Booted and Safari displayed the local setup page. This is a setup-page smoke check only, not completed native or orientation QA.
- Verify segment reporting in the actual Duo WebView and every supported folded/unfolded configuration. A single-screen Safari view does not establish the two-region contract on the inner display.
- Chromium also tests equal portrait heights across a reported horizontal hinge with asymmetric vertical safe areas. Verify that geometry on the actual Duo WebView when a device reports that arrangement.
- Native lifecycle/resume, open overlays during device rotation, and the complete physical iPhone/iPad/Duo matrix remain in #45/#59.

Keep #45 open until that acceptance evidence is complete. Do not treat Chromium emulation or this page's screen inventory as native/device certification.
