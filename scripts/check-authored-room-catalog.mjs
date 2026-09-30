import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {WebSocket} from 'ws';
import catalog from '../src/network/protocol.json' with {type: 'json'};
import selection from '../src/engine/data/content-selection.json' with {type: 'json'};
import {roomDeploymentBlockReason} from '../src/network/room-deployment.mjs';
import {createLanServer} from '../server/lan-server.mjs';

// Exercise the same registered packs as the browser, not generated/ships.json.
const result = await build({stdin: {contents: `
  export {ModManager} from './src/engine/modding/ModManager';
  export {i18n} from './src/engine/i18n/LocalizationManager';
  export {deploymentCost} from './src/engine/simulation/CombatDeployment';
`, resolveDir: process.cwd(), loader: 'ts'}, bundle: true, write: false, format: 'esm', platform: 'node', define: {'import.meta.env': JSON.stringify({BASE_URL: '/', MODE: 'development', DEV: true, PROD: false, SSR: false})}});
const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authored-catalog-bundle-'));
const bundleFile = path.join(bundleDir, 'registered-content.mjs');
let compiled;
try {
  await fs.writeFile(bundleFile, result.outputFiles[0].text);
  compiled = await import(pathToFileURL(bundleFile).href);
} finally {await fs.unlink(bundleFile).catch(() => {}); await fs.rmdir(bundleDir);}
const {ModManager, i18n, deploymentCost} = compiled;
const mods = ModManager.getInstance();
const ids = catalog.ships.map(hull => hull.id);
const excluded = mods.getAllShips().filter(spec => !ids.includes(spec.id));
const member = (hull, team = 0) => ({id: 'player', name: '目录合同', hull, team});
const options = (battleSize = 3200) => ({assignment: 'teams', battleSize, aiHulls: [[], [ids[0]]]});

test('room catalog exactly matches the selected registered root hulls, names, DP and textures', () => {
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, selection.hulls);
  assert.equal(ids[0], selection.sandbox.player);
  for (const row of catalog.ships) {
    const spec = mods.requireShip(row.id);
    assert.notEqual(spec.hullSize, 'FIGHTER');
    assert.equal(i18n.t(spec.nameKey), row.name, row.id);
    assert.equal(spec.spriteUrl, row.spriteUrl, row.id);
    assert.equal(spec.deploymentPoints, row.deploymentPoints, row.id);
    assert.equal(deploymentCost(spec), row.deploymentPoints, row.id);
    assert.equal(roomDeploymentBlockReason([member(row.id)], options()), '');
    assert.equal(roomDeploymentBlockReason([{...member('unknown'), design: {hullId: row.id}}], options()), '');
  }
  const modules = mods.requireShip('web_gloriana').modules;
  assert.equal(modules.length, 8);
  for (const {spec} of modules) assert.ok(!ids.includes(spec.id), spec.id);
  assert.ok(excluded.some(spec => spec.hullSize === 'FIGHTER'), 'registered aircraft are explicitly excluded');
});

test('room DP boundaries agree with combat; reserves still do not require simultaneous deployment', () => {
  for (const row of catalog.ships) {
    const opts = options(400), count = Math.floor(200 / row.deploymentPoints);
    const humans = Array.from({length: count}, (_, i) => ({...member(row.id), id: 'p' + i}));
    assert.equal(roomDeploymentBlockReason(humans, opts), '', row.id);
    assert.match(roomDeploymentBlockReason([...humans, member(row.id)], opts), /需要至少.*DP/, row.id);
    opts.aiHulls[1] = Array(20).fill(row.id);
    assert.equal(roomDeploymentBlockReason([member(ids[0])], opts), '', 'reserves: ' + row.id);
    opts.aiHulls[1] = ['fit:1']; opts.aiLoadouts = {'fit:1': {hullId: row.id}};
    assert.equal(roomDeploymentBlockReason([member(ids[0])], opts), '', 'fit: ' + row.id);
  }
  assert.match(roomDeploymentBlockReason([member('web_gloriana')], options(340)), /需要至少 180 DP.*当前只有 170/);
  for (const hull of ['missing_hull', '', ...excluded.map(spec => spec.id)]) {
    assert.match(roomDeploymentBlockReason([member(hull)], options()), /缺少有效部署点/, hull);
    const opts = options(); opts.aiHulls[1] = [hull];
    assert.match(roomDeploymentBlockReason([member(ids[0])], opts), /AI 舰船缺少有效部署点/, hull);
  }
});

