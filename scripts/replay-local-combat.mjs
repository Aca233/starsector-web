import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {encodeReplayFile, decodeReplayFile} from './lib/replay-file.mjs';

const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
const option = flag => {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`${flag} requires a value`);
  return args[index + 1];
};
const input = option('--replay'), capture = args.includes('--capture-sample');
if (!!input === capture) throw Error('Use --replay <checkpoint.json> or --capture-sample.');
if (input && fs.statSync(path.resolve(input)).size > 64 * 1024 * 1024) throw Error('Replay export exceeds 64 MiB.');
const checkpoint = input ? decodeReplayFile(JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))) : null;
const steps = Number(option('--steps') ?? 6);
if (!Number.isSafeInteger(steps) || steps < 1 || steps > 600) throw Error('Sample steps must be 1..600.');
const output = path.resolve(option('--out') ?? 'artifacts/foundation-replay-check');
fs.mkdirSync(output, {recursive: true});
const require = createRequire(import.meta.url);
const roots = [root, option('--modules') ?? 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'];
const {chromium} = require(require.resolve('playwright', {paths: roots}));
// Own ephemeral browser, own storage, no app main entry or user browser connection.
const server = await createServer({root, configFile: path.join(root, 'vite.combat.config.ts'),
  server: {host: '127.0.0.1', port: 0, open: false}, logLevel: 'error'});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({headless: true, executablePath: option('--browser') ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/__foundation_replay.html', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'}));
  await page.goto(`http://127.0.0.1:${address.port}/__foundation_replay.html`);
  const result = await page.evaluate(async ({checkpoint, steps, hull, enemyHull}) => {
    const {initializeShipPacks} = await import('/src/engine/modding/ShipPackBootstrap.ts');
    await initializeShipPacks();
    const {LocalWorkerHost} = await import('/src/engine/runtime/local/LocalWorkerHost.ts');
    const {LOCAL_COMBAT_PROTOCOL} = await import('/src/engine/runtime/local/LocalCombatProtocol.ts');
    const {copyReplayCheckpoint, COMBAT_REPLAY_BUILD, sameReplayWitness} = await import('/src/engine/runtime/local/CombatReplayCheckpoint.ts');
    const {contentRegistry} = await import('/src/engine/content/ContentRegistry.ts');
    const {assetManager} = await import('/src/engine/assets/AssetResolver.ts');
    const {runtimeShipPacks, setRuntimeShipPacks} = await import('/src/engine/modding/ShipPackCatalog.ts');
    const {validateRuntimeShipPacks} = await import('/src/engine/modding/ShipPackCapabilities.ts');
    const {refreshShipPackStudioCatalog} = await import('/src/studio/DesignModel.ts');
    await assetManager.ensureManifestLoaded();
    const hosts = [];
    try {
      let saved = checkpoint;
      if (!saved) {
        const config = {playerHull: hull, enemyHull, seed: 917, multicore: false, presentation: 'render-strict',
          content: {ships: contentRegistry.getAllShips(), weapons: contentRegistry.getAllWeapons(), packs: runtimeShipPacks()}};
        const source = new LocalWorkerHost(config); hosts.push(source); await source.ready;
        const sample = {autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false};
        for (let i = 0; i < steps; i++) await source.step(sample);
        // Include a real command receipt, so both journal branches are replayed.
        await source.commands([{kind: 'pilot', autopilot: false}]);
        saved = source.checkpoint();
        source.dispose();
      }
      const accepted = copyReplayCheckpoint(saved, LOCAL_COMBAT_PROTOCOL);
      if (accepted.config.content) {
        const content = accepted.config.content;
        if (content.packs) validateRuntimeShipPacks(content.packs);
        contentRegistry.installSnapshot(content.ships, content.weapons);
        if (content.packs) { setRuntimeShipPacks(content.packs); refreshShipPackStudioCatalog(); }
      }
      const restored = new LocalWorkerHost(accepted.config, 90_000, accepted); hosts.push(restored);
      const frame = await restored.ready;
      if (frame.tick !== accepted.tick || !sameReplayWitness(frame.witness, accepted.witness)) throw Error('Replay authority witness differs.');
      return {checkpoint: accepted, report: {build: COMBAT_REPLAY_BUILD, protocol: LOCAL_COMBAT_PROTOCOL,
        tick: frame.tick, entries: accepted.entries.length, witnessEqual: true, worker: restored.status}};
    } finally { hosts.forEach(host => host.dispose()); }
  }, {checkpoint, steps, hull: option('--hull') ?? 'web_expanse_rocinante', enemyHull: option('--enemy-hull') ?? 'web_sc2_hyperion'});
  if (errors.length) throw Error(errors.join('\n'));
  if (capture) fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(encodeReplayFile(result.checkpoint)) + '\n');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result.report, null, 2) + '\n');
  console.log(JSON.stringify(result.report, null, 2));
} finally { await browser?.close(); await server.close(); }
