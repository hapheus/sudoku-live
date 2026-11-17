import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.mjs';
import { spawnSync } from 'node:child_process';

test('defaults, composed flags, precedence and production WSS', () => {
  assert.equal(readConfig([], {}).count, 3);
  assert.equal(readConfig([], {}).headed, false);
  const config = readConfig(['--headed', '--count', '5', '--ws-url', 'wss://sudoku-ws.fraha.dev/connection/websocket'], { BOT_COUNT: '2' });
  assert.equal(config.count, 5);
  assert.equal(config.headed, true);
  assert.equal(config.wsUrl, 'wss://sudoku-ws.fraha.dev/connection/websocket');
  assert.equal(readConfig([], { CENTRIFUGO_URL: config.wsUrl }).wsUrl, config.wsUrl);
});

test('invalid arguments fail before build, browsers or sessions', () => {
  for (const count of ['0', '-1', '11', '1.5', 'NaN', 'Infinity', '', '1e0', ' 2']) {
    assert.throws(() => readConfig(['--count', count], {}));
  }
  for (const args of [['--count'], ['--wat'], ['--headed', '--headed'], ['--ws-url', 'https://example.org'], ['--app-url', 'file:///tmp/app']]) {
    assert.throws(() => readConfig(args, {}));
  }
  const result = spawnSync(process.execPath, [new URL('../launch.mjs', import.meta.url).pathname, '--count', '0'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /count must be/);
});
