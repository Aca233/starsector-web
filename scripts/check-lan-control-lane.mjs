import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import protocol from '../src/network/protocol.json' with { type: 'json' };
import { createLanServer } from '../server/lan-server.mjs';
import { DesktopLanBridge } from '../server/desktop-lan-bridge.mjs';
import { LAN_CONTROL_PATH, LAN_CONTROL_LIMIT, isLanControlMessage, LanControlLanes } from '../server/LanControlLane.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, name) {
  for (let i = 0; i < 200; i++) { const value = fn(); if (value) return value; await wait(10); }
  throw Error('Timed out: ' + name);
}
async function server(t, extension) {
  const dist = await mkdtemp(path.join(tmpdir(), 'lan-control-'));
  await writeFile(path.join(dist, 'lan-build.json'), '{"build":"control-test"}');
  const app = await createLanServer({ host: '127.0.0.1', port: 0, dist, extension });
  t.after(async () => { await app.close(); await unlink(path.join(dist, 'lan-build.json')); await rmdir(dist); });
  return { app, origin: `http://127.0.0.1:${app.server.address().port}` };
}
async function socket(t, origin, pathname = '/lan/ws') {
  const ws = new WebSocket(origin.replace('http:', 'ws:') + pathname, { origin, perMessageDeflate: false });
  ws.rows = []; ws.errors = []; ws.on('message', (raw, binary) => { if (!binary) ws.rows.push(JSON.parse(raw)); });
  ws.on('error', e => ws.errors.push(e)); t.after(() => ws.terminate());
  await once(ws, 'open'); return ws;
}
async function client(t, origin, extra = {}) {
  const ws = await socket(t, origin);
  ws.send(JSON.stringify({ type: 'hello', name: 'test', instance: 'test', build: 'control-test', protocol: protocol.version, stateCredits: 1, ...extra }));
  const welcome = await until(() => ws.rows.find(r => r.type === 'welcome'), 'welcome');
  return { ws, welcome };
}
async function lane(t, origin, welcome) {
  const ws = await socket(t, origin, LAN_CONTROL_PATH + '?token=' + welcome.controlLane.token);
  await until(() => ws.rows.find(r => r.type === 'control-lane-ready'), 'control ready'); return ws;
}
test('independent lane bypasses a blocked snapshot TCP stream, not primary authority validation', async t => {
  const { app, origin } = await server(t), { ws, welcome } = await client(t, origin, { controlLane: 1 });
  const control = await lane(t, origin, welcome);
  ws.send('{"type":"create","password":""}');
  const room = await until(() => [...app.rooms.values()][0], 'room');
  const peer = room.peers[0];
  // A real TCP reader stall, not a fabricated bufferedAmount. Controls share no
  // TCP send queue, but still use the primary peer's input ownership/rate checks.
  ws._socket.pause();
  const block = Buffer.alloc(1024 * 1024, 7);
  for (let i = 0; i < 8; i++) peer.ws.send(block);
  const at = performance.now(); control.send('{"type":"ping","sent":1234}');
  const pong = await until(() => control.rows.find(r => r.type === 'pong' && r.sent === 1234), 'unblocked pong');
  assert.ok(performance.now() - at < 1000);
  assert.equal(pong.lanTransport.role, 'host');
  assert.ok(peer.ws.bufferedAmount > 0, 'snapshot TCP must actually still be blocked');
  assert.equal(ws.rows.some(r => r.type === 'pong' && r.sent === 1234), false);
  assert.equal(peer.controlLane.received, 1);
  control.send(JSON.stringify({ type: 'input', matchId: 'not-my-match', input: { seq: 99 } }));
  await wait(30); assert.equal(peer.seq, -1, 'side channel cannot authorize an input');
  control.send(JSON.stringify({ type: 'state-consumed', matchId: 'not-my-match', seq: 123 }));
  await wait(30); assert.equal(peer.stateCredits.stats().acked, 0);
  ws.terminate(); await until(() => control.readyState === WebSocket.CLOSED, 'primary close revokes lane');
});
test('capabilities are single-use; side channel rejects binary/lifecycle packets and falls back', async t => {
  const { app, origin } = await server(t), { ws, welcome } = await client(t, origin, { controlLane: 1 });
  const control = await lane(t, origin, welcome);
  const duplicate = new WebSocket(origin.replace('http:', 'ws:') + LAN_CONTROL_PATH + '?token=' + welcome.controlLane.token, { origin });
  const duplicateError = once(duplicate, 'error'); await new Promise(resolve => duplicate.once('close', resolve)); assert.match(String((await duplicateError)[0]), /403/);
  ws.send('{"type":"create","password":""}'); const room = await until(() => [...app.rooms.values()][0], 'room');
  control.send('{"type":"start"}'); const [code] = await once(control, 'close'); assert.equal(code, 1008); assert.equal(room.status, 'lobby');
  ws.send('{"type":"ping","sent":9}'); await until(() => ws.rows.find(r => r.type === 'pong' && r.sent === 9), 'primary fallback');
  const resumed = await client(t, origin, { controlLane: 1, resumeToken: welcome.resumeToken });
  const second = await lane(t, origin, resumed.welcome);
  second.send(Buffer.from([1, 2, 3])); const [binaryCode] = await once(second, 'close'); assert.equal(binaryCode, 1008);
});
test('old clients do not gain side channels; stale capabilities cannot bind after reconnect', async t => {
  const { origin } = await server(t), old = await client(t, origin);
  assert.equal(old.welcome.controlLane, undefined);
  const first = await client(t, origin, { controlLane: 1 });
  await client(t, origin, { controlLane: 1, resumeToken: first.welcome.resumeToken });
  const stale = new WebSocket(origin.replace('http:', 'ws:') + LAN_CONTROL_PATH + '?token=' + first.welcome.controlLane.token, { origin });
  const staleError = once(stale, 'error'); await new Promise(resolve => stale.once('close', resolve)); assert.match(String((await staleError)[0]), /403/);
});
test('desktop bridge negotiates transparently and drops to primary if optional lane closes', async t => {
  const remote = await server(t);
  // Bridge origin uses the assigned listen port, just as electron-service does.
  const local = await server(t);
  const bridge = new DesktopLanBridge(local.app.server.address().port); t.after(() => bridge.close());
  // Attach the production extension to a separately configured HTTP listener.
  local.app.server.removeAllListeners('upgrade');
  local.app.server.on('upgrade', (req, socket, head) => { try { bridge.upgrade(req, socket, head); } catch { socket.destroy(); } });
  const ws = await socket(t, local.origin, '/desktop/lan/ws?target=' + encodeURIComponent(remote.origin));
  ws.send(JSON.stringify({ type: 'hello', name: 'test', instance: 'test', build: 'control-test', protocol: protocol.version, stateCredits: 1 }));
  await until(() => ws.rows.find(r => r.type === 'welcome'), 'proxied welcome');
  ws.send('{"type":"create","password":""}'); const room = await until(() => [...remote.app.rooms.values()][0], 'proxied room');
  await until(() => room.peers[0].controlLane?.socket, 'negotiated lane'); await wait(30);
  ws.send('{"type":"ping","sent":101}'); await until(() => ws.rows.find(r => r.type === 'pong' && r.sent === 101), 'proxied fast pong');
  assert.equal(room.peers[0].controlLane.received, 1);
  room.peers[0].controlLane.socket.terminate(); await wait(50);
  ws.send('{"type":"ping","sent":102}'); await until(() => ws.rows.find(r => r.type === 'pong' && r.sent === 102), 'proxied fallback pong');
  assert.equal(ws.readyState, WebSocket.OPEN);
  bridge.close(); await until(() => ws.readyState === WebSocket.CLOSED, 'bridge close');
});

