import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

/** One memory-bounded authority Worker per running/loading match. */
export function createAuthorityFactory({ workerFile = new URL('./authority-worker.mjs', import.meta.url), assets,
  maxBattles = 4, maxShips = 128, memoryMb = 768, bootTimeoutMs = 30000 } = {}) {
  if (!Number.isInteger(maxBattles) || maxBattles < 1 || maxBattles > 32) throw Error('Invalid battle limit');
  const active = new Set();
  const create = (match, receive) => {
    if (active.size >= maxBattles) throw Error('服务器计算房间已满，请稍后再开始。');
    const ships = match.players.length + match.options.aiHulls.reduce((n, rows) => n + rows.length, 0);
    if (ships > maxShips) throw Error("服务器单房间编成上限为 " + maxShips + " 艘；不会悄悄删减编成。");
    let closed = false, ready = false, termination = null;
    const worker = new Worker(workerFile, { workerData: { match, assets }, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: memoryMb }, name: 'battle-' + match.id });
    const handle = {
      postMessage(message) { if (!closed) worker.postMessage(message); },
      terminate() {
        if (termination) return termination;
        closed = true; clearTimeout(bootTimer);
        termination = worker.terminate().finally(() => active.delete(handle));
        return termination;
      },
    };
    const fail = message => { if (!closed) { receive({ type: 'error', message }); void handle.terminate(); } };
    const bootTimer = setTimeout(() => fail('服务器战斗初始化超时。'), bootTimeoutMs);
    bootTimer.unref(); active.add(handle);
    worker.on('message', message => {
      if (closed) return;
      if (message.type === 'ready') { ready = true; clearTimeout(bootTimer); }
      try { receive(message); } catch (error) { fail(error.message); }
    });
    worker.on('error', error => fail('服务器计算 Worker 失败：' + error.message));
    worker.on('exit', code => { if (!closed) fail('服务器计算 Worker 意外退出：' + code + (ready ? '' : '（初始化期间）')); });
    return handle;
  };
  create.activeCount = () => active.size;
  create.close = () => Promise.all([...active].map(handle => handle.terminate()));
  create.workerFile = workerFile instanceof URL ? fileURLToPath(workerFile) : workerFile;
  return create;
}
