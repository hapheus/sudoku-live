import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { OnlineGameClient } from '../../../../src/services/online-game-client.js';
import type { GameSession } from '../../src/game-session.ts';

type Room = { game_id: string; difficulty: string; game_mode: string; join_policy: string };
type Snapshot = ReturnType<GameSession['snapshot']>;

async function waitFor(predicate: () => boolean, label: string, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error(`Timed out: ${label}`);
    await delay(50);
  }
}

test('real Centrifugo exposes three worker games, late-watch snapshots, moves and fresh games after process restart',
  { timeout: 90_000 }, async context => {
    // Use ONLY a disposable dedicated test server: this creates live sessions.
    const wsUrl = process.env.CENTRIFUGO_TEST_URL || 'ws://127.0.0.1:18081/connection/websocket';
    const rooms = new Map<string, Room>();
    const observer = new OnlineGameClient({ wsConfig: { wsUrl } });
    const watcher = new OnlineGameClient({ wsConfig: { wsUrl } });
    let child: ChildProcess | null = null;
    let readySlots = -1;
    const snapshots: Snapshot[] = [];
    const moves: Record<string, unknown>[] = [];
    const update = (room: Room & { status?: string }) => {
      if (room.status === 'solved' || room.status === 'finished') rooms.delete(room.game_id);
      else rooms.set(room.game_id, room);
    };
    const startWorker = () => {
      readySlots = -1;
      child = spawn(process.execPath, ['launch.mjs'], { env: {
        ...process.env, CENTRIFUGO_URL: wsUrl, BOT_COUNT: '3',
      }, stdio: ['ignore', 'pipe', 'pipe'] });
      let buffer = '';
      child.stdout?.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          try {
            const value = JSON.parse(line);
            if (value.event === 'readiness') { readySlots = value.readySlots; context.diagnostic(JSON.stringify(value)); }
          } catch { /* Ignore non-JSON startup output. */ }
        }
      });
      child.stderr?.on('data', chunk => context.diagnostic(chunk.toString()));
    };
    const stopWorker = async () => {
      if (!child || child.exitCode !== null) return;
      const processToStop = child;
      const exited = once(processToStop, 'exit');
      processToStop.kill('SIGTERM');
      const deadline = setTimeout(() => processToStop.kill('SIGKILL'), 12_000);
      try { await exited; assert.equal(processToStop.exitCode, 0); }
      finally { clearTimeout(deadline); child = null; }
    };
    try {
      const lobby = observer.joinLobby({
        onLobbyPresenceChange: (values: Room[]) => { rooms.clear(); values.forEach(update); },
        onLobbyMemberJoin: update, onLobbyUpdate: update,
        onLobbyMemberLeave: (room: Room) => rooms.delete(room.game_id),
      });
      await lobby.ready(5_000);
      startWorker();
      await waitFor(() => rooms.size === 3 && readySlots === 3, 'three published rooms');
      assert.ok([...rooms.values()].every(room => ['easy', 'medium', 'hard', 'expert'].includes(room.difficulty)));
      for (const room of rooms.values()) {
        assert.equal(room.game_mode, 'solo');
        assert.equal(room.join_policy, 'auto');
      }
      const ids = [...rooms.keys()].sort();
      const room = watcher.joinGameChannel(ids[0], { role: 'spectator', gameMode: 'solo', joinPolicy: 'auto',
        onEvent: (type, data) => {
          if (type === 'sync' || type === 'init') snapshots.push(data.gameState as Snapshot);
          if (type === 'cell-update') moves.push(data);
        } });
      await room.ready(5_000);
      await waitFor(() => snapshots.length > 0, 'late watcher snapshot');
      assert.ok([36, 81].includes(snapshots.at(-1)!.board.length));
      await waitFor(() => moves.length > 0, 'natural move', 20_000);
      const move = moves[0];
      const index = Number(move.index);
      assert.equal(snapshots.at(-1)!.givens[index], false);
      assert.equal(move.value, snapshots.at(-1)!.solution[index]);

      if (process.env.CENTRIFUGO_TEST_DOCKER_RECOVERY === 'true') {
        const args = ['compose', '-p', 'sudoku-shift-bot-integration', '-f', 'compose.test.yml'];
        const before = snapshots.length;
        try {
          execFileSync('docker', [...args, 'stop', 'centrifugo'], { timeout: 15_000, stdio: 'pipe' });
          await waitFor(() => readySlots === 0, 'worker detects server outage');
        } finally {
          execFileSync('docker', [...args, 'start', 'centrifugo'], { timeout: 15_000, stdio: 'pipe' });
        }
        await waitFor(() => readySlots === 3 && snapshots.length > before, 'RAM snapshot after reconnect', 35_000);
        assert.deepEqual([...rooms.keys()].sort(), ids);
      } else context.diagnostic('Docker outage subcase NOT run; use npm run test:recovery to include it.');

      await stopWorker();
      await waitFor(() => rooms.size === 0, 'graceful lobby cleanup');
      startWorker();
      await waitFor(() => rooms.size === 3 && readySlots === 3, 'three fresh rooms after process restart');
      assert.equal([...rooms.keys()].some(id => ids.includes(id)), false);
    } finally {
      try { await stopWorker(); }
      finally { watcher.disconnect(); observer.disconnect(); }
    }
  });
