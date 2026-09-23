// Explicit synchronous reference fixture; real-worker coverage lives in check-steam-snapshot-prepare.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { SteamGateway, STEAM_SNAPSHOT_BYTES, STEAM_SNAPSHOT_WINDOW } from '../server/steam/gateway.mjs';
import { SnapshotSendWindow, MAX_SNAPSHOT_WINDOW } from '../server/steam/snapshot-window.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
const hostId = '76561198000000001', guestId = '76561198000000002', lobby = '109775240000000001', connection = 'a'.repeat(32);
function fixture(open = {}) {
  const packets = [], logs = [];
  const gateway = new SteamGateway({ snapshotPreparation: false, build: 'test', log: line => logs.push(JSON.parse(line.slice('[steam-transport] '.length))),
    client: { networking: { sendP2PPacket: (_remote, type, data) => { assert.equal(type, 2); packets.push(data); return true; },
      isP2PPacketAvailable: () => 0 }, } });
  gateway.owner = hostId;
  gateway.selected = { id: lobby, owner: hostId, lobby: { getOwner: () => BigInt(hostId), getMembers: () => [BigInt(hostId), BigInt(guestId)] } };
  gateway.relay = { acceptTransport() {} };
  gateway.dispatch(guestId, { connection, op: 'open', data: { lobby, build: 'test', protocol: protocol.version, ...open } });
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
  const guest = new SteamGateway({ snapshotPreparation: false, build: 'test' });
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
  assert.ok(current.maxAge < 200, JSON.stringify(current)); assert.ok(current.peakFrames <= STEAM_SNAPSHOT_WINDOW);
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

test('shared-room ACK queue cannot become a new RTT baseline or single-frame probe',()=>{
 const w=new SnapshotSendWindow();w.acknowledge(300,0,4,false);
 for(let now=400;now<=80000;now+=400){w.acknowledge(1000,now,4,false);assert.equal(w.probe,null);assert.ok(w.limit>=2);assert.equal(w.baseRtt,300);}
 w.acknowledge(280,80400,2,false);assert.equal(w.baseRtt,280,'genuine lower observations remain usable');
});
test('a second room peer cancels an outstanding upward RTT probe without losing credit control',()=>{
 const w=new SnapshotSendWindow();w.acknowledge(50,10000,4);w.acknowledge(300,41001,4);assert.equal(w.probe,'drain');
 w.acknowledge(350,41500,1,false);assert.equal(w.probe,null);assert.equal(w.baseRtt,50);assert.ok(w.limit>=2);
 const limit=w.limit;w.acknowledge(NaN,42000,1,false);assert.equal(w.limit,limit);assert.equal(w.baseRtt,50);
});

test('Steam motion handles fragmentation, loss, reordering, duplicate/old scopes and malformed packets', async () => {
  const { encodeSteamMotion, SteamMotionReceiver } = await import('../server/steam/motion-channel.mjs');
  const { encodeMotionFrame, motionToText } = await import('../src/network/MotionFrame.mjs');
  let now = 0;
  const receiver = new SteamMotionReceiver(connection, { now: () => now });
  const arm = (sync = 'sync') => {
    receiver.reset('match', sync);
    receiver.worldReceived(0, { matchId: 'match', frame: { tick: 0 } });
    assert.ok(receiver.worldConsumed(0));
  };
  arm();
  const message = tick => ({ type: 'motion', matchId: 'match', syncId: 'sync', data: motionToText(encodeMotionFrame({
    tick, time: tick / 60, acknowledged: {},
    ships: Array.from({ length: 100 }, (_, i) => ['ship' + i, ...Array.from({ length: 6 }, (_, j) => ((i + 1) * 12345.6789 * (j + 1)) % 100000), 0, 0]),
  })) });
  const a = encodeSteamMotion(connection, message(1)); assert.ok(a.packets.length > 1);
  assert.equal(receiver.receive(a.packets[0]), null); now = 251;
  const b = encodeSteamMotion(connection, message(2)); let result;
  for (const p of [...b.packets].reverse()) result = receiver.receive(p) ?? result;
  assert.deepEqual(result, message(2)); assert.equal(receiver.parts.size, 0);
  for (const p of a.packets) assert.equal(receiver.receive(p), null, 'old lost pose cannot rewind');
  for (const p of b.packets) assert.equal(receiver.receive(p), null, 'duplicate cannot reapply');
  assert.equal(receiver.consume({ matchId: 'match', syncId: 'old', tick: 2 }), null);
  assert.equal(receiver.consume({ matchId: 'match', syncId: 'sync', tick: 999 }), null);
  assert.deepEqual(receiver.consume({ matchId: 'match', syncId: 'sync', tick: 2 }), { motion: 1, matchId: 'match', syncId: 'sync', tick: 2 });
  arm('next'); for (const p of encodeSteamMotion(connection, message(3)).packets) assert.equal(receiver.receive(p), null, 'old sync rejected');
  arm(); for (const p of encodeSteamMotion('b'.repeat(32), message(4)).packets) assert.equal(receiver.receive(p), null, 'wrong nonce rejected before allocation');
  assert.equal(receiver.parts.size, 0);
  const bad = Buffer.from(b.packets[0]); bad.writeUInt16LE(65535, 18); assert.equal(receiver.receive(bad), null);
  const corrupt = b.packets.map(p => Buffer.from(p)); corrupt[0][36] ^= 1;
  for (const p of corrupt) assert.equal(receiver.receive(p), null, 'inconsistent checksum cannot deliver');
  arm();
  for (let tick = 10; tick < 50; tick++) receiver.receive(encodeSteamMotion(connection, message(tick)).packets[0]);
  assert.equal(receiver.parts.size, 2, 'loss never allocates an unbounded reassembly queue');
});

test('Steam motion requires real world consumption, bounds shared traffic and expires without faking ACKs', async () => {
  const { SteamMotionBudget, SteamMotionSender } = await import('../server/steam/motion-channel.mjs');
  const { encodeMotionFrame, motionToText } = await import('../src/network/MotionFrame.mjs');
  let now = 0; const budget = new SteamMotionBudget({ now: () => now }), sent = [];
  const sender = new SteamMotionSender(connection, budget, p => { sent.push(p); return true; }, { now: () => now });
  const message = tick => ({ type: 'motion', matchId: 'match', syncId: 'sync', data: motionToText(encodeMotionFrame({ tick, time: tick / 60, acknowledged: {}, ships: [['ship', tick, 0, 0, 0, 0, 0, 0, 0]] })) });
  sender.worldSent(1, { matchId: 'match', seq: 1, tick: 1 }); assert.equal(sender.send(message(2)), false);
  assert.equal(sender.worldConsumed(999), false); assert.equal(sender.worldConsumed(1), true);
  for (let tick = 2; tick <= 5; tick++) assert.ok(sender.send(message(tick)));
  assert.equal(sender.send(message(6)), false); assert.equal(sender.stats().inflight, 4);
  assert.equal(sender.consumed({ matchId: 'wrong', syncId: 'sync', tick: 5 }), false);
  now = 251;
  assert.equal(sender.consumed({ matchId: 'match', syncId: 'sync', tick: 5 }), false, 'late ACK cannot resurrect expired credit');
  assert.equal(sender.stats().consumed, 0); assert.equal(sender.stats().expired, 4); assert.equal(sender.send(message(7)), false);
  assert.ok(sender.stats().fallback); sender.reset(); assert.ok(sender.stats().fallback, 'same-match resync cannot erase sticky fallback');
  sender.reset(null); sender.worldSent(2, { matchId: 'match', seq: 2, tick: 8 }); sender.worldConsumed(2, true);
  assert.equal(sender.send(message(9)), false, 'discarded full state is not a usable baseline');
  sender.worldSent(3, { matchId: 'match', seq: 3, tick: 9 }); sender.worldConsumed(3);
  assert.ok(sender.send(message(10))); assert.ok(sender.consumed({ matchId: 'match', syncId: 'sync', tick: 10 }));
  now += 751; assert.equal(sender.send(message(11)), false); assert.equal(sender.stats().world.fallbackReason, 'whole-state-stalled');
  sender.reset(); assert.equal(sender.stats().world.fallbackReason, 'whole-state-stalled');
  const fair = new SteamMotionBudget({ now: () => now, burst: 1200, bytesPerSecond: 1200 });
  assert.ok(fair.take(1200, 'a')); assert.equal(fair.take(1000, 'b'), false); now += 200;
  assert.equal(fair.take(100, 'a'), false, 'small later sender cannot starve older request');
  for (let i = 0; i < 3; i++) { assert.equal(fair.take(1000, 'b'), false); now += 200; }
  assert.equal(fair.take(1000, 'b'), false); // Still polled within the 250ms intent lifetime.
  assert.equal(fair.take(100, 'a'), false); now += 100;
  assert.ok(fair.take(1000, 'b')); assert.ok(sent.every(p => p.length <= 1200));
});

test('Steam motion visibility and resync require a new retained world and discard old receipt authority', async () => {
  const { encodeSteamMotion, SteamMotionReceiver } = await import('../server/steam/motion-channel.mjs');
  const { encodeMotionFrame, motionToText } = await import('../src/network/MotionFrame.mjs');
  const receiver = new SteamMotionReceiver(connection); receiver.reset('match', 'sync');
  const packet = (tick, syncId = 'sync') => encodeSteamMotion(connection, { type: 'motion', matchId: 'match', syncId,
    data: motionToText(encodeMotionFrame({ tick, time: tick / 60, acknowledged: {}, ships: [] })) }).packets[0];
  const world = tick => ({ matchId: 'match', frame: { tick } });
  receiver.worldReceived(1, world(1)); assert.equal(receiver.receive(packet(2)), null, 'network arrival is not consumption');
  assert.ok(receiver.worldConsumed(1)); assert.ok(receiver.receive(packet(2)));
  receiver.worldReceived(2, world(3)); receiver.setHidden(true);
  assert.equal(receiver.consume({ matchId: 'match', syncId: 'sync', tick: 2 }), null);
  receiver.setHidden(false); assert.equal(receiver.worldConsumed(2), false); assert.equal(receiver.receive(packet(4)), null);
  receiver.worldReceived(3, world(4)); assert.ok(receiver.worldConsumed(3));
  assert.equal(receiver.receive(packet(2)), null, 'old datagram cannot rewind past fresh baseline'); assert.ok(receiver.receive(packet(5)));
  receiver.reset('match', 'new-sync'); assert.equal(receiver.worldConsumed(3), false);
  receiver.worldReceived(4, world(6)); receiver.worldConsumed(4);
  assert.equal(receiver.receive(packet(7)), null); assert.ok(receiver.receive(packet(7, 'new-sync')));
});

test('Steam motion capability alone never advertises negotiated renderer support', () => {
  const { gateway, peer } = fixture({ stateConsumption: 1, motion: 1 });
  assert.equal(peer.diagnostics().motion, null);
  gateway.dispatch(guestId, { connection, id: 100, op: 'data', data: { type: 'hello', stateCredits: 1 } });
  peer.send(JSON.stringify({ type: 'welcome' }));
  assert.equal(peer.diagnostics().motion, null); assert.equal(peer.sendMotion({}), false);
  // Only a trusted relay welcome may finish both ends of the negotiation.
  peer.send(JSON.stringify({ type: 'welcome', motionState: 1, motionTransport: 'steam-datagram-v1' }));
  assert.equal(peer.diagnostics().motion.world.status, 'awaiting-world');
  assert.equal(peer.motionEnabled, true); peer.close();
});

test('Steam motion superseded by a real newer full world is not mistaken for packet loss', async () => {
  const { SteamMotionBudget, SteamMotionSender } = await import('../server/steam/motion-channel.mjs');
  const { encodeMotionFrame, motionToText } = await import('../src/network/MotionFrame.mjs');
  let now = 0;
  const sender = new SteamMotionSender(connection, new SteamMotionBudget({ now: () => now }), () => true, { now: () => now });
  const world = tick => { sender.worldSent(tick, { matchId: 'match', seq: tick, tick }); assert.ok(sender.worldConsumed(tick)); };
  const pose = tick => ({ type: 'motion', matchId: 'match', syncId: 'sync', data: motionToText(encodeMotionFrame({ tick, time: tick / 60, acknowledged: {}, ships: [] })) });
  world(1);
  for (let tick = 2; tick <= 5; tick++) { assert.ok(sender.send(pose(tick))); world(tick); now += 100; }
  sender.expire(); assert.equal(sender.stats().inflight, 0); assert.equal(sender.stats().bytes, 0);
  assert.equal(sender.stats().consumed, 0); assert.equal(sender.stats().superseded, 4);
  assert.equal(sender.stats().expired, 0); assert.equal(sender.stats().fallback, null);
  assert.equal(sender.send(pose(5)), false); assert.ok(sender.send(pose(6)));
});

test('Steam components isolate receipt credit, fragmented loss, corruption and old connections', async () => {
  const { SteamComponentBudget, SteamComponentSender, SteamComponentReceiver } = await import('../server/steam/component-channel.mjs');
  const { encodeCombatState, COMBAT_NUMBERS } = await import('../src/network/CriticalCombatState.mjs');
  let now = 0, reason = null;
  const budget = new SteamComponentBudget({ now: () => now }), packets = [];
  const sender = new SteamComponentSender(connection, budget, p => { packets.push(p); return true; }, r => { reason = r; }, { now: () => now });
  const receiver = new SteamComponentReceiver(connection, { now: () => now });
  const message = tick => ({ type: 'combat-state', matchId: 'match', syncId: 'sync', tick, data: Buffer.from(encodeCombatState({ tick, time: tick / 60,
    ships: Array.from({ length: 100 }, (_, i) => ['ship-' + i, 0, 0, ...COMBAT_NUMBERS.map((_, j) => Math.sin(i * 97 + j * 61 + tick) * 12345)]) })).toString('base64') });
  assert.ok(sender.send(message(1))); assert.ok(packets.length > 1); assert.ok(packets.every(p => p.length <= 1200));
  let delivered; for (const p of [...packets].reverse()) delivered = receiver.receive(p, 'match', 'sync') ?? delivered;
  assert.deepEqual(delivered, message(1)); assert.equal(sender.stats().consumed, 0, 'packet delivery is not application consumption');
  const receipt = { type: 'combat-consumed', matchId: 'match', syncId: 'sync', tick: 1, status: 'consumed' };
  assert.equal(receiver.consume({ ...receipt, syncId: 'old' }), null);
  const ack = receiver.consume(receipt); assert.ok(ack); assert.equal(sender.consume(ack.component, null), null);
  assert.deepEqual(sender.consume(ack.component, ack.receipt), receipt); assert.equal(budget.flight, 0);
  for (const p of packets) assert.equal(receiver.receive(p, 'match', 'sync'), null);
  const foreign = new SteamComponentReceiver('b'.repeat(32)); for (const p of packets) assert.equal(foreign.receive(p, 'match', 'sync'), null);
  assert.equal(foreign.parts.size, 0);
  packets.length = 0; assert.ok(sender.send(message(2)));
  const corrupt = packets.map(p => Buffer.from(p)); corrupt[0][40] ^= 1;
  for (const p of corrupt) assert.equal(receiver.receive(p, 'match', 'sync'), null);
  now = 501; sender.poll(); await Promise.resolve();
  assert.equal(reason, 'component-loss-or-consumer-stall'); assert.equal(sender.stats().consumed, 1);
  assert.equal(budget.flight, 0); assert.equal(sender.send(message(3)), false, 'loss disables only optional epoch without fake ACK');
  sender.reset(); assert.ok(sender.send(message(4))); sender.reset(); assert.equal(budget.flight, 0);
  // Transport credit must obey the same fragment/final semantics as the relay.
  assert.equal(receiver.consume(null), null);
  for (const offset of [0, 6144]) {
    packets.length = 0;
    const visual = {type:'projectile-visual',matchId:'match',syncId:'sync',key:1,tick:5,kind:'baseline',offset,total:6145,data:Buffer.alloc(offset === 0 ? 6144 : 1).toString('base64')};
    assert.ok(sender.send(visual));
    for (const p of packets) receiver.receive(p, 'match', 'sync');
    const r = {type:'visual-consumed',matchId:'match',syncId:'sync',key:1,tick:5,kind:'baseline',offset,total:6145,status:offset === 0 ? 'fragment' : 'consumed'};
    const wrong = {...r,status:offset === 0 ? 'consumed' : 'fragment'};
    assert.equal(receiver.consume(wrong), null);
    assert.equal(sender.consume(sender.serial, wrong), null);
    assert.ok(budget.flight > 0);
    const exact = receiver.consume(r); assert.ok(exact);
    assert.deepEqual(sender.consume(exact.component, exact.receipt), r);
    assert.equal(budget.flight, 0);
  }
});

test('authority component upload validates cached visual anchors and complete combat bytes', async () => {
  const { AuthorityComponentPublisher, AuthorityComponentReceiver } = await import('../src/network/AuthorityComponents.mjs');
  const { AnchoredProjectilePublisher } = await import('../src/network/AnchoredProjectileVisual.mjs');
  const { encodeCombatState } = await import('../src/network/CriticalCombatState.mjs');
  const source = new AuthorityComponentPublisher(), target = new AuthorityComponentReceiver('match'), visual = new AnchoredProjectilePublisher('match');
  const first = source.prepare('match', { type: 'projectile-visual', publication: visual.publish({ tick: 1, time: 1 / 60, rows: [] }) });
  assert.ok(first.message.baseline); first.commit(); assert.equal(target.receive(first.message).publication.tick, 1);
  const next = source.prepare('match', { type: 'projectile-visual', publication: visual.publish({ tick: 2, time: 2 / 60, rows: [] }) });
  assert.equal(next.message.baseline, undefined); assert.equal(target.receive(next.message).publication.tick, 2);
  assert.throws(() => new AuthorityComponentReceiver('match').receive(next.message), /baseline/);
  assert.throws(() => target.receive({ ...next.message, matchId: 'old' }), /scope/);
  const combat = source.prepare('match', { type: 'combat-state', tick: 3, data: encodeCombatState({ tick: 3, time: .05, ships: [] }) });
  assert.equal(target.receive(combat.message).frame.tick, 3);
  assert.throws(() => target.receive({ ...combat.message, tick: 4 }), /tick/);
  source.reset(); assert.ok(source.prepare('match', { type: 'projectile-visual', publication: visual.latest }).message.baseline);
});

test('Steam world-stall recovery requires timely actual consumption in the current epoch',async()=>{
  const {SteamMotionBudget,SteamMotionSender}=await import('../server/steam/motion-channel.mjs');
  const {encodeMotionFrame,motionToText}=await import('../src/network/MotionFrame.mjs');
  let now=0;const sender=new SteamMotionSender(connection,new SteamMotionBudget({now:()=>now}),()=>true,{now:()=>now});
  const msg=tick=>({type:'motion',matchId:'m',syncId:'s',data:motionToText(encodeMotionFrame({tick,time:tick/60,acknowledged:{},ships:[['a',tick,0,0,0,0,0,0,0]]}))});
  sender.worldSent(1,{matchId:'m',seq:1,tick:1});sender.worldConsumed(1);now=800;assert.equal(sender.send(msg(50)),false);
  sender.reset('m');assert.equal(sender.worldConsumed(1),false);
  for(const [seq,at] of [[2,1300],[3,1550],[4,1800]]){
    now=at;sender.worldSent(seq,{matchId:'m',seq,tick:seq*2});now+=20;
    assert.equal(sender.send(msg(seq*2+1)),false,'network send/ACK alone is not world consumption');
    assert.equal(sender.worldConsumed(seq),true);assert.equal(sender.send(msg(seq*2+1)),seq===4);
  }
  assert.equal(sender.stats().world.recoveries,1);assert.equal(sender.stats().sent,1);
});
