import type { LogicalHint } from './types.ts';
import { randomUUID } from 'node:crypto';
import {
  isContributionName, isContributionPlayerId, isHintCount, nextHintCount, recordPlayerContribution, rememberCoopPlayers,
} from '../../../src/domain/game-contributions.js';
import {
  createSudokuGame, serializeGameState, setCellValue, fillCandidateNotes, findLogicalHint,
  getCandidateDigits, getPeerIndices, shiftRow, shiftCol, shiftBand, shiftStack, applyRemoteCellPatch,
} from '../../../src/domain/sudoku-engine.js';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type Variant = '3x3' | '2x3';

export interface BotPlayer {
  senderId: string;
  playerName: string;
  role: 'host' | 'guest';
}

interface PlannedMove {
  index: number;
  value: number;
  hint: LogicalHint | null;
  candidateCount: number;
  opportunities: number;
  averageCandidates: number;
  nearFocus: boolean;
}

function buildUnits(variant: Variant) {
  const size = variant === '2x3' ? 6 : 9;
  const boxRows = variant === '2x3' ? 2 : 3;
  const boxCols = 3;
  const units: { type: 'row' | 'col' | 'box'; index: number; indices: number[] }[] = [];
  for (let i = 0; i < size; i++) {
    units.push({ type: 'row', index: i, indices: Array.from({ length: size }, (_, c) => i * size + c) });
    units.push({ type: 'col', index: i, indices: Array.from({ length: size }, (_, r) => r * size + i) });
    const br = Math.floor(i / (size / boxCols)) * boxRows;
    const bc = (i % (size / boxCols)) * boxCols;
    const box: number[] = [];
    for (let dr = 0; dr < boxRows; dr++) for (let dc = 0; dc < boxCols; dc++) box.push((br + dr) * size + (bc + dc));
    units.push({ type: 'box', index: i, indices: box });
  }
  return { size, boxRows, boxCols, units };
}

function findAdvancedLogicalHints(
  board: number[], givens: boolean[], solution: number[], variant: Variant,
): Map<number, LogicalHint> {
  const { size, boxRows, boxCols, units } = buildUnits(variant);
  const cands = new Map<number, Set<number>>();
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0 && !givens[i]) cands.set(i, new Set(getCandidateDigits(board, i, variant)));
  }
  const reason = new Map<number, 'naked_pair' | 'locked_candidate'>();
  const prune = (idx: number, d: number, kind: 'naked_pair' | 'locked_candidate') => {
    const set = cands.get(idx);
    if (!set || !set.delete(d)) return;
    if (set.size === 1 && !reason.has(idx)) reason.set(idx, kind);
  };
  for (const unit of units) {
    const pairs = unit.indices.filter(idx => cands.get(idx)?.size === 2);
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const a = [...cands.get(pairs[i])!];
        const b = cands.get(pairs[j])!;
        if (b.has(a[0]) && b.has(a[1])) {
          for (const other of unit.indices) {
            if (other !== pairs[i] && other !== pairs[j]) {
              prune(other, a[0], 'naked_pair');
              prune(other, a[1], 'naked_pair');
            }
          }
        }
      }
    }
  }
  const boxes = units.filter(u => u.type === 'box');
  const lines = units.filter(u => u.type !== 'box');
  for (let d = 1; d <= size; d++) {
    for (const box of boxes) {
      const spots = box.indices.filter(idx => cands.get(idx)?.has(d));
      if (spots.length < 2) continue;
      const rows = new Set(spots.map(idx => Math.floor(idx / size)));
      const cols = new Set(spots.map(idx => idx % size));
      if (rows.size === 1) {
        const rowUnit = lines.find(u => u.type === 'row' && u.index === [...rows][0]);
        rowUnit?.indices.forEach(idx => { if (!box.indices.includes(idx)) prune(idx, d, 'locked_candidate'); });
      }
      if (cols.size === 1) {
        const colUnit = lines.find(u => u.type === 'col' && u.index === [...cols][0]);
        colUnit?.indices.forEach(idx => { if (!box.indices.includes(idx)) prune(idx, d, 'locked_candidate'); });
      }
    }
    for (const line of lines) {
      const spots = line.indices.filter(idx => cands.get(idx)?.has(d));
      if (spots.length < 2) continue;
      const boxIds = new Set(spots.map(idx => {
        const r = Math.floor(Math.floor(idx / size) / boxRows);
        const c = Math.floor((idx % size) / boxCols);
        return r * (size / boxCols) + c;
      }));
      if (boxIds.size === 1) {
        const boxUnit = boxes[[...boxIds][0]];
        boxUnit?.indices.forEach(idx => { if (!line.indices.includes(idx)) prune(idx, d, 'locked_candidate'); });
      }
    }
  }
  const result = new Map<number, LogicalHint>();
  for (const [idx, set] of cands) {
    if (set.size !== 1) continue;
    const digit = [...set][0];
    if (solution[idx] !== digit) continue;
    const pr = Math.floor(idx / size);
    const pc = idx % size;
    const contextDelays = new Map<number, number>([[idx, 0]]);
    for (const peer of getPeerIndices(idx, variant)) {
      if (board[peer] > 0) {
        const dist = Math.abs(Math.floor(peer / size) - pr) + Math.abs((peer % size) - pc);
        contextDelays.set(peer, dist * 28);
      }
    }
    result.set(idx, {
      index: idx, digit, technique: reason.get(idx) ?? 'locked_candidate',
      unitType: 'cell', unitIndex: null, contextDelays,
    });
  }
  return result;
}

