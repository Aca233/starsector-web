import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, unlink, rmdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
import { projectCampaignPlayer } from '../server/campaign/PlayerProjection.mjs';
const worldId = 'development-sector', a = 'fleet-captain-a', b = 'fleet-captain-b';
async function setup(t, options = {}) {
  const service = new CampaignService({ filename: ':memory:' }); await service.ready(); await service.create(options.world ?? createDevelopmentCampaign());
  const grants = ['captain-a', 'captain-b'].map(playerId => ({ playerId, token: randomBytes(32).toString('base64url') }));
  const gateway = await listenCampaignGateway({ service, worldId, grants, port: 0, ...options });
  t.after(async () => { await gateway.close(); await service.close(); });
  const api = async (index, route = 'session', body, extra = {}) => {
    const result = await fetch(gateway.origin + '/campaign-api/' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + grants[index].token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, value: await result.json() };
  };
  const command = async (type, payload, refs = []) => { const w = await service.read(worldId), ready = await service.ready(); return { worldId, epoch: ready.epoch, requestId: randomBytes(16).toString('hex'), type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) }; };
  return { service, gateway, grants, api, command };
}

test('HTTP authentication derives identity from the host grant; unauthenticated or URL tokens reveal nothing', async t => {
  const { gateway, api, grants } = await setup(t);
  assert.equal((await fetch(gateway.origin + '/campaign-api/session')).status, 401);
  assert.equal((await fetch(gateway.origin + '/campaign-api/session', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetch(gateway.origin + '/campaign-api/session?token=' + grants[0].token)).status, 409);
  const session = await api(0); assert.equal(session.status, 200); assert.equal(session.value.view.self.id, 'captain-a');
  assert.equal(session.value.view.visibilityPolicy, 'control-and-consensual-party'); assert.equal(session.value.simulation.status, 'stopped');
  assert.ok(!JSON.stringify(session.value).includes(grants[0].token));
});

test('player projection omits foreign cargo, ship state, positions, arbitrary extension secrets and raw events', async t => {
  const world = structuredClone(createDevelopmentCampaign()); world.fleets[b].position = [987654, 321012]; world.fleets[b].cargo.fuel = 654321;
  const { api } = await setup(t, { world }); const s = (await api(0)).value, text = JSON.stringify(s);
  assert.equal(s.view.fleets.length, 1); assert.equal(s.view.contacts[0].id, b); assert.ok(!text.includes('987654')); assert.ok(!text.includes('654321'));
  for (const key of ['extensions', 'accounts', 'members', 'rulesLock', 'contentFingerprint']) assert.equal(s.view[key], undefined);
  const other = (await api(1)).value; assert.equal(other.view.fleets[0].id, b); assert.equal(other.view.fleets[0].private.cargo.fuel, 654321);
});

test('raw world, outbox, system simulation, arbitrary principal and cross-world execution have no public route', async t => {
  const { api, command, service } = await setup(t); const before = await service.read(worldId);
  for (const route of ['world', 'events', 'simulation-start', 'create']) assert.equal((await api(0, route)).status, 404);
  const c = await command('world.advance', { fromTick: 0, ticks: 60 }); assert.equal((await api(0, 'command', c)).value.error.code, 'FORBIDDEN_COMMAND');
  const course = await command('fleet.stop', { fleetId: a, locationId: 'system' }, [['fleets', a]]);
  assert.equal((await api(0, 'command', { ...course, principal: { kind: 'system', id: 'admin' } })).value.error.code, 'INVALID_COMMAND');
  assert.equal((await api(0, 'command', { ...course, worldId: 'another-world' })).status, 403); assert.deepEqual(await service.read(worldId), before);
});

test('two authenticated players independently command their fleets and cannot move another player fleet', async t => {
  const { api, command, service } = await setup(t);
  const c = await command('fleet.set-course', { fleetId: a, locationId: 'system', destination: [240, 0] }, [['fleets', a]]);
  assert.equal((await api(1, 'command', c)).value.error.code, 'FORBIDDEN'); const receipt = await api(0, 'command', c); assert.equal(receipt.status, 200);
  assert.deepEqual(await api(0, 'command', c), receipt);
  const other = await command('fleet.set-course', { fleetId: b, locationId: 'system', destination: [-200, 60] }, [['fleets', b]]);
  assert.equal((await api(1, 'command', other)).status, 200);
  await service.execute({ kind: 'system', id: 'test-clock' }, await command('world.advance', { fromTick: 0, ticks: 60 }));
  const w = await service.read(worldId); assert.ok(w.fleets[a].position[0] > 0); assert.ok(w.fleets[b].position[0] < 0);
});

test('consensual invitation reveals only identity until acceptance; joining shares navigation, not private resources or command rights', async t => {
  const { api, command } = await setup(t);
  const invite = await api(0, 'command', await command('party.invite', { fromFleetId: a, toFleetId: b }, [['fleets', a]])); const id = invite.value.result.invitationId;
  const pending = (await api(1)).value.view; assert.equal(pending.fleets.length, 1); assert.equal(pending.invitations[0].canAccept, true);
  assert.equal(pending.invitations[0].fromFleetId, a); assert.equal(pending.invitations[0].position, undefined);
  const accept = await api(1, 'command', await command('party.accept', { invitationId: id }, [['invitations', id], ['fleets', a], ['fleets', b]])); assert.equal(accept.status, 200);
  const shared = (await api(0)).value.view, allied = shared.fleets.find(f => f.id === b); assert.equal(shared.fleets.length, 2); assert.equal(allied.private, null); assert.equal(allied.canCommand, false);
  assert.equal((await api(0, 'command', await command('fleet.stop', { fleetId: b, locationId: 'system' }, [['fleets', b]]))).status, 403);
  const partyId = accept.value.result.partyId;
  assert.equal((await api(1, 'command', await command('party.leave', { fleetId: b }, [['fleets', b], ['parties', partyId]]))).status, 200);
  assert.equal((await api(0)).value.view.fleets.length, 1);
});

test('HTTP jump commits once and survives reconnect; landing appears in the next scoped snapshot', async t => {
  const { api, command, service } = await setup(t);
  const c = await command('fleet.jump', { fleetId: a, sourceId: 'exit', destinationIndex: 0 }, [['fleets', a], ['spaceEntities', 'exit'], ['spaceEntities', 'well']]);
  const receipt = await api(0, 'command', c); assert.equal(receipt.status, 200); assert.equal(receipt.value.result.paidFuel, 1);
  assert.equal((await api(0)).value.view.fleets[0].private.cargo.fuel, 19); assert.deepEqual(await api(0, 'command', c), receipt);
  await service.execute({ kind: 'system', id: 'test-clock' }, await command('world.advance', { fromTick: 0, ticks: 300 }));
  const view = (await api(0)).value.view; assert.equal(view.fleets[0].locationId, 'hyper'); assert.equal(view.fleets[0].navigation.jumpPhase, null);
  assert.equal(view.points[0].id, 'well'); assert.equal((await api(1)).value.view.fleets[0].locationId, 'system');
});

test('same-origin/Host checks reject cross-site use even with valid credentials; no CORS wildcard is emitted', async t => {
  const { api, gateway, grants } = await setup(t);
  assert.equal((await api(0, 'session', undefined, { Origin: 'https://foreign.example' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => { const req = httpRequest(gateway.origin + '/campaign-api/session', { headers: { Host: 'attacker.example', Authorization: 'Bearer ' + grants[0].token } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(wrongHost, 403);
  const good = await fetch(gateway.origin + '/campaign-api/session', { headers: { Authorization: 'Bearer ' + grants[0].token, Origin: gateway.origin } });
  assert.equal(good.status, 200); assert.equal(good.headers.get('access-control-allow-origin'), null); assert.equal(good.headers.get('cache-control'), 'no-store');
});

test('bounded malformed bodies and forbidden methods produce sanitized errors without filesystem or stack leakage', async t => {
  const { gateway, grants, api } = await setup(t); const target = gateway.origin + '/campaign-api/command';
  const headers = { Authorization: 'Bearer ' + grants[0].token, 'Content-Type': 'application/json' };
  const bad = await fetch(target, { method: 'POST', headers, body: '{broken' }); assert.equal((await bad.json()).error.code, 'INVALID_JSON');
  const large = await fetch(target, { method: 'POST', headers, body: JSON.stringify({ payload: 'x'.repeat(70000) }) }); assert.equal(large.status, 413);
  assert.equal((await api(0, 'command', { type: 'fleet.stop' }, { 'Content-Type': 'text/plain' })).value.error.code, 'CONTENT_TYPE');
  const missing = await fetch(gateway.origin + '/private/credentials.json'); const text = await missing.text(); assert.equal(missing.status, 404); assert.ok(!text.includes('stack')); assert.ok(!text.includes('C:'));
});

test('public assets are limited to the campaign build and traversal cannot read private host files', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-static-')), build = path.join(dir, 'build'); await mkdir(build); await mkdir(path.join(build, 'assets'));
  await writeFile(path.join(build, 'campaign.html'), '<h1>Campaign build</h1>'); await writeFile(path.join(build, 'assets', 'app.js'), '/* campaign */'); await writeFile(path.join(dir, 'secret.js'), 'HOST-SECRET');
  t.after(async () => { await unlink(path.join(build, 'campaign.html')); await unlink(path.join(build, 'assets', 'app.js')); await unlink(path.join(dir, 'secret.js')); await rmdir(path.join(build, 'assets')); await rmdir(build); await rmdir(dir); });
  const { gateway } = await setup(t, { staticRoot: build });
  assert.equal((await fetch(gateway.origin + '/campaign.html')).status, 200); assert.equal((await fetch(gateway.origin + '/assets/app.js')).status, 200);
  for (const url of ['/assets/%2e%2e%2f%2e%2e%2fsecret.js', '/secret.js', '/index.html']) { const r = await fetch(gateway.origin + url); assert.equal(r.status, 404); assert.ok(!(await r.text()).includes('HOST-SECRET')); }
});

test('host grant setup rejects weak, duplicate, nonexistent identities and accidental public HTTP binding', async () => {
  const service = new CampaignService({ filename: ':memory:' }); await service.create(createDevelopmentCampaign());
  try {
    const token = randomBytes(32).toString('base64url');
    for (const grants of [[{ playerId: 'captain-a', token: 'password' }], [{ playerId: 'missing', token }], [{ playerId: 'captain-a', token }, { playerId: 'captain-b', token }]]) {
      await assert.rejects(() => listenCampaignGateway({ service, worldId, grants, port: 0 }), { code: 'ACCESS_CONFIG' });
    }
    await assert.rejects(() => listenCampaignGateway({ service, worldId, grants: [{ playerId: 'captain-a', token }], host: '0.0.0.0', port: 0 }), { code: 'INSECURE_BIND' });
  } finally { await service.close(); }
});

test('faction command authority, not ownership alone, determines private projection', () => {
  const world = structuredClone(createDevelopmentCampaign());
  world.factions.guild = { id: 'guild', version: 0, name: 'Guild', playerRoles: { 'captain-a': 'leader', 'captain-b': 'member' } };
  world.fleets[b].control = { kind: 'faction', id: 'guild' };
  assert.equal(projectCampaignPlayer(world, 'captain-a').fleets.length, 2); assert.equal(projectCampaignPlayer(world, 'captain-b').fleets.length, 0);
});


test('native image/font requests support correct MIME and HEAD without exposing source data', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-native-'));
  const game = path.join(dir, 'game-assets'), graphics = path.join(game, 'graphics');
  await mkdir(graphics, { recursive: true });
  const assets = { 'font.ttf': 'font fixture', 'atlas.fnt': 'info face="fixture"', 'background.jpg': 'image fixture', 'secret.json': 'PRIVATE' };
  for (const [name, value] of Object.entries(assets)) await writeFile(path.join(graphics, name), value);
  t.after(async () => { for (const name of Object.keys(assets)) await unlink(path.join(graphics, name)); await rmdir(graphics); await rmdir(game); await rmdir(dir); });
  const { gateway } = await setup(t, { staticRoot: dir });
  for (const [name, type] of [['font.ttf', 'font/ttf'], ['atlas.fnt', 'text/plain; charset=utf-8'], ['background.jpg', 'image/jpeg']]) {
    const res = await fetch(gateway.origin + '/game-assets/graphics/' + name); assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), type); assert.equal(await res.text(), assets[name]);
    const head = await fetch(gateway.origin + '/game-assets/graphics/' + name, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(assets[name])); assert.equal(await head.text(), '');
  }
  for (const suffix of ['secret.json', '%ZZ', '..%2f..%2ffont.ttf', '..%5cfont.ttf', 'font.ttf%00', 'font.ttf:stream']) assert.equal((await fetch(gateway.origin + '/game-assets/graphics/' + suffix)).status, 404);
  assert.equal((await fetch(gateway.origin + '/game-assets/private.ttf')).status, 404);
});

test('static junctions cannot escape either public asset subtree even into the build root', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-junction-')), build = path.join(dir, 'build'), assets = path.join(build, 'assets'), game = path.join(build, 'game-assets'), graphics = path.join(game, 'graphics'), privateDir = path.join(build, 'private');
  await mkdir(assets, { recursive: true }); await mkdir(graphics, { recursive: true }); await mkdir(privateDir);
  await writeFile(path.join(privateDir, 'secret.js'), 'HOST-SECRET'); await writeFile(path.join(dir, 'outside.js'), 'OUTSIDE-SECRET');
  const links = [path.join(assets, 'inside'), path.join(graphics, 'inside'), path.join(graphics, 'outside')];
  await symlink(privateDir, links[0], 'junction'); await symlink(privateDir, links[1], 'junction'); await symlink(dir, links[2], 'junction');
  t.after(async () => { for (const link of links) await unlink(link); await unlink(path.join(privateDir, 'secret.js')); await unlink(path.join(dir, 'outside.js')); for (const p of [assets, graphics, game, privateDir, build, dir]) await rmdir(p); });
  const { gateway } = await setup(t, { staticRoot: build });
  for (const url of ['/assets/inside/secret.js', '/game-assets/graphics/inside/secret.js', '/game-assets/graphics/outside/outside.js']) { const res = await fetch(gateway.origin + url); assert.equal(res.status, 404); assert.ok(!(await res.text()).includes('SECRET')); }
});


test('HTTP approach persists a scoped interaction target and never jumps or charges fuel without confirmation', async t => {
  const { api, command, service } = await setup(t);
  const c = await command('fleet.approach', { fleetId: a, targetId: 'exit' }, [['fleets', a], ['spaceEntities', 'exit']]);
  assert.equal((await api(1, 'command', c)).status, 403); const receipt = await api(0, 'command', c); assert.equal(receipt.status, 200);
  const s = (await api(0)).value.view.fleets[0]; assert.equal(s.navigation.interaction.targetId, 'exit'); assert.equal(s.navigation.interaction.orderId, c.requestId); assert.equal(s.navigation.jumpPhase, null); assert.equal(s.private.cargo.fuel, 20);
  const ready = await service.ready(); await service.execute({kind:'system',id:'world-service'}, {worldId,epoch:ready.epoch,requestId:randomBytes(16).toString('hex'),type:'world.advance',payload:{fromTick:0,ticks:180},expected:[]});
  assert.equal((await api(0)).value.view.fleets[0].navigation.interaction.arrived, true);
  const replay = await api(0, 'command', c); assert.deepEqual(replay, receipt); assert.equal((await api(1)).value.view.fleets.length, 1);
});


test('fleet catalogue JSON is public only at its generated asset path, never arbitrary credentials', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campaign-catalog-')), assets = path.join(dir, 'assets'); await mkdir(assets);
  const files = { 'native-catalog-ships-abc123.json': '[{"id":"wolf"}]', 'access.json': 'PRIVATE', 'native-catalog-ships.json': 'PRIVATE' };
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(assets, name), value);
  t.after(async () => { for (const name of Object.keys(files)) await unlink(path.join(assets, name)); await rmdir(assets); await rmdir(dir); });
  const { gateway } = await setup(t, { staticRoot: dir });
  const response = await fetch(gateway.origin + '/assets/native-catalog-ships-abc123.json');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8'); assert.deepEqual(await response.json(), [{ id: 'wolf' }]);
  for (const url of ['/assets/access.json', '/assets/native-catalog-ships.json', '/assets/%2e%2e%2faccess.json']) assert.equal((await fetch(gateway.origin + url)).status, 404);
});


test('Fleet mothball command crosses authenticated HTTP/Worker and refreshes private capacity/CR without altering cargo', async t => {
  const initial=structuredClone(createDevelopmentCampaign()),memberId='wolf-captain-a';initial.members[memberId].condition.hullFraction=0.5;initial.members[memberId].condition.combatReadiness=0.4;
  const {api,command,service}=await setup(t,{world:initial});
  const before=(await api(0)).value.view.fleets[0];assert.ok(before.private.logistics.repairCompletion.supplyCost>0);
  const c=await command('logistics.set-mothballed',{memberId,mothballed:true},[['fleets',a],['members',memberId]]);
  assert.equal((await api(1,'command',c)).status,403);
  const receipt=await api(0,'command',c);assert.equal(receipt.status,200);assert.deepEqual(await api(0,'command',c),receipt);
  const sealed=(await api(0)).value.view.fleets[0];
  assert.equal(sealed.private.members[0].mothballed,true);assert.equal(sealed.private.members[0].combatReadiness,0);assert.equal(sealed.private.logistics.cargoCapacity,0);assert.equal(sealed.private.logistics.fuelCapacity,0);assert.equal(sealed.private.logistics.personnelCapacity,0);assert.deepEqual(sealed.private.cargo,before.private.cargo);
  assert.deepEqual(sealed.private.logistics.repairCompletion,{supplyCost:0,applicable:true});
  const reopen=await command('logistics.set-mothballed',{memberId,mothballed:false},[['fleets',a],['members',memberId]]);
  assert.equal((await api(0,'command',reopen)).status,200);const restored=(await api(0)).value.view.fleets[0];assert.equal(restored.private.members[0].combatReadiness,before.private.members[0].combatReadiness);assert.deepEqual(restored.private.logistics,before.private.logistics);
  const stale={...reopen,requestId:'stale-mothball-request'};assert.equal((await api(0,'command',stale)).value.error.code,'VERSION_CONFLICT');
  assert.equal((await service.read(worldId)).fleets[b].version,0);
  const pause=await command('logistics.set-repairs',{memberId,suspended:true},[['fleets',a],['members',memberId]]);assert.equal((await api(0,'command',pause)).status,200);assert.equal((await api(0)).value.view.fleets[0].private.logistics.repairCompletion.supplyCost,0);
  const resume=await command('logistics.set-repairs',{memberId,suspended:false},[['fleets',a],['members',memberId]]);assert.equal((await api(0,'command',resume)).status,200);
  await service.execute({kind:'system',id:'test-clock'},await command('world.advance',{fromTick:0,ticks:60}));
  const later=(await api(0)).value.view.fleets[0];assert.ok(later.private.logistics.repairCompletion.supplyCost<before.private.logistics.repairCompletion.supplyCost);
});
