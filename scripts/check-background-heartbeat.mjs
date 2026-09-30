/** Regression: application heartbeat suspension + real relay watchdogs.
 * node scripts/check-background-heartbeat.mjs
 * Optional real Chromium freeze check: --browser (Playwright on NODE_PATH).
 * Uses an isolated loopback server/profile, never an existing room or save. */
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { WebSocket } from 'ws';
import { Worker } from 'node:worker_threads';
import { LanStateCredits } from '../server/LanStateCredits.mjs';
import { createLanServer } from '../server/lan-server.mjs';
import config from '../src/network/protocol.json' with { type: 'json' };

const bundle = (await build({
  stdin: { contents: 'export { LanConnection } from "./src/network/protocol.ts"; export { PresentationReceipts } from "./src/network/PresentationReceipts.ts"; export { HostRecoveryBudget } from "./src/network/SnapshotPolicy.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'LanTest', platform: 'browser',
  define: { __LAN_BUILD_ID__: JSON.stringify('background-test') },
})).outputFiles[0].text;

function client(hidden = false, negotiated = {}) {
  let now = 100, nextTimer = 0;
  const timers = new Map(), listeners = new Set(), sockets = [], events = [];
  const document = {
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener(type, fn) { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'visibilitychange') listeners.delete(fn); },
  };
  class Socket {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    messages = [];
    constructor() { sockets.push(this); }
    send(data) { this.messages.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  }
  const context = vm.createContext({
    console, URL, DOMException, EventTarget, ArrayBuffer, Uint8Array, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto, document, WebSocket: Socket,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => now }, Date: class extends Date { static now() { return now; } },
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms, interval: true }); return id; },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms, interval: false }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
  });
  vm.runInContext(bundle, context);
  const connection = new context.LanTest.LanConnection();
  connection.subscribe(m => events.push(m));
  function welcome(extra = {}) {
    const socket = sockets.at(-1);
    socket.onopen();
    socket.receive({ type: 'welcome', resumeToken: 'a'.repeat(64), ...extra });
    return socket;
  }
  connection.connect('ws://localhost/lan/ws', 'test');
  const socket = welcome(negotiated);
  return {
    connection, socket, sockets, events, listeners, timers, welcome, Receipts: context.LanTest.PresentationReceipts, policy: context.LanTest.HostRecoveryBudget,
    advance(ms) { now += ms; },
    heartbeat() { for (const t of [...timers.values()]) if (t.interval && t.ms === 1000) t.fn(); },
    visibility(value, dispatch = true) {
      document.visibilityState = value ? 'hidden' : 'visible';
      if (dispatch) for (const fn of listeners) fn();
    },
  };
}

test('foreground silence still reconnects after 10 seconds', () => {
  const c = client();
  c.advance(11000); c.heartbeat();
  assert.equal(c.connection.ready, false);
  assert.equal(c.events.at(-1).type, 'reconnecting');
});
test('hidden page keeps its socket and bounds outstanding probes', () => {
  const c = client();
  c.visibility(true); c.advance(1000); c.heartbeat();
  for (let i = 0; i < 6; i++) { c.advance(60000); c.heartbeat(); }
  assert.equal(c.connection.socket, c.socket);
  assert.equal(c.connection.ready, true);
  assert.equal(c.socket.messages.filter(m => m.type === 'ping').length, 1);
  assert.equal(c.events.some(m => m.type === 'reconnecting'), false);
});
test('foreground return probes afresh, ignores old pong, then detects a real outage', () => {
  const c = client();
  c.advance(1000); c.heartbeat();
  const old = c.socket.messages.at(-1);
  c.visibility(true); c.advance(120000); c.visibility(false);
  const fresh = c.socket.messages.at(-1);
  assert.equal(fresh.type, 'ping'); assert.notEqual(fresh.sent, old.sent);
  c.socket.receive({ type: 'pong', sent: old.sent });
  assert.equal(c.connection.rttMs, null);
  c.advance(9000); c.heartbeat(); assert.equal(c.connection.ready, true);
  c.advance(1001); c.heartbeat(); assert.equal(c.connection.ready, false);
});
test('fresh foreground pong restores connection without counting background time as RTT', () => {
  const c = client(true);
  c.advance(1000); c.heartbeat();
  const old = c.socket.messages.at(-1);
  c.advance(120000); c.socket.receive({ type: 'pong', sent: old.sent });
  assert.equal(c.connection.rttMs, null);
  c.visibility(false);
  const fresh = c.socket.messages.at(-1);
  c.advance(25); c.socket.receive({ type: 'pong', sent: fresh.sent });
  assert.equal(c.connection.rttMs, 25);
  c.heartbeat(); assert.equal(c.connection.ready, true);
});
test('first resumed timer handles a queued visibility event before checking timeout', () => {
  const c = client();
  c.visibility(true); c.advance(120000);
  c.visibility(false, false); c.heartbeat();
  assert.equal(c.connection.ready, true);
  assert.equal(c.events.at(-1).hidden, false);
  c.visibility(false); // Delayed duplicate cannot reset the foreground grace again.
  c.advance(11000); c.heartbeat();
  assert.equal(c.connection.ready, false);
});
test('real transport closure is not exempt while hidden; 30-second deadline remains', () => {
  const c = client(true);
  c.socket.onclose({ code: 1006 });
  assert.equal(c.events.at(-1).type, 'reconnecting');
  const retry = [...c.timers.entries()].find(([,t]) => !t.interval);
  c.timers.delete(retry[0]); retry[1].fn();
  c.advance(config.reconnectMs + 1);
  c.sockets.at(-1).onclose({ code: 1006 });
  assert.equal(c.events.at(-1).type, 'disconnected');
});
test('visibility listeners are removed on close and not duplicated on reuse', () => {
  const c = client();
  c.connection.close(false, false);
  assert.equal(c.listeners.size, 0); assert.equal(c.timers.size, 0);
  c.connection.connect('ws://localhost/lan/ws', 'test'); c.welcome();
  assert.equal(c.listeners.size, 1);
  c.connection.close(); assert.equal(c.listeners.size, 0);
});
test('background Worker gaps do not consume overload budget, but limits remain', () => {
  const { policy: Policy } = client();
  const p = new Policy();
  for (let i = 0; i < 5; i++) assert.equal(p.allow(1000 + i, 120000, true), true);
  assert.equal(p.allow(10000, 2000), true);
  assert.equal(p.allow(11000, 2000), true);
  assert.equal(p.allow(12000, 2000), false);
  assert.equal(new Policy().allow(20000, config.backgroundGraceMs + 1, true), false);
  assert.equal(new Policy().allow(20000, 10001), false);
});


