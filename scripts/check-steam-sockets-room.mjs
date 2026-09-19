import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { SteamGateway, STEAM_SOCKET_TRANSPORT } from '../server/steam/gateway.mjs';
import { SteamSocketRoom } from '../server/steam/sockets-room.mjs';
import { socketWireHeader } from '../server/steam/sockets-wire.mjs';
import { createLanServer } from '../server/lan-server.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

// Contract/in-memory wire fixture, NOT a congestion or Valve routing model.
// Actual relay code runs, but no server listen/network/Steam API is invoked.
const HOST = '76561198000000001', GUEST = '76561198000000002', ROOM = '10977524000000001', BUILD = 'socket-adapter-test';
const dist = path.resolve('artifacts/steam-sockets-adapter-relay');
fs.mkdirSync(dist, { recursive: true }); fs.writeFileSync(path.join(dist, 'lan-build.json'), JSON.stringify({ build: BUILD }));
class Browser extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.messages = []; this.closes = []; this.hold = false; this.callbacks = []; }
  send(text, done) { this.messages.push(JSON.parse(text)); if (this.hold) this.callbacks.push(done); else done?.(); }
  message(value) { this.emit('message', Buffer.from(JSON.stringify(value)), false); }
  close(code, reason) { if (this.readyState === 3) return; this.readyState = 3; this.closes.push({ code, reason }); this.emit('close', code, Buffer.from(reason ?? '')); }
  terminate() { this.close(1006, 'terminated'); }
  ping(data) { this.emit('pong', data); }
  last(type) { return this.messages.findLast(m => m.type === type); }
}
function fabric(clock) {
  let next = 100; const ends = new Map(), links = [], sent = [];
  const f = { sent, links, ends, filter: () => true, policy: () => ({ status: 'accepted' }) };
  f.endpoint = id => {
    const endpoint = { id, notices: [], inbox: [], state: 'new', options: null,
      open(options) { this.options = options; this.state = 'open'; ends.set(id, this); },
      connect() {
        const host = ends.get(HOST); if (id === HOST || !host || host.state !== 'open') return null;
        const ht = Object.freeze({ handle: ++next, lease: String(next), remote: id, scope: ROOM });
        const gt = Object.freeze({ handle: ++next, lease: String(next), remote: HOST, scope: ROOM });
        links.push({ host, guest: this, ht, gt, open: true });
        host.notices.push({ type: 'connected', ticket: ht }); this.notices.push({ type: 'connected', ticket: gt }); return gt;
      },
      poll() { return this.notices.splice(0); },
      receive() { return this.inbox.splice(0, 16); },
      send(ticket, data, kind) {
        const link = links.find(l => l.open && (ticket === l.ht || ticket === l.gt || same(ticket, l.ht) || same(ticket, l.gt)));
        if (!link) return { status: 'error' };
        const fromHost = same(ticket, link.ht), target = fromHost ? link.guest : link.host;
        const packet = { from: id, at: clock(), kind, data: Buffer.from(data), ticket: fromHost ? link.gt : link.ht };
        const result = f.policy(packet); sent.push({ ...packet, result });
        if (result.status === 'accepted' && f.filter(packet)) target.inbox.push(packet);
        return result;
      },
      sample() { return { available: true, pendingBytes: 0, unackedReliableBytes: 0, sendRateBytesPerSecond: 1e6, lanes: [0, 1, 2].map(lane => ({ lane, queueMs: 0 })) }; },
      disconnect(ticket) {
        const link = links.find(l => l.open && (same(ticket, l.ht) || same(ticket, l.gt)));
        if (!link) return false; link.open = false;
        link.host.notices.push({ type: 'disconnected', ticket: link.ht }); link.guest.notices.push({ type: 'disconnected', ticket: link.gt }); return true;
      },
      close() { this.state = 'closed'; for (const l of links) if (l.host === this || l.guest === this) this.disconnect(l.host === this ? l.ht : l.gt); },
    }; return endpoint;
  };
  return f;
}
function same(a, b) { return a && b && ['handle', 'lease', 'scope', 'remote'].every(k => a[k] === b[k]); }
async function fixture(t, { factory = true, guestFactory = factory } = {}) {
  let now = 10000; t.mock.method(Date, 'now', () => now);
  // Use real http.Server/EventEmitter, only replace OS-bound listen/close.
  t.mock.method(http.Server.prototype, 'listen', function (...args) { queueMicrotask(() => args.at(-1)()); return this; });
  t.mock.method(http.Server.prototype, 'close', function (done) { queueMicrotask(() => done?.()); return this; });
  const f = fabric(() => now), members = new Set([HOST, GUEST]), callbacks = new Map(), data = {};
  let owner = HOST, legacyCalls = 0;
  function lobby() { return { id: BigInt(ROOM), getOwner: () => BigInt(owner), getMembers: () => [...members].map(BigInt),
    mergeFullData: values => { Object.assign(data, values); return true; }, getData: key => data[key], setData: (key, value) => { data[key] = value; return true; }, setJoinable: () => true, leave() {} }; }
  function gateway(id, modern) {
    const client = { localplayer: { getSteamId: () => BigInt(id), getName: () => id === HOST ? '房主' : '玩家' },
      matchmaking: { createLobby: async () => lobby(), joinLobby: async () => lobby() }, callback: { register: (kind, cb) => { callbacks.set(id + ':' + kind, cb); return { disconnect() {} }; } },
      networking: new Proxy({}, { get: () => () => { legacyCalls++; throw Error('Unexpected legacy API'); } }) };
    const g = new SteamGateway({ build: BUILD, client, socketRoomFactory: modern ? options => new SteamSocketRoom({ ...options, lifecycle: f.endpoint(id), now: () => now }) : null });
    assert.equal(g.initialize().available, true); clearInterval(g.timer); return g;
  }
  const host = gateway(HOST, factory), guest = gateway(GUEST, guestFactory);
  const relay = await createLanServer({ host: '127.0.0.1', port: 0, dist, extension: host.extension }); host.relay = relay;
  t.after(async () => { await guest.close(); await host.close(); await relay.close(); });
  await host.select('create');
  const hb = new Browser(); host.connectBrowser(hb, new URL('http://localhost/steam/ws?lobby=' + ROOM));
  hb.message({ type: 'hello', protocol: protocol.version, build: BUILD, name: '房主', instance: 'host' }); hb.message({ type: 'create' });
  const room = [...relay.rooms.values()][0]; assert.ok(room); assert.equal(data.sw_status, 'lobby');
  const api = { host, guest, hb, relay, room, f, data, callbacks, members,
    time: () => now, advance: n => { now += n; }, changeOwner: id => { owner = id; }, legacyCalls: () => legacyCalls,
    tick(n = 1) { for (let i = 0; i < n; i++) { host.poll(); guest.poll(); now += 8; } },
    async join({ hello = true } = {}) { await guest.select('join', ROOM); return this.browser({ hello }); },
    browser({ hello = true, resumeToken } = {}) {
      const b = new Browser(); guest.connectBrowser(b, new URL('http://localhost/steam/ws?lobby=' + ROOM));
      if (hello) b.message({ type: 'hello', protocol: protocol.version, build: BUILD, name: '玩家', instance: 'guest', ...(resumeToken ? { resumeToken } : {}) });
      return b;
    },
    async ready() { const b = await this.join(); this.tick(12); assert.ok(b.last('welcome')); b.message({ type: 'join', code: room.code }); this.tick(12); assert.equal(room.peers.length, 2); return b; },
    start(b) { hb.message({ type: 'ready', ready: true }); b.message({ type: 'ready', ready: true }); this.tick(12); hb.message({ type: 'start' }); this.tick(12); assert.equal(room.status, 'loading', JSON.stringify(hb.last('error'))); const matchId = room.match.id; hb.message({ type: 'loaded', matchId }); b.message({ type: 'loaded', matchId }); this.tick(12); assert.equal(room.status, 'running'); return matchId; },
    state(seq, extra = '') { return { type: 'state', matchId: room.match.id, seq, frame: { tick: seq, ships: room.match.players.map((p, i) => ({ id: 'ship-' + i, state: { teamId: p.team } })), crafts: [], craftSpecs: [], world: {}, extra } }; },
  }; return api;
}

