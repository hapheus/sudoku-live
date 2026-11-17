import type { Difficulty, Variant } from './game-session.ts';

export const NATURAL_RANGES = {
  easy: [90_000, 180_000],
  medium: [150_000, 270_000],
  hard: [210_000, 420_000],
} satisfies Record<Difficulty, [number, number]>;

export interface MoveTimingContext {
  technique: string;
  unitType?: string | null;
  candidateCount: number;
  remaining: number;
  totalMoves: number;
}

export function estimateMoveFactor(ctx: MoveTimingContext): number {
  let factor: number;
  switch (ctx.technique) {
    case 'full_house': factor = 0.6; break;
    case 'note_single': factor = 0.65; break;
    case 'hidden_single': factor = ctx.unitType === 'box' ? 0.8 : 1.0; break;
    case 'naked_single': factor = 1.35; break;
    case 'locked_candidate':
    case 'naked_pair': factor = 1.75; break;
    default: factor = 1.8 + Math.min(0.8, Math.max(0, ctx.candidateCount - 2) * 0.25); break;
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
  if (ctx.remaining <= 1) return Math.max(350, Math.round(remainingBudgetMs));
  const baselineAvg = targetDurationMs / Math.max(1, ctx.totalMoves);
  const budgetAvg = Math.max(baselineAvg * 0.75, remainingBudgetMs / ctx.remaining);
  const blendedAvg = baselineAvg * 0.35 + budgetAvg * 0.65;
  const minPause = Math.min(400, Math.max(10, baselineAvg * 0.25));
  const jitter = 0.8 + random() * 0.4;
  return Math.round(Math.max(minPause, Math.min(baselineAvg * 3.5, blendedAvg * estimateMoveFactor(ctx) * jitter)));
}

export function planPauses(
  difficulty: Difficulty, variant: Variant, moves: number,
  random: () => number = Math.random,
  range: readonly [number, number] = NATURAL_RANGES[difficulty],
): number[] {
  if (!Number.isInteger(moves) || moves < 0 || moves > 81) throw new Error('Invalid move count');
  if (!Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0] <= 0 || range[1] < range[0]) {
    throw new Error('Invalid duration range');
  }
  if (moves === 0) return [];
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid random source');
    return value;
  };
  // Keep legacy environment settings from slowing the new natural profile;
  // explicitly shorter targets remain supported.
  const min = Math.min(range[0], NATURAL_RANGES[difficulty][0]);
  const max = Math.min(range[1], NATURAL_RANGES[difficulty][1]);
  const total = Math.round((min + draw() * (max - min)) * (variant === '2x3' ? 36 / 81 : 1));
  const average = total / moves;
  const low = average * 0.25;
  const high = average * 3.5;
  let burst = 0;
  const weights = Array.from({ length: moves }, () => {
    const decision = draw();
    if (burst > 0) { burst--; return 0.2 + draw() * 0.35; }
    if (decision < 0.3) { burst = 1 + Math.floor(draw() * 3); return 0.25 + draw() * 0.4; }
    return (0.5 + draw()) * (decision > 0.88 ? 3 : 1);
  });
  // Project random weights onto a bounded allocation with the requested total.
  let left = 0;
  let right = total * 2;
  for (let iteration = 0; iteration < 60; iteration++) {
    const scale = (left + right) / 2;
    const sum = weights.reduce((value, weight) => value + Math.max(low, Math.min(high, weight * scale)), 0);
    if (sum < total) left = scale;
    else right = scale;
  }
  const result = weights.map(weight => Math.floor(Math.max(low, Math.min(high, weight * right))));
  const remainder = total - result.reduce((a, b) => a + b, 0);
  for (let index = 0; index < remainder; index++) result[index % moves]++;
  return result;
}