const testWorkers = new Set();
afterEach(() => { for (const dispose of testWorkers) dispose(); testWorkers.clear(); });
const workerBundle = (await build({
  stdin: {
    contents: fs.readFileSync('src/network/host.worker.ts', 'utf8') + '\nself.stepTest = step; self.inspectTestState = () => ({ controls, tick, running, accumulator }); self.setTestBacklog = n => { accumulator = n; }; self.installTestStepCost = ms => { const fixed = engine.fixedUpdate.bind(engine); engine.fixedUpdate = dt => { fixed(dt); self.consumeTestTime(ms); }; };',
    resolveDir: path.resolve('src/network'), loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { __LAN_BUILD_ID__: '"worker-test"', 'import.meta.url': '"http://localhost/worker.js"', 'import.meta.env': '{"BASE_URL":"/","VITE_LAN_AI_WORKERS":"false"}' },
})).outputFiles[0].text;
function hostWorker(hidden = true, binarySnapshots = false) {
  let now = 100, callback;
  const channels = [];
  class TestMessageChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
  const messages = [], self = { postMessage: m => messages.push(m), consumeTestTime: ms => { now += ms; } };
  // Same JS realm preserves the engine's strict plain-object definition checks.
  new Function('self', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'MessageChannel', workerBundle)(
    self, { now: () => now }, fn => (callback = fn, 1), () => { callback = null; }, () => 1, () => {}, TestMessageChannel,
  );
  const dispose = () => { self.onmessage({ data: { type: 'stop' } }); for (const c of channels) { c.port1.close(); c.port2.close(); } };
  testWorkers.add(dispose);
  const send = data => self.onmessage({ data });
  send({ type: 'init', hidden, binarySnapshots, match: {
    id: 'test', hostId: 'host', seed: 1, snapshotHz: 20,
    options: { aiHulls: [[], []], assignment: 'teams', battleSize: 400 },
    players: [{ id: 'host', seat: 0, team: 0, hull: 'onslaught', design: null }, { id: 'guest', seat: 1, team: 1, hull: 'onslaught', design: null }],
  } });
  assert(messages.some(m => m.type === 'ready'), JSON.stringify(messages));
  send({ type: 'snapshot-consumed', tick: 0 }); send({ type: 'start' });
  return { self, messages, send, async step(ms) { now += ms; if (callback) await self.stepTest(); }, state: () => self.inspectTestState() };
}
test('actual host Worker resumes a two-minute background gap without replaying controls or catching up minutes', async () => {
  const w = hostWorker();
  w.send({ type: 'presence', seat: 0, connected: true, online: true });
  w.send({ type: 'input', seat: 0, input: { seq: 1, keys: 1, aim: [1, 1], firing: true, pointerActive: true, actions: [{ id: 1, kind: 'vent' }] } });
  assert.equal(w.state().controls.get(0).queued.length, 1);
  await w.step(120000);
  const control = w.state().controls.get(0);
  assert.equal(control.online, false); assert.equal(control.input.keys, 0);
  assert.equal(control.input.firing, false); assert.equal(control.input.pointerActive, false);
  assert.equal(control.queued.length, 0); assert.equal(control.lastAction, 1);
  assert(w.messages.some(m => m.type === 'recovered'));
  for (let i = 0; i < 6; i++) await w.step(20);
  assert(w.state().tick > 0 && w.state().tick < 20);
  assert(w.messages.some(m => m.type === 'snapshot' && m.tick > 0));
  assert.equal(w.messages.some(m => m.type === 'error'), false);
  w.send({ type: 'stop' });
});
test('actual host Worker accepts foreground notification before the delayed timer, not a later foreground stall', async () => {
  const w = hostWorker();
  w.send({ type: 'visibility', hidden: false }); await w.step(120000);
  assert.equal(w.state().running, true);
  await w.step(12000);
  assert.equal(w.state().running, false);
  assert(w.messages.some(m => m.type === 'error'));
});
for (const gap of [120, 250, 500, 999, 1000, 1001, 2000]) {
  test('background timer throttled to ' + gap + 'ms keeps the actual Worker alive and publishing', async () => {
    const w = hostWorker();
    for (let i = 0; i < 12; i++) {
      await w.step(gap);
      for (const m of w.messages.slice(-3)) if (m.type === 'snapshot') w.send({ type: 'snapshot-consumed', tick: m.tick });
    }
    assert.equal(w.state().running, true, w.messages.filter(m => m.type === 'error').map(m => m.message).join('; '));
    assert(w.state().tick > 0 && w.state().tick <= 12 * 6, 'advance bounded normal physics batches, never chase suspended wall time');
    assert.equal(w.messages.filter(m => m.type === 'recovered').length, 1, 'no repeated sync reset during sustained throttling');
    assert(w.messages.some(m => m.type === 'snapshot' && m.tick > 0), 'must publish after recovery');
    w.send({ type: 'stop' });
  });
}
test('actual host Worker preserves ordinary computation cost while background-throttled', async () => {
  const w = hostWorker(); w.self.installTestStepCost(10);
  for (let i = 0; i < 30; i++) await w.step(500);
  assert.equal(w.state().running, true);
  assert.equal(w.messages.filter(m => m.type === 'recovered').length, 1);
  w.send({ type: 'stop' });
});
for (const idle of [4, 500]) test('actual host Worker rejects genuine slow physics with ' + idle + 'ms background idle', async () => {
  const w = hostWorker(); w.self.installTestStepCost(250);
  for (let i = 0; i < 60 && w.state().running; i++) await w.step(idle);
  assert.equal(w.state().running, false);
  assert(w.messages.some(m => m.type === 'error' && m.message.includes('持续过载')));
});
test('foreground resume clears pending background actions and returns to normal ticks', async () => {
  const w = hostWorker();
  await w.step(500); await w.step(500);
  w.send({ type: 'presence', seat: 0, connected: true, online: true });
  w.send({ type: 'input', seat: 0, input: { seq: 2, keys: 1, aim: [1, 1], firing: true, pointerActive: true, actions: [{ id: 2, kind: 'vent' }] } });
  w.send({ type: 'visibility', hidden: false }); await w.step(500);
  assert.equal(w.state().controls.get(0).input.firing, false);
  assert.equal(w.state().controls.get(0).queued.length, 0);
  const tick = w.state().tick;
  for (let i = 0; i < 10; i++) await w.step(20);
  assert.equal(w.state().running, true); assert(w.state().tick > tick);
  assert.equal(w.messages.filter(m => m.type === 'recovered').length, 2);
  w.send({ type: 'stop' });
});
test('five-minute hard cap still applies after a throttled period has already recovered', async () => {
  const w = hostWorker(); await w.step(500); await w.step(config.backgroundGraceMs + 1);
  assert.equal(w.state().running, false);
  assert(w.messages.some(m => m.type === 'error' && m.message.includes('5 分钟')));
});
test('actual host Worker rejects a background scheduler pause exceeding five minutes', async () => {
  const w = hostWorker(); await w.step(config.backgroundGraceMs + 1);
  assert.equal(w.state().running, false);
  assert(w.messages.some(m => m.type === 'error'));
});
test('actual host Worker still stops repeated physics backlog even when hidden', async () => {
  const w = hostWorker();
  for (let i = 0; i < 3; i++) { w.self.setTestBacklog(1000); await w.step(20); }
  assert.equal(w.messages.filter(m => m.type === 'recovered').length, 2);
  assert.equal(w.state().running, false);
  assert(w.messages.some(m => m.type === 'error'));
});

for (const binary of [false, true]) test('actual host Worker flow separates simulation from blocked publication (' + (binary ? 'LAN binary' : 'Steam JSON') + ')', async () => {
  const w = hostWorker(false, binary);
  // The engine and publication path are real; only scheduler time is simulated.
  // Withhold the decode credit: do not mistake healthy simulation for delivery.
  for (let i = 0; i < 600; i++) await w.step(4);
  let data = w.messages.findLast(m => m.type === 'performance').flow;
  assert.ok(data.rates.simulated >= 55, JSON.stringify(data));
  assert.ok(data.rates.produced <= 1, JSON.stringify(data));
  assert.ok(data.rates.blocked > 60, JSON.stringify(data));
  let acknowledged = 0;
  for (let i = 0; i < 750; i++) {
    const pending = w.messages.findLast(m => m.type === 'snapshot');
    if (pending.tick > acknowledged) { acknowledged = pending.tick; w.send({ type: 'snapshot-consumed', tick: pending.tick }); }
    await w.step(4);
  }
  data = w.messages.findLast(m => m.type === 'performance').flow;
  assert.ok(data.rates.simulated >= 55, JSON.stringify(data));
  assert.ok(data.rates.produced >= 55, JSON.stringify(data));
  assert.equal(data.rates.blocked, 0);
  assert.equal(w.messages.some(m => m.type === 'error'), false);
  w.send({ type: 'stop' });
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw Error('Condition timed out'); await delay(20); }
}
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starsector-heartbeat-test-'));
  fs.writeFileSync(path.join(dir, 'lan-build.json'), JSON.stringify({ build: 'background-test' }));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Isolated heartbeat test</title><script src="/client.js"></script>');
  fs.writeFileSync(path.join(dir, 'client.js'), bundle);
  const app = await createLanServer({ host: '127.0.0.1', port: 0, dist: dir });
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const sockets = [];
  async function connect(name, resumeToken) {
    let answerPings = true;
    const ws = new WebSocket(origin.replace('http', 'ws') + '/lan/ws', { origin, autoPong: false });
    ws.on('ping', data => { if (answerPings) ws.pong(data); });
    sockets.push(ws);
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const send = message => ws.send(JSON.stringify(message));
    send({ type: 'hello', protocol: config.version, build: 'background-test', name, instance: name, resumeToken });
    await until(() => messages.some(m => m.type === 'welcome'));
    let probe = 0;
    return { ws, messages, send, stopPongs() { answerPings = false; }, async flush() {
      const sent = ++probe; send({ type: 'ping', sent });
      await until(() => messages.some(m => m.type === 'pong' && m.sent === sent));
    } };
  }
  return { app, origin, connect, async close() {
    for (const ws of sockets) ws.terminate();
    await app.close();
    for (const name of ['lan-build.json', 'index.html', 'client.js']) fs.unlinkSync(path.join(dir, name));
    fs.rmdirSync(dir);
  } };
}

