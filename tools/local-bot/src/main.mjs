import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { BotManager } from './bot-manager.ts';
import { createHeadedView } from './headed.mjs';

export async function run(config, { createView = createHeadedView } = {}) {
  console.info('SUDOKU_LOCAL_BOT_ONLY');
  const manager = new BotManager({ wsUrl: config.wsUrl, slots: Array(config.count).fill('random'),
    variant: 'random', notesPolicy: 'random',
    onError: (difficulty, diagnostic) => console.warn(JSON.stringify({ event: 'slot-retrying', difficulty, ...diagnostic })),
  });
  let stopping = false;
  let view;
  let deadline;
  const armDeadline = () => {
    deadline ??= setTimeout(() => { console.error('Bot shutdown timed out'); process.exit(1); }, 10_000);
  };
  const stop = () => {
    stopping = true;
    armDeadline();
    void view?.close().catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let readyBefore = -1;
  const startupAt = performance.now();
  let started = false;
  let visibleIds = '';
  try {
    if (config.headed) { view = await createView(config); view.onClose(stop); }
    while (!stopping) {
      await manager.step(performance.now());
      if (stopping) break;
      const ready = manager.readySlots();
      if (ready !== readyBefore) {
        console.info(JSON.stringify({ event: 'readiness', managedSlots: manager.sessions().length, readySlots: ready }));
        readyBefore = ready;
      }
      if (ready === config.count) started = true;
      if (!started && performance.now() - startupAt > 20_000) throw new Error('Bot startup timed out before all sessions became ready.');
      if (started) {
        const sessions = manager.sessions();
        await view?.update(sessions);
        const ids = sessions.map(session => session.id).join(',');
        if (ids !== visibleIds) {
          visibleIds = ids;
          console.info(JSON.stringify({ event: config.headed ? 'headed-ready' : 'sessions',
            games: sessions.map(session => ({ id: session.id, difficulty: session.difficulty, variant: session.variant })) }));
        }
      }
      await delay(250);
    }
  } catch (error) {
    if (!stopping) throw error;
  } finally {
    armDeadline();
    try { await Promise.all([manager.stop(), view?.close()]); }
    finally {
      clearTimeout(deadline);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }
}