test('real gateway/relay: pre-ready hello, create/join, match/load, complete state, end; no legacy APIs', async t => {
  const f = await fixture(t), b = await f.ready();
  assert.equal(f.data.sw_transport, STEAM_SOCKET_TRANSPORT);
  const matchId = f.start(b), state = f.state(1); f.hb.message(state); f.tick(30);
  assert.deepEqual(b.last('state'), state); assert.equal(b.last('launch').matchId, matchId);
  f.hb.message({ type: 'end', matchId }); f.tick(30);
  assert.equal(b.last('ended').matchId, matchId); assert.equal(f.room.status, 'ended');
  assert.equal(f.legacyCalls(), 0); assert.equal(f.host.status().transport.mode, STEAM_SOCKET_TRANSPORT);
  assert.equal(f.host.socketRoom.wireBudget.bytes, 0); assert.equal(f.guest.socketRoom.wireBudget.bytes, 0);
});

test('default gateway refuses experimental metadata; legacy/missing metadata stays compatible', async t => {
  const f = await fixture(t, { guestFactory: false });
  await assert.rejects(() => f.guest.select('join', ROOM), /实验传输/); assert.equal(f.guest.selected, null);
  delete f.data.sw_transport; await f.guest.select('join', ROOM); assert.equal(f.guest.socketRoom, null); assert.equal(f.guest.selected.transport, 'legacy-p2p');
});

