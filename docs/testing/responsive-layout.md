# Responsive region contract

Landscape gameplay uses two equal grid tracks at compact landscape heights (up to 540 CSS px) and at widths of at least 900 CSS px with heights of at least 540 CSS px. Each track is `minmax(0, 1fr)`: content cannot determine its width. The measurement excludes the shared gutter and the body padding, which includes safe-area insets. A difference of at most one CSS pixel is allowed for rounding.

Compact landscape and browsers reporting two horizontal viewport segments also split the other screens explicitly:

| Screen | Primary region | Secondary region |
| --- | --- | --- |
| Start / setup | Title and introduction | Variant, difficulty, music, Play/Resume, web footer |
| Settings | Title, player identity, appearance and language | Join policy, audio, guide |
| Watch directory | Connection, pending join, search and filters | Room list or empty state |
| Privacy / legal notice | Back and page-switch navigation | Article |
| Gameplay / spectator / solved | Board or Tic Tac Toe | Status, player/spectator controls, hints or solve summary |

On two horizontal viewport segments, the smaller segment defines the equal usable widths. Extra width on an asymmetric display remains outside the content. Segment coordinates define the central unavailable gap; both sides use the same padding, including the larger horizontal safe-area inset. Navigation and help dialogs stay in the second segment. Confirmation banners use the second region. These rules use reported display geometry rather than a device-name heuristic.

Ordinary portrait screens retain their existing single-column flow. Controls can scroll vertically at compact heights; touch targets are not reduced to force everything above the fold.

## Regression checks

```bash
npx playwright test tests/qa/split-layout.spec.ts tests/qa/storage-denied.spec.ts
npm run e2e -- --ignore-snapshots
```

The region tests measure equal widths and horizontal containment of descendants in both Sudoku variants at 667×375, 812×375, 844×390, 1024×768 and 1440×900. They repeat geometry checks after portrait/landscape resizing and assert preservation of the displayed puzzle. Another case traverses setup, Settings, Watch and the privacy page. Chromium display-feature emulation tests unequal segments with a 30 px hinge, including help-dialog placement. This is emulated geometry, not physical-device evidence. Existing end-to-end tests exercise completion, spectator interactions, localization, keyboard controls, zoom and accessibility.

Visual baselines for the changed layouts are refreshed alongside the geometry checks. Saved-game screenshot fixtures pin an existing background ID so random artwork does not produce unrelated image differences; the app retains its normal random selection. Baseline comparisons still cover the artwork and controls without new masks.

## Remaining device acceptance (#45 / #59)

- The owner's physical-iPhone overlap still needs exact device/OS/viewport/content reproduction and physical verification of the fix.
- The iPhone Duo iOS 27.2 simulator is installed. On 2026-11-17, initial boot monitoring reported `Data Migration Failed`; the device subsequently reached Booted and Safari displayed the local setup page. This is a setup-page smoke check only, not completed native or orientation QA.
- Verify segment reporting in the actual Duo WebView and every supported folded/unfolded configuration. A single-screen Safari view does not establish the two-region contract on the inner display.
- Configurations reporting two **vertical** viewport segments still require a defined and verified arrangement; the current two-column rules do not handle that fold axis.
- Native lifecycle/resume, open overlays during device rotation, and the complete physical iPhone/iPad/Duo matrix remain in #45/#59.

Keep #45 open until that acceptance evidence is complete. Do not treat Chromium emulation or this page's screen inventory as native/device certification.
