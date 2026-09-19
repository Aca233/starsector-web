import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlowCounters, publicAuthorityPerformance } from '../src/network/SnapshotFlow.mjs';
import { countSnapshotStage, acceptAuthorityPerformance, snapshotPipelineMetrics } from '../server/SnapshotPipelineMetrics.mjs';
import { createLanServer } from '../server/lan-server.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const sample = () => ({ tick: 80, simulationMs: 3, captureMs: 4, encodeMs: 2, callbackGapMs: 1, backlogMs: 0,
  flow: { windowMs: 1000, rates: { simulated: 60, produced: 20, blocked: 160 } } });
function roomFixture() {
  const host = { id: 'private-host', seat: 0, stateCredits: {} }, guest = { id: 'private-guest', seat: 1, stateCredits: {} };
  const room = { status: 'running', match: { id: 'private-match' }, hostId: host.id, peers: [host, guest] };
  for (const p of room.peers) p.room = room;
  return { room, host, guest };
}

test('interval rates warm up, stay detached, measure above target and count actual zero', () => {
  const c = new FlowCounters(['produced'], 0);
  c.count('produced', 85); assert.equal(c.sample(999).rates.produced, null);
  const s = c.sample(1000); assert.equal(s.rates.produced, 85); s.rates.produced = -1;
  assert.equal(c.sample(1200).rates.produced, 85); assert.equal(c.sample(2000).rates.produced, 0);
  assert.throws(() => c.count('nope')); for (const n of [-1, NaN, Infinity, 0.5]) assert.throws(() => c.count('produced', n));
});
test('suspension and reset/backwards clocks produce unknown rather than misleading low Hz', () => {
  const c = new FlowCounters(['a'], 0); c.count('a', 60);
  assert.equal(c.sample(6000).rates.a, null); c.count('a', 30); assert.equal(c.sample(7000).rates.a, 30);
  assert.equal(c.sample(10).rates.a, null); c.reset(20); assert.equal(c.sample(1019).rates.a, null);
  assert.throws(() => c.sample(NaN));
});
test('authority allowlist detaches nested rates, strips identity and rejects non-finite/oversized measurements', () => {
  const v = sample(); v.token = 'secret'; v.flow.rates.token = 'secret'; const s = publicAuthorityPerformance(v);
  assert.ok(!JSON.stringify(s).includes('secret')); v.flow.rates.produced = 1; assert.equal(s.flow.rates.produced, 20);
  for (const v of [null, [], {}, { ...sample(), tick: -1 }, { ...sample(), captureMs: Infinity }, { ...sample(), backlogMs: 300001 },
    { ...sample(), flow: { windowMs: 1000, rates: { ...sample().flow.rates, produced: -1 } } }]) assert.equal(publicAuthorityPerformance(v), null);
  const warm = sample(); warm.flow = { windowMs: null, rates: { simulated: null, produced: null, blocked: null } };
  assert.deepEqual(publicAuthorityPerformance(warm), warm);
});
test('only current running authority can report; guests, old matches and stale probes do not overwrite it', () => {
  const { host, guest, room } = roomFixture(); const probe = { matchId: room.match.id, ageMs: 10, performance: sample() };
  assert.equal(acceptAuthorityPerformance(host, probe, 0), true);
  for (const p of [guest, { ...host, id: 'intruder' }]) assert.equal(acceptAuthorityPerformance(p, probe, 0), false);
  for (const p of [{ ...probe, matchId: 'old' }, { ...probe, ageMs: 5001 }, { ...probe, ageMs: NaN }, { ...probe, performance: {} }]) assert.equal(acceptAuthorityPerformance(host, p, 0), false);
  assert.equal(snapshotPipelineMetrics(guest, 100).authority.performance.tick, 80);
  room.status = 'loading'; assert.equal(acceptAuthorityPerformance(host, probe, 0), false); assert.equal(snapshotPipelineMetrics(host, 0), null);
});
test('stage rates distinguish ingress, queue, socket skips, credit skips and exact consumption', () => {
  const { host, guest } = roomFixture(); snapshotPipelineMetrics(host, 0);
  for (let i = 0; i < 60; i++) countSnapshotStage(host, 'received', 10);
  for (let i = 0; i < 20; i++) countSnapshotStage(guest, 'queued', 20);
  for (let i = 0; i < 30; i++) countSnapshotStage(guest, 'skippedSocket', 20);
  for (let i = 0; i < 10; i++) countSnapshotStage(guest, 'skippedCredit', 20);
  countSnapshotStage(guest, 'consumed', 20);
  const d = snapshotPipelineMetrics(guest, 1000);
  assert.equal(d.ingress.rates.received, 60); assert.deepEqual(d.receivers[0].stages.rates, { received: 0, queued: 20, skippedSocket: 30, skippedCredit: 10, consumed: 1 });
  assert.equal(d.role, 'guest'); assert.equal(d.receivers.length, 1); assert.equal(d.receivers[0].consumptionCredits, true);
});
test('authority expiry, match change, reconnected objects and unsupported Steam consumption stay distinct', () => {
  const { room, host, guest } = roomFixture(); acceptAuthorityPerformance(host, { matchId: room.match.id, ageMs: 500, performance: sample() }, 0);
  const stale = snapshotPipelineMetrics(guest, 4501).authority; assert.equal(stale.stale, true); assert.equal(stale.performance, null);
  countSnapshotStage(guest, 'queued', 4501); room.match.id = 'new'; const fresh = snapshotPipelineMetrics(guest, 5000);
  assert.equal(fresh.authority, null); assert.equal(fresh.receivers[0].stages.rates.queued, null);
  const reconnected = { ...guest, stateCredits: null }; assert.equal(snapshotPipelineMetrics(reconnected, 6000).receivers[0].stages.rates.queued, null);
  assert.equal(snapshotPipelineMetrics(reconnected, 6000).receivers[0].consumptionCredits, false);
});
test('bounded host report and guest-only report do not expose identity, match, credentials or other guests', () => {
  const { room, host, guest } = roomFixture();
  room.peers.push(...Array.from({ length: 30 }, (_, i) => ({ room, seat: i + 2, id: `private-${i}`, token: 'private-token' })));
  room.peers[2].disconnected = true; const h = snapshotPipelineMetrics(host, 0), g = snapshotPipelineMetrics(guest, 0);
  assert.equal(h.receivers.length, 9); assert.ok(h.receivers.every(r => r.seat !== 2)); assert.equal(g.receivers.length, 1);
  assert.ok(!JSON.stringify(h).includes('private')); assert.ok(JSON.stringify(h).length < 4096);
});

