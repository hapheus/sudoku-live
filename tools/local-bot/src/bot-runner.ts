import type { LogicalHint } from './types.ts';
import { getPeerIndices } from '../../../src/domain/sudoku-engine.js';
import { CentrifugoAdapter } from './centrifugo-adapter.ts';
import { GameSession } from './game-session.ts';
import type { Difficulty, Variant } from './game-session.ts';
import { nextMovePause, pickTargetDuration } from './move-scheduler.ts';
import { choosePlayerProfile, replacementDelay } from './player-profile.ts';
import type { NotesPolicy, BotJoinPolicy } from './player-profile.ts';
export type { NotesPolicy } from './player-profile.ts';

const HINT_CHANCE: Record<string, number> = {
  full_house: 0.05,
  note_single: 0.05,
  hidden_single: 0.15,
  naked_single: 0.25,
  locked_candidate: 0.9,
  naked_pair: 0.9,
  fallback: 0.95,
};

export interface RunnerOptions {
  wsUrl: string;
  variant?: Variant | 'random';
  random?: () => number;
  notesPolicy?: NotesPolicy | 'random';
  joinPolicy?: BotJoinPolicy | 'random';
  onError?: (difficulty: Difficulty, diagnostic: ReturnType<CentrifugoAdapter['retryDiagnostic']>) => void;
  durationRanges?: Partial<Record<Difficulty, readonly [number, number]>>;
}

export class BotRunner {
  private adapter: CentrifugoAdapter;
  private profile: ReturnType<typeof choosePlayerProfile>;
  private puzzlesLeft: number;
  private nextPlayerAt: number | null = null;
  private readonly difficultySetting: Difficulty | 'random';
  private activeDifficulty: Difficulty;
  private readonly options: RunnerOptions;
  private current: GameSession | null = null;
  private started = false;
  private stopped = false;
  private due = 0;
  private heartbeatAt = 0;
  private startedAt = 0;
  private rotateAt = Infinity;
  private retryAt = 0;
  private failures = 0;
  private targetDurationMs = 0;
  private totalMoves = 0;
  private flowStreak = 0;
  private pendingFluentMove = false;
  private pendingMove: ReturnType<GameSession['advance']> = null;
  private pendingShift: { eventId: string; snapshot: ReturnType<GameSession['snapshot']> } | null = null;
  private movesSinceShift = 0;
  private nextShift = Infinity;
  private movesSinceNotes = 0;
  private nextNotes = Infinity;
  private cursorSteps: { at: number; index: number | null; digit: number | null }[] = [];
  private pendingHintStep: { at: number; hint: LogicalHint; shown: boolean } | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(difficulty: Difficulty | 'random', options: RunnerOptions) {
    this.difficultySetting = difficulty;
    this.options = options;
    this.profile = choosePlayerProfile({ ...options, difficulty }, options.random);
    this.activeDifficulty = this.profile.difficulty;
    this.puzzlesLeft = this.profile.puzzles;
    this.adapter = new CentrifugoAdapter(options.wsUrl, this.profile.joinPolicy);
  }

  session() { return this.current; }
  ready() { return !this.stopped && this.started && this.failures === 0 && this.adapter.connected; }

