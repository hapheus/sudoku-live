import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function round1(value) {
    return Math.round(value * 10) / 10;
}

export function gradeForScore(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

export function calculateQualityScore({
    lineCoveragePct = 0,
    duplicatedPct = 0,
    eslintErrors = 0,
    eslintWarnings = 0,
}) {
    const coverageScore = round1(Math.max(0, Math.min(40, lineCoveragePct * 0.4)));
    const dryScore = round1(Math.max(0, 30 - duplicatedPct * 3));
    const lintScore = round1(Math.max(0, 30 - eslintErrors * 1.5 - eslintWarnings * 0.5));
    const totalScore = round1(coverageScore + dryScore + lintScore);

    return {
        coverageScore,
        dryScore,
        lintScore,
        totalScore,
        grade: gradeForScore(totalScore),
    };
}

export function formatSummaryMarkdown(metrics) {
    return [
        `### Code Quality Score: ${metrics.totalScore} / 100 (Grade ${metrics.grade})`,
        '',
        '| Dimension | Raw Metric | Score |',
        '| --- | --- | --- |',
        `| Test Coverage (Lines) | ${metrics.lineCoveragePct}% | ${metrics.coverageScore} / 40 |`,
        `| DRY (Duplication) | ${metrics.duplicatedPct}% | ${metrics.dryScore} / 30 |`,
        `| Static Analysis (ESLint + SonarJS) | ${metrics.eslintErrors} errors, ${metrics.eslintWarnings} warnings | ${metrics.lintScore} / 30 |`,
        '',
    ].join('\n');
}

function runStep(cmd, args, { allowNonZero = false } = {}) {
    const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (!allowNonZero && res.status !== 0) {
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
        process.exit(res.status || 1);
    }
    return res;
}

export function minimumQualityScore(args) {
    const option = args.find(arg => arg.startsWith('--min-score='));
    const score = option ? Number(option.split('=')[1]) : 90;
    if (!Number.isFinite(score) || score < 90 || score > 100) {
        throw new Error('Quality minimum must be between 90 and 100.');
    }
    return score;
}

function main() {
    const minScore = minimumQualityScore(process.argv.slice(2));
    runStep('npm', ['run', 'typecheck']);

    runStep('npx', ['vitest', 'run', '--coverage']);
    runStep('npx', ['jscpd', '--silent']);
    const eslintRes = runStep('npx', ['eslint', 'src/', '--format', 'json'], { allowNonZero: true });

    const coverageJson = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
    const lineCoveragePct = Number(coverageJson?.total?.lines?.pct || 0);

    const jscpdJson = JSON.parse(readFileSync('coverage/jscpd/jscpd-report.json', 'utf8'));
    const duplicatedPct = Math.round(Number(jscpdJson?.statistics?.total?.percentage || 0) * 100) / 100;

    const eslintResults = JSON.parse(eslintRes.stdout || '[]');
    let eslintErrors = 0;
    let eslintWarnings = 0;
    for (const file of eslintResults) {
        eslintErrors += file.errorCount || 0;
        eslintWarnings += file.warningCount || 0;
    }

    const scores = calculateQualityScore({
        lineCoveragePct,
        duplicatedPct,
        eslintErrors,
        eslintWarnings,
    });

    const summary = formatSummaryMarkdown({
        lineCoveragePct,
        duplicatedPct,
        eslintErrors,
        eslintWarnings,
        ...scores,
    });

    process.stdout.write(`\n${summary}\n`);

    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    }

    if (scores.totalScore < minScore) {
        console.error(`Quality score ${scores.totalScore} is below minimum threshold ${minScore}.`);
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