function client(origin) {
  const ws = new WebSocket(origin.replace('http', 'ws') + '/lan/ws', {origin});
  const received = [], waiters = new Set();
  ws.on('message', data => { received.push(JSON.parse(data.toString())); for (const check of [...waiters]) check(); });
  const opened = new Promise((resolve, reject) => {ws.once('open', resolve); ws.once('error', reject);});
  const wait = (predicate, from = 0, label = 'observe') => new Promise((resolve, reject) => {
    const cleanup = () => {clearTimeout(timer); waiters.delete(check);};
    const check = () => {const message = received.slice(from).find(predicate); if (message) {cleanup(); resolve(message);} };
    const timer = setTimeout(() => {cleanup(); reject(Error('relay response timeout (' + label + '): ' + JSON.stringify(received.slice(from).map(m => ({type: m.type, message: m.message})))));}, 3000);
    waiters.add(check); check();
  });
  return {ws, opened, wait, request(message, predicate) {const from = received.length; ws.send(JSON.stringify(message)); return wait(predicate, from, message.type);}};
}

test('real two-client relay accepts all roots, rejects invalid/module/aircraft AI without mutation, enforces budget and launches', {timeout: 20000}, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'starsector-authored-catalog-'));
  let app;
  const clients = [];
  try {
    await fs.writeFile(path.join(dir, 'lan-build.json'), JSON.stringify({build: 'authored-catalog-test'}));
    app = await createLanServer({host: '127.0.0.1', port: 0, dist: dir});
    const origin = 'http://127.0.0.1:' + app.server.address().port;
    for (let i = 0; i < 2; i++) {
      const c = client(origin); clients.push(c); await c.opened;
      await c.request({type: 'hello', protocol: catalog.version, build: 'authored-catalog-test', name: '目录测试' + i, instance: 'catalog-instance-' + i}, m => m.type === 'welcome');
    }
    const [host, guest] = clients;
    const {room: created} = await host.request({type: 'create', battleSize: 3200}, m => m.type === 'room');
    await guest.request({type: 'join', code: created.code}, m => m.type === 'room' && m.room.members.length === 2);
    const room = app.rooms.get(created.code);
    assert.ok(room.peers.every(p => p.hull === ids[0]));
    assert.equal(room.peers[1].team, 1, 'joining guest is assigned to the opposing team');
    for (const hull of ids) {
      const response = await host.request({type: 'configure', hull, design: null, requestId: 'configure-' + ids.indexOf(hull),
        roomCode: room.code, baseRevision: room.peers[0].designRevision}, m => m.type === 'configured' || m.type === 'error');
      assert.equal(response.type, 'configured', JSON.stringify(response)); assert.equal(response.hull, hull);
    }
    const aiHulls = [ids.slice(0, 2), ids.slice(2)];
    const configured = await host.request({type: 'options', baseRevision: room.options.aiRevision ?? 0, options: {aiHulls, battleSize: 3200}}, m => m.type === 'room' || m.type === 'error');
    assert.equal(configured.type, 'room', JSON.stringify(configured));
    assert.deepEqual(room.options.aiHulls, aiHulls);
    for (const hull of ['unknown', 'fit:missing', ...excluded.map(spec => spec.id)]) {
      const before = structuredClone(room.options);
      const response = await host.request({type: 'options', baseRevision: room.options.aiRevision ?? 0, options: {aiHulls: [[hull], []]}}, m => m.type === 'error');
      assert.match(response.message, /房间规则无效/);
      assert.deepEqual(room.options, before, 'invalid AI must not change options: ' + hull);
    }
    // Lowering the room limit is legal in the lobby, but starting over budget is not.
    await host.request({type: 'options', options: {battleSize: 340}}, m => m.type === 'room');
    const blocked = await host.request({type: 'start', requestId: 'budget-check'}, m => m.type === 'error');
    assert.match(blocked.message, /需要至少 180 DP/);
    assert.equal(room.status, 'lobby'); assert.equal(room.match, null);
    await host.request({type: 'options', options: {battleSize: 3200}}, m => m.type === 'room');
    const unready = await host.request({type: 'start', requestId: 'readiness-check'}, m => m.type === 'error');
    assert.match(unready.message, /等待玩家准备/);
    await guest.request({type: 'ready', ready: true}, m => m.type === 'room' && m.room.members.some(p => p.ready));
    const {match} = await host.request({type: 'start', requestId: 'start-authored'}, m => m.type === 'match');
    assert.equal(match.players.length, 2); assert.deepEqual(match.options.aiHulls, aiHulls);
    assert.equal(match.options.deploymentLimit, 1600); assert.equal(room.status, 'loading');
    assert.equal((await guest.wait(m => m.type === 'match')).match.id, match.id);
  } finally {
    for (const c of clients) c.ws.terminate();
    await app?.close();
    await fs.unlink(path.join(dir, 'lan-build.json')).catch(() => {});
    await fs.rmdir(dir);
  }
});