  step(now: number): Promise<void> {
    if (this.stopped || now < this.retryAt) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.tick(now).then(() => { this.failures = 0; }).catch((error: unknown) => {
      this.retryAt = now + Math.min(30_000, 1_000 * 2 ** Math.min(this.failures++, 5));
      this.heartbeatAt = 0;
      this.options.onError?.(this.activeDifficulty, this.adapter.retryDiagnostic(error));
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async tick(now: number) {
    const random = this.options.random || Math.random;
    if (this.current?.solved && now >= this.rotateAt) await this.finishGame(now, random);
    if (this.nextPlayerAt !== null) {
      if (now < this.nextPlayerAt) return;
      const previousName = this.adapter.playerName;
      this.profile = choosePlayerProfile({ ...this.options, difficulty: this.difficultySetting }, random);
      this.activeDifficulty = this.profile.difficulty;
      this.puzzlesLeft = this.profile.puzzles;
      this.adapter = new CentrifugoAdapter(this.options.wsUrl, this.profile.joinPolicy, previousName);
      this.nextPlayerAt = null;
    }
    if (!this.current) this.current = new GameSession(this.profile.difficulty, this.profile.variant, random);
    const session = this.current;
    if (!this.started) {
      if (this.profile.notesPolicy === 'always') session.fillCandidates();
      await this.adapter.open(session);
      this.flowStreak = 0;
      this.targetDurationMs = pickTargetDuration(session.difficulty, session.variant, random,
        this.options.durationRanges?.[session.difficulty]);
      this.totalMoves = Math.max(1, session.remaining);
      this.startedAt = now;
      this.due = now + this.computePause(session, now, random);
      this.heartbeatAt = now + 10_000;
      this.started = true;
      this.movesSinceShift = 0;
      this.nextShift = 6 + Math.floor(random() * 7);
      this.movesSinceNotes = 0;
      this.nextNotes = 8 + Math.floor(random() * 10);
      await this.planCursor(session, now, this.due - now);
      return;
    }
    const changed = await this.adapter.receive(session);
    if (changed.size) {
      this.flowStreak = 0;
      if (this.pendingMove && changed.has(this.pendingMove.index)) this.pendingMove = null;
      this.cursorSteps = [];
      this.pendingHintStep = null;
      await this.adapter.clearHintHighlight();
      if (!session.solved && session.canAutoplay) {
        if (!this.pendingMove && !this.pendingShift) this.due = now + this.computePause(session, now, random);
        await this.planCursor(session, now, Math.max(500, this.due - now));
      }
      else await this.adapter.cursor(null);
      if (session.solved && this.rotateAt === Infinity) this.rotateAt = now + (this.puzzlesLeft === 1 ? 0 : 5_000);
    }
    if (!this.pendingShift) session.updateElapsed(now - this.startedAt);
    if (this.adapter.needsSync || now >= this.heartbeatAt) {
      await this.adapter.sync(session);
      this.heartbeatAt = now + 10_000;
    }
    await this.flushCursor(now);
    if (session.solved && now >= this.rotateAt) { await this.finishGame(now, random); return; }
    if (!session.canAutoplay) return;
    if (!this.pendingMove && !this.pendingShift && (now < this.due || session.solved)) return;
    if (!this.pendingMove && !this.pendingShift && this.adapter.shiftsAllowed && this.movesSinceShift >= this.nextShift && session.remaining > 3) {
      const shift = session.shift();
      if (shift) this.pendingShift = { ...shift, snapshot: session.snapshot() };
    }
    if (this.profile.notesPolicy === 'later'
      && !this.pendingMove && !this.pendingShift && !session.hasNotes && session.remaining > 4
      && this.targetDurationMs >= 15_000
      && (this.movesSinceNotes >= this.nextNotes
        || ['locked_candidate', 'naked_pair', 'fallback'].includes(session.preview()?.hint?.technique ?? ''))) {
      const updates = session.fillCandidates();
      this.movesSinceNotes = 0;
      this.nextNotes = 8 + Math.floor(random() * 10);
      if (updates.length) {
        this.pendingHintStep = null;
        await this.adapter.clearHintHighlight();
        await this.adapter.fillCandidates(updates);
        this.flowStreak = 0;
        this.due = now + Math.max(700, this.computePause(session, now, random));
        await this.planCursor(session, now, this.due - now, true);
        return;
      }
    }
    if (this.pendingShift) {
      this.pendingHintStep = null;
      await this.adapter.clearHintHighlight();
      await this.adapter.cursor(null);
      await this.adapter.sync(session, this.pendingShift.eventId, this.pendingShift.snapshot);
      this.pendingShift = null;
      this.movesSinceShift = 0;
      this.nextShift = 6 + Math.floor(random() * 7);
      this.flowStreak = 0;
      this.due = now + Math.max(800, this.computePause(session, now, random));
      this.heartbeatAt = now + 10_000;
      await this.planCursor(session, now, this.due - now);
      return;
    }
    if (!this.pendingMove) {
      const next = session.preview();
      this.pendingFluentMove = Boolean(next && next.nearFocus
        && ['full_house', 'note_single', 'naked_single'].includes(next.hint?.technique ?? ''));
      this.pendingMove = session.advance();
    }
    if (this.pendingMove) {
      await this.adapter.cursor(this.pendingMove.index, this.pendingMove.value);
      await this.adapter.move(this.pendingMove);
      this.pendingMove = null;
      this.flowStreak = this.pendingFluentMove ? Math.min(3, this.flowStreak + 1) : 0;
      if (this.pendingHintStep?.shown) {
        await this.adapter.hintHighlight(this.pendingHintStep.hint, 'solve');
      }
      this.pendingHintStep = null;
    }
    this.movesSinceShift++;
    this.movesSinceNotes++;
    this.due = now + (session.solved ? 0 : this.computePause(session, now, random));
    if (session.solved) {
      this.rotateAt = now + (this.puzzlesLeft === 1 ? 0 : 5_000);
      const size = session.variant === '2x3' ? 6 : 9;
      // One restrained victory lap, then park in the centre until rotation.
      this.cursorSteps = [0, size - 1, size * size - 1, size * (size - 1), Math.floor(size * size / 2)]
        .map((index, step) => ({ at: now + step * 900, index, digit: null }));
      await this.flushCursor(now);
      await this.adapter.sync(session);
      if (this.puzzlesLeft === 1) await this.finishGame(now, random);
    } else await this.planCursor(session, now, this.due - now, true);
  }

  private async finishGame(now: number, random: () => number) {
    await this.adapter.finish(this.current!);
    this.adapter.close();
    this.current = null;
    this.started = false;
    this.rotateAt = Infinity;
    this.cursorSteps = [];
    this.pendingHintStep = null;
    this.pendingMove = null;
    this.pendingShift = null;
    this.puzzlesLeft--;
    if (this.puzzlesLeft === 0) this.nextPlayerAt = now + replacementDelay(random);
  }

  private computePause(session: GameSession, now: number, random: () => number): number {
    const next = session.preview();
    if (!next || session.remaining <= 0) return 0;
    const remainingBudget = Math.max(0, this.startedAt + this.targetDurationMs - now);
    return nextMovePause({
      technique: next.hint?.technique ?? 'fallback',
      unitType: next.hint?.unitType ?? null,
      candidateCount: next.candidateCount,
      remaining: session.remaining,
      totalMoves: this.totalMoves,
      opportunities: next.opportunities,
      averageCandidates: next.averageCandidates,
      nearFocus: next.nearFocus,
      flowStreak: this.flowStreak,
      tempo: this.profile.tempo,
    }, remainingBudget, this.targetDurationMs, random);
  }

  private async planCursor(session: GameSession, now: number, pause: number, linger = false) {
    const target = session.preview();
    if (!target) { this.cursorSteps = []; this.pendingHintStep = null; return; }
    const random = this.options.random || Math.random;
    const startAt = linger && pause >= 1_200 ? now + Math.min(600, pause * 0.2) : now;
    const activeWindow = Math.max(0, now + pause - startAt);
    this.cursorSteps = [{ at: startAt, index: target.index, digit: null }];
    if (activeWindow >= 2_400) {
      const board = session.snapshot().board;
      const peers = getPeerIndices(target.index, session.variant);
      const emptyPeers = peers.filter(index => board[index] === 0 && index !== target.index);
      const sameDigits = board.flatMap((value, index) => value === target.value && index !== target.index ? [index] : []);
      const scanPool = [...(sameDigits.length && random() < 0.45 ? [sameDigits[Math.floor(random() * sameDigits.length)]] : []), ...emptyPeers];
      const stepCount = Math.min(scanPool.length, activeWindow >= 4_500 ? 3 : 2);
      if (stepCount > 0) {
        const picked: number[] = [];
        const pool = [...scanPool];
        for (let i = 0; i < stepCount; i++) {
          const idx = Math.floor(random() * pool.length);
          picked.push(pool.splice(idx, 1)[0]);
        }
        const span = activeWindow * 0.72;
        this.cursorSteps = [];
        picked.forEach((cell, i) => {
          this.cursorSteps.push({ at: startAt + (span * i) / (stepCount + 0.5), index: cell, digit: null });
        });
        this.cursorSteps.push({ at: startAt + span, index: target.index, digit: null });
      }
    } else if (activeWindow >= 900 && random() < 0.4) {
      const board = session.snapshot().board;
      const sameDigits = board.flatMap((value, index) => value === target.value && index !== target.index ? [index] : []);
      const peers = new Set(getPeerIndices(target.index, session.variant));
      const emptyPeers = board.flatMap((value, index) => value === 0 && index !== target.index && peers.has(index) ? [index] : []);
      const emptyOthers = board.flatMap((value, index) => value === 0 && index !== target.index ? [index] : []);
      const pool = sameDigits.length && random() < 0.5
        ? sameDigits
        : (emptyPeers.length ? emptyPeers : emptyOthers);
      if (pool.length) {
        const other = pool[Math.floor(random() * pool.length)];
        this.cursorSteps.push({ at: startAt + activeWindow * 0.25, index: other, digit: null },
          { at: startAt + activeWindow * 0.55, index: target.index, digit: null });
      }
    }
    const hintChance = target.hint ? (HINT_CHANCE[target.hint.technique] ?? 0.25) : 0;
    this.pendingHintStep = target.hint && activeWindow >= 1_200 && random() < hintChance
      ? { at: startAt + Math.max(350, activeWindow * 0.58), hint: target.hint, shown: false }
      : null;
    this.cursorSteps.push({ at: startAt + activeWindow * 0.82, index: target.index, digit: target.value });
    await this.flushCursor(now);
  }

  private async flushCursor(now: number) {
    const count = this.cursorSteps.filter(step => step.at <= now).length;
    if (count) {
      const latest = this.cursorSteps[count - 1];
      // Skip stale intermediate gestures after an outage rather than replaying a burst.
      await this.adapter.cursor(latest.index, latest.digit);
      this.cursorSteps.splice(0, count);
    }
    if (this.pendingHintStep && !this.pendingHintStep.shown && now >= this.pendingHintStep.at) {
      this.pendingHintStep.shown = true;
      await this.adapter.hintHighlight(this.pendingHintStep.hint, 'preview');
    }
  }

  async stop() {
    this.stopped = true;
    await this.inFlight;
    try { if (this.current && this.started) await this.adapter.finish(this.current); }
    catch { /* Presence leave remains the fallback when offline. */ }
    finally { this.adapter.close(); }
  }
}
