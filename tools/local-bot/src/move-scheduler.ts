import type { Difficulty, Variant } from './game-session.ts';

export const NATURAL_RANGES = {
  easy: [90_000, 180_000],
  medium: [150_000, 270_000],
  hard: [210_000, 420_000],
  expert: [300_000, 540_000],
} satisfies Record<Difficulty, [number, number]>;

export interface MoveTimingContext {
  technique: string;
  unitType?: string | null;
  candidateCount: number;
  remaining: number;
  totalMoves: number;
  opportunities?: number;
  averageCandidates?: number;
  nearFocus?: boolean;
  flowStreak?: number;
  tempo?: number;
}

export function estimateMoveFactor(ctx: MoveTimingContext): number {
  let factor: number;
  switch (ctx.technique) {
    case 'full_house': factor = 0.5; break;
    case 'note_single': factor = 0.6; break;
    case 'naked_single': factor = 0.85; break;
    case 'hidden_single': factor = ctx.unitType === 'box' ? 1.15 : 1.35; break;
    case 'locked_candidate':
    case 'naked_pair': factor = 1.9; break;
    default: factor = 2.2 + Math.min(0.8, Math.max(0, ctx.candidateCount - 2) * 0.2); break;
  }
  // Re-evaluate after every board change, rather than relying on the setup label.
  if (ctx.opportunities !== undefined) factor *= ctx.opportunities === 0 ? 1.3 : Math.max(0.7, 1.12 - ctx.opportunities * 0.06);
  if (ctx.averageCandidates !== undefined) factor *= 0.85 + Math.min(6, ctx.averageCandidates) * 0.08;
  if (ctx.nearFocus) factor *= 0.9;
  if (['full_house', 'note_single', 'naked_single'].includes(ctx.technique)) {
    factor *= Math.max(0.7, 1 - (ctx.flowStreak ?? 0) * 0.1);
  }
  if (ctx.remaining <= 6) factor *= 0.65;
  else if (ctx.remaining <= 12) factor *= 0.82;
  return factor;
}

export function pickTargetDuration(
  difficulty: Difficulty,
  variant: Variant,
  random: () => number = Math.random,
  range: readonly [number, number] = NATURAL_RANGES[difficulty],
): number {
  if (!Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0] <= 0 || range[1] < range[0]) {
    throw new Error('Invalid duration range');
  }
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid random source');
  const min = Math.min(range[0], NATURAL_RANGES[difficulty][0]);
  const max = Math.min(range[1], NATURAL_RANGES[difficulty][1]);
  return Math.round((min + draw * (max - min)) * (variant === '2x3' ? 36 / 81 : 1));
}

export function nextMovePause(
  ctx: MoveTimingContext,
  remainingBudgetMs: number,
  targetDurationMs: number,
  random: () => number = Math.random,
): number {
  const baselineAvg = targetDurationMs / Math.max(1, ctx.totalMoves);
  // The total duration is a soft starting pace, never a deadline to wait out.
  const budgetAvg = Math.max(baselineAvg * 0.65, Math.min(baselineAvg * 1.25,
    remainingBudgetMs / Math.max(1, ctx.remaining)));
  const blendedAvg = baselineAvg * 0.7 + budgetAvg * 0.3;
  const minPause = Math.min(400, Math.max(10, baselineAvg * 0.25));
  const decision = random();
  const jitter = 0.8 + random() * 0.4;
  const rhythm = decision > 0.88 ? 1.7 + random() * 0.7 : (decision < 0.22 ? 0.55 : 1);
  const thinking = blendedAvg * estimateMoveFactor(ctx) * jitter * rhythm * (ctx.tempo ?? 1);
  return Math.round(Math.max(minPause, Math.min(18_000, baselineAvg * 5, thinking)));
}
