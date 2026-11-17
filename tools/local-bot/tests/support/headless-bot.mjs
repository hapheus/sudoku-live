import { fileURLToPath } from 'node:url';
import { readConfig } from '../../src/config.mjs';
import { run } from '../../src/main.mjs';
import { createHeadedView } from '../../src/headed.mjs';

// Test browser-mode orchestration without ever opening a visible window.
export const createHeadlessView = config => createHeadedView(config, { headless: true });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await run(readConfig(), { createView: createHeadlessView }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
