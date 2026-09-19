import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { SteamGateway, STEAM_SNAPSHOT_BYTES, STEAM_SNAPSHOT_WINDOW } from '../server/steam/gateway.mjs';
import { SnapshotSendWindow, MAX_SNAPSHOT_WINDOW } from '../server/steam/snapshot-window.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
const hostId = '76561198000000001', guestId = '76561198000000002', lobby = '109775240000000001', connection = 'a'.repeat(32);
function fixture() {
  const packets = [], logs = [];
  const gateway = new SteamGateway({ build: 'test', log: line => logs.push(JSON.parse(line.slice('[steam-transport] '.length))),
    client: { networking: { sendP2PPacket: (_remote, type, data) => { assert.equal(type, 2); packets.push(data); return true; },
      isP2PPacketAvailable: () => 0 }, } });
  gateway.owner = hostId;
  gateway.selected = { id: lobby, owner: hostId, lobby: { getOwner: () => BigInt(hostId), getMembers: () => [BigInt(hostId), BigInt(guestId)] } };
  gateway.relay = { acceptTransport() {} };
  gateway.dispatch(guestId, { connection, op: 'open', data: { lobby, build: 'test', protocol: protocol.version } });
  packets.length = 0;
  return { gateway, peer: gateway.peers.get(guestId), packets, logs };
}
const frame = (tick, payload = '') => JSON.stringify({ type: 'state', frame: { tick, payload } });
const ack = (gateway, id, nonce = connection) => gateway.dispatch(guestId, { connection: nonce, op: 'ack', data: { id } });

test('initial four-frame pipeline; ACK frees only its own nonce and frame credit', () => {
  const { gateway, peer, packets } = fixture();
  for (let i = 0; i < 4; i++) peer.send(frame(i));
  assert.equal(packets.length, 4); assert.equal(peer.snapshotWritable, false);
  const ids = [...peer.inflight.keys()], bytes = peer.bufferedAmount;
  peer.send(frame(100)); assert.equal(packets.length, 4);
  ack(gateway, ids[0], 'b'.repeat(32)); ack(gateway, 999999);
  assert.equal(peer.bufferedAmount, bytes);
  ack(gateway, ids[2]); assert.equal(peer.inflight.size, 3); assert.ok(peer.snapshotWritable);
  ack(gateway, ids[2]); assert.equal(peer.inflight.size, 3);
  peer.send(frame(101)); assert.equal(peer.inflight.size, 4);
  const decoded = new SteamPacketCodec().receive(hostId, packets.at(-1));
  assert.equal(decoded.data.frame.tick, 101); // Never drain queued stale tick 100.
});

test('compressed byte limit, one oversize frame alone, control and heartbeat remain sendable', () => {
  const { gateway, peer, packets } = fixture();
  const payload = randomBytes(44000).toString('base64');
  peer.send(frame(1, payload)); assert.ok(peer.bufferedAmount > 40000);
  const before = packets.length;
  peer.send(frame(2, payload)); assert.equal(peer.inflight.size, 1); assert.equal(packets.length, before);
  peer.send(JSON.stringify({ type: 'pong', sent: 123 })); peer.ping();
  assert.equal(packets.length, before + 2);
  ack(gateway, [...peer.inflight.keys()][0]);
  peer.send(frame(3, randomBytes(STEAM_SNAPSHOT_BYTES + 1000).toString('base64')));
  assert.ok(peer.bufferedAmount > STEAM_SNAPSHOT_BYTES); assert.equal(peer.snapshotWritable, false);
  assert.equal(peer.inflight.size, 1);
});

test('unacknowledged oldest frame times out even when newer ACKs arrive, close clears credit', t => {
  t.mock.method(Date, 'now', () => 10000);
  const { gateway, peer, logs } = fixture();
  peer.send(frame(1)); peer.send(frame(2)); const ids = [...peer.inflight.keys()];
  ack(gateway, ids[1]);
  t.mock.method(Date, 'now', () => 18001);
  gateway.poll();
  assert.equal(peer.readyState, 3); assert.equal(peer.bufferedAmount, 0); assert.equal(peer.inflight.size, 0);
  assert.ok(logs.some(log => log.event === 'peer-close' && log.oldestAckMs === 8001 && log.reason.includes('8 秒')));
  ack(gateway, ids[0]); assert.equal(peer.bufferedAmount, 0);
  assert.ok(!JSON.stringify(logs).includes(guestId));
});

test('native send failure closes without leaking ACK credit; replacement ignores old ACKs', () => {
  const { gateway, peer } = fixture();
  peer.send(frame(1)); const id = [...peer.inflight.keys()][0];
  gateway.dispatch(guestId, { connection: 'b'.repeat(32), op: 'open', data: { lobby, build: 'test', protocol: protocol.version } });
  const replacement = gateway.peers.get(guestId); replacement.send(frame(2));
  ack(gateway, id); assert.equal(replacement.inflight.size, 1);
  gateway.client.networking.sendP2PPacket = () => false;
  replacement.send(frame(3)); assert.equal(replacement.readyState, 3); assert.equal(replacement.bufferedAmount, 0);
  assert.equal(peer.inflight.size, 0);
});