test('unknown transport is rejected without probing or falling back', async t => {
  const f = await fixture(t); f.data.sw_transport = 'future-v999';
  await assert.rejects(() => f.guest.select('join', ROOM), /不兼容/); assert.equal(f.legacyCalls(), 0); assert.equal(f.guest.selected, null);
});

test('default-created rooms explicitly advertise legacy and do not import/construct a socket room', async t => {
  const f = await fixture(t, { factory: false }); assert.equal(f.data.sw_transport, 'legacy-p2p'); assert.equal(f.host.socketRoom, null);
});

test('wire build mismatch closes before relay admission', async t => {
  const f = await fixture(t); f.guest.build = 'wrong'; f.data.sw_build = 'wrong'; const b = await f.join(); f.tick(30);
  assert.equal(b.readyState, 3); assert.equal(f.room.peers.length, 1); assert.equal(f.f.links.filter(l => l.open).length, 0);
});

test('legacy failure and accept callbacks cannot affect a selected socket room', async t => {
  const f = await fixture(t), b = await f.ready();
  f.callbacks.get(HOST + ':6')({ remote: BigInt(GUEST) }); f.callbacks.get(GUEST + ':7')({ remote: BigInt(HOST), error: 4 });
  f.host.dispatch(GUEST, { connection: 'a'.repeat(32), op: 'open', data: {} }); f.tick(10);
  assert.equal(f.legacyCalls(), 0); assert.equal(f.host.peers.size, 0); assert.equal(b.readyState, 1);
});

test('pre-ready input is bounded by count and bytes; binary and malformed JSON are rejected', async t => {
  const f = await fixture(t); const first = await f.join({ hello: false });
  for (let i = 0; i < 33; i++) first.message({ type: 'hello' }); assert.equal(first.readyState, 3);
  const large = f.browser({ hello: false }); large.message({ type: 'hello', data: 'x'.repeat(65536) }); assert.equal(large.readyState, 3);
  const binary = f.browser({ hello: false }); binary.emit('message', Buffer.from('hello'), true); assert.equal(binary.closes[0].code, 1008);
  const malformed = f.browser({ hello: false }); malformed.emit('message', Buffer.from('{'), false); assert.equal(malformed.readyState, 3);
  f.tick(30); assert.equal(f.f.links.filter(l => l.open).length, 0); assert.equal(f.guest.socketRoom.diagnostics().preReadyBytes, 0);
});

test('one browser lease: duplicate tab rejected, disconnect/resume isolates old packets and callbacks', async t => {
  const f = await fixture(t), b = await f.ready(); const token = b.last('welcome').resumeToken;
  const oldLink = f.f.links.at(-1), duplicate = f.browser(); assert.equal(duplicate.closes[0].code, 4001);
  b.close(1001, 'reload'); f.tick(3); const next = f.browser({ resumeToken: token });
  // Stale native notices and payloads must not close/feed the new ticket.
  f.f.ends.get(GUEST).notices.unshift({ type: 'disconnected', ticket: oldLink.gt });
  f.f.ends.get(GUEST).inbox.push({ ticket: oldLink.gt, kind: 'control', data: Buffer.alloc(64) });
  f.tick(30); assert.equal(next.last('welcome').resumed, true); assert.equal(f.room.peers.length, 2); assert.equal(next.readyState, 1);
  b.emit('error', Error('late old websocket error')); b.emit('close', 1001, Buffer.from('late')); f.tick(5); assert.equal(next.readyState, 1);
  assert.ok(f.guest.socketRoom.stats.staleTickets > 0);
});

