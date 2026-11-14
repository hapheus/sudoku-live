#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;
const BREAKING_HEADER_RE = /^[a-z]+(?:\([^)]+\))?!:/im;
const BREAKING_FOOTER_RE = /^BREAKING[- ]CHANGE:/im;
const MINOR_RE = /^feat(?:\([^)]+\))?:/i;
const PATCH_RE = /^(?:fix|perf|revert)(?:\([^)]+\))?:/i;

/**
 * Parse a semantic version string (with optional leading "v").
 * @param {string | null | undefined} tag
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseSemver(tag) {
    if (typeof tag !== 'string') {
        return null;
    }
    const match = tag.trim().match(SEMVER_RE);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

/**
 * Determine the highest semver bump level from a list of conventional commit messages.
 * @param {string[]} commits
 * @returns {'major' | 'minor' | 'patch' | null}
 */
export function determineBump(commits) {
    let bump = null;
    for (const rawCommit of commits) {
        const commit = rawCommit.trim();
        if (!commit) {
            continue;
        }
        const firstLine = commit.split('\n', 1)[0];
        if (BREAKING_HEADER_RE.test(firstLine) || BREAKING_FOOTER_RE.test(commit)) {
            return 'major';
        }
        if (MINOR_RE.test(firstLine)) {
            bump = 'minor';
        } else if (bump === null && PATCH_RE.test(firstLine)) {
            bump = 'patch';
        }
    }
    return bump;
}

/**
 * Compute the next semantic version string (without leading "v"), or null if no release is needed.
 * @param {string | null | undefined} latestTag
 * @param {string[]} commits
 * @returns {string | null}
 */
export function computeNextVersion(latestTag, commits) {
    if (!latestTag) {
        return '1.0.0';
    }
    const parsed = parseSemver(latestTag);
    if (!parsed) {
        throw new Error(`Invalid semver tag: ${latestTag}`);
    }
    const bump = determineBump(commits);
    if (bump === 'major') {
        return `${parsed.major + 1}.0.0`;
    }
    if (bump === 'minor') {
        return `${parsed.major}.${parsed.minor + 1}.0`;
    }
    if (bump === 'patch') {
        return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    }
    return null;
}

function getLatestSemverTag() {
    const output = execFileSync(
        'git',
        ['tag', '--merged', 'HEAD', '--sort=-v:refname', 'v[0-9]*.[0-9]*.[0-9]*'],
        { encoding: 'utf8' }
    );
    const first = output
        .split('\n')
        .map((line) => line.trim())
        .find((line) => SEMVER_RE.test(line));
    return first || null;
}

function getCommitsSinceTag(tag) {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const output = execFileSync('git', ['log', range, '--format=%B%x1e'], {
        encoding: 'utf8',
    });
    return output
        .split('\x1e')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

const isMainModule =
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
    const latestTag = getLatestSemverTag();
    const commits = getCommitsSinceTag(latestTag);
    const nextVersion = computeNextVersion(latestTag, commits);
    if (nextVersion) {
        process.stdout.write(`${nextVersion}\n`);
    }
}
