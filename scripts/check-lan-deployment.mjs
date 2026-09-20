import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import costs from '../src/engine/data/generated/deployment-costs.json' with { type: 'json' };
import { roomDeploymentBlockReason } from '../src/network/room-deployment.mjs';
import { roomStartBlockReason } from '../src/network/room-start.mjs';
import { roomApplyAction, roomWorkflow } from '../src/network/room-workflow.mjs';

const xivCosts = { dominator_xiv: 25, eagle_xiv: 20, enforcer_xiv: 9, falcon_xiv: 14, legion_xiv: 40, onslaught_xiv: 40 };
const member = (hull, design = null) => ({ id: 'host', name: 'Aca233', team: 0, hull, design, ready: false, editing: false, connected: true });
const options = () => ({ aiHulls: [[], ['onslaught']], assignment: 'teams', battleSize: 200 });

for (const [hull, dp] of Object.entries(xivCosts)) {
  test(`${hull}: native inherited ${dp} DP works for human hulls and designs`, () => {
    assert.equal(costs[hull], dp);
    assert.equal(roomDeploymentBlockReason([member(hull)], options()), '');
    assert.equal(roomDeploymentBlockReason([member('unknown', { hullId: hull })], options()), '');
    const room = { code: 'XIV123', hostId: 'host', status: 'lobby', members: [member(hull)], options: options() };
    assert.equal(roomStartBlockReason({ ...room, aiHulls: room.options.aiHulls }), '');
    assert.equal(roomWorkflow(room, 'host').deploymentBlocked, false);
    assert.equal(roomApplyAction(room, 'host', { hullId: hull }).continueToAction, true);
  });
  test(`${hull}: raw and registered AI fits can deploy`, () => {
    const opts = options();
    opts.aiHulls[1] = [hull];
    assert.equal(roomDeploymentBlockReason([member('onslaught')], opts), '');
    opts.aiHulls[1] = ['fit:1'];
    opts.aiLoadouts = { 'fit:1': { hullId: hull } };
    assert.equal(roomDeploymentBlockReason([member('onslaught')], opts), '');
  });
}

test('all resolved native costs agree with combat and enforce exact team budget boundaries', async () => {
  const result = await build({ entryPoints: ['src/engine/simulation/CombatDeployment.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  const { deploymentCost } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  for (const [hull, dp] of Object.entries(costs)) {
    assert.equal(deploymentCost({ id: hull }), dp, hull);
    const opts = options();
    assert.equal(roomDeploymentBlockReason([member(hull)], opts), '', hull);
    opts.aiHulls[1] = [hull];
    assert.equal(roomDeploymentBlockReason([member('onslaught')], opts), '', `AI ${hull}`);
    const count = Math.floor(100 / dp);
    const fleet = Array.from({ length: count }, (_, i) => ({ ...member(hull), id: `member-${i}` }));
    assert.equal(roomDeploymentBlockReason(fleet, opts), '', `within budget: ${hull}`);
    assert.match(roomDeploymentBlockReason([...fleet, member(hull)], opts), /需要至少.*DP/, `over budget: ${hull}`);
  }
});

test('unknown or missing DP still fails closed, including registered AI fits', () => {
  for (const hull of ['missing_hull', 'gargoyle', '']) {
    assert.match(roomDeploymentBlockReason([member(hull)], options()), /Aca233的舰船缺少有效部署点/);
    const opts = options(); opts.aiHulls[1] = [hull];
    assert.match(roomDeploymentBlockReason([member('onslaught_xiv')], opts), /AI 舰船缺少有效部署点/);
    opts.aiHulls[1] = ['fit:1']; opts.aiLoadouts = { 'fit:1': { hullId: hull } };
    assert.match(roomDeploymentBlockReason([member('onslaught_xiv')], opts), /AI 舰船缺少有效部署点/);
  }
  assert.match(roomDeploymentBlockReason([member('onslaught_xiv', { hullId: 'missing_hull' })], options()), /缺少有效部署点/);
});

test('XIV AI still cannot exceed its team limit; reserves do not count as simultaneous deployment', () => {
  const opts = options(); opts.aiHulls[1] = Array(10).fill('onslaught_xiv');
  assert.equal(roomDeploymentBlockReason([member('onslaught_xiv')], opts), '');
  opts.aiHulls = Array.from({ length: 6 }, () => ['onslaught_xiv']);
  assert.match(roomDeploymentBlockReason([member('onslaught_xiv')], opts), /需要至少 40 DP.*当前只有 33/);
});

test('real LAN relay accepts an XIV player and XIV AI and publishes a match', { timeout: 15000 }, async () => {
  const { createLanServer } = await import('../server/lan-server.mjs');
  const { WebSocket } = await import('ws');
  const { default: protocol } = await import('../src/network/protocol.json', { with: { type: 'json' } });
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'starsector-xiv-deployment-'));
  let app, ws;
  try {
    await fs.writeFile(path.join(dir, 'lan-build.json'), JSON.stringify({ build: 'xiv-deployment-test' }));
    app = await createLanServer({ host: '127.0.0.1', port: 0, dist: dir });
    const origin = 'http://127.0.0.1:' + app.server.address().port;
    ws = new WebSocket(origin.replace('http', 'ws') + '/lan/ws', { origin });
    const next = predicate => new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); ws.off('message', receive); };
      const receive = data => {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') { cleanup(); reject(Error(message.message)); }
        else if (predicate(message)) { cleanup(); resolve(message); }
      };
      const timer = setTimeout(() => { cleanup(); reject(Error('relay response timed out')); }, 3000);
      ws.on('message', receive);
    });
    const send = message => ws.send(JSON.stringify(message));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let response = next(m => m.type === 'welcome');
    send({ type: 'hello', protocol: protocol.version, build: 'xiv-deployment-test', name: 'Aca233', instance: 'xiv-deployment-test' });
    const { id } = await response;
    response = next(m => m.type === 'room'); send({ type: 'create', battleSize: 200 });
    const { room } = await response;
    response = next(m => m.type === 'configured');
    send({ type: 'configure', requestId: 'xiv-configure', roomCode: room.code, baseRevision: room.members[0].designRevision,
      hull: 'onslaught_xiv', design: { version: 1, id: 'xiv-regression', name: 'XIV regression', hullId: 'onslaught_xiv', weapons: {}, hullMods: [], wings: [], capacitors: 0, vents: 0, groups: [], updatedAt: 0 } });
    const configured = await response;
    assert.equal(configured.hull, 'onslaught_xiv');
    response = next(m => m.type === 'room' && m.room.options.aiHulls[1]?.includes('legion_xiv'));
    send({ type: 'options', baseRevision: 0, options: { aiHulls: [[], ['legion_xiv']] } }); await response;
    response = next(m => m.type === 'match'); send({ type: 'start', requestId: 'xiv-start' });
    const { match } = await response;
    assert.equal(match.players.find(p => p.id === id).design.hullId, 'onslaught_xiv');
    assert.deepEqual(match.options.aiHulls, [[], ['legion_xiv']]);
    assert.equal(app.rooms.get(room.code).status, 'loading');
    assert.equal(match.options.deploymentLimit, 100);
  } finally {
    ws?.terminate(); await app?.close();
    await fs.unlink(path.join(dir, 'lan-build.json')).catch(() => {});
    await fs.rmdir(dir);
  }
});
