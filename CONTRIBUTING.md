# Contributing to Tic Tac Toe

Thank you for contributing to the Tic Tac Toe project! This document outlines our workflow, conventions, and quality standards.

---

## Code of Conduct & Language

English is mandatory throughout the entire project for all code, comments, commit messages, PRs, and discussions.

---

## Git Workflow & Branch Conventions

We follow Git Flow conventions:

- `main`: Production-ready releases.
- `develop`: Primary integration branch. All feature branches merge here.
- `feature/<name>`: New features or enhancements (branched from `develop`).
- `hotfix/<name>`: Urgent production fixes (branched from `main`).
- `release/<version>`: Release preparation branches.

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
   composer install
   npm install
   php artisan key:generate
   touch database/database.sqlite
   php artisan migrate
   ```
3. With `devenv` / `direnv`:
   ```bash
   direnv allow
   devenv up
   ```

---

## Testing & Verification Standards

Before opening a pull request, ensure all tests and style checks pass:

1. **Backend Tests**:
   ```bash
   php artisan test
   ```
2. **Frontend Tests**:
   ```bash
   npm run test
   ```
3. **Code Style (Laravel Pint)**:
   ```bash
   ./vendor/bin/pint --test
   ```
4. **Vite Production Build**:
   ```bash
   npm run build
   ```

---

## Pull Request Process

1. Create a feature branch from `develop`.
2. Write unit and feature tests following TDD principles.
3. Keep external dependencies minimal. Avoid introducing heavy UI or state management libraries.
4. Ensure accessibility adheres to WCAG 2.2 AA guidelines (keyboard focus, touch targets, screen reader labels).
5. Open a Pull Request targeting `develop` with a clear description of the changes.