test('real relay: bounded host background grace, foreground recovery, and dead-peer cleanup', async t => {
  const f = await fixture();
  try {
    let host = await f.connect('host');
    host.send({ type: 'create' });
    await until(() => f.app.rooms.size === 1);
    const room = [...f.app.rooms.values()][0], peer = room.peers[0];
    const guest = await f.connect('guest');
    guest.send({ type: 'join', code: room.code }); await guest.flush();
    assert.equal(room.peers.length, 2);
    const running = age => {
      room.status = 'running'; room.lastState = Date.now() - age;
      room.recoveryUntil = 0; room.result = null;
      room.match = { id: 'background-match', players: [], options: { aiHulls: [[], []] } };
    };
    await t.test('invalid visibility is rejected', async () => {
      host.send({ type: 'visibility', hidden: 'yes' }); await host.flush();
      assert.equal(peer.background, false);
      assert(host.messages.some(m => m.type === 'error' && m.message.includes('可见')));
    });
    await t.test('a hidden guest cannot exempt a foreground host', async () => {
      guest.send({ type: 'visibility', hidden: true }); await guest.flush();
      running(13000); await until(() => room.status === 'ended');
      assert.match(room.reason, /12 秒/);
    });
    await t.test('hidden host survives more than 12 seconds without state', async () => {
      host.send({ type: 'visibility', hidden: true }); await host.flush();
      running(120000); await delay(1200);
      assert.equal(room.status, 'running');
    });
    await t.test('short network reconnect preserves the hidden host and its foreground recovery grace', async () => {
      const id = peer.id, token = host.messages.find(m => m.type === 'welcome').resumeToken;
      host.ws.terminate(); await until(() => peer.disconnected > 0);
      host = await f.connect('host', token);
      assert.equal(peer.id, id); assert.equal(peer.background, true);
      assert.equal(room.status, 'running');
    });
    await t.test('foreground return has bounded fresh-state grace; duplicate events do not renew it', async () => {
      host.send({ type: 'visibility', hidden: false }); await host.flush();
      const deadline = room.recoveryUntil;
      assert(deadline > Date.now() && deadline <= room.lastState + config.backgroundGraceMs);
      host.send({ type: 'visibility', hidden: false }); await host.flush();
      assert.equal(room.recoveryUntil, deadline);
      await delay(1100); assert.equal(room.status, 'running');
      room.recoveryUntil = Date.now() - 1;
      await until(() => room.status === 'ended');
    });
    await t.test('repeated hidden announcements do not extend the five-minute cap', async () => {
      host.send({ type: 'visibility', hidden: true }); await host.flush();
      running(config.backgroundGraceMs + 1);
      host.send({ type: 'visibility', hidden: true }); await host.flush();
      await until(() => room.status === 'ended');
      assert.match(room.reason, /5 分钟/);
    });
    await t.test('real socket heartbeat failure and session expiry still clean up a hidden host', async () => {
      host.stopPongs(); await delay(50);
      peer.lastPong = Date.now() - 16000;
      await until(() => peer.disconnected > 0);
      peer.disconnected = Date.now() - config.reconnectMs - 1;
      await until(() => f.app.rooms.size === 0);
    });
  } finally { await f.close(); }
});

