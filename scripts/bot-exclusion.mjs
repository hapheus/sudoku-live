import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOT_PATH = /(?:^|\/)(?:local-bot|\.build|bot\.mjs|playwright|playwright-core|tsx|esbuild)(?:\/|$)/i;
const BOT_CONTENT = /SUDOKU_LOCAL_BOT_ONLY|sudoku-shift-local-bot|Bot shutdown timed out/;

export function assertNoBotEntries(entries) {
  const forbidden = entries.filter(entry => BOT_PATH.test(entry.replaceAll('\\', '/')));
  if (forbidden.length) throw new Error(`Local bot files in release: ${forbidden.join(', ')}`);
}

export function verifyBotExclusion(directory) {
  if (!fs.existsSync(directory)) throw new Error(`Missing release directory: ${directory}`);
  let files = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      assertNoBotEntries([path.relative(directory, filename)]);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected release symlink: ${filename}`);
      if (entry.isDirectory()) walk(filename);
      else {
        if (/\.(?:[cm]?js|html|json|map)$/.test(entry.name) && BOT_CONTENT.test(fs.readFileSync(filename, 'utf8'))) {
          throw new Error(`Local bot runtime in release: ${filename}`);
        }
        files++;
      }
    }
  }
  walk(directory);
  return files;
}

export function botExclusionPlugin() {
  return {
    name: 'exclude-local-bot',
    resolveId(source, importer) {
      if (source.includes('local-bot') || importer?.replaceAll('\\', '/').includes('/tools/local-bot/')) {
        throw new Error('Local bot modules cannot be imported by the application build.');
      }
    },
    writeBundle(output) { verifyBotExclusion(output.dir); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const directory of process.argv.slice(2).length ? process.argv.slice(2) : ['dist']) {
    console.log(`Bot exclusion verified: ${directory} (${verifyBotExclusion(directory)} files)`);
  }
}