export class GameSession {
  readonly id = randomUUID();
  private state;
  private focus: number | null = null;
  private readonly random: () => number;
  private planned: PlannedMove | null = null;
  private host: BotPlayer | null = null;

  constructor(difficulty: Difficulty, variant: Variant, random: () => number = Math.random) {
    this.random = random;
    this.state = createSudokuGame({ difficulty, variant });
  }

  setHost(senderId: string, playerName: string) {
    this.host = { senderId, playerName, role: 'host' };
  }

  rememberPlayers(members: { id: string; role: string; name?: string }[]) {
    this.state = rememberCoopPlayers(this.state, members);
  }

  recordGuestHint(data: Record<string, unknown>) {
    if (typeof data.senderId !== 'string' || typeof data.hintsUsed !== 'number') return;
    this.state = recordPlayerContribution(this.state, {
      senderId: data.senderId, playerName: isContributionName(data.playerName) ? data.playerName : undefined,
      hintsUsed: data.hintsUsed,
    });
  }

  useHint(player = this.host) {
    if (!player) return undefined;
    const hintsUsed = nextHintCount(this.state, player.senderId);
    this.state = recordPlayerContribution(this.state, { ...player, hintsUsed });
    return hintsUsed;
  }

  get solved() { return this.state.status === 'solved'; }
  get remaining() { return this.state.board.filter(value => value === 0).length; }
  get difficulty() { return this.state.difficulty; }
  get variant(): Variant { return this.state.variant; }
  get filledCount() { return this.state.filledCount; }
  get hasNotes() { return this.state.notes.some((arr, idx) => this.state.board[idx] === 0 && arr.length > 0); }
  get canAutoplay() { return this.state.board.every((value, index) => value === 0 || value === this.state.solution[index]); }

  fillCandidates(): { index: number; value: null; notes: number[]; eventId: string }[] {
    if (this.solved || !this.canAutoplay) return [];
    const prevNotes = this.state.notes;
    const nextState = fillCandidateNotes(this.state);
    if (nextState === this.state) return [];
    this.state = nextState;
    this.planned = null;
    const updates: { index: number; value: null; notes: number[]; eventId: string }[] = [];
    for (let i = 0; i < nextState.board.length; i++) {
      if (prevNotes[i].join(',') !== nextState.notes[i].join(',')) {
        updates.push({ index: i, value: null, notes: [...nextState.notes[i]], eventId: randomUUID() });
      }
    }
    return updates;
  }

  applyGuestPatch(data: Record<string, unknown>): boolean {
    const { index, value, notes } = data;
    const size = this.variant === '2x3' ? 6 : 9;
    const hasValue = value !== undefined && value !== null;
    const hasNotes = notes !== undefined && notes !== null;
    if (this.solved || typeof index !== 'number' || !Number.isInteger(index)
      || index < 0 || index >= this.state.board.length || this.state.givens[index]) return false;
    if (!hasValue && !hasNotes) return false;
    if (hasValue && (data.owner !== 'guest' || typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > size)) return false;
    if (!hasValue && data.owner !== undefined && data.owner !== null && data.owner !== 'guest') return false;
    if (!hasValue && this.state.board[index] !== 0) return false;
    if (hasNotes && (!Array.isArray(notes) || notes.some(note => !Number.isInteger(note) || note < 1 || note > size))) return false;
    this.state = applyRemoteCellPatch(this.state, {
      index, value: hasValue ? value as number : null,
      notes: Array.isArray(notes) ? [...new Set<number>(notes)] : null, owner: 'guest',
      senderId: typeof data.senderId === 'string' ? data.senderId : undefined,
      authorId: data.authorId === null || isContributionPlayerId(data.authorId) ? data.authorId : undefined,
      playerName: isContributionName(data.playerName) ? data.playerName : undefined,
      hintsUsed: isHintCount(data.hintsUsed) ? data.hintsUsed : undefined,
    });
    this.planned = null;
    return true;
  }