if (process.argv.includes('--browser')) test('real Chromium: freeze a hidden page for 20 seconds, retain socket, then probe', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const f = await fixture();
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(f.origin);
    await page.evaluate(origin => {
      window.events = [];
      window.connection = new LanTest.LanConnection();
      connection.subscribe(m => events.push(m));
      connection.connect(origin.replace('http', 'ws') + '/lan/ws', 'browser');
    }, f.origin);
    await page.waitForFunction(() => connection.ready);
    // Inject hidden visibility, then actually freeze JS through CDP. Notify the
    // relay before suspension, as a normal visibilitychange handler would.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.originalSocket = connection.socket;
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await delay(20000);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => connection.rttMs !== null);
    const result = await page.evaluate(() => ({ sameSocket: originalSocket === connection.socket, ready: connection.ready, retried: events.some(m => m.type === 'reconnecting'), rtt: connection.rttMs }));
    assert.equal(result.sameSocket, true); assert.equal(result.ready, true); assert.equal(result.retried, false);
    assert(result.rtt < 10000);
  } finally { await browser.close(); await f.close(); }
});

// Explicit consumption contracts for the actual LanConnection. These scoped
// tests never run the older authority/input fixtures above.
const receiptState = (seq, extra = {}) => ({ type: 'state', matchId: 'receipt-match', seq,
  frame: { tick: seq, ships: [], world: { combatTime: seq / 60 } }, ...extra });