class MemoryServer extends EventEmitter { listen(_p, _h, cb) { cb(); } address() { return { port: 32110 }; } close(cb) { cb(); } }
class MemorySocket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; rows = []; extensions = 'permessage-deflate';
  send(data) { this.rows.push(JSON.parse(String(data))); } ping() {}
  receive(m) { this.emit('message', Buffer.from(JSON.stringify(m)), false); }
  close() { this.readyState = 3; this.emit('close', 1000); } terminate() { this.close(); }
}
for (const mode of ['lan', 'steam']) test(`production ${mode} relay piggybacks metrics without relaxing snapshot gates or consuming false ACKs`, async t => {
  const dist = mkdtempSync(join(tmpdir(), 'pipeline-test-')); writeFileSync(join(dist, 'lan-build.json'), JSON.stringify({ build: 'pipeline-test' }));
  const stub = t.mock.method(http, 'createServer', () => new MemoryServer());
  let now = 100, relay; const clock = t.mock.method(performance, 'now', () => now);
  try {
    relay = await createLanServer({ dist, host: '127.0.0.1', port: 32110 }); stub.mock.restore();
    const client = identity => { const ws = new MemorySocket(); relay.acceptTransport(ws, mode === 'steam' ? { canHost: true, scope: 'fixture', identity } : null);
      ws.receive({ type: 'hello', name: 'Player', instance: identity, build: 'pipeline-test', protocol: protocol.version, stateCredits: 1 });
      assert.ok(ws.rows.some(m => m.type === 'welcome')); return ws; };
    const host = client('host'), guest = client('guest'); host.receive({ type: 'create', password: '' }); const room = [...relay.rooms.values()][0];
    guest.receive({ type: 'join', code: room.code, password: '' }); guest.receive({ type: 'ready', ready: true }); host.receive({ type: 'start' });
    for (const ws of [host, guest]) ws.receive({ type: 'loaded', matchId: room.match.id }); assert.equal(room.status, 'running');
    const probe = { matchId: room.match.id, ageMs: 0, performance: sample() };
    host.receive({ type: 'ping', sent: 1, authority: probe });
    let seq = 0; const state = () => { seq++; host.receive({ type: 'state', matchId: room.match.id, seq,
      frame: { tick: seq, ships: [{ id: 'a', state: { teamId: 0 } }, { id: 'b', state: { teamId: 1 } }], crafts: [], craftSpecs: [], world: {} } }); };
    state(); for (const [i, ws] of [host, guest].entries()) ws.receive({ type: 'sync-ready', matchId: room.match.id, syncId: room.peers[i].sync.id, tick: seq });
    state(); state(); // LAN fills its 2-credit window, Steam has no LAN consumption window.
    guest.receive({ type: 'state-consumed', matchId: room.match.id, seq: 999 });
    if (mode === 'lan') assert.equal(room.peers[1].stateCredits.stats().inflight, 2);
    guest.bufferedAmount = 1; state();
    now = 1100; guest.receive({ type: 'ping', sent: 2, authority: { ...probe, performance: { ...sample(), tick: 999 } } });
    const pong = guest.rows.at(-1), d = pong.snapshotPipeline;
    assert.equal(pong.type, 'pong'); assert.equal(d.ingress.rates.received, 4); assert.equal(d.authority.performance.tick, 80);
    assert.equal(d.receivers[0].stages.rates.skippedSocket, 1); assert.equal(d.receivers[0].consumptionCredits, mode === 'lan');
    assert.equal(d.receivers[0].stages.rates.queued, mode === 'lan' ? 2 : 3);
    assert.equal(d.receivers[0].stages.rates.skippedCredit, mode === 'lan' ? 1 : 0);
    assert.equal(d.receivers[0].stages.rates.consumed, 0);
    guest.receive({ type: 'input', matchId: room.match.id, syncId: room.peers[1].sync.id, input: { seq: 1, keys: 1, aim: [0, 0], firing: false, pointerActive: false, actions: [] } });
    assert.ok(host.rows.some(m => m.type === 'input' && m.input.seq === 1));
    guest.bufferedAmount = 0; guest.receive({ type: 'state-consumed', matchId: room.match.id, seq: 2 });
    now = 2100; guest.receive({ type: 'ping', sent: 3 }); assert.equal(guest.rows.at(-1).snapshotPipeline.receivers[0].stages.rates.consumed, mode === 'lan' ? 1 : 0);
    if (mode === 'steam') assert.equal(pong.lanTransport, undefined);
  } finally { stub.mock.restore(); clock.mock.restore(); if (relay) await relay.close(); unlinkSync(join(dist, 'lan-build.json')); rmdirSync(dist); }
});

