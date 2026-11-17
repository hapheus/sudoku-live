import { readConfig, USAGE } from './src/config.mjs';
try {
  const config = readConfig();
  if (config.help) console.log(USAGE);
  else {
    const { buildBot } = await import('./build.mjs');
    await buildBot();
    const { run } = await import('./.build/bot.mjs');
    await run(config);
  }
} catch (error) {
  console.error(error.code === 'ERR_MODULE_NOT_FOUND'
    ? 'Install local bot tooling: npm ci --prefix tools/local-bot'
    : error.message);
  process.exitCode = 1;
}