const stateAcks = c => c.socket.messages.filter(m => m.type === 'state-consumed').map(m => m.seq);
function receiptTimeout(c, ms) {
  const entry = [...c.timers].find(([, value]) => !value.interval && value.ms === ms);
  assert.ok(entry, 'Expected receipt timer ' + ms); c.timers.delete(entry[0]); entry[1].fn();
}

test('presentation receipt: synchronous retention is explicit, after all listeners, with no timer', () => {
  const c = client(false, { stateCredits: 1 }), timers = c.timers.size, stages = [];
  const unsubscribe = c.connection.subscribe((m, receipt) => {
    if (m.type !== 'state') return;
    assert.equal(receipt.complete('consumed'), true); stages.push('retained');
    assert.deepEqual(stateAcks(c), []);
    assert.equal(receipt.complete('consumed'), false);
  });
  c.connection.subscribe(m => { if (m.type === 'state') { stages.push('observer'); assert.deepEqual(stateAcks(c), m.seq === 10 ? [] : [10]); } });
  c.socket.receive(receiptState(10));
  assert.deepEqual(stages, ['retained', 'observer']); assert.deepEqual(stateAcks(c), [10]);
  assert.equal(c.timers.size, timers); assert.equal(c.connection.presentationConsumption.pending, 0);
  unsubscribe(); c.socket.receive(receiptState(11)); // No display owner discards, it does not deadlock loading.
  assert.deepEqual(stateAcks(c), [10, 11]); c.connection.close(false);
});

test('presentation receipt: out-of-order completion cannot cumulatively release unfinished states', () => {
  const c = client(false, { stateCredits: 1 }), tokens = [], remote = new LanStateCredits();
  remote.recordNetworkRtt(100);
  c.connection.subscribe((m, receipt) => { if (m.type === 'state') tokens.push(receipt.defer(() => {})); });
  for (let seq = 10; seq < 13; seq++) { assert.equal(remote.reserve(seq, 100), true); c.socket.receive(receiptState(seq)); }
  assert.deepEqual(stateAcks(c), []); assert.equal(c.connection.presentationConsumption.pending, 3);
  assert.equal(c.connection.completePresentation({ ...tokens[0], id: tokens[2].id + 1 }, 'consumed'), false);
  assert.equal(c.connection.completePresentation(tokens[0], 'fragment'), false);
  assert.equal(c.connection.completePresentation(tokens[2], 'consumed'), true);
  assert.deepEqual(stateAcks(c), []); assert.equal(remote.stats().inflight, 3);
  assert.equal(c.connection.completePresentation({ ...tokens[0], seq: 999999 }, 'discarded'), true);
  assert.deepEqual(stateAcks(c), [10]); remote.ack(10); assert.equal(remote.stats().inflight, 2);
  assert.equal(c.connection.completePresentation(tokens[1], 'consumed'), true);
  assert.deepEqual(stateAcks(c), [10, 11, 12]); remote.ack(11); remote.ack(12); assert.equal(remote.stats().inflight, 0);
  assert.equal(c.connection.completePresentation(tokens[2], 'consumed'), false);
  assert.equal(c.connection.presentationConsumption.pending, 0); c.connection.close(false);
});