const clientCode = (await build({ entryPoints: ['src/network/protocol.ts'], bundle: true, platform: 'browser', format: 'cjs', write: false, define: { __LAN_BUILD_ID__: '"test"' } })).outputFiles[0].text;
function connectionFixture(transport = 'lan') {
  const sockets = [], timers = new Map(), intervals = new Map(); let now = 100, id = 0;
  const document = new EventTarget(); document.visibilityState = 'visible';
  class Socket { static OPEN = 1; readyState = 1; bufferedAmount = 0; sent = []; constructor() { sockets.push(this); } send(m) { this.sent.push(JSON.parse(m)); } close() { this.readyState = 3; } }
  const module = { exports: {} };
  vm.runInNewContext(clientCode, { module, exports: module.exports, WebSocket: Socket, EventTarget, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, URL, DOMException, document,
    crypto: { getRandomValues: a => a.fill(7) }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => now },
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: i => timers.delete(i), setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: i => intervals.delete(i) });
  const c = new module.exports.LanConnection(transport); c.connect('ws://127.0.0.1/lan/ws', 'test'); const ws = sockets[0]; ws.onopen();
  const receive = m => ws.onmessage({ data: JSON.stringify(m) }); receive({ type: 'welcome', resumeToken: 'a'.repeat(64) });
  for (const fn of intervals.values()) fn();
  return { c, ws, receive, document, now: n => { now = n; }, heartbeat: () => [...intervals.values()].forEach(fn => fn()), lastPing: () => ws.sent.findLast(m => m.type === 'ping') };
}
for (const mode of ['lan', 'steam']) test(`${mode} client sends only small allowed authority fields and accepts matching pong`, () => {
  const f = connectionFixture(mode); f.receive({ type: 'pong', sent: f.lastPing().sent });
  const s = sample(); s.token = 'secret'; f.c.recordAuthorityPerformance('match', s); s.flow.rates.produced = 1;
  f.now(1100); f.heartbeat(); const p = f.lastPing(); assert.equal(p.authority.performance.flow.rates.produced, 20); assert.ok(!JSON.stringify(p).includes('secret')); assert.ok(JSON.stringify(p).length < 512);
  f.receive({ type: 'pong', sent: -1, snapshotPipeline: { version: 1 } }); assert.equal(f.c.snapshotPipelineAt, null);
  f.now(1250); f.receive({ type: 'pong', sent: p.sent, snapshotPipeline: { version: 1 } }); assert.equal(f.c.snapshotPipelineAt, 1250); assert.equal(f.c.snapshotPipelineRoundTripMs, 150);
  f.c.clearAuthorityPerformance('other'); f.now(2200); f.heartbeat(); assert.ok(f.lastPing().authority);
  f.receive({ type: 'pong', sent: f.lastPing().sent }); assert.equal(f.c.snapshotPipelineAt, null); // Old server.
  f.c.clearAuthorityPerformance('match'); f.now(3300); f.heartbeat(); assert.equal(f.lastPing().authority, undefined); f.c.close();
});
test('client upload congestion skips probe; stale authority omitted; no extra heartbeat or snapshot sends', () => {
  const f = connectionFixture(); f.receive({ type: 'pong', sent: f.lastPing().sent }); f.c.recordAuthorityPerformance('match', sample());
  const n = f.ws.sent.length; f.ws.bufferedAmount = 16385; f.now(1100); f.heartbeat(); assert.equal(f.ws.sent.length, n);
  f.ws.bufferedAmount = 0; f.now(6200); f.heartbeat(); assert.equal(f.lastPing().authority, undefined); assert.equal(f.ws.sent.length, n + 1); f.c.close();
});
test('client match/visibility epochs reject delayed old reports without interfering with RTT', () => {
  const f = connectionFixture(); const old = f.lastPing(); f.c.recordAuthorityPerformance('old', sample()); f.receive({ type: 'match', match: { id: 'new' } });
  f.now(200); f.receive({ type: 'pong', sent: old.sent, snapshotPipeline: { version: 1 } }); assert.equal(f.c.snapshotPipelineAt, null); assert.equal(f.c.rttMs, 100);
  f.now(1100); f.heartbeat(); assert.equal(f.lastPing().authority, undefined);
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'));
  f.receive({ type: 'pong', sent: f.lastPing().sent, snapshotPipeline: { version: 1 } }); assert.equal(f.c.snapshotPipelineAt, null); f.c.close();
});
test('client reconnect and end clear diagnostics and old authority, even before a new snapshot arrives', () => {
  const f = connectionFixture(); f.receive({ type: 'pong', sent: f.lastPing().sent, snapshotPipeline: { version: 1 } }); f.c.recordAuthorityPerformance('match', sample());
  f.receive({ type: 'ended' }); assert.equal(f.c.snapshotPipelineAt, null); f.now(1100); f.heartbeat(); assert.equal(f.lastPing().authority, undefined);
  f.receive({ type: 'pong', sent: f.lastPing().sent, snapshotPipeline: { version: 1 } });
  f.c.connect('ws://127.0.0.1/lan/ws', 'test'); assert.equal(f.c.snapshotPipelineAt, null); assert.equal(f.c.snapshotPipeline, null); f.c.close();
});

