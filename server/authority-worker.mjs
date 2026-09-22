import { parentPort, workerData } from 'node:worker_threads';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { assetManager } from '../src/engine/assets/AssetResolver';

// Each match owns an isolated registry and the exact production authority loop.
// The server never starts Chromium, a renderer, or the AI experiment workers.
const assets = await realpath(workerData.assets);
globalThis.fetch = async input => {
  const name = String(input);
  if (/^[a-z]+:/i.test(name)) throw Error('Authority resources must be local');
  const resolved = await realpath(path.resolve(assets, name.replace(/^\.?\//, '')));
  if (!resolved.startsWith(assets + path.sep)) throw Error('Resource outside asset root');
  return new Response(await readFile(resolved));
};
globalThis.self = globalThis;
globalThis.postMessage = (message, transfer = []) => parentPort.postMessage(message, transfer);
await assetManager.ensureManifestLoaded();
await import('../src/network/host.worker.ts');
parentPort.on('message', message => globalThis.onmessage({ data: message }));
globalThis.onmessage({ data: { type: 'init', match: workerData.match, hidden: false, binarySnapshots: true, authoritySummaries: true, motionState: false } });