test('presentation receipt: every connection epoch revokes late replies and cancels work exactly once', () => {
  const transitions = [c => c.connection.resetPresentationConsumption(),
    c => c.socket.receive({ type: 'launch', matchId: 'receipt-match', syncId: 'new' }),
    c => c.socket.receive({ type: 'match', match: { id: 'next-match' } }),
    c => c.visibility(true), c => c.connection.close(false),
    c => c.socket.onclose({ code: 1006, reason: '' }), c => c.socket.receive({ type: 'left' }),
    c => c.socket.receive({ type: 'roomClosed' })];
  for (const transition of transitions) {
    const c = client(false, { stateCredits: 1 }); let token, cancelled = 0;
    c.socket.receive({ type: 'launch', matchId: 'receipt-match', syncId: 'same' });
    c.connection.subscribe((m, receipt) => { if (m.type === 'state') token = receipt.defer(() => {
      cancelled++; assert.equal(c.connection.completePresentation(token, 'consumed'), false);
      c.connection.resetPresentationConsumption(); // Reentrant teardown cannot resurrect the old receipt.
    }); });
    c.socket.receive(receiptState(10)); c.socket.receive({ type: 'launch', matchId: 'receipt-match', syncId: 'same' });
    assert.equal(cancelled, 0, 'Repeated launch is not a new connection epoch');
    transition(c); assert.equal(cancelled, 1); assert.equal(c.connection.completePresentation(token, 'consumed'), false);
    assert.equal(c.connection.presentationConsumption.pending, 0); assert.deepEqual(stateAcks(c), []); c.connection.close(false);
    assert.equal(cancelled, 1);
  }
});

test('presentation receipt: subscriber failure, async listener misuse and rejected consumption grant no credit', async () => {
  for (const mode of ['throw-after-complete', 'promise', 'reject']) {
    const c = client(false, { stateCredits: 1 });
    c.connection.subscribe((m, receipt) => {
      if (m.type !== 'state') return;
      if (mode === 'throw-after-complete') { receipt.complete('consumed'); throw Error('failed consumer'); }
      if (mode === 'promise') return Promise.reject(Error('forgot explicit defer'));
      receipt.reject(Error('bad data'));
    });
    c.socket.receive(receiptState(10)); await Promise.resolve();
    assert.deepEqual(stateAcks(c), []); assert.equal(c.events.filter(m => m.code === 'PRESENTATION_CONSUMPTION').length, 1);
    assert.equal(c.connection.presentationConsumption.pending, 0); c.connection.close(false);
  }
});

test('presentation receipt: frame and encoded-unit admission stay bounded without payload queues', () => {
  const c = client(false, { stateCredits: 1 }); let cancelled = 0;
  c.connection.subscribe((m, receipt) => { if (m.type === 'state') receipt.defer(() => cancelled++); });
  for (let seq = 0; seq < 64; seq++) c.socket.receive(receiptState(seq));
  assert.equal(c.connection.presentationConsumption.pending, 64);
  c.socket.receive(receiptState(64));
  assert.equal(cancelled, 64); assert.equal(c.connection.presentationConsumption.pending, 0);
  assert.deepEqual(stateAcks(c), []); assert.equal(c.events.filter(m => m.code === 'PRESENTATION_CONSUMPTION').length, 1);
  const errors = [], ledger = new c.Receipts(error => errors.push(String(error)), { state: { count: 2, units: 10 }, visual: { count: 1, units: 5 } });
  ledger.deliver('state', 6, () => true, receipt => receipt.defer(() => {}));
  ledger.deliver('state', 5, () => true, () => { throw Error('Overflow must not dispatch'); });
  assert.equal(errors.length, 1); assert.equal(ledger.stats.pending, 0); assert.equal(ledger.stats.units, 0);
  ledger.reset(); c.connection.close(false);
});