test('slow renderer skips latest-only state instead of accumulating a second frontend queue; callback error disconnects', async t => {
  const f = await fixture(t), b = await f.ready(); f.start(b); b.hold = true;
  f.hb.message(f.state(1)); f.tick(30); assert.equal(b.last('state').seq, 1);
  for (let seq = 2; seq <= 12; seq++) { f.hb.message(f.state(seq)); f.tick(4); }
  assert.equal(b.messages.filter(m => m.type === 'state').length, 1); assert.ok(f.guest.socketRoom.stats.skippedBrowserStates > 0);
  const done = b.callbacks.find(fn => typeof fn === 'function'); assert.ok(done); done(Error('renderer closed'));
  f.tick(5); assert.equal(b.readyState, 3); assert.equal(f.f.links.filter(l => l.open).length, 0);
});

test('browser send stalls retain the fixed eight-second guard even when wire heartbeats are healthy', async t => {
  const f = await fixture(t), b = await f.ready(); f.start(b); b.hold = true;
  f.hb.message(f.state(1)); f.tick(30); for (let i = 0; i < 1100; i++) f.tick();
  assert.equal(b.readyState, 3); assert.equal(b.closes.at(-1).code, 1013);
});

test('only matched remote heartbeat pongs keep relay alive, not local SDK admission or peer.ping()', async t => {
  const f = await fixture(t), b = await f.ready(), p = f.room.peers[1], before = p.lastPong;
  p.ws.ping(); assert.equal(p.lastPong, before); f.tick(150); assert.ok(p.lastPong > before);
  f.f.filter = packet => socketWireHeader(packet.kind, packet.data).op !== 'pong';
  const last = p.lastPong; f.tick(1100); assert.equal(p.lastPong, last); assert.equal(b.readyState, 3);
});

test('relay kick/version close reaches browser with the exact code/reason and drains native ownership', async t => {
  const f = await fixture(t), b = await f.join({ hello: false }); f.tick(8);
  b.message({ type: 'hello', protocol: 0, build: BUILD, name: 'bad', instance: 'bad' }); f.tick(30);
  assert.equal(b.last('error').code, 'VERSION'); assert.deepEqual(b.closes.at(-1), { code: 1008, reason: 'Version mismatch' });
  f.tick(280); assert.equal(f.f.links.filter(l => l.open).length, 0); assert.equal(f.host.socketRoom.records.size, 0);
});

test('lobby member removal, owner migration and explicit leave close owned sessions with zero wire retention', async t => {
  const f = await fixture(t), b = await f.ready(); f.members.delete(GUEST); f.tick(10);
  assert.equal(b.readyState, 3); assert.equal(f.host.socketRoom.records.size, 0);
  f.changeOwner(GUEST); const room = f.host.socketRoom; f.host.poll();
  assert.equal(f.host.selected, null); assert.equal(room.closed, true); assert.equal(room.wireBudget.bytes, 0); assert.equal(f.legacyCalls(), 0);
});

test('old snapshot delivered after ended or a new match cannot resurrect the previous game', async t => {
  const f = await fixture(t), b = await f.ready(); const matchId = f.start(b);
  f.hb.message(f.state(1)); f.tick(30); const saved = [];
  f.f.filter = packet => { if (packet.from === HOST && packet.kind === 'snapshot') { saved.push(packet); return false; } return true; };
  f.hb.message(f.state(2)); f.tick(15); assert.ok(saved.length);
  f.hb.message({ type: 'end', matchId }); f.tick(15); const endedAt = b.messages.length;
  f.f.ends.get(GUEST).inbox.push(...saved); f.tick(15); assert.equal(b.messages.slice(endedAt).filter(m => m.type === 'state').length, 0);
  f.f.filter = () => true; f.start(b); f.hb.message(f.state(1)); f.tick(30); assert.equal(b.last('state').matchId, f.room.match.id); assert.notEqual(f.room.match.id, matchId);
});

test('native backpressure coalesces adjacent unsent movement, but never drops actions/sync barriers', async t => {
  const f = await fixture(t), b = await f.ready(); const record = f.guest.socketRoom.records.get(HOST), received = [];
  f.room.peers[1].ws.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'input') received.push(m); });
  const input = (seq, actions = [], syncId = 'one') => ({ type: 'input', matchId: 'test-match', syncId,
    input: { seq, keys: seq % 8, firing: false, pointerActive: true, aim: [seq, 0], actions } });
  f.f.policy = p => p.from === GUEST ? { status: 'backpressure' } : { status: 'accepted' };
  for (let i = 0; i < 120; i++) { b.message(input(i)); if (i % 4 === 0) f.tick(); }
  b.message(input(120, [{ id: 1, kind: 'system' }]));
  for (let i = 121; i < 140; i++) b.message(input(i));
  b.message(input(140, [], 'two')); b.message(input(141, [], 'two'));
  assert.equal(b.readyState, 1); assert.ok(record.session.controls.length < 8, JSON.stringify(record.session.controls.map(c=>({op:c.frame.op,coalesce:c.coalesce,started:c.startedAt})))); assert.ok(record.session.stats.coalescedControls >= 130);
  f.f.policy = () => ({ status: 'accepted' }); f.tick(30);
  assert.deepEqual(received.map(m => m.input.seq), [119, 120, 139, 141]);
  assert.deepEqual(received[1].input.actions, [{ id: 1, kind: 'system' }]); assert.equal(received[3].syncId, 'two');
});