for (const players of [3, 4, 5]) test(players + ' players keep separate control ownership while all guest state readers stall', async t => {
  const { app, origin } = await server(t);
  const host = await client(t, origin); host.ws.send('{"type":"create","password":""}');
  const room = await until(() => [...app.rooms.values()][0], 'room');
  host.ws.send(JSON.stringify({ type: 'capacity', capacity: players }));
  await until(() => room.capacity === players, 'room capacity');
  const guests = [];
  for (let i = 1; i < players; i++) {
    const guest = await client(t, origin, { controlLane: 1 }); guest.control = await lane(t, origin, guest.welcome);
    guest.ws.send(JSON.stringify({ type: 'join', code: room.code })); guests.push(guest);
  }
  await until(() => room.peers.length === players, 'all joined');
  for (const guest of guests) guest.ws._socket.pause();
  const chunk = Buffer.alloc(1024 * 1024, 8);
  for (const peer of room.peers.slice(1)) for (let i = 0; i < 8; i++) peer.ws.send(chunk);
  const at = performance.now();
  guests.forEach((guest, i) => guest.control.send(JSON.stringify({ type: 'ping', sent: 200 + i })));
  for (let i = 0; i < guests.length; i++) {
    const pong = await until(() => guests[i].control.rows.find(r => r.type === 'pong' && r.sent === 200 + i), 'guest control');
    assert.equal(pong.lanTransport.receivers[0].seat, room.peers[i + 1].seat);
    assert.equal(pong.lanTransport.receivers[0].controlLane.active, true);
    assert.ok(room.peers[i + 1].ws.bufferedAmount > 0);
  }
  console.log(JSON.stringify({ scenario: 'blocked primary TCP readers, loopback only', players, controlsCompletedMs: performance.now() - at }));
  guests.forEach(guest => guest.ws.terminate());
});


