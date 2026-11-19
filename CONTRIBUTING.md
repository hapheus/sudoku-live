# Contributing to Sudoku Live

Thank you for contributing to the Sudoku Live project! This document outlines our workflow, conventions, and quality standards.

---

## Code of Conduct & Language

English is mandatory throughout the entire project for all code, comments, commit messages, PRs, and discussions.

---

## Git Workflow & Branch Conventions

- `main`: Protected integration and release branch (requires passing CI checks, quality >=90, and 2 Code Owner approvals). The live ruleset and integration order are documented in [GitHub issue #51](https://github.com/hapheus/sudoku-shift/issues/51).
- `feat/<name>`: New features or enhancements (branched from `main`).
- `fix/<name>`: Bug fixes (branched from `main`).
- `docs/<name>`: Documentation updates (branched from `main`).
- `chore/<name>`: Tooling, build, or maintenance updates (branched from `main`).

---

## Commit Guidelines (Conventional Commits)

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` A new feature
- `fix:` A bug fix
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `docs:` Documentation changes only
- `chore:` Changes to the build process, tooling, or repository config
- `build:` Changes that affect the build system or dependencies

Keep commits atomic, meaningful, and descriptive. Never commit secrets, local `.env` files, or generated assets.

---

## Development Setup

1. Fork and clone the repository.
2. Initialize environment:
   ```bash
   cp .env.example .env
   npm install
   ```
3. Start Centrifugo and the Vite dev server:
   ```bash
   docker compose up centrifugo -d
   npm run dev
   ```
4. Or with `devenv` / `direnv`:
   ```bash
   direnv allow
   devenv up
   ```

---

## Testing & Verification Standards

Before opening a pull request, ensure all tests, builds, and container checks pass:

1. **Unit & Component Tests (Vitest)**:
   ```bash
   npm run test
   ```
2. **Vite Production Build**:
   ```bash
   npm run build
   ```
3. **Capacitor CLI Check**:
   ```bash
   npx cap ls
   ```
4. **Centrifugo & Docker Compose Validation**:
   ```bash
   docker compose config -q
   ```

---

## TypeScript and Quality Gate

```bash
npm run typecheck
npm run quality
```

The quality CLI always enforces a minimum of 90/100; lowering the CLI threshold is rejected. TypeScript is checked without migrating or claiming to typecheck the existing JavaScript. Scores, lint rules and coverage scope must not be weakened to make a change pass. For stacked PRs, CI also runs when the base is a feature branch.

---

## Pull Request Process

1. Create a feature branch from `main`.
2. Write unit and feature tests following TDD principles.
3. Keep external dependencies minimal. Avoid introducing heavy UI or state management libraries.
4. Ensure accessibility adheres to WCAG 2.2 AA guidelines (keyboard focus, touch targets, screen reader labels).
5. Open a Pull Request targeting `main` with a clear description of the changes.

## Releases After a Squash Merge

The [release workflow](.github/workflows/release.yml) computes the next version from commits on `main` since the latest version tag. For a minor release, start the final squash commit subject with `feat:`. For a patch release, use `fix:`, `perf:`, or `revert:`. Check the subject in the merge dialog, since GitHub can use the PR title there. A `feat:` or `fix:` inside the squash commit body alone does not trigger a release.

Run `node scripts/next-release-version.mjs` with the version tags available to preview the next version for the current commit. After merging, check the release workflow for the new tag and the itch.io and Docker Hub publish jobs.
