# Issue #48 — System theme

Stored preference and effective theme are separate: missing/invalid storage defaults to System, while explicit Dark/Light selections remain authoritative. System listens to OS media-query changes, updates HTML data-theme, color-scheme and theme-color, and cleans up its listener on override/unmount. No matchMedia fallback assumes dark, preserving non-browser test behavior. New English/German labels live in locale files.

The appearance control now has three choices. Its group stacks above language on narrow phones, retaining >=44px targets. Twelve existing Settings references were intentionally updated for this layout; twelve new System-selected references were visually reviewed as a complete viewport/theme matrix and connected to assertions. Existing gameplay references were not refreshed.

TDD: three hook assertions failed against the old dark-only default before implementation. Five preference tests now cover OS updates, cleanup, persistence and overrides; component callbacks include System. Full Vitest suite: 220 tests in 42 files pass. Lint: 0 errors, 27 pre-existing warnings. Build, Capacitor listing, Compose validation and diff checks pass.

Browser coverage: Dark/Light OS settings at 360×640, 390×844, 768×1024, 1280×800, 1440×900 and 812×375. Twenty-six cases cover new System behavior plus #47 regressions, keyboard radio navigation, persistence/reload, live OS changes, HTML/meta/style synchronization, overflow and axe WCAG 2/2.1 A/AA with no disabled rules. Existing #47 keyboard/200% zoom/reduced-motion checks remain included. No developer drawer exists. All 26 cases passed with regenerated references; final no-update run is recorded below.

Limits: Chromium/macOS, not Safari/native-device verification or full manual WCAG certification. Known fixed-nav full-element-capture artifact is documented in REPORT.md. Existing gameplay screenshot debt and >=90 quality remediation are outside this feature. No separate typecheck task exists.

Final no-update Chromium run: **26/26 passed**, including all 24 Settings/System references and unchanged shift references.
