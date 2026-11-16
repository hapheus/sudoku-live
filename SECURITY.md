# Security policy

## Supported versions

Security fixes target the current `main` branch. Older snapshots and app builds should be updated before reporting a vulnerability. This volunteer-maintained project does not offer a guaranteed response or remediation SLA.

## Reporting a vulnerability

Use this repository's **Security → Report a vulnerability** private reporting option when available. If that option is unavailable, open a minimal issue asking the repository owner for a private reporting channel, without publishing vulnerability details.

Do not post credentials, personal data, working attack payloads against the public service, or private logs in public issues. Include affected versions, a minimal local reproduction, expected/observed behavior and impact through the private channel. Test only against systems you control; do not probe other players or production infrastructure.

## Supply-chain verification

Container base images are pinned by manifest digest. The committed Gradle wrapper JAR is required bootstrap tooling, not an arbitrary release binary; its SHA-256 matches the official Gradle 8.14.3 wrapper checksum and is checked by wrapper-validation CI. Gradle also verifies the distribution archive checksum. See `https://github.com/hapheus/sudoku-shift/issues/51` for the dated verification and remaining repository-level controls.
