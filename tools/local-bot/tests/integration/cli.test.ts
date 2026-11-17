import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { OnlineGameClient } from '../../../../src/services/online-game-client.js';

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 12_000);
  try { await exited; assert.equal(child.exitCode, 0); }
  finally { clearTimeout(deadline); }
}
async function waitFor(predicate: () => boolean | Promise<boolean>, label: string) {
  const until = Date.now() + 35_000;
  while (!await predicate()) {
    if (Date.now() > until) throw new Error(`Timed out: ${label}`);
    await delay(100);
  }
}

test('default, count, headed and combined CLI publish exactly N independent sessions and stop cleanly', { timeout: 180_000 }, async () => {
  const wsUrl = 'ws://127.0.0.1:18081/connection/websocket';
  const root = new URL('../../../../', import.meta.url);
  const vite = spawn(process.execPath, [new URL('node_modules/vite/bin/vite.js', root).pathname,
    '--host', '127.0.0.1', '--port', '15373', '--strictPort'], {
    cwd: root, env: { ...process.env, VITE_WS_URL: wsUrl }, stdio: 'ignore',
  });
  const observer = new OnlineGameClient({ wsConfig: { wsUrl } });
  const rooms = new Set<string>();
  const update = room => {
    if (['solved', 'finished'].includes(room.status)) rooms.delete(room.game_id);
    else rooms.add(room.game_id);
  };
  try {
    await waitFor(async () => { try { return (await fetch('http://127.0.0.1:15373')).ok; } catch { return false; } }, 'app server');
    const lobby = observer.joinLobby({ onLobbyPresenceChange: values => { rooms.clear(); values.forEach(update); },
      onLobbyMemberJoin: update, onLobbyUpdate: update, onLobbyMemberLeave: room => rooms.delete(room.game_id) });
    await lobby.ready(5_000);
    for (const [args, expected] of [[[], 3], [['--count', '5'], 5], [['--headed'], 3], [['--headed', '--count', '5'], 5]] as const) {
      let ready = false;
      let stderr = '';
      const child = spawn(process.execPath, ['launch.mjs', ...args, '--ws-url', wsUrl, '--app-url', 'http://127.0.0.1:15373'], {
        env: { ...process.env, BOT_COUNT: '3' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stderr!.on('data', chunk => { stderr += chunk; });
      let buffer = '';
      child.stdout!.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split('\n'); buffer = lines.pop()!;
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            if (message.event === (args.includes('--headed' as never) ? 'headed-ready' : 'sessions')) {
              assert.equal(message.games.length, expected);
              assert.equal(new Set(message.games.map(game => game.id)).size, expected);
              ready = true;
            }
          } catch (error) { if (error instanceof assert.AssertionError) throw error; }
        }
      });
      try {
        await waitFor(() => {
          if (child.exitCode !== null) throw new Error(`CLI exited ${child.exitCode}: ${stderr}`);
          return ready && rooms.size === expected;
        }, `CLI ${args.join(' ')}`);
        // Headed-ready is emitted after every real Watch page rendered its board.
        await delay(500);
      } finally { await stop(child); }
      await waitFor(() => rooms.size === 0, 'all sessions cleaned up');
    }
  } finally {
    observer.disconnect();
    vite.kill('SIGTERM');
    if (vite.exitCode === null) await once(vite, 'exit');
  }
});

test('a headed startup failure releases already connected bot sessions', { timeout: 45_000 }, async () => {
  const observer = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://127.0.0.1:18081/connection/websocket' } });
  const rooms = new Set<string>();
  const update = room => ['finished', 'solved'].includes(room.status) ? rooms.delete(room.game_id) : rooms.add(room.game_id);
  let child: ChildProcess | undefined;
  try {
    const lobby = observer.joinLobby({ onLobbyMemberJoin: update, onLobbyUpdate: update,
      onLobbyMemberLeave: room => rooms.delete(room.game_id), onLobbyPresenceChange: values => { rooms.clear(); values.forEach(update); } });
    await lobby.ready(5_000);
    child = spawn(process.execPath, ['launch.mjs', '--headed', '--count', '5', '--ws-url',
      'ws://127.0.0.1:18081/connection/websocket', '--app-url', 'http://127.0.0.1:9'], { stdio: 'ignore' });
    await once(child, 'exit');
    assert.equal(child.exitCode, 1);
    await waitFor(() => rooms.size === 0, 'failed startup cleanup');
  } finally { if (child && child.exitCode === null) child.kill('SIGKILL'); observer.disconnect(); }
});
