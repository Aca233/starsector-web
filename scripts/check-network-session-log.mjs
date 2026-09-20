import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DesktopNetworkLog, attachDesktopNetworkLog } from '../desktop/network-log.mjs';
import { NETWORK_LOG_PREFIX } from '../desktop/network-diagnostic-record.mjs';

const message = (battle = 0) => NETWORK_LOG_PREFIX + JSON.stringify({
  version: 1, event: 'sample', transport: 'lan', role: 'guest', battle,
  monotonicMs: battle * 1000, wallTimeMs: 100000, hud: { hz: 17, fps: 60 },
});
const rows = text => text.trim().split('\n').filter(Boolean).map(JSON.parse);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function memoryIO() {
  const files = new Map(), calls = [];
  return { files, calls,
    mkdir: async (file, options) => { calls.push(['mkdir', file, options]); },
    appendFile: async (file, line, options) => {
      calls.push(['append', file, options]); files.set(file, (files.get(file) ?? '') + line);
    },
    copyFile: async (file, destination) => {
      calls.push(['copy', file, destination]);
      if (!files.has(file)) throw Object.assign(new Error('missing source'), { code: 'ENOENT' });
      files.set(destination, files.get(file));
    },
  };
}
async function tempDirectory(t) {
  const base = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(base, 'starsector-network-session-'));
  t.after(async () => {
    // Verify the absolute recursive cleanup target remains our test workspace.
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('starsector-network-session-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test('explicit start creates parent first; close appends exactly one durable last summary', async () => {
  const io = memoryIO(); let now = 100;
  const log = new DesktopNetworkLog('logs/session.jsonl', { io, now: () => now, wallNow: () => 123 });
  assert.equal(io.calls.length, 0);
  assert.equal(log.start({ appVersion: '1.2.3', mode: 'steam', logicalCores: 8, totalMemoryBytes: 4096 }), true);
  assert.equal(log.start(), false); assert.equal(log.accept(message(1), true), true);
  now = 1100;
  const closing = log.close('shutdown');
  assert.strictEqual(log.close('restart'), closing);
  assert.equal(log.accept(message(2), true), false); assert.equal(log.event('desktop-sample', {}), false);
  assert.equal(log.start(), false); assert.equal(await closing, true); await log.flush();
  const data = rows(io.files.get(log.file)), summary = data.at(-1);
  assert.deepEqual(data.map(row => row.event), ['session-start', 'sample', 'session-end']);
  assert.deepEqual(io.calls[0], ['mkdir', path.dirname(log.file), { recursive: true }]);
  assert.equal(data[0].metadata.logicalCores, 8); assert.equal(data[0].metadata.mode, 'steam');
  assert.equal(data[0].desktopMonotonicMs, 100); assert.equal(data[1].desktopMonotonicMs, 100);
  assert.equal(summary.desktopMonotonicMs, 1100);
  assert.equal(summary.reason, 'shutdown'); assert.equal(summary.durationMs, 1000);
  assert.equal(summary.accepted, 2); assert.equal(summary.written, 2); assert.equal(summary.summaryScope, 'process');
  assert.equal(summary.writeErrors, 0); assert.equal(summary.dropped, 0);
  assert.equal(summary.bytesWritten, Buffer.byteLength(io.files.get(log.file).split('\n').slice(0, -2).join('\n') + '\n'));
  assert.deepEqual(io.calls.filter(call => call[0] === 'append').map(call => call[2].flush), [false, false, true]);
  assert.ok(data.every(row => row.sessionId === 'session' && row.processRunId === log.processRunId));
  assert.equal(log.pending, 0);
});

test('real session exceeds 4 MiB without rotation; handoff/resume appends and separate sessions preserve old bytes', async t => {
  const dir = await tempDirectory(t);
  const file = path.join(dir, 'nested', 'network-logs', 'network-session-one.jsonl');
  let now = 0;
  const log = new DesktopNetworkLog(file, { now: () => now });
  assert.equal(log.start({ appVersion: '1.0.0', sessionId: 'one' }), true);
  let count = 0;
  while (log.size <= 4 * 1024 * 1024) {
    for (let i = 0; i < 16; i++) { now += 1000; assert.equal(log.accept(message(count++), true), true); }
    await log.flush(); assert.equal(log.writeErrors, 0);
  }
  assert.equal(await log.close('steam-relaunch'), true);
  const original = await fs.readFile(file, 'utf8'), data = rows(original);
  assert.ok(Buffer.byteLength(original) > 4 * 1024 * 1024);
  assert.equal(data[0].event, 'session-start'); assert.equal(data.at(-1).event, 'session-handoff');
  assert.deepEqual(data.slice(1, -1).map(row => row.battle), Array.from({ length: count }, (_, i) => i));
  await assert.rejects(fs.stat(file + '.previous'), { code: 'ENOENT' });
  const resume = new DesktopNetworkLog(file);
  assert.equal(resume.start({ resumed: true, sessionId: 'one' }), true);
  resume.accept(message(99999), true); assert.equal(await resume.close('shutdown'), true);
  const resumed = await fs.readFile(file, 'utf8'), all = rows(resumed);
  assert.ok(resumed.startsWith(original));
  assert.deepEqual(all.slice(-3).map(row => row.event), ['session-resume', 'sample', 'session-end']);
  assert.ok(all.every(row => row.sessionId === 'one'));
  assert.notEqual(log.processRunId, resume.processRunId);
  assert.ok(all.slice(-3).every(row => row.processRunId === resume.processRunId));
  assert.equal(all.at(-1).written, 2); assert.equal(all.at(-1).resumed, true);
  const second = new DesktopNetworkLog(path.join(path.dirname(file), 'network-session-two.jsonl'));
  assert.equal(second.start(), true); assert.equal(await second.close(), true);
  assert.equal(await fs.readFile(file, 'utf8'), resumed);
});

test('stalled I/O is bounded; close reserves one slot and main can bound its wait', async () => {
  const gate = deferred(), io = memoryIO(), append = io.appendFile;
  io.appendFile = async (...args) => { await gate.promise; return append(...args); };
  const log = new DesktopNetworkLog('session', { maxPending: 2, io });
  assert.equal(log.start(), true); assert.equal(log.accept(message(), true), true);
  for (let i = 0; i < 50; i++) assert.equal(log.event('desktop-sample', {}), false);
  assert.equal(log.pending, 2);
  const closing = log.close(); assert.equal(log.pending, 3);
  assert.strictEqual(log.close(), closing); assert.equal(log.pending, 3);
  const result = await Promise.race([closing.then(() => 'closed'), new Promise(resolve => setTimeout(() => resolve('deadline'), 10))]);
  assert.equal(result, 'deadline'); gate.resolve(); assert.equal(await closing, true);
  const summary = rows(io.files.get('session')).at(-1);
  assert.equal(summary.pendingDrops, 50); assert.equal(summary.dropped, 50); assert.equal(summary.written, 2);
  assert.equal(log.pending, 0);
});

test('renderer and desktop events share 12/s rate budget, recover on rollback, close bypasses limit', async () => {
  const io = memoryIO(); let now = 1000;
  const log = new DesktopNetworkLog('session', { io, now: () => now });
  log.start(); await log.flush();
  for (let i = 0; i < 12; i++) {
    assert.equal(i % 2 ? log.accept(message(i), true) : log.event('desktop-sample', {}), true); await log.flush();
  }
  assert.equal(log.event('page-loaded', {}), false);
  now = 900; assert.equal(log.event('page-loaded', {}), true); await log.flush();
  now = 1900;
  for (let i = 0; i < 12; i++) { assert.equal(log.accept(message(i), true), true); await log.flush(); }
  assert.equal(log.accept(message(), true), false); assert.equal(await log.close(), true);
  assert.equal(rows(io.files.get('session')).at(-1).rateDrops, 2);
});

test('allowlist preserves nested metrics and enums, strips paths/identities/free text at every level', async () => {
  const io = memoryIO(), log = new DesktopNetworkLog('session', { io });
  const secret = { path: 'SECRET', token: 'SECRET', name: 'SECRET', reason: 'SECRET' };
  log.start({ appVersion: '1.0.0', platform: 'win32', logicalCores: 8, totalMemoryBytes: 16000,
    mode: 'steam', ...secret, sessionId: 'C:\\SECRET\\file', build: 'https://SECRET' });
  await log.flush();
  const processes = Object.fromEntries(['main', 'renderer', 'backend', 'gpu'].map(key =>
    [key, { cpuPercent: 0, workingSetBytes: 1024, privateBytes: 512, ...secret }]));
  const fields = { mode: 'steam', sampleGapMs: 1001,
    eventLoop: { meanMs: 1.5, p95Ms: 3, maxMs: 9, ...secret }, processes: { ...processes, SECRET: secret },
    mainMemory: { rssBytes: 1024, heapUsedBytes: 256, heapTotalBytes: 512, externalBytes: 0, ...secret },
    rssBytes: Infinity, heapUsedBytes: -1, cpuPercent: 'SECRET', windowVisible: true, ...secret };
  fields.self = fields;
  assert.equal(log.event('desktop-sample', fields), true); processes.main.workingSetBytes = 9999;
  assert.equal(log.event('mode-change', { mode: 'steam', previousMode: 'lan', stage: 'requested', ...secret }), true);
  assert.equal(log.event('backend-failed', { mode: 'steam', exitCode: -1, reason: 'spawn-failed' }), true);
  assert.equal(log.event('renderer-gone', { mode: 'steam', exitCode: 5, reason: 'crashed' }), true);
  assert.equal(log.event('renderer-unresponsive', { mode: 'steam', ...secret }), true);
  assert.equal(log.event('renderer-responsive', { mode: 'steam', ...secret }), true);
  assert.equal(log.event('page-loaded', { mode: 'steam', durationMs: 50, ...secret }), true);
  for (const event of ['unknown', 'session-start', 'session-end', 'session-summary']) assert.equal(log.event(event, secret), false);
  await log.close('SECRET');
  const text = io.files.get('session'), data = rows(text), sample = data[1];
  assert.ok(!text.includes('SECRET')); assert.equal(data[0].metadata.sessionId, null);
  assert.deepEqual(sample.eventLoop, { meanMs: 1.5, p95Ms: 3, maxMs: 9 });
  assert.equal(sample.processes.main.workingSetBytes, 1024); assert.equal(sample.processes.gpu.cpuPercent, 0);
  assert.deepEqual(sample.mainMemory, { rssBytes: 1024, heapUsedBytes: 256, heapTotalBytes: 512, externalBytes: 0 });
  assert.equal(sample.cpuPercent, null); assert.equal(sample.heapUsedBytes, null); assert.equal(sample.rssBytes, null);
  assert.equal(data[2].previousMode, 'lan'); assert.equal(data[2].stage, 'requested');
  assert.equal(data[3].reason, 'spawn-failed'); assert.equal(data[3].exitCode, -1);
  assert.equal(data[4].reason, 'crashed'); assert.equal(data.at(-1).reason, 'unknown');
});

test('queued write failures are nonfatal and counted by the final summary after draining', async () => {
  const io = memoryIO(), append = io.appendFile;
  io.appendFile = async (...args) => {
    if (JSON.parse(args[1]).battle === 1) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return append(...args);
  };
  const log = new DesktopNetworkLog('session', { io });
  log.start(); log.accept(message(1), true); log.accept(message(2), true);
  assert.equal(await log.close('shutdown'), true);
  const data = rows(io.files.get('session'));
  assert.deepEqual(data.map(row => row.event), ['session-start', 'sample', 'session-end']);
  assert.equal(data.at(-1).accepted, 3); assert.equal(data.at(-1).written, 2);
  assert.equal(data.at(-1).writeErrors, 1); assert.equal(data.at(-1).desktopDropped, 1);
  assert.equal(data.at(-1).dropped, 1); assert.equal(log.pending, 0);
});

test('mkdir failure and sync/async append failures never reject flush or close', async () => {
  const io = { mkdir: async () => { throw Error('permission denied'); }, appendFile: () => { throw Error('disk offline'); } };
  const log = new DesktopNetworkLog('session', { io });
  assert.equal(log.start(), true); assert.equal(await log.flush(), false);
  assert.equal(log.accept(message(), true), true); assert.equal(await log.flush(), false);
  assert.equal(await log.close(), false); assert.equal(log.pending, 0); assert.equal(log.writeErrors, 3);
  const asyncLog = new DesktopNetworkLog('session', { io: { appendFile: async () => { throw Error('disk full'); } } });
  assert.equal(await asyncLog.close(), false);
});

test('export serializes an exact complete prefix before later appends and close', async () => {
  const io = memoryIO(), copy = io.copyFile, entered = deferred(), release = deferred();
  io.copyFile = async (...args) => { entered.resolve(); await release.promise; return copy(...args); };
  const log = new DesktopNetworkLog('session', { io });
  log.start(); log.accept(message(1), true);
  const exporting = log.exportTo('exported'); log.accept(message(2), true); const closing = log.close();
  await entered.promise;
  const prefix = io.files.get('session');
  assert.deepEqual(rows(prefix).map(row => row.event), ['session-start', 'sample']); assert.ok(prefix.endsWith('\n'));
  release.resolve(); await exporting; assert.equal(await closing, true);
  assert.equal(io.files.get('exported'), prefix); assert.ok(io.files.get('session').startsWith(prefix));
  assert.deepEqual(rows(io.files.get('session')).map(row => row.event), ['session-start', 'sample', 'sample', 'session-end']);
  await log.exportTo('closed-export'); assert.equal(io.files.get('closed-export'), io.files.get('session'));
  assert.equal(log.pending, 0);
});

test('export rejection reaches its caller but does not poison subsequent appends or close', async () => {
  const io = memoryIO(); io.copyFile = async () => { throw Object.assign(Error('save denied'), { code: 'EACCES' }); };
  const log = new DesktopNetworkLog('session', { io }); log.start();
  const exporting = log.exportTo('exported'); log.accept(message(1), true); const closing = log.close();
  await assert.rejects(exporting, { code: 'EACCES' }); assert.equal(await closing, true); await log.flush();
  const summary = rows(io.files.get('session')).at(-1);
  assert.equal(summary.exportErrors, 1); assert.equal(summary.writeErrors, 0); assert.equal(summary.written, 2);
  assert.equal(log.pending, 0);
});

test('export rejects self-overwrite, invalid paths and unbounded queued copies', async () => {
  const io = memoryIO(), log = new DesktopNetworkLog('session', { io, maxPending: 2 });
  log.start(); await log.flush();
  await assert.rejects(log.exportTo(path.resolve('session')), /active session/);
  await assert.rejects(log.exportTo(null), TypeError);
  if (process.platform === 'win32') await assert.rejects(log.exportTo(path.resolve('SESSION')), /active session/);
  const gate = deferred(), copy = io.copyFile;
  io.copyFile = async (...args) => { await gate.promise; return copy(...args); };
  const one = log.exportTo('one'), two = log.exportTo('two');
  await assert.rejects(log.exportTo('three'), /queue is busy/); assert.equal(log.pending, 2);
  const closing = log.close(); assert.equal(log.pending, 3);
  gate.resolve(); await Promise.all([one, two, closing]); assert.equal(log.pending, 0);
});

test('real exports are complete JSONL prefixes, recover after copy failure, and include end after close', async t => {
  const dir = await tempDirectory(t), file = path.join(dir, 'nested', 'session.jsonl');
  const destination = path.join(dir, 'export.jsonl'), log = new DesktopNetworkLog(file);
  log.start(); log.accept(message(1), true); const exporting = log.exportTo(destination); log.accept(message(2), true);
  await exporting; await log.close();
  const prefix = await fs.readFile(destination, 'utf8'), full = await fs.readFile(file, 'utf8');
  assert.ok(prefix.endsWith('\n')); assert.ok(full.startsWith(prefix));
  assert.equal(rows(prefix).length, 2); assert.equal(rows(full).length, 4);
  await assert.rejects(log.exportTo(path.join(dir, 'missing', 'no.jsonl')), { code: 'ENOENT' });
  await log.exportTo(destination); assert.equal(await fs.readFile(destination, 'utf8'), full);
});

test('console bridge still requires trusted main frame, local source, game URL and renderer schema', async () => {
  const origin = 'http://127.0.0.1:7777', contents = new EventEmitter();
  contents.mainFrame = {}; let url = `${origin}/?view=lan`; contents.getURL = () => url;
  const io = memoryIO(), log = new DesktopNetworkLog('session', { io });
  const detach = attachDesktopNetworkLog(contents, origin, log);
  const valid = { message: message(), sourceId: `${origin}/assets/game.js`, frame: contents.mainFrame };
  contents.emit('console-message', { ...valid, frame: {} });
  contents.emit('console-message', { ...valid, sourceId: 'https://evil.example/game.js' });
  contents.emit('console-message', { ...valid, sourceId: 'about:srcdoc' });
  contents.emit('console-message', { ...valid, message: NETWORK_LOG_PREFIX + JSON.stringify({ version: 1, event: 'session-start', file: 'SECRET' }) });
  url = 'https://evil.example/lan.html'; contents.emit('console-message', valid);
  await log.flush(); assert.equal(io.files.size, 0);
  url = `${origin}/?view=lan`; contents.emit('console-message', valid); await log.flush();
  assert.equal(rows(io.files.get('session')).length, 1); assert.equal(log.start(), false);
  detach(); contents.emit('console-message', valid); await log.flush(); assert.equal(rows(io.files.get('session')).length, 1);
});

test('invalid maxPending cannot unbound queue', () => {
  for (const value of [NaN, Infinity, -1, 0, 1.5, '32', 100000]) {
    const log = new DesktopNetworkLog('session', { maxPending: value });
    assert.ok(Number.isInteger(log.maxPending) && log.maxPending >= 1 && log.maxPending <= 256);
  }
});

test('renderer reload can reset its clocks without resetting desktop time or process/session identity', async () => {
  const io = memoryIO(); let now = 100;
  const log = new DesktopNetworkLog('session.jsonl', { io, now: () => now });
  log.start({ mode: 'local' }); log.accept(message(0), true); await log.flush();
  now = 1100; log.event('page-loaded', { mode: 'local' });
  now = 2100; log.accept(message(0), true); await log.close('shutdown');
  const data = rows(io.files.get('session.jsonl')), samples = data.filter(row => row.event === 'sample');
  assert.deepEqual(samples.map(row => row.monotonicMs), [0, 0]);
  assert.deepEqual(samples.map(row => row.battle), [0, 0]);
  assert.deepEqual(samples.map(row => row.desktopMonotonicMs), [100, 2100]);
  assert.equal(data[0].metadata.mode, 'local'); assert.equal(data[2].mode, 'local');
  assert.ok(data.every(row => row.sessionId === 'session' && row.processRunId === log.processRunId));
});
