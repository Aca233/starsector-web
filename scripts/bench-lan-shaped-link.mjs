// Real, compressed WebSockets through a local byte-rate/delay TCP proxy.
// Sender and receiver have SEPARATE processes / event loops / zlib pools.
// Replays a looping recording, not a game, browser, physical LAN or Steam route.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { LanStateCredits } from '../server/LanStateCredits.mjs';
import { LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { encodeBinaryState, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';

const epochNow = () => performance.timeOrigin + performance.now();
const quantile = (xs, q) => {
  const sorted = xs.toSorted((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : null;
};
const timings = xs => ({ mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, p95: quantile(xs, .95) });
function loadBodies(folder) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  return manifest.rows.map(row => {
    const bytes = fs.readFileSync(path.join(folder, row.name));
    return bytes.subarray(8 + bytes.readUInt32LE(4));
  });
}

// IPC is observations only. The consumption ACK takes the shaped WS return
// path immediately after decoding/validation, never a shortcut through IPC.
async function runClient() {
  const bodies = loadBodies(process.argv[3]);
  const receiver = new LanDeltaReceiver();
  const client = new WebSocket(`ws://127.0.0.1:${process.argv[4]}`, { perMessageDeflate: lanPerMessageDeflate() });
  client.on('open', () => process.send({ ready: true }));
  client.on('error', error => process.send?.({ error: String(error) }));
  client.on('message', (raw, binary) => {
    try {
      assert.equal(binary, true);
      const start = performance.now(), decoded = receiver.decode(raw), restored = performance.now();
      const state = decodeBinaryState(decoded), parsed = performance.now();
      assert.deepEqual(decoded, encodeBinaryState('recording-replay', state.seq, bodies[(state.seq - 1) % bodies.length]));
      const receivedAt = epochNow(), validated = performance.now();
      client.send(JSON.stringify({ seq: state.seq }));
      process.send({ seq: state.seq, receivedAt, restoreMs: restored - start, parseMs: parsed - restored, validateMs: validated - parsed });
    } catch (error) { process.send?.({ error: String(error) }); }
  });
  process.once('disconnect', () => { client.terminate(); });
}

function lane(src, dst, rate, delay, errors) {
  let queue = [], bytes = 0, serial = performance.now(), timer = null, blocked = false, ended = false, closed = false, total = 0, peak = 0;
  const clean = () => { closed = true; clearTimeout(timer); queue = []; bytes = 0; };
  const pump = () => {
    clearTimeout(timer); timer = null;
    if (closed || blocked || !dst.writable) return;
    while (queue.length) {
      const wait = queue[0].at - performance.now();
      if (wait > 0) { timer = setTimeout(pump, Math.ceil(wait)); break; }
      const item = queue.shift(); bytes -= item.data.length; total += item.data.length;
      if (!dst.write(item.data)) { blocked = true; dst.once('drain', () => { blocked = false; pump(); }); break; }
    }
    if (bytes < 1024 * 1024 && !ended) src.resume();
    if (ended && !queue.length) dst.end();
  };
  src.on('data', data => {
    if (closed) return;
    serial = Math.max(serial, performance.now()) + data.length * 1000 / rate;
    queue.push({ data, at: serial + delay }); bytes += data.length; peak = Math.max(peak, bytes);
    if (bytes > 8 * 1024 * 1024) { errors.push('proxy bound exceeded'); src.destroy(); dst.destroy(); return; }
    if (bytes > 2 * 1024 * 1024) src.pause();
    pump();
  });
  src.on('end', () => { ended = true; pump(); });
  dst.on('close', clean);
  return { clean, stats: () => ({ bytes: total, peak }) };
}

async function trial(bodies, folder, ordered, bytesPerSecond, durationMs) {
  const backend = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: lanPerMessageDeflate() });
  const sockets = new Set(), lanes = [], errors = [], rows = [], pongs = [], encodeTimes = [], sendTimes = [];
  let proxy, child, peer, timer, probe, endTimer;
  try {
    await once(backend, 'listening');
    proxy = net.createServer(front => {
      front.setNoDelay(true);
      const back = net.connect(backend.address().port, '127.0.0.1'); back.setNoDelay(true);
      for (const sock of [front, back]) {
        sockets.add(sock); sock.on('close', () => sockets.delete(sock)); sock.on('error', e => errors.push(String(e)));
      }
      lanes.push(lane(back, front, bytesPerSecond, 30, errors), lane(front, back, 1000000, 30, errors));
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const connection = once(backend, 'connection');
    child = fork(fileURLToPath(import.meta.url), ['--client', path.resolve(folder), String(proxy.address().port)], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    });
    const expected = new Map();
    let started = null;
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('isolated client startup timeout')), 20000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error(`isolated client exited: ${code}`)); });
      child.on('message', m => {
        if (m.error) { errors.push(m.error); return; }
        if (m.ready) { clearTimeout(timeout); resolve(); return; }
        const sample = expected.get(m.seq);
        if (!sample) { errors.push(`unknown received seq ${m.seq}`); return; }
        expected.delete(m.seq);
        rows.push({ ...m, at: m.receivedAt - started, ageMs: m.receivedAt - sample });
      });
    });
    // Observe rejection while waiting for the socket too; no orphaned rejection.
    ready.catch(() => {});
    [peer] = await Promise.race([connection, ready.then(() => connection)]);
    await ready;
    assert.match(peer.extensions, /permessage-deflate/);
    const sender = new LanDeltaSender({ ordered }), credits = new LanStateCredits(); credits.recordNetworkRtt(60);
    peer.on('error', error => errors.push(String(error)));
    peer.on('message', raw => {
      try { const m = JSON.parse(raw); if (credits.ack(m.seq)) sender.ack(m.seq); }
      catch (error) { errors.push(String(error)); }
    });
    let seq = 0, skipSocket = 0, skipCredit = 0, peakFlight = 0;
    started = epochNow(); let next = performance.now();
    peer.on('pong', raw => pongs.push({ at: epochNow() - started, ms: performance.now() - Number(raw) }));
    timer = setInterval(() => {
      if (performance.now() < next) return;
      next += 1000 / 60; seq++;
      if (peer.bufferedAmount) { skipSocket++; return; }
      if (credits.stats().inflight >= credits.capacity) { skipCredit++; return; }
      const at = epochNow(), encodeStart = performance.now();
      const bytes = encodeBinaryState('recording-replay', seq, bodies[(seq - 1) % bodies.length]);
      if (!credits.reserve(seq, bytes.length)) { skipCredit++; return; }
      const choice = sender.prepare(lanDeltaTarget(bytes, seq));
      encodeTimes.push(performance.now() - encodeStart); expected.set(seq, at);
      const sendingAt = performance.now();
      peer.send(choice.packet, error => {
        if (error) errors.push(String(error));
        else sendTimes.push(performance.now() - sendingAt);
      });
      sender.commit(choice); peakFlight = Math.max(peakFlight, credits.stats().inflight);
    }, 4);
    probe = setInterval(() => peer.ping(String(performance.now())), 1000);
    await new Promise(resolve => { endTimer = setTimeout(resolve, durationMs); });
    clearInterval(timer); clearInterval(probe);
    const steady = rows.filter(r => r.at >= 2000 && r.at < durationMs);
    assert.deepEqual(errors, []); assert.ok(peakFlight <= 5); assert.ok(expected.size <= 5);
    return {
      ordered, bytesPerSecond, durationMs, offered: seq, received: rows.length, steadyHz: steady.length / ((durationMs - 2000) / 1000),
      stateAgeP50: quantile(steady.map(r => r.ageMs), .5), stateAgeP95: quantile(steady.map(r => r.ageMs), .95),
      pongP95: quantile(pongs.map(r => r.ms), .95), skipSocket, skipCredit, peakFlight,
      encodeMs: timings(encodeTimes), sendCallbackMs: timings(sendTimes), restoreMs: timings(steady.map(r => r.restoreMs)),
      parseMs: timings(steady.map(r => r.parseMs)), validationMs: timings(steady.map(r => r.validateMs)),
      downlink: lanes[0].stats(), uplink: lanes[1].stats(), delta: sender.stats(), errors: [...errors],
    };
  } finally {
    clearInterval(timer); clearInterval(probe); clearTimeout(endTimer);
    for (const l of lanes) l.clean();
    peer?.terminate(); for (const s of sockets) s.destroy();
    if (child?.connected) child.disconnect();
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await Promise.all([new Promise(resolve => backend.close(resolve)), proxy && new Promise(resolve => proxy.close(resolve))]);
  }
}

if (process.argv[2] === '--client') await runClient();
else {
  const folder = process.argv[2] ?? 'artifacts/lan-delta-20260919/frames32';
  const output = process.argv[3] ?? 'artifacts/network-latency-phase2-20260920/shaped-lan-isolated.json';
  const rates = process.argv[4] ? process.argv[4].split(',').map(Number) : [1500000, 4000000];
  const durationMs = Number(process.argv[5] ?? 12000);
  assert.ok(rates.every(n => Number.isFinite(n) && n > 0)); assert.ok(durationMs >= 4000);
  const bodies = loadBodies(folder), results = [];
  fs.mkdirSync(path.dirname(output), { recursive: true });
  for (const rate of rates) for (const ordered of [false, true, true, false]) {
    const result = await trial(bodies, folder, ordered, rate, durationMs); results.push(result); console.log(JSON.stringify(result));
    fs.writeFileSync(output, JSON.stringify({
      scope: 'Separate sender/receiver processes, real WS/compression/local shaped TCP; repeated 32-ship recording; base RTT 60ms, 5 credits, offered 60Hz; NOT physical network, browser/game FPS',
      node: process.version, results,
    }, null, 2));
  }
}
