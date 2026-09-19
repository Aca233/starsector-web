// Offline regression of BOTH production LanConnection routes and the actual
// LanBattle input producer. No WebSocket, Steam, browser, or port is opened.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRealtimeFixtures } from './lib/realtime-send-fixture.mjs';
import { realtimeWritable, submitRealtimeInput, RealtimeSendGate } from '../src/network/RealtimeSendPolicy.mjs';
import { encodeBinaryFrame, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const fixture = await createRealtimeFixtures();

test('real-time admission is empty-local-queue only; invalid samples fail closed', () => {
  assert.equal(realtimeWritable(0), true);
  for (const n of [1, 16384, 65536, -1, NaN, Infinity, undefined, '0']) assert.equal(realtimeWritable(n), false);
});
test('blocked producer never spends tokens, allocates input, or reports success', () => {
  const unexpected = () => { throw Error('blocked callbacks must not run'); };
  assert.equal(submitRealtimeInput({ canSend: () => false, takeBudget: unexpected, createInput: unexpected, send: unexpected, accepted: unexpected }), false);
});
test('budget exhaustion and failed local admission never commit input', () => {
  let created = 0, accepted = 0;
  const options = { canSend: () => true, takeBudget: () => false, createInput: () => ++created, send: () => false, accepted: () => accepted++ };
  assert.equal(submitRealtimeInput(options), false); assert.equal(created, 0);
  options.takeBudget = () => true; assert.equal(submitRealtimeInput(options), false); assert.equal(created, 1); assert.equal(accepted, 0);
  options.send = () => true; assert.equal(submitRealtimeInput(options), true); assert.equal(accepted, 1);
});
for (const transport of ['lan', 'steam']) {
  test(`${transport}: busy connection rejects input BEFORE serialization, counters remain uncommitted`, () => {
    const f = fixture(transport); f.socket.bufferedAmount = 1;
    assert.equal(f.connection.send({ type: 'input', get input() { throw Error('must not serialize stale input'); } }), false);
    assert.equal(f.sent.length, 0); assert.equal(f.connection.inputSequence, 0); assert.equal(f.connection.actionSequence, 0);
  });
  test(`${transport}: actual UI preserves actions across pressure, then sends newest controls once`, () => {
    const f = fixture(transport); f.producer.action(1); f.producer.action(2); f.socket.bufferedAmount = 70000;
    for (let i = 1; i <= 60; i++) { f.at(i * 17); f.producer.set({ keys: i % 255, x: i }); f.producer.tick(); }
    assert.equal(f.sent.length, 0); assert.equal(f.producer.actions.length, 2); assert.equal(f.producer.seq, 0); assert.equal(f.producer.records.length, 0);
    f.socket.bufferedAmount = 0; f.producer.tick();
    const m = JSON.parse(f.sent[0]); assert.equal(m.input.keys, 60); assert.equal(m.input.aim[0], 60); assert.deepEqual(m.input.actions.map(a => a.id), [1, 2]);
    assert.equal(f.producer.actions.length, 0); assert.equal(f.producer.seq, 1); assert.equal(f.connection.actionSequence, 2);
    f.at(1040); f.producer.tick(); assert.deepEqual(JSON.parse(f.sent[1]).input.actions, []);
  });
  test(`${transport}: a thrown socket send keeps actions and sequence for retry`, () => {
    const f = fixture(transport), send = f.socket.send; f.producer.action(3);
    f.socket.send = () => { throw Error('send failure'); }; f.producer.tick();
    assert.equal(f.producer.actions.length, 1); assert.equal(f.producer.seq, 0); assert.equal(f.connection.inputSequence, 0);
    f.at(20); f.socket.send = send; f.producer.tick(); assert.equal(f.producer.seq, 1); assert.equal(JSON.parse(f.sent[0]).input.actions[0].id, 3);
  });
  test(`${transport}: busy snapshots skip BEFORE encoding, control/receipts/finish still flow`, () => {
    const f = fixture(transport); f.socket.bufferedAmount = 1;
    const frame = { get binary() { throw Error('must not inspect/encode skipped state'); } };
    assert.equal(f.connection.sendSnapshot('test', 1, frame), 'skipped');
    for (const type of ['ping', 'state-consumed', 'finish', 'leave', 'deployment']) assert.equal(f.connection.send({ type }), true);
    assert.equal(f.sent.length, 5);
    f.socket.bufferedAmount = 0; const json = '{"tick":1,"ships":[]}';
    assert.equal(f.connection.sendSnapshot('test', 1, { json, bytes: Buffer.byteLength(json) }), 'sent');
    assert.deepEqual(JSON.parse(f.sent.at(-1)), { type: 'state', matchId: 'test', seq: 1, frame: JSON.parse(json) });
  });
  test(`${transport}: original disconnect, size limits and explicit focus reset remain`, () => {
    const f = fixture(transport); f.socket.readyState = 3;
    assert.equal(f.connection.send({ type: 'input', input: {} }), false); assert.equal(f.connection.sendSnapshot('test', 1, {}), 'disconnected');
    f.socket.readyState = 1;
    assert.equal(f.connection.sendSnapshot('test', 1, { json: '{}', bytes: 16777217 }), 'oversized');
    f.socket.bufferedAmount = 33554433; assert.equal(f.connection.send({ type: 'finish' }), false);
    f.socket.bufferedAmount = 0; f.producer.action(1); f.producer.set({ focused: false, keys: 12 }); f.producer.tick();
    const m = JSON.parse(f.sent.at(-1)); assert.equal(m.input.keys, 0); assert.equal(m.input.firing, false); assert.equal(m.input.pointerActive, false); assert.deepEqual(m.input.actions, []);
  });
  test(`${transport}: healthy 60Hz producer is not intentionally slowed`, () => {
    const f = fixture(transport);
    for (let i = 0; i < 600; i++) { f.at(i * 1000 / 60); f.producer.tick(); }
    assert.equal(f.sent.length, 600); assert.equal(f.producer.seq, 600);
  });
}

test('one fresh snapshot permits one input, repeated probes do not spend or renew its tail slot', () => {
  const gate = new RealtimeSendGate();
  assert.equal(gate.canSendInput(5, 0), false);
  assert.equal(gate.canSendSnapshot(0, 100), true); gate.snapshotSent(100);
  assert.equal(gate.canSendInput(30000, 100), true); assert.equal(gate.canSendInput(30000, 110), true);
  assert.equal(gate.canSendInput(30000, 117), false, 'the allowance expires without renewal');
  gate.snapshotSent(200); gate.inputSent(200); assert.equal(gate.canSendInput(30000, 200), false);
  gate.snapshotSent(200); assert.equal(gate.canSendInput(0, 200), true); assert.equal(gate.canSendInput(4, 201), false, 'observed drain clears old tail allowance');
  gate.snapshotSent(300); gate.reset(); assert.equal(gate.canSendInput(30000, 300), false);
});
for (const transport of ['lan', 'steam']) test(`${transport}: snapshot-first scheduling cannot starve host input or grow a second input tail`, () => {
  const f = fixture(transport); f.socket.send = raw => { f.sent.push(raw); f.socket.bufferedAmount += Buffer.byteLength(raw); };
  for (let i = 0; i < 600; i++) {
    f.at(i * 1000 / 60); f.socket.bufferedAmount = 0;
    const json = JSON.stringify({ tick: i, ballast: 'x'.repeat(30000) });
    assert.equal(f.connection.sendSnapshot('test', i, { json, bytes: Buffer.byteLength(json) }), 'sent');
    f.producer.tick(); const count = f.sent.length;
    f.producer.tick(); assert.equal(f.sent.length, count, 'one input tail only');
    assert.equal(f.connection.sendSnapshot('test', i + 1000, { json, bytes: Buffer.byteLength(json) }), 'skipped');
  }
  assert.equal(f.sent.filter(raw => JSON.parse(raw).type === 'state').length, 600);
  assert.equal(f.sent.filter(raw => JSON.parse(raw).type === 'input').length, 600);
});


test('LAN binary snapshots retain the exact frame and allow only one trailing input', () => {
  const f = fixture('lan'), frame = { tick: 7, ships: [{ id: 'test', x: 12.125, hp: 199.75 }] };
  const bytes = encodeBinaryFrame(frame), binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  f.socket.send = raw => { f.sent.push(raw); f.socket.bufferedAmount += typeof raw === 'string' ? Buffer.byteLength(raw) : raw.byteLength; };
  assert.equal(f.connection.sendSnapshot('test', 7, { binary, bytes: binary.byteLength }), 'sent');
  assert.deepEqual(decodeBinaryState(f.sent[0]), { type: 'state', matchId: 'test', seq: 7, frame });
  f.producer.action(1); f.producer.tick(); assert.equal(f.sent.length, 2); assert.equal(f.producer.actions.length, 0);
  f.producer.tick(); assert.equal(f.sent.length, 2);
  assert.equal(f.connection.sendSnapshot('test', 8, { binary, bytes: binary.byteLength }), 'skipped');
  const steam = fixture('steam');
  assert.equal(steam.connection.sendSnapshot('test', 7, { binary, bytes: binary.byteLength }), 'disconnected');
  assert.equal(steam.sent.length, 0, 'do not enable the LAN binary wire format for Steam');
});
for (const transport of ['lan', 'steam']) {
  test(transport + ': failed snapshot must not grant an input tail', () => {
    const f = fixture(transport), send = f.socket.send;
    f.socket.send = () => { throw Error('local send failed'); };
    assert.equal(f.connection.sendSnapshot('test', 1, { json: '{}', bytes: 2 }), 'disconnected');
    f.socket.send = send; f.socket.bufferedAmount = 1;
    assert.equal(f.connection.canSendInput(), false); f.producer.tick(); assert.equal(f.sent.length, 0);
  });
  test(transport + ': closing and reusing a connection clears its fresh-snapshot tail', () => {
    const f = fixture(transport);
    assert.equal(f.connection.sendSnapshot('test', 1, { json: '{}', bytes: 2 }), 'sent');
    f.socket.bufferedAmount = 1; assert.equal(f.connection.canSendInput(), true);
    f.connection.close(false); assert.equal(f.connection.canSendInput(), false); assert.equal(f.socket.readyState, 3);
    f.socket.readyState = 1; f.connection.socket = f.socket;
    assert.equal(f.connection.canSendInput(), false, 'new socket must not inherit the old allowance');
    f.socket.bufferedAmount = 0; assert.equal(f.connection.canSendInput(), true);
  });
}


test('fresh input allows one snapshot only within one interval; probes never renew it', () => {
  const gate = new RealtimeSendGate();
  assert.equal(gate.canSendInput(0, 100), true); gate.inputSent(100);
  assert.equal(gate.canSendSnapshot(172, 110), true);
  assert.equal(gate.canSendSnapshot(172, 117), false);
  assert.equal(gate.canSendInput(0, 200), true); gate.inputSent(200);
  assert.equal(gate.canSendSnapshot(172, 201), true); gate.snapshotSent(201);
  assert.equal(gate.canSendInput(30000, 201), false, 'companion cannot grant another companion');
  assert.equal(gate.canSendSnapshot(30000, 201), false);
  gate.inputSent(300); gate.reset(); assert.equal(gate.canSendSnapshot(172, 300), false);
});
for (const transport of ['lan', 'steam']) test(transport + ': input-first scheduling cannot starve snapshots or form an alternating backlog', () => {
  const f = fixture(transport); f.socket.send = raw => { f.sent.push(raw); f.socket.bufferedAmount += Buffer.byteLength(raw); };
  for (let i = 0; i < 600; i++) {
    f.at(i * 1000 / 60); f.socket.bufferedAmount = 0;
    f.producer.tick();
    const json = JSON.stringify({ tick: i, ballast: 'x'.repeat(30000) });
    assert.equal(f.connection.sendSnapshot('test', i, { json, bytes: Buffer.byteLength(json) }), 'sent');
    const count = f.sent.length;
    f.producer.tick(); assert.equal(f.sent.length, count);
    assert.equal(f.connection.sendSnapshot('test', i + 1000, { json, bytes: Buffer.byteLength(json) }), 'skipped');
  }
  assert.equal(f.sent.filter(raw => JSON.parse(raw).type === 'state').length, 600);
  assert.equal(f.sent.filter(raw => JSON.parse(raw).type === 'input').length, 600);
});
