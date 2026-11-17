import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BotRunner } from '../../src/bot-runner.ts';
import { createHeadlessView } from '../support/headless-bot.mjs';
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

test('default, count and browser-mode flags run headlessly with independent sessions and clean shutdown', { timeout: 180_000 }, async () => {
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
      let gameIds: string[] = [];
      let stderr = '';
      const entry = args.includes('--headed' as never)
        ? ['--import', 'tsx', 'tests/support/headless-bot.mjs'] : ['launch.mjs'];
      const child = spawn(process.execPath, [...entry, ...args, '--ws-url', wsUrl, '--app-url', 'http://127.0.0.1:15373'], {
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
            if (!ready && message.event === (args.includes('--headed' as never) ? 'headed-ready' : 'sessions')) {
              assert.equal(message.games.length, expected);
              assert.equal(new Set(message.games.map(game => game.id)).size, expected);
              gameIds = message.games.map(game => game.id);
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
        // The browser-mode flag uses a headless view factory throughout this test.
        if (expected === 5 && args.includes('--headed' as never)) {
          const browser = await chromium.launch({ headless: true });
          try {
            const page = await browser.newPage();
            const traffic: string[] = [];
            let receivedState: { board: number[] } | null = null;
            page.on('websocket', socket => {
              traffic.push(socket.url());
              socket.on('framereceived', frame => {
                try {
                  for (const line of String(frame.payload).split('\n')) {
                    const payload = JSON.parse(line)?.push?.pub?.data;
                    if (payload) {
                      traffic.push(payload.type);
                      if (payload.type === 'sync' && payload.data?.gameState) receivedState = payload.data.gameState;
                    }
                  }
                } catch { /* SDK control frames do not carry publications. */ }
              });
            });
            await page.goto(`http://127.0.0.1:15373/?game=${[...rooms][0] ?? gameIds[0]}&watch=1`);
            await page.locator('.sudoku-board').waitFor();
            // The app briefly renders a local placeholder before the host snapshot arrives.
            await waitFor(async () => receivedState !== null
              && await page.locator('.sudoku-cell').count() === receivedState.board.length
              && await page.locator('.sudoku-cell__digit').count() >= receivedState.board.filter(Boolean).length, 'authoritative Watch snapshot');
            const cursor = page.locator('.sudoku-cell--partner-cursor, .sudoku-cell--player-cursor');
            await waitFor(async () => await cursor.count() > 0, 'visible host cursor');
            const before = await page.locator('.sudoku-cell__digit').count();
            try {
              await waitFor(async () => await page.locator('.sudoku-cell__digit').count() > before, 'real bot placement rendered in Watch');
            } catch (error) {
              await page.screenshot({ path: new URL('../../../../test-results/local-bot-watch-failure.png', import.meta.url).pathname });
              console.log(JSON.stringify({ before, after: await page.locator('.sudoku-cell__digit').count(), traffic, stderr }));
              throw error;
            }
            assert.equal(await page.locator('.sudoku-cell--conflict').count(), 0);
            await page.screenshot({ path: new URL('../../../../test-results/local-bot-watch.png', import.meta.url).pathname });
          } finally { await browser.close(); }
        } else await delay(500);
      } finally { await stop(child); }
      await waitFor(() => rooms.size === 0, 'all sessions cleaned up');
    }
    // Keeping the browser alive with zero game tabs is necessary during player gaps.
    const runner = new BotRunner('easy', { wsUrl, variant: '2x3', notesPolicy: 'never', random: () => 0,
      durationRanges: { easy: [1_000, 1_000], medium: [1_000, 1_000], hard: [1_000, 1_000], expert: [1_000, 1_000] } });
    const view = await createHeadlessView({ wsUrl, appUrl: 'http://127.0.0.1:15373' });
    let closed = false;
    view.onClose(() => { closed = true; });
    try {
      let now = 0;
      await runner.step(now);
      const first = runner.session()!;
      await view.update([first]);
      for (let tick = 0; tick < 1_000 && !first.solved; tick++) { now += 250; await runner.step(now); }
      assert.equal(first.solved, true);
      assert.equal(runner.session(), null);
      await view.update([]);
      await delay(200);
      assert.equal(closed, false, 'a player gap must not terminate headed operation');
      await runner.step(now + 10_000);
      assert.notEqual(runner.session()?.id, first.id);
      await view.update([runner.session()!]);
      assert.equal(closed, false);
    } finally { await view.close(); await runner.stop(); }
  } finally {
    observer.disconnect();
    vite.kill('SIGTERM');
    if (vite.exitCode === null) await once(vite, 'exit');
  }
});

test('a browser-mode startup failure tested headlessly releases connected bot sessions', { timeout: 45_000 }, async () => {
  const observer = new OnlineGameClient({ wsConfig: { wsUrl: 'ws://127.0.0.1:18081/connection/websocket' } });
  const rooms = new Set<string>();
  const update = room => ['finished', 'solved'].includes(room.status) ? rooms.delete(room.game_id) : rooms.add(room.game_id);
  let child: ChildProcess | undefined;
  try {
    const lobby = observer.joinLobby({ onLobbyMemberJoin: update, onLobbyUpdate: update,
      onLobbyMemberLeave: room => rooms.delete(room.game_id), onLobbyPresenceChange: values => { rooms.clear(); values.forEach(update); } });
    await lobby.ready(5_000);
    child = spawn(process.execPath, ['--import', 'tsx', 'tests/support/headless-bot.mjs', '--headed', '--count', '5', '--ws-url',
      'ws://127.0.0.1:18081/connection/websocket', '--app-url', 'http://127.0.0.1:9'], { stdio: 'ignore' });
    await once(child, 'exit');
    assert.equal(child.exitCode, 1);
    await waitFor(() => rooms.size === 0, 'failed startup cleanup');
  } finally { if (child && child.exitCode === null) child.kill('SIGKILL'); observer.disconnect(); }
});