// Virtual full-duplex *reliable* transport: bandwidth serialization, latency and
// a retransmission-like stall preserve packet order. Exercises BOTH gateways and
// real fragmentation/ACKs, not a mocked window. It does not exercise Valve routing.
function simulate(t, { window = STEAM_SNAPSHOT_WINDOW, rtt = 200, bandwidth = 128000, stallMs = 0, duration = 12000, payloadBytes = 1800, jitterMs = 0, afterBandwidth = bandwidth, changeAt = Infinity } = {}) {
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  const { gateway: host, peer } = fixture(), delivered = [], queues = { host: [], guest: [] }, tails = { host: 0, guest: 0 };
  const guest = new SteamGateway({ build: 'test' });
  guest.owner = guestId; guest.guestConnection = connection;
  guest.selected = { ...host.selected };
  guest.renderer = { readyState: 1, bufferedAmount: 0,
    send: (raw, done) => { const m = JSON.parse(raw); if (m.type === 'state') delivered.push({ tick: m.frame.tick, age: now - m.frame.tick, time: now }); done?.(); },
    close: () => { guest.renderer.readyState = 3; } };
  let packetIndex = 0; let stalled = false, peakFrames = 0, peakBytes = 0, peakWireBytes = 0;
  function wire(side) {
    const target = side === 'host' ? 'guest' : 'host', sender = side === 'host' ? hostId : guestId;
    return { sendP2PPacket: (_remote, _type, data) => {
      let extra = 0;
      if (side === 'host' && stallMs && !stalled && now >= 14000) { stalled = true; extra = stallMs; }
      const rate = now >= 10000 + changeAt ? afterBandwidth : bandwidth;
      // Reliable retransmission/route jitter is ordered: later packets cannot overtake.
      const jitter = jitterMs ? (++packetIndex % 29 === 0 ? jitterMs : 0) : 0;
      tails[target] = Math.max(now, tails[target]) + data.length * 1000 / rate + extra + jitter;
      queues[target].push({ at: tails[target] + rtt / 2, data: Buffer.from(data), steamId: BigInt(sender) });
      return true;
    }, isP2PPacketAvailable: () => queues[side][0]?.at <= now ? queues[side][0].data.length : 0,
    readP2PPacket: () => queues[side].shift() };
  }
  host.client = { networking: wire('host') }; guest.client = { networking: wire('guest') };
  const payload = randomBytes(payloadBytes).toString('base64');
  let nextFrame = now;
  for (const end = now + duration; now < end; now++) {
    if (now >= nextFrame) {
      nextFrame += 1000 / 60;
      if (peer.snapshotWritable && peer.inflight.size < window) peer.send(frame(now, payload));
    }
    host.poll(); guest.poll();
    peakFrames = Math.max(peakFrames, peer.inflight.size); peakBytes = Math.max(peakBytes, peer.bufferedAmount);
    peakWireBytes = Math.max(peakWireBytes, ...Object.values(queues).map(q => q.reduce((sum, m) => sum + m.data.length, 0)));
  }
  assert.equal(peer.readyState, 1); assert.equal(guest.renderer.readyState, 1);
  const steady = delivered.filter(f => f.time >= now - 3000);
  return { frames: delivered.length, steadyHz: steady.length / 3, maxAge: Math.max(...delivered.map(f => f.age)),
    recoveredMaxAge: Math.max(...steady.map(f => f.age)), finalWindow: peer.snapshotWindow.limit, peakFrames, peakBytes, peakWireBytes };
}

test('200ms RTT: removes stop-and-wait ceiling without unbounded reliable backlog', t => {
  const old = simulate(t, { window: 1 }), current = simulate(t);
  assert.ok(old.steadyHz < 5.1); assert.ok(current.steadyHz > old.steadyHz * 3);
  assert.ok(current.maxAge < 200); assert.ok(current.peakFrames <= STEAM_SNAPSHOT_WINDOW);
  assert.ok(current.peakBytes <= STEAM_SNAPSHOT_BYTES);
  console.log(JSON.stringify({ scenario: '200ms RTT, 1.024Mbps', old, current }));
});

test('bandwidth-constrained link with 1500ms reliable stall drains and recovers, no disconnect', t => {
  const result = simulate(t, { bandwidth: 16000, stallMs: 1500 });
  assert.ok(result.frames > 30); assert.ok(result.peakFrames <= STEAM_SNAPSHOT_WINDOW);
  assert.ok(result.peakBytes <= STEAM_SNAPSHOT_BYTES); assert.ok(result.peakWireBytes <= STEAM_SNAPSHOT_BYTES);
  assert.ok(result.recoveredMaxAge < 900); assert.ok(result.steadyHz > 4);
  console.log(JSON.stringify({ scenario: '200ms RTT, 128Kbps, 1500ms reliable stall', result }));
});


