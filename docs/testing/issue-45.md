# Issue #45 — Duo simulator follow-up

PR #46 already supplied the application orientation/responsive changes; this follow-up records the previously blocked native simulator verification without duplicating those changes.

## Verified on 2026-11-16

- iOS 27.2 runtime is now installed; the existing iPhone Duo simulator (`E8F5D903-734D-49CE-AAB9-BC683280CFD5`) boots successfully. The old minimum-runtime blocker no longer applies to this environment.
- `npm run cap:sync` completed on main containing PR #52, without tracked generated changes.
- Unsigned Debug simulator build: **BUILD SUCCEEDED**.
- Installation succeeded; `simctl launch` returned a process ID for `dev.fraha.sudoku`.
- A screenshot from display 1 (1398×2034 pixels) visibly shows the native app's Sudoku Shift setup screen, grid/difficulty choices, Play button and bottom navigation. Display 3 (2007×2853) is black in this initial configuration; this is not evidence of working unfolded gameplay.
- iOS configuration includes portrait and both landscape orientations, `UIRequiresFullScreen=false`; the web manifest permits orientation `any`. These are configuration checks, not runtime rotation tests.

## Reproduction

```sh
npm run cap:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination id=E8F5D903-734D-49CE-AAB9-BC683280CFD5 \
  -derivedDataPath /tmp/issue45-derived CODE_SIGNING_ALLOWED=NO build
xcrun simctl bootstatus E8F5D903-734D-49CE-AAB9-BC683280CFD5 -b
xcrun simctl install E8F5D903-734D-49CE-AAB9-BC683280CFD5 \
  /tmp/issue45-derived/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch E8F5D903-734D-49CE-AAB9-BC683280CFD5 dev.fraha.sudoku
xcrun simctl io E8F5D903-734D-49CE-AAB9-BC683280CFD5 screenshot --display=1 /tmp/duo-display1.png
```

Boot the device first if it is shut down (`simctl boot <UDID>`). Device IDs and runtime installation are machine-specific. Duo has multiple displays: omitting `--display` fails with `Cannot choose between 2 displays`. Locally inspected evidence is under ignored `test-results/issue45/duo-display{1,3}.png`; it is a smoke-test capture, not a screenshot-regression baseline.

## Still unverified

The available computer-use interface rejects Simulator by both name and full application path (`Invalid app`), and a follow-up attempt to access Device Hub (`com.apple.dt.Devices`) returned `cgWindowNotFound`. Native touch interactions, orientation changes, fold/unfold transitions, gameplay, accessibility/VoiceOver and lifecycle checks could not be exercised through that interface. No alternate UI automation was used to bypass this limitation. Existing browser responsive tests are not a substitute for these native scenarios. Keep #45 open for the remaining interactive device QA; do not interpret build/launch success as complete Duo support certification.

No application code or CI changed in this follow-up. Markdown references, existing plist/manifest structure, and diff whitespace were checked; application tests are not claimed for this documentation-only branch.

The simulator started by this smoke test was shut down afterward. An accessible Duo window is needed to continue interactive QA; opening a window is not itself a passing interaction test.
