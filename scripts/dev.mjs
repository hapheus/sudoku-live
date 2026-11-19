import { fileURLToPath } from 'node:url';

const viteArgs = process.argv.slice(2);
let wsUrl;

for (let index = 0; index < viteArgs.length; index += 1) {
    const argument = viteArgs[index];
    if (argument === '--') break;
    if (argument !== '--ws-url' && !argument.startsWith('--ws-url=')) continue;

    const value = argument === '--ws-url' ? viteArgs[index + 1] : argument.slice('--ws-url='.length);
    const endpoint = value && URL.canParse(value) ? new URL(value) : null;
    if (wsUrl || !endpoint || !['ws:', 'wss:'].includes(endpoint.protocol)
        || endpoint.username || endpoint.password || endpoint.href.includes('#')) {
        console.error('Use --ws-url once with a valid ws:// or wss:// URL without credentials or a fragment.');
        process.exit(1);
    }
    wsUrl = endpoint.href;
    viteArgs.splice(index, argument === '--ws-url' ? 2 : 1);
    index -= 1;
}

if (wsUrl) process.env.VITE_WS_URL = wsUrl;

const viteCli = new URL('./bin/vite.js', import.meta.resolve('vite/package.json'));
process.argv.splice(1, process.argv.length - 1, fileURLToPath(viteCli), ...viteArgs);
await import(viteCli.href);
