import type { Difficulty, Variant } from './game-session.ts';

export type NotesPolicy = 'always' | 'later' | 'never';
export type BotJoinPolicy = 'auto' | 'disabled';
export interface PlayerSettings {
  difficulty: Difficulty | 'random';
  variant?: Variant | 'random';
  notesPolicy?: NotesPolicy | 'random';
  joinPolicy?: BotJoinPolicy | 'random';
}

export function choosePlayerProfile(settings: PlayerSettings, random: () => number = Math.random) {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  return {
    difficulty: settings.difficulty === 'random' ? pick(['easy', 'medium', 'hard', 'expert'] as const) : settings.difficulty,
    variant: !settings.variant || settings.variant === 'random' ? pick(['2x3', '3x3'] as const) : settings.variant,
    joinPolicy: !settings.joinPolicy || settings.joinPolicy === 'random' ? pick(['auto', 'disabled'] as const) : settings.joinPolicy,
    notesPolicy: !settings.notesPolicy || settings.notesPolicy === 'random' ? pick(['always', 'later', 'never'] as const) : settings.notesPolicy,
    puzzles: 1 + Math.floor(random() * 3),
    tempo: 0.85 + random() * 0.3,
  };
}

export function replacementDelay(random: () => number = Math.random) {
  return 10_000 + Math.floor(random() * 20_001);
}