test('presentation receipt: unsent ACK retries are bounded and hung consumers time out', () => {
  const c = client(false, { stateCredits: 1 });
  c.connection.subscribe((m, receipt) => { if (m.type === 'state') receipt.complete('consumed'); });
  c.socket.bufferedAmount = config.maxSnapshotBytes * 2 + 1; c.socket.receive(receiptState(10));
  assert.deepEqual(stateAcks(c), []); assert.equal(c.connection.presentationConsumption.pending, 1);
  c.socket.bufferedAmount = 0; c.advance(50); receiptTimeout(c, 50);
  assert.deepEqual(stateAcks(c), [10]); assert.equal(c.connection.presentationConsumption.pending, 0); c.connection.close(false);
  const hung = client(false, { stateCredits: 1 }); let cancelled = 0, token;
  hung.connection.subscribe((m, receipt) => { if (m.type === 'state') token = receipt.defer(() => cancelled++); });
  hung.socket.receive(receiptState(10)); hung.advance(5000); receiptTimeout(hung, 5000);
  assert.equal(cancelled, 1); assert.equal(hung.connection.completePresentation(token, 'consumed'), false);
  assert.equal(hung.connection.presentationConsumption.pending, 0); assert.deepEqual(stateAcks(hung), []);
  assert.equal(hung.events.filter(m => m.code === 'PRESENTATION_CONSUMPTION').length, 1); hung.connection.close(false);
});

test('presentation receipt: terminal report waits for retention, coalesces retransmits, and cancels on resync', () => {
  for (const mode of ['normal', 'reset', 'blocked-ack']) {
    const c = client(false, { stateCredits: 1 }), tokens = [];
    c.connection.subscribe((m, receipt) => { if (m.type === 'state') tokens.push(receipt.defer(() => {})); });
    c.socket.receive(receiptState(10)); c.socket.receive(receiptState(11));
    const ended = { type: 'ended', matchId: 'receipt-match', winner: 'draw' };
    c.socket.receive(ended); c.socket.receive(ended);
    assert.equal(c.events.filter(m => m.type === 'ended').length, 0);
    assert.equal(c.connection.presentationConsumption.terminalPending, true);
    c.socket.receive({ type: 'room', room: { status: 'ended' } }); // Small controls are not parked in the ledger.
    assert.equal(c.events.at(-1).type, 'room');
    if (mode === 'reset') c.connection.resetPresentationConsumption();
    if (mode === 'blocked-ack') c.socket.bufferedAmount = config.maxSnapshotBytes * 2 + 1;
    c.connection.completePresentation(tokens[1], 'consumed'); assert.equal(c.events.filter(m => m.type === 'ended').length, 0);
    c.connection.completePresentation(tokens[0], 'consumed');
    assert.equal(c.events.filter(m => m.type === 'ended').length, mode === 'reset' ? 0 : 1);
    assert.deepEqual(stateAcks(c), mode === 'normal' ? [10, 11] : []);
    assert.equal(c.connection.presentationConsumption.pending, 0); c.connection.close(false);
  }
});

test('presentation receipt: visual ownership is explicit and independent, fragments never grant baseline-ready', async () => {
  const { AnchoredProjectilePublisher } = await import('../src/network/AnchoredProjectileVisual.mjs');
  const publisher = new AnchoredProjectilePublisher('receipt-visual');
  const frame = publisher.publish({ tick: 1, time: 0, rows: [] });
  const packet = { type: 'projectile-visual', matchId: 'receipt-match', syncId: 'same', key: frame.key, tick: 1,
    kind: 'baseline', data: Buffer.from(frame.baseline).toString('base64'), visualHandled: true };
  const c = client(false, { stateCredits: 1 }); c.connection.visualState = true;
  c.socket.receive(packet);
  assert.equal(c.socket.messages.at(-1).status, 'discarded', 'Server-supplied visualHandled cannot grant readiness');
  let stateToken, visualToken, cancelled = 0;
  c.connection.subscribe((m, receipt) => {
    if (m.type === 'state') stateToken = receipt.defer(() => {});
    if (m.type === 'projectile-visual') visualToken = receipt.defer(() => cancelled++);
  });
  c.socket.receive(receiptState(10)); c.socket.receive(packet);
  assert.equal(c.connection.completePresentation(visualToken, 'consumed'), true);
  assert.equal(c.socket.messages.at(-1).status, 'consumed'); assert.deepEqual(stateAcks(c), []);
  c.socket.receive(packet); c.socket.receive({ type: 'layered-unavailable' });
  assert.equal(cancelled, 1); assert.equal(c.connection.completePresentation(visualToken, 'consumed'), false);
  assert.equal(c.socket.messages.filter(m => m.type === 'visual-consumed').at(-1).status, 'discarded');
  assert.equal(c.connection.presentationConsumption.state, 1);
  c.connection.completePresentation(stateToken, 'consumed'); assert.deepEqual(stateAcks(c), [10]);
  c.connection.visualState = true;
  c.socket.receive({ ...packet, data: Buffer.alloc(6144).toString('base64'), offset: 0, total: 6145 });
  assert.equal(c.socket.messages.at(-1).status, 'fragment'); assert.equal(c.connection.presentationConsumption.pending, 0);
  c.socket.receive({ ...packet, data: Buffer.alloc(1).toString('base64'), offset: 6144, total: 6145 });
  assert.equal(c.connection.presentationConsumption.visual, 1);
  c.connection.completePresentation(visualToken, 'discarded');
  assert.equal(c.socket.messages.at(-1).status, 'discarded'); c.connection.close(false);
});