test('300ms RTT with sufficient bandwidth converges to 60Hz without adding a long queue', t => {
  const result = simulate(t, { rtt: 300, bandwidth: 1000000, duration: 18000 });
  assert.ok(result.steadyHz >= 58, JSON.stringify(result));
  assert.ok(result.recoveredMaxAge < 180, JSON.stringify(result));
  assert.ok(result.peakFrames <= STEAM_SNAPSHOT_WINDOW); assert.ok(result.peakBytes <= STEAM_SNAPSHOT_BYTES);
  console.log(JSON.stringify({ scenario: '300ms RTT, 8Mbps, 60Hz producer', result }));
});

test('bandwidth reduction and ordered jitter shrink the window, avoid stale multi-second steady state', t => {
  const result = simulate(t, { rtt: 200, bandwidth: 1000000, afterBandwidth: 32000, changeAt: 9000, jitterMs: 20, duration: 24000 });
  assert.ok(result.peakFrames >= 10, JSON.stringify(result));
  assert.ok(result.finalWindow < result.peakFrames, JSON.stringify(result));
  assert.ok(result.recoveredMaxAge < 600, JSON.stringify(result));
  assert.ok(result.peakBytes <= STEAM_SNAPSHOT_BYTES); assert.ok(result.steadyHz >= 9, JSON.stringify(result));
  console.log(JSON.stringify({ scenario: '200ms RTT, 8Mbps -> 256Kbps, ordered jitter', result }));
});

test('variable larger snapshots remain within byte cap even when RTT wants more flight slots', t => {
  const result = simulate(t, { rtt: 300, bandwidth: 128000, payloadBytes: 12000, duration: 18000 });
  assert.ok(result.peakBytes <= STEAM_SNAPSHOT_BYTES, JSON.stringify(result));
  assert.ok(result.recoveredMaxAge < 800, JSON.stringify(result));
  assert.ok(result.steadyHz >= 7, JSON.stringify(result));
  console.log(JSON.stringify({ scenario: '300ms RTT, 1.024Mbps, 12KB high-entropy payload', result }));
});


test('adaptive credit never grows for application-limited traffic or invalid duration samples', () => {
  const w = new SnapshotSendWindow();
  for (let i = 0; i < 100; i++) w.acknowledge(200, 10000 + i * 201, 1);
  assert.equal(w.limit, 4);
  const base = w.baseRtt;
  for (const bad of [0, -100, Infinity, NaN]) w.acknowledge(bad, 90000, 4);
  assert.equal(w.limit, 4); assert.equal(w.baseRtt, base);
});

test('adaptive credit grows by at most one per RTT, has count floor/cap and bounded histories', () => {
  const w = new SnapshotSendWindow(); let at = 10000;
  for (let i = 0; i < 100; i++) { w.acknowledge(1, at += 101, w.limit); assert.ok(w.limit <= MAX_SNAPSHOT_WINDOW); }
  assert.equal(w.limit, MAX_SNAPSHOT_WINDOW);
  for (let i = 0; i < 100; i++) w.acknowledge(1000, at += 101, w.limit);
  assert.equal(w.limit, 2);
  for (let i = 0; i < 1000; i++) w.acknowledge(1000, at, 2);
  assert.ok(w.samples.length <= 256); assert.ok(w.roundSamples.length <= 256);
});

test('new connection resets limits; increased RTT floor requires a drained measurement', () => {
  const w = new SnapshotSendWindow(); w.acknowledge(50, 10000, 4); w.acknowledge(300, 41001, 4);
  assert.equal(w.baseRtt, 50); assert.equal(w.limit, 1); assert.equal(w.probe, 'drain');
  w.acknowledge(350, 41500, 1); assert.equal(w.probe, 'measure'); assert.equal(w.baseRtt, 50);
  w.acknowledge(300, 42000, 1); assert.equal(w.baseRtt, 300); assert.equal(w.probe, null); assert.equal(w.limit, 4);
  const { gateway, peer } = fixture(); peer.snapshotWindow.limit = 30;
  gateway.dispatch(guestId, { connection: 'b'.repeat(32), op: 'open', data: { lobby, build: 'test', protocol: protocol.version } });
  assert.equal(gateway.peers.get(guestId).snapshotWindow.limit, 4);
  assert.equal(gateway.peers.get(guestId).snapshotWindow.baseRtt, null);
});


test('two-minute low-bandwidth soak does not slowly learn a stale multi-second queue as normal RTT', t => {
  const result = simulate(t, { rtt: 200, bandwidth: 1000000, afterBandwidth: 16000, changeAt: 8000, duration: 120000 });
  assert.ok(result.recoveredMaxAge < 600, JSON.stringify(result));
  assert.ok(result.finalWindow <= 6, JSON.stringify(result));
  console.log(JSON.stringify({ scenario: '120s virtual soak, 8Mbps -> 128Kbps', result }));
});
