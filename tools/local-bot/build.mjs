import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export async function buildBot() {
  await build({
    absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
    entryPoints: ['src/main.mjs'], outfile: '.build/bot.mjs',
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    external: ['playwright'], define: { 'import.meta.env': '{}' },
    logLevel: 'warning',
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildBot();