  updateElapsed(milliseconds: number) {
    this.state.elapsedSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  }

  snapshot() {
    return structuredClone(serializeGameState(this.state));
  }

  preview(): PlannedMove | null {
    if (!this.canAutoplay) return null;
    if (this.planned) return { ...this.planned };
    const empty = this.state.board.flatMap((value, index) => value === 0 ? [index] : []);
    // If candidate notes are on the board, humans first fill cells with only 1 note left.
    const noteSingles = empty.filter(index => this.state.notes[index].length === 1
      && this.state.notes[index][0] === this.state.solution[index]);
    if (noteSingles.length) {
      const peers = this.focus === null ? [] : getPeerIndices(this.focus, this.variant);
      const nearby = noteSingles.filter(index => peers.includes(index));
      const pool = nearby.length && this.random() < 0.65 ? nearby : noteSingles;
      const index = pool[Math.floor(this.random() * pool.length)];
      const value = this.state.solution[index];
      const baseHint = findLogicalHint(this.state, { preferredIndex: index });
      const hint = baseHint ? { ...baseHint, technique: 'note_single' } : null;
      this.planned = this.plan(index, value, hint, noteSingles.length);
      return { ...this.planned };
    }
    // Enumerate the upstream engine's best available logical technique, without
    // allowing its solution-based fallback to impose a row-major traversal.
    const logicalState = { ...this.state, solution: [] };
    const logicalHints = new Map<number, LogicalHint>();
    for (const index of empty) {
      const hint = findLogicalHint(logicalState, { preferredIndex: index });
      if (hint) logicalHints.set(hint.index, hint);
    }
    if (!logicalHints.size && empty.length) {
      const advanced = findAdvancedLogicalHints(this.state.board, this.state.givens, this.state.solution, this.variant);
      for (const [idx, hint] of advanced) logicalHints.set(idx, hint);
    }
    let choices = logicalHints.size ? [...logicalHints.keys()] : empty;
    if (!logicalHints.size && choices.length) {
      const counts = choices.map(index => getCandidateDigits(this.state.board, index, this.variant).length);
      const minimum = Math.min(...counts);
      choices = choices.filter((_, position) => counts[position] === minimum);
    }
    const peers = this.focus === null ? [] : getPeerIndices(this.focus, this.variant);
    const nearby = choices.filter(index => peers.includes(index));
    if (nearby.length && this.random() < 0.65) choices = nearby;
    const index = choices[Math.floor(this.random() * choices.length)];
    if (index === undefined) return null;
    const value = this.state.solution[index];
    const hint = logicalHints.get(index) ?? findLogicalHint(this.state, { preferredIndex: index });
    this.planned = this.plan(index, value, hint, logicalHints.size);
    return { ...this.planned };
  }

  private plan(index: number, value: number, hint: LogicalHint | null, opportunities: number): PlannedMove {
    const counts = this.state.board.flatMap((digit, cell) => digit === 0
      ? [getCandidateDigits(this.state.board, cell, this.variant).length] : []);
    return {
      index, value, hint, opportunities,
      candidateCount: Math.max(1, getCandidateDigits(this.state.board, index, this.variant).length),
      averageCandidates: counts.reduce((sum, count) => sum + count, 0) / Math.max(1, counts.length),
      nearFocus: this.focus !== null && getPeerIndices(this.focus, this.variant).includes(index),
    };
  }

  advance(player = this.host) {
    const move = this.preview();
    if (!move) return null;
    const { index, value } = move;
    this.planned = null;
    this.state = setCellValue(this.state, index, value, {
      recordHistory: false, owner: player?.role ?? 'host', authorId: player?.senderId ?? null,
    });
    this.focus = index;
    const contribution = this.state.playerContributions.find(({ id }) => id === player?.senderId);
    return {
      index, value, notes: [], owner: player?.role ?? 'host', eventId: randomUUID(),
      ...(player ? {
        authorId: player.senderId, playerName: player.playerName, hintsUsed: contribution?.hintsUsed ?? 0,
      } : {}),
    };
  }

  shift() {
    if (this.solved) return null;
    const size = this.variant === '2x3' ? 6 : 9;
    const boxRows = this.variant === '2x3' ? 2 : 3;
    const kind = Math.floor(this.random() * 4);
    const pivot = this.focus ?? Math.floor(this.random() * size * size);
    const row = Math.floor(pivot / size);
    const col = pivot % size;
    const target = [row, col, Math.floor(row / boxRows), Math.floor(col / 3)][kind];
    const direction = this.random() < 0.5 ? -1 : 1;
    this.state = [shiftRow, shiftCol, shiftBand, shiftStack][kind](this.state, target, direction, { recordHistory: false });
    this.focus = null;
    this.planned = null;
    return { eventId: randomUUID() };
  }
}
