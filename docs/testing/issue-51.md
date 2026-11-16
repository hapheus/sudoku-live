# Issue #51 — Quality gate and supply-chain controls

## Scope and dependency

This branch builds on #56 (#50); its PR targets that feature branch so the quality/security diff is separately reviewable. The user approved live main protection and honest difficulty fallback. No PR was merged or deployed by this work.

Because the live main gate now requires the new check, integrate this quality PR **into #50's branch first**, then integrate #50 into main under the gates. Update the other feature branches from main afterward. Do not bypass or fake checks to work around the ordering. UI integrations with #48 and navigation/session integrations with #49 need normal conflict review and full re-verification.

## Quality changes and evidence

The minimum is now 90 by default and explicitly 90 in CI. Attempts to lower it, non-finite values and values above 100 are rejected; a caller may only raise the threshold. Typecheck runs before the quality measurement. Scoring weights, coverage scope and duplication/lint thresholds were not relaxed, and no warnings were suppressed.

Baseline for #50: 73.1/100, 82.99% line coverage, 2.36% duplication, 26 warnings. Current local measurement: **90.2/100**, **86.85%** line coverage, **1.5%** duplication, **0 lint errors / 0 warnings**. Changes remove repeated MRV selection, duplicate undo snapshots/board finalization and duplicated gameplay props, share the legacy singles analyzer with the tested rating solver, and separate keyboard/presence/history/UI-state responsibilities. Legal text, component DOM behavior and CSS were preserved; no new application text or visual design was introduced.

Added public-hook tests cover guarded navigation, rematch request/cancel/accept, difficulty/variant confirmation, resume, candidate notes, note undo, two-stage hints, spectator suggestions/retraction, digit locks, given-clue protection and completion. Gate/config tests verify the minimum, immutable image references, official wrapper checksum, CI action pins and stored protection rules. The original gate/strict-lint checks failed before implementation. Tests initially exposed controlled-parent fixture state and jsdom URL/asset-transform assumptions; fixtures now model the parent applying membership updates, and repository configuration reads use paths relative to the npm project root.

## Supply-chain verification

- Node `26-alpine` and Nginx `1.29-alpine` are pinned to multi-architecture manifest digests obtained from their registry with `docker buildx imagetools inspect`; no unrelated image upgrade was requested.
- Gradle 8.14.3 wrapper JAR SHA-256 matches [the official wrapper checksum](https://services.gradle.org/distributions/gradle-8.14.3-wrapper.jar.sha256): `7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172`. It is retained because Android bootstrap needs it, not deleted to game a scanner score.
- Added the official [distribution checksum](https://services.gradle.org/distributions/gradle-8.14.3-all.zip.sha256) to Gradle properties. Pinned Gradle wrapper-validation runs in the quality job. The setup-node action commit was resolved through GitHub's official repository API.
- The pinned Docker image built successfully. A disposable loopback-only container served `/up`, `/env-config.js` and SPA HTML with HTTP 200 and content assertions, then was stopped.
- `SECURITY.md` defines private-reporting guidance without claiming a guaranteed response or external certification.
- Both unused imports reported by CodeQL were removed. The generator's trivially reachable fallback control flow was repaired in #50; this branch retains that fix.

## Live main protection — applied and read back

The existing **Protect main branch** ruleset (`27266932`) was updated under the repository-owner account after explicit user approval. All non-status rules, review requirements, ref conditions and bypass actors were preserved unchanged. The old 70-point quality context was replaced with **Quality Score >=90**; CodeQL and OSV execution/result checks were added. Existing unit/build, Playwright, Docker and packaging requirements remain. Checks are bound to the observed GitHub Actions (`15368`) or code-scanning (`57789`) app, with strict up-to-date enforcement.

The checked-in [ruleset policy](../security/main-branch-protection.json) exactly matched a fresh API read-back in every configured field after application. Existing policy requires two approvals, code-owner review, approval of the latest push, resolved review threads, no bypass actors, and blocks deletion/non-fast-forward updates. Native GitHub settings express two total approvals plus code-owner review; project policy still requires using the configured code owners for both approvals.

Important: a 404 from the legacy `/branches/main/protection` API **does not establish that a branch is unprotected**. This repository uses rulesets. An initial legacy write was rejected (422) and changed no settings. The existing ruleset was then inspected and updated through the [repository rules API](https://docs.github.com/en/rest/repos/rules#update-a-repository-ruleset), without creating parallel legacy protection. For current effective protection, query `/repos/hapheus/sudoku-shift/rules/branches/main` and the ruleset API.

PR-trigger branch filters were removed from CI, quality, CodeQL and OSV workflows to support stacked PR verification without hardcoding temporary branch names. Scorecard remains a default-branch publication workflow; its existing permissions/schedule were not expanded to untrusted PRs.

## Scanner state and limits

Source/configuration fixes do not close default-branch alerts before merge and rescan. No alert was manually dismissed or labelled fixed without scanner evidence. The wrapper binary finding has an explicit provenance/validation rationale. Maintained/SAST/BranchProtection results require a fresh default-branch Scorecard run; existing dated alerts are not proof that the new controls failed. A CII badge requires genuine external assessment, and continuous fuzzing infrastructure is not supplied or claimed by these deterministic property tests. Those external/project-level findings remain explicitly unresolved rather than addressed by fake badges or blanket suppressions.

## Browser QA and remaining limits

The #47 responsive/keyboard/zoom/axe/screenshot suite passes **14/14**, without updating references. The complete functional/axe suite (`--ignore-snapshots`) passes **57**, with **1 existing online-only skip**. Gameplay screenshots for both themes at all six established viewports were captured and visually inspected as a matrix; existing references were not refreshed. No new layout/accessibility findings were observed in the changed scope. This does not claim pixel parity for the previously documented macOS glyph-rendering differences or a full manual WCAG certification. No new native-device/Safari test was performed for this branch. No developer drawer exists.

Final full-suite/typecheck/quality/build/configuration verification is recorded below before commit. CI results are reported separately from local checks; queued checks are not claimed passed.

Final checks: **245 tests / 46 files passed**; typecheck and strict lint (`--max-warnings=0`) passed; quality **90.2/100** passed; production build, immutable-image Docker build and HTTP smoke checks, Capacitor listing, Compose validation, all workflow YAML parsing and diff checks passed. Existing snapshot/online/native limitations above remain explicit. The live ruleset was applied successfully and verified by read-back; no review or merge was posted under another account.