const uiCode = (await build({ entryPoints: ['src/network/SnapshotPipelineDiagnostics.tsx'], bundle: true, jsx: 'automatic', platform: 'node', format: 'cjs', packages: 'external', write: false })).outputFiles[0].text;
const uiModule = { exports: {} }; vm.runInNewContext(uiCode, { module: uiModule, exports: uiModule.exports, require: createRequire(import.meta.url) });
const render = (pipeline, ageMs = 0) => renderToStaticMarkup(createElement(uiModule.exports.SnapshotPipelineDiagnostics, { pipeline, ageMs, receivedHz: 20, appliedHz: 18 }));
const report = () => ({ version: 1, authority: { performance: sample(), knownAgeMs: 0, stale: false }, receivers: [{ seat: 1, consumptionCredits: false, stages: { rates: {} } }] });
test('UI unknown/legacy/malformed metrics never fabricate zero or render NaN/Infinity', () => {
  for (const value of [null, 42, [], {}, { ...report(), version: 2 }, { ...report(), receivers: [null, { seat: NaN }] }]) {
    const html = render(value, NaN); assert.ok(html.includes('未知')); assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity')); assert.ok(!html.includes('房主产出 0.0'));
  }
  const html = render(report()); assert.ok(html.includes('接收端 1：')); assert.ok(html.includes('消费回执 未启用')); assert.ok(html.includes('本端还原 18.0'));
});
test('UI suppresses expired source separately from heartbeat and bounds receiver rows', () => {
  assert.ok(render(report()).includes('房主产出 20.0'));
  assert.ok(render(report(), 5001).includes('房主产出 未知'));
  const d = report(); d.authority.knownAgeMs = 4800; assert.ok(render(d, 300).includes('房主产出 未知'));
  d.authority.stale = true; d.authority.knownAgeMs = 0; assert.ok(render(d).includes('房主产出 未知'));
  d.receivers = Array(100).fill(d.receivers[0]); assert.equal((render(d).match(/接收端 1：/g) ?? []).length, 9);
});