test('control limits are UTF-8 byte limits and server replies fall back without truncation', async () => {
  const small = JSON.stringify({ type: 'ping', sent: '中'.repeat(6000) });
  assert.ok(small.length < LAN_CONTROL_LIMIT); assert.ok(Buffer.byteLength(small) > LAN_CONTROL_LIMIT);
  assert.equal(isLanControlMessage(small), false);
  assert.equal(isLanControlMessage(Buffer.from(small)), false);
  assert.equal(isLanControlMessage('null'), false);
  assert.equal(isLanControlMessage('{'), false);
  assert.equal(isLanControlMessage(Buffer.from('{"type":"ping"}'), true), false);
  const lanes = new LanControlLanes(), primary = { readyState: WebSocket.OPEN };
  const peer = { ws: primary, controlLane: { primary, fallbacks: 0, socket: {
    readyState: WebSocket.OPEN, bufferedAmount: 0, send() { assert.fail('Oversized reply must use primary'); }
  } } };
  assert.equal(lanes.send(peer, { type: 'pong', sent: '中'.repeat(6000) }), false);
  assert.equal(peer.controlLane.fallbacks, 1);
  await lanes.close();
});

test('oversized wire controls close only the side lane; primary rate limit also applies to the side lane', async t => {
  const { app, origin } = await server(t), { ws, welcome } = await client(t, origin, { controlLane: 1 });
  const control = await lane(t, origin, welcome);
  control.send(JSON.stringify({ type: 'ping', sent: '中'.repeat(6000) }));
  const [code] = await once(control, 'close'); assert.equal(code, 1009); assert.equal(ws.readyState, WebSocket.OPEN);
  const next = await client(t, origin, { controlLane: 1 }); const flood = await lane(t, origin, next.welcome);
  next.ws.send('{"type":"create","password":""}');
  const room = await until(() => [...app.rooms.values()][0], 'rate room');
  // Primary and control must share one budget, rather than each granting 160.
  const budget = room.peers[0]; budget.window = Date.now(); budget.count = 159;
  const closed = once(next.ws, 'close');
  flood.send('{"type":"ping","sent":1}'); flood.send('{"type":"ping","sent":2}');
  assert.equal((await closed)[0], 1008);
  await until(() => flood.readyState === WebSocket.CLOSED, 'rate revoke');
});

