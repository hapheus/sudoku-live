import { BotRunner } from './bot-runner.ts';
import type { NotesPolicy, RunnerOptions } from './bot-runner.ts';
import type { Difficulty, GameSession } from './game-session.ts';

const DEFAULT_NOTES_POLICY: Record<Difficulty, NotesPolicy> = {
  easy: 'never',
  medium: 'later',
  hard: 'always',
  expert: 'always',
};

export class BotManager {
  private readonly runners: BotRunner[];

  constructor(options: RunnerOptions & { slots?: (Difficulty | 'random')[] }) {
    const slots = options.slots ?? Array<Difficulty | 'random'>(3).fill('random');
    this.runners = slots.map(difficulty => new BotRunner(difficulty, {
      ...options,
      notesPolicy: options.notesPolicy ?? (difficulty === 'random' ? 'random' : DEFAULT_NOTES_POLICY[difficulty]),
    }));
  }

  slotCount() { return this.runners.length; }

  sessions() { return this.runners.map(runner => runner.session()).filter((s): s is GameSession => s !== null); }

  readySlots() { return this.runners.filter(runner => runner.ready()).length; }

  async step(now: number) { await Promise.all(this.runners.map(runner => runner.step(now))); }

  async stop() { await Promise.all(this.runners.map(runner => runner.stop())); }
}