test('presentation receipt: real Worker transfer and stale reply use only local correlation', async t => {
  const { encodeBinaryFrame } = await import('../src/network/BinarySnapshot.mjs');
  const c = client(false, { stateCredits: 1 }), messages = [], replies = [], tokens = [], detached = [];
  const decoderUrl = new URL('../src/network/BinarySnapshot.mjs', import.meta.url).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    (async () => {
      const { decodeBinaryFrame } = await import(${JSON.stringify(decoderUrl)});
      const held = new Map();
      parentPort.on('message', m => {
        if (m.type === 'retain') { const frame = decodeBinaryFrame(m.wire); held.set(m.token.id, { token: m.token, frame }); parentPort.postMessage({ retained: m.token.id, tick: frame.tick }); }
        if (m.type === 'release') { const entry = held.get(m.id); if (entry) { held.delete(m.id); parentPort.postMessage({ token: entry.token, status: 'consumed' }); } }
        if (m.type === 'cancel') { for (const [id, entry] of held) if (entry.token.owner === m.owner && entry.token.epoch === m.epoch) held.delete(id); parentPort.postMessage({ cancelled: m.epoch, retainedCount: held.size }); }
        if (m.type === 'late') parentPort.postMessage({ token: m.token, status: 'consumed' });
      });
      parentPort.postMessage({ ready: true });
    })().catch(error => { throw error; });`, { eval: true });
  t.after(async () => { c.connection.close(false); await worker.terminate(); });
  worker.on('message', message => {
    messages.push(message);
    if (message.token) replies.push({ token: message.token, accepted: c.connection.completePresentation(message.token, message.status) });
  });
  await until(() => messages.some(m => m.ready));
  c.connection.subscribe((m, receipt) => {
    if (m.type !== 'state') return;
    let token;
    token = receipt.defer(() => worker.postMessage({ type: 'cancel', owner: token.owner, epoch: token.epoch }));
    tokens.push(token);
    const wire = encodeBinaryFrame(m.frame).slice().buffer;
    worker.postMessage({ type: 'retain', token, wire }, [wire]); detached.push(wire.byteLength === 0);
  });
  c.socket.receive(receiptState(10)); c.socket.receive(receiptState(11));
  assert.deepEqual(stateAcks(c), []); await until(() => messages.filter(m => m.retained).length === 2);
  assert.deepEqual(detached, [true, true]); assert.deepEqual(stateAcks(c), [], 'Worker post/receipt of bytes is not application completion');
  worker.postMessage({ type: 'release', id: tokens[1].id }); await until(() => replies.length === 1);
  assert.deepEqual(stateAcks(c), []);
  worker.postMessage({ type: 'release', id: tokens[0].id }); await until(() => replies.length === 2);
  assert.deepEqual(stateAcks(c), [10, 11]); assert.equal(replies.every(r => r.accepted), true);
  c.socket.receive(receiptState(12)); await until(() => messages.filter(m => m.retained).length === 3);
  c.connection.resetPresentationConsumption(); await until(() => messages.some(m => m.cancelled !== undefined));
  assert.equal(messages.find(m => m.cancelled !== undefined).retainedCount, 0);
  worker.postMessage({ type: 'late', token: tokens[2] }); await until(() => replies.length === 3);
  assert.equal(replies[2].accepted, false); assert.deepEqual(stateAcks(c), [10, 11]);
  assert.equal(c.connection.presentationConsumption.pending, 0);
});

test('presentation receipt: equal epoch/id from a different owner cannot finish this connection', () => {
  const c = client(), limits = { state: { count: 2, units: 100 }, visual: { count: 1, units: 100 } }, sent = [];
  const first = new c.Receipts(error => { throw error; }, limits), second = new c.Receipts(error => { throw error; }, limits);
  let oldToken, newToken;
  try {
    first.deliver('state', 1, () => true, receipt => { oldToken = receipt.defer(() => {}); });
    second.deliver('state', 1, () => { sent.push('new'); return true; }, receipt => { newToken = receipt.defer(() => {}); });
    assert.equal(oldToken.epoch, newToken.epoch); assert.equal(oldToken.id, newToken.id);
    assert.equal(second.complete(oldToken, 'consumed'), false);
    assert.deepEqual(sent, []); assert.equal(second.complete(newToken, 'consumed'), true); assert.deepEqual(sent, ['new']);
  } finally { first.reset(); second.reset(); c.connection.close(false); }
});