test('bridge replays latest idempotent controls when the optional lane loses its final ACK', async t => {
  const remote = await server(t), host = await client(t, remote.origin);
  host.ws.send('{"type":"create","password":""}');
  const room = await until(() => [...remote.app.rooms.values()][0], 'recovery room');
  const local = await server(t), bridge = new DesktopLanBridge(local.app.server.address().port);
  t.after(() => bridge.close());
  local.app.server.removeAllListeners('upgrade');
  local.app.server.on('upgrade', (req, socket, head) => { try { bridge.upgrade(req, socket, head); } catch { socket.destroy(); } });
  const guest = await socket(t, local.origin, '/desktop/lan/ws?target=' + encodeURIComponent(remote.origin));
  guest.send(JSON.stringify({ type: 'hello', name: 'guest', instance: 'test', build: 'control-test', protocol: protocol.version, stateCredits: 1 }));
  await until(() => guest.rows.find(r => r.type === 'welcome'), 'guest welcome');
  guest.send(JSON.stringify({ type: 'join', code: room.code }));
  await until(() => room.peers.length === 2 && room.peers[1].controlLane?.socket, 'guest lane');
  guest.send('{"type":"ready","ready":true}'); await until(() => room.peers[1].ready, 'guest ready');
  host.ws.send('{"type":"start"}'); await until(() => room.status === 'loading', 'loading');
  for (const ws of [host.ws, guest]) ws.send(JSON.stringify({ type: 'loaded', matchId: room.match.id }));
  await until(() => room.status === 'running', 'running');
  const peer = room.peers[1], matchId = room.match.id;
  host.ws.send(JSON.stringify({ type: 'state', matchId, seq: 1, frame: { tick: 1, ships: [{ id: 'a', state: { teamId: 0 } }, { id: 'b', state: { teamId: 1 } }], crafts: [], craftSpecs: [], world: {} } }));
  await until(() => guest.rows.find(r => r.type === 'state' && r.seq === 1), 'guest state');
  guest.send(JSON.stringify({ type: 'sync-ready', matchId, syncId: peer.sync.id, tick: 1 }));
  await until(() => guest.rows.find(r => r.type === 'controls-ready'), 'initial synchronization');
  // Simulate loss after local TCP accepted writes, before authority dispatch.
  // No future state/input is sent to accidentally unstick the consumed credit.
  const side = peer.controlLane.socket, received = peer.controlLane.received;
  side._socket.pause(); guest.rows.length = 0;
  guest.send(JSON.stringify({ type: 'state-consumed', matchId, seq: 1 }));
  guest.send(JSON.stringify({ type: 'sync-ready', matchId, syncId: peer.sync.id, tick: 1 }));
  guest.send(JSON.stringify({ type: 'input', matchId, syncId: peer.sync.id, input: { seq: 1, keys: 1, aim: [0, 0], firing: false, pointerActive: false, actions: [{ id: 1, kind: 'shield' }] } }));
  await wait(50); assert.equal(peer.controlLane.received, received); assert.equal(peer.stateCredits.stats().inflight, 1); assert.equal(peer.seq, -1);
  side.terminate();
  await until(() => peer.stateCredits.stats().inflight === 0 && peer.seq === 1 && guest.rows.some(r => r.type === 'controls-ready'), 'fallback ACK, sync and input');
  assert.equal(peer.stateCredits.stats().acked, 1); assert.equal(peer.action, 1);
  assert.equal(host.ws.rows.filter(r => r.type === 'input' && r.input.seq === 1).length, 1);
  assert.equal(guest.readyState, WebSocket.OPEN);
  // A repeated valid-looking ACK or input cannot mint credit or repeat actions.
  guest.send(JSON.stringify({ type: 'state-consumed', matchId, seq: 1 }));
  guest.send(JSON.stringify({ type: 'input', matchId, syncId: peer.sync.id, input: { seq: 1, keys: 1, aim: [0, 0], firing: false, pointerActive: false, actions: [{ id: 1, kind: 'shield' }] } }));
  await wait(30); assert.equal(peer.stateCredits.stats().acked, 1);
  assert.equal(host.ws.rows.filter(r => r.type === 'input' && r.input.seq === 1).length, 1);
});


test('unbound capabilities expire and bound allocation is capped', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lanes = new LanControlLanes(), peers = [];
  for (let i = 0; i < 64; i++) {
    const peer = { ws: { readyState: WebSocket.OPEN } }; peers.push(peer);
    assert.equal(lanes.issue(peer, peer.ws).version, 1);
  }
  assert.equal(lanes.issue({ ws: {} }, {}), null);
  t.mock.timers.tick(10001);
  assert.equal(lanes.entries.size, 0); assert.equal(lanes.offers.size, 0);
  assert.ok(peers.every(p => p.controlLane === null));
  assert.equal(lanes.issue(peers[0], peers[0].ws).version, 1);
  await lanes.close(); assert.equal(peers[0].controlLane, null);
});

test('bridge tolerates a reverse proxy that rejects the optional lane without breaking primary', async t => {
  const remote = await server(t), upgrade = remote.app.server.listeners('upgrade')[0];
  let rejected = 0;
  remote.app.server.removeAllListeners('upgrade');
  remote.app.server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith(LAN_CONTROL_PATH)) {
      rejected++; socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    } else upgrade(req, socket, head);
  });
  const local = await server(t), bridge = new DesktopLanBridge(local.app.server.address().port);
  t.after(() => bridge.close()); local.app.server.removeAllListeners('upgrade');
  local.app.server.on('upgrade', (req, socket, head) => { try { bridge.upgrade(req, socket, head); } catch { socket.destroy(); } });
  const ws = await socket(t, local.origin, '/desktop/lan/ws?target=' + encodeURIComponent(remote.origin));
  ws.send(JSON.stringify({ type: 'hello', name: 'test', instance: 'test', build: 'control-test', protocol: protocol.version, stateCredits: 1 }));
  await until(() => ws.rows.find(r => r.type === 'welcome') && rejected === 1, 'rejected optional dial');
  ws.send('{"type":"ping","sent":403}');
  const pong = await until(() => ws.rows.find(r => r.type === 'pong' && r.sent === 403), 'primary pong');
  assert.equal(pong.lanTransport.receivers[0].controlLane.active, false);
  assert.equal(ws.readyState, WebSocket.OPEN); assert.equal(rejected, 1);
});
