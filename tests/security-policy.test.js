import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(path, 'utf8');

describe('supply-chain and merge-gate configuration', () => {
    it('pins every Docker base image by immutable manifest digest', () => {
        const bases = read('Dockerfile').split('\n').filter(line => line.startsWith('FROM '));
        expect(bases).toHaveLength(2);
        for (const base of bases) expect(base).toMatch(/@sha256:[a-f0-9]{64}(?:\s|$)/);
    });
    it('retains an authentic Gradle 8.14.3 wrapper and verifies the downloaded distribution', () => {
        // Independently retrieved from official services.gradle.org on 2026-11-16.
        const jar = readFileSync('android/gradle/wrapper/gradle-wrapper.jar');
        expect(createHash('sha256').update(jar).digest('hex')).toBe('7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172');
        expect(read('android/gradle/wrapper/gradle-wrapper.properties')).toContain('distributionSha256Sum=ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c');
    });
    it('records strict app-bound quality/security checks without weakening review protection', () => {
        const policy = JSON.parse(read('docs/security/main-branch-protection.json'));
        expect(policy.enforcement).toBe('active');
        expect(policy.bypass_actors).toEqual([]);
        const reviews = policy.rules.find(rule => rule.type === 'pull_request').parameters;
        expect(reviews.required_approving_review_count).toBe(2);
        expect(reviews.require_code_owner_review).toBe(true);
        expect(reviews.require_last_push_approval).toBe(true);
        const statuses = policy.rules.find(rule => rule.type === 'required_status_checks').parameters;
        expect(statuses.strict_required_status_checks_policy).toBe(true);
        expect(statuses.required_status_checks).toEqual(expect.arrayContaining([
            { context: 'Quality Score >=90', integration_id: 15368 },
            { context: 'CodeQL', integration_id: 57789 },
            { context: 'osv-scanner', integration_id: 57789 },
        ]));
        expect(policy.rules.map(rule => rule.type)).toEqual(expect.arrayContaining(['deletion', 'non_fast_forward']));
    });

    it('uses the 90-point gate and pinned wrapper verification action in CI', () => {
        const workflow = read('.github/workflows/quality.yml');
        expect(workflow).toContain('name: Quality Score >=90');
        expect(workflow).toContain('run: npm run quality -- --min-score=90');
        expect(workflow).toMatch(/gradle\/actions\/wrapper-validation@[a-f0-9]{40}/);
        for (const action of workflow.matchAll(/uses: ([^\s]+)/g)) expect(action[1]).toMatch(/@[a-f0-9]{40}$/);
    });
});
