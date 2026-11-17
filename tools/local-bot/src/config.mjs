export const USAGE = `npm run bot -- [--headed] [--count 1..10] [--ws-url ws(s)://...] [--app-url http(s)://...]
Defaults: 3 bots, headless, ws://127.0.0.1:8081/connection/websocket,
http://127.0.0.1:5173. Environment: BOT_COUNT, CENTRIFUGO_URL, BOT_APP_URL.
Install once: npm ci --prefix tools/local-bot
Headed only: npx --prefix tools/local-bot playwright install chromium`;

function url(value, protocols, name) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid ${name}`); }
  if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed.href;
}

export function readConfig(args = process.argv.slice(2), env = process.env) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--headed', '--count', '--ws-url', '--app-url', '--help'].includes(flag) || flag in flags) {
      throw new Error('Unknown or repeated bot option. Use --help.');
    }
    if (flag === '--headed' || flag === '--help') flags[flag] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      flags[flag] = args[++i];
    }
  }
  const rawCount = flags['--count'] ?? env.BOT_COUNT ?? '3';
  if (!/^[1-9][0-9]*$/.test(rawCount) || Number(rawCount) > 10) throw new Error('Bot count must be an integer from 1 to 10.');
  return {
    count: Number(rawCount), headed: Boolean(flags['--headed']), help: Boolean(flags['--help']),
    wsUrl: url(flags['--ws-url'] ?? env.CENTRIFUGO_URL ?? 'ws://127.0.0.1:8081/connection/websocket', ['ws:', 'wss:'], 'WebSocket URL'),
    appUrl: url(flags['--app-url'] ?? env.BOT_APP_URL ?? 'http://127.0.0.1:5173', ['http:', 'https:'], 'app URL'),
  };
}