test('terminal control stops unsent state without abandoning a partly admitted reliable anchor', async t => {
  const f = await fixture(t), b = await f.ready(); const matchId = f.start(b);
  let n = 81; const ballast = Array.from({ length: 90000 }, () => String.fromCharCode(33 + ((n = Math.imul(n, 1664525) + 1013904223 >>> 0) % 89))).join('');
  f.hb.message(f.state(1, ballast));
  const record = f.host.socketRoom.records.get(GUEST);
  for (let i = 0; i < 20 && record.session.stateJob?.startedAt == null; i++) f.tick();
  assert.ok(record.session.stateJob?.index > 0); assert.equal(record.session.stateJob.frame.kind, 'anchor');
  f.hb.message({ type: 'end', matchId }); f.tick(100);
  assert.equal(b.last('ended').matchId, matchId); assert.equal(b.last('state'), undefined);
  assert.equal(record.session.awaitingReliable, null); assert.equal(f.guest.socketRoom.wireBudget.bytes, 0);
  f.tick(1100); assert.equal(b.readyState, 1); assert.equal(record.session.state, 'ready');
});

test('transport metadata edits do not switch an established room or reopen legacy networking', async t => {
  const f = await fixture(t), b = await f.ready(); const room = f.host.socketRoom;
  f.data.sw_transport = 'legacy-p2p'; f.tick(30);
  assert.equal(f.host.socketRoom, room); assert.equal(b.readyState, 1); assert.equal(f.legacyCalls(), 0);
});

test('a native room fault closes owned browser/session once and cannot trigger fallback', async t => {
  const f = await fixture(t), b = await f.ready(), room = f.guest.socketRoom;
  f.f.ends.get(GUEST).notices.push({ type: 'error', reason: 'ownership-uncertain' }); f.tick(10);
  assert.equal(room.closed, true); assert.equal(b.closes.length, 1); assert.equal(room.records.size, 0); assert.equal(room.wireBudget.bytes, 0);
  assert.equal(f.legacyCalls(), 0); assert.equal(f.guest.socketRoom, room);
});

test('host broadcast preparation is shared without sharing per-peer anchors, framing or cache ownership',()=>{
 const life={open(){},connect(){},poll(){return [];},receive(){return [];},send(){return {status:'accepted'};},sample(){return {available:false};},disconnect(){return true;},close(){}};
 const room=new SteamSocketRoom({lifecycle:life,localId:HOST,ownerId:HOST,scope:ROOM,build:BUILD,now:()=>0,allowed:()=>true,isCurrent:()=>true,acceptTransport(){}});
 room.add({handle:1,lease:'1',remote:GUEST,scope:ROOM},0);room.add({handle:2,lease:'2',remote:'76561198000000003',scope:ROOM},0);
 const [a,b]=[...room.records.values()].map(r=>r.session);assert.equal(a.encoder,b.encoder);assert.equal(a.codec,b.codec);assert.notEqual(a.sender,b.sender);assert.notEqual(a.localNonce,b.localNonce);
 const text=JSON.stringify({type:'state',matchId:'cache',seq:1,frame:{tick:1,moving:Array.from({length:100},(_,i)=>({x:Math.sin(i),y:Math.cos(i)}))}});
 const first=a.encoder.prepare(text,a.codec),count=room.codec.packedPreparations;for(let i=0;i<9;i++)assert.equal(b.encoder.prepare(text,b.codec),first);
 assert.equal(count,1);assert.equal(room.codec.packedPreparations,count);a.close();assert.equal(room.encoder.current,first);assert.notEqual(room.codec.packedCache,null);
 room.close();assert.equal(room.encoder.current,null);assert.equal(room.codec.cache,null);assert.equal(room.codec.packedCache,null);assert.equal(room.wireBudget.bytes,0);
});
