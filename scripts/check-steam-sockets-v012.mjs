import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindSteamSocketsV012, SOCKETS_MAX_MESSAGE } from '../server/steam/sockets-v012.mjs';
const ID = '76561198000000002', OTHER = '76561198000000003';
function fixture() {
  let nextPointer = 0x1000n;
  const arena = new Map(), events = [], signatures = [], inbox = [], allowed = new Set([ID]);
  const modes = { nativeIdentity: ID, infoAvailable: true, sendResult: 1n, lanesResult: 1, groupResult: true, allocateNull: false, failWrite: false, failRead: false, throwAfterSend: false, badCount: null };
  function alloc(bytes) { const p = nextPointer; nextPointer += BigInt(bytes + 256); arena.set(p, Buffer.alloc(bytes)); return p; }
  function at(pointer, length) {
    for (const [start, buffer] of arena) {
      const offset = Number(pointer - start);
      if (offset >= 0 && offset + length <= buffer.length) return buffer.subarray(offset, offset + length);
    }
    throw Error('Invalid fixture pointer');
  }
  function release(message) {
    events.push({ op: 'release', message });
    assert.ok(arena.has(message), 'release exactly once');
    const data = at(message, 8).readBigUInt64LE();
    if (arena.has(data)) { arena.get(data).fill(0xdd); arena.delete(data); }
    arena.delete(message);
  }
  function allocate(bytes) {
    if (modes.allocateNull) return null;
    const message = alloc(216), data = alloc(bytes);
    at(message, 8).writeBigUInt64LE(data); at(message + 8n, 4).writeInt32LE(bytes);
    return message;
  }
  const memory = {
    decode(pointer, offsetOrType, typeOrCount) {
      if (modes.failRead) throw Error('PRIVATE native decoder detail');
      if (typeof offsetOrType === 'string') return Uint8Array.from(at(pointer, typeOrCount));
      const location = pointer + BigInt(offsetOrType);
      if (typeOrCount === 'void *') return at(location, 8).readBigUInt64LE();
      if (typeOrCount === 'int32_t') return at(location, 4).readInt32LE();
      if (typeOrCount === 'uint32_t') return at(location, 4).readUInt32LE();
      if (typeOrCount === 'uint16_t') return at(location, 2).readUInt16LE();
      throw Error('Unexpected decode');
    },
    encode(pointer, offsetOrType, typeOrValue, value) {
      if (modes.failWrite) throw Error('PRIVATE native encoder detail');
      if (typeof offsetOrType === 'string') { Buffer.from(typeOrValue).copy(at(pointer, value)); return; }
      const location = pointer + BigInt(offsetOrType);
      if (typeOrValue === 'uint32_t') at(location, 4).writeUInt32LE(value);
      else if (typeOrValue === 'int32_t') at(location, 4).writeInt32LE(value);
      else if (typeOrValue === 'uint16_t') at(location, 2).writeUInt16LE(value);
      else throw Error('Unexpected encode');
    },
  };
  const exports = {
    SteamNetworkingSockets_SteamAPI_v012() { events.push({ op: 'sockets' }); return 1n; },
    SteamNetworkingUtils_SteamAPI_v004() { events.push({ op: 'utils' }); return 2n; },
    ISteamNetworkingSockets_CreatePollGroup() { return 3; },
    ISteamNetworkingSockets_DestroyPollGroup(_self, group) { events.push({ op: 'destroy', group }); return true; },
    ISteamNetworkingSockets_SetConnectionPollGroup(_self, connection, group) { events.push({ op: 'group', connection, group }); return modes.groupResult; },
    ISteamNetworkingSockets_ConfigureConnectionLanes(_self, connection, count, priorities, weights) { events.push({ op: 'lanes', connection, count, priorities, weights }); return modes.lanesResult; },
    ISteamNetworkingSockets_GetConnectionInfo(_self, connection, info) { events.push({op:'info',connection});assert.equal(info.length,696);info.writeBigUInt64LE(BigInt(modes.nativeIdentity),8);return modes.infoAvailable; },
    ISteamNetworkingUtils_AllocateMessage(_self, bytes) { events.push({ op: 'allocate', bytes }); return allocate(bytes); },
    ISteamNetworkingSockets_SendMessages(_self, count, pointers, results) {
      assert.equal(count, 1); const message = pointers.readBigUInt64LE();
      events.push({ op: 'send', connection: memory.decode(message, 12, 'uint32_t'), lane: memory.decode(message, 208, 'uint16_t'), flags: memory.decode(message, 196, 'int32_t'), data: Buffer.from(memory.decode(memory.decode(message, 0, 'void *'), 'uint8_t', memory.decode(message, 8, 'int32_t'))) });
      results.writeBigInt64LE(modes.sendResult); release(message);
      if (modes.throwAfterSend) throw Error('PRIVATE exception AFTER ownership transfer');
    },
    ISteamNetworkingSockets_ReceiveMessagesOnPollGroup(_self, group, pointers, max) {
      assert.equal(group, 3); assert.equal(max, 16);
      const batch = inbox.splice(0, max); batch.forEach((p, i) => pointers.writeBigUInt64LE(p, i * 8)); return modes.badCount ?? batch.length;
    },
    SteamNetworkingIdentity_GetSteamID64(identity) { return Buffer.isBuffer(identity) ? identity.readBigUInt64LE(8) : at(identity + 8n, 8).readBigUInt64LE(); },
    SteamNetworkingMessage_t_Release: release,
  };
  const library = { func(signature) {
    signatures.push(signature); const name = signature.match(/SteamAPI_(\w+)\(/)?.[1];
    assert.equal(typeof exports[name], 'function', signature); return exports[name];
  } };
  const io = bindSteamSocketsV012(library, memory);
  const open = () => { io.open({ sdkInitialized: true, allowed: remote => allowed.has(remote) }); assert.equal(io.attach(10, ID), true); };
  function queue({ connection = 10, remote = ID, kind = 'control', flags = kind === 'snapshot' ? 0 : 8, size, bodyNull = false, data = Buffer.from('native payload') } = {}) {
    const p = allocate(data.length), body = at(p, 8).readBigUInt64LE(); data.copy(at(body, data.length));
    at(p + 12n, 4).writeUInt32LE(connection); at(p + 24n, 8).writeBigUInt64LE(BigInt(remote));
    at(p + 196n, 4).writeInt32LE(flags); at(p + 208n, 2).writeUInt16LE(({ control: 0, anchor: 1, snapshot: 2 })[kind] ?? 65535);
    if (size !== undefined) at(p + 8n, 4).writeInt32LE(size);
    if (bodyNull) { arena.delete(body); at(p, 8).writeBigUInt64LE(0n); }
    inbox.push(p); return p;
  }
  return { io, open, queue, modes, events, signatures, arena, allowed, inbox };
}

test('Sockets v012 binding is inert and fixes the 4-argument flattened SendMessages ownership ABI', () => {
  const f = fixture(); assert.deepEqual(f.events, []); assert.equal(f.signatures.length, 12);
  assert.ok(f.signatures.includes('void SteamAPI_ISteamNetworkingSockets_SendMessages(void *self, int count, void *messages, void *results)'));
  assert.ok(!f.signatures.some(s => /_v013|Init|Listen|ConnectP2P|Callback|RunCallbacks/.test(s)));
  assert.throws(() => f.io.open({ allowed: () => true }), /Initialized/); assert.deepEqual(f.events, []);
});
test('membership, handles and a ten-connection bound precede native lane/group writes', () => {
  const f = fixture(); f.open();
  assert.deepEqual(f.events.find(e => e.op === 'lanes'), { op: 'lanes', connection: 10, count: 3, priorities: [0, 1, 2], weights: [1, 1, 1] });
  const calls = f.events.length;
  for (const h of [0, -1, NaN, Infinity, 1.5, '10', 0x100000000]) assert.equal(f.io.attach(h, ID), false);
  assert.equal(f.io.attach(10, OTHER), false); assert.equal(f.io.attach(11, OTHER), false); assert.equal(f.events.length, calls);
  for (let i = 11; i < 20; i++) assert.equal(f.io.attach(i, ID), true);
  assert.equal(f.io.attach(20, ID), false); assert.equal(f.io.diagnostics().connections, 10); f.io.close();
});
test('failed lane/group setup cannot authorize a connection for sending', () => {
  const f = fixture(); f.io.open({sdkInitialized:true,allowed:()=>true}); f.modes.lanesResult=8;
  assert.equal(f.io.attach(10,ID),false); assert.ok(!f.events.some(e=>e.op==='group'));
  f.modes.lanesResult=1;f.modes.groupResult=false;assert.equal(f.io.attach(10,ID),false);
  assert.equal(f.io.send(10,Buffer.from('x'),'control').reason,'peer-not-authorized');assert.ok(!f.events.some(e=>e.op==='allocate'));f.io.close();
});
test('control/anchor use reliable 9; replaceable state uses modern NoDelay 5 on separate priority lanes', () => {
  const f = fixture(); f.open(); f.modes.sendResult = 9007199254740995n;
  for (const [kind,lane,flags] of [['control',0,9],['anchor',1,9],['snapshot',2,5]]) {
    const bytes=Buffer.from([0,0xff,19,38]);assert.deepEqual(f.io.send(10,bytes,kind),{status:'accepted',messageNumber:'9007199254740995'});
    const sent=f.events.filter(e=>e.op==='send').at(-1);assert.equal(sent.lane,lane);assert.equal(sent.flags,flags);assert.deepEqual(sent.data,bytes);assert.equal(f.arena.size,0);
  }
  assert.equal(f.events.filter(e=>e.op==='release').length,3);f.io.close();
});
test('NoDelay rejection is only a dropped snapshot; reliable errors and native backpressure are explicit', () => {
  const f=fixture();f.open();
  for(const [result,kind,status] of [[-41n,'snapshot','dropped'],[-41n,'anchor','error'],[-25n,'control','backpressure'],[-3n,'control','error'],[0n,'snapshot','error']]) {
    f.modes.sendResult=result;assert.equal(f.io.send(10,Buffer.from('payload'),kind).status,status);assert.equal(f.arena.size,0);
  }
  assert.equal(f.events.filter(e=>e.op==='release').length,5);f.io.close();
});
test('oversize/invalid sends do not allocate; the exact documented 512KiB native maximum works', () => {
  const f=fixture();f.open();
  for(const [data,kind] of [[Buffer.alloc(0),'control'],[Buffer.alloc(SOCKETS_MAX_MESSAGE+1),'snapshot'],['x','control'],[Buffer.from('x'),'__proto__'],[Buffer.from('x'),'reliable-no-delay']])assert.equal(f.io.send(10,data,kind).reason,'invalid-message');
  assert.ok(!f.events.some(e=>e.op==='allocate'));assert.equal(f.io.send(10,Buffer.alloc(SOCKETS_MAX_MESSAGE),'anchor').status,'accepted');assert.equal(f.arena.size,0);f.io.close();
});
test('allocation or preparation failure cannot leak an SDK-owned message', () => {
  const f=fixture();f.open();f.modes.allocateNull=true;assert.equal(f.io.send(10,Buffer.from('x'),'control').reason,'allocation-failed');assert.equal(f.arena.size,0);
  f.modes.allocateNull=false;f.modes.failWrite=true;assert.equal(f.io.send(10,Buffer.from('x'),'control').reason,'native-prepare-failed');assert.equal(f.arena.size,0);assert.equal(f.events.filter(e=>e.op==='release').length,1);f.io.close();
});
test('exception after native ownership transfer quarantines without double-free or unbounded retries', () => {
  const f=fixture();f.open();f.modes.throwAfterSend=true;
  assert.deepEqual(f.io.send(10,Buffer.from('x'),'control'),{status:'error',reason:'native-ownership-uncertain'});assert.equal(f.arena.size,0);
  const count=f.events.length;assert.equal(f.io.send(10,Buffer.from('x'),'control').reason,'native-unavailable');assert.deepEqual(f.io.receive(),[]);assert.equal(f.events.length,count);assert.equal(f.io.diagnostics().uncertainSends,1);f.io.close();
});
test('receive copies data before Release and rejects identity/handle/lane/reliability mismatches', () => {
  const f=fixture();f.open();f.queue();f.queue({kind:'snapshot'});f.queue({kind:'anchor'});
  for(const message of [{remote:OTHER},{connection:99},{kind:'unknown'},{kind:'control',flags:0},{kind:'snapshot',flags:8}])f.queue(message);
  const rows=f.io.receive();assert.deepEqual(rows.map(r=>r.kind),['control','snapshot','anchor']);for(const row of rows)assert.equal(row.data.toString(),'native payload');assert.equal(f.arena.size,0);assert.equal(f.io.diagnostics().discarded,5);f.io.close();
});
test('membership is rechecked on send/receive, not frozen at attach time', () => {
  const f=fixture();f.open();f.queue();f.allowed.clear();const count=f.events.filter(e=>e.op==='allocate').length;
  assert.equal(f.io.send(10,Buffer.from('x'),'control').reason,'peer-not-authorized');assert.equal(f.events.filter(e=>e.op==='allocate').length,count);
  assert.deepEqual(f.io.receive(),[]);assert.equal(f.arena.size,0);f.io.close();
});
test('oversized, negative, empty and null-buffer native receives are dropped before payload allocation', () => {
  const f=fixture();f.open();for(const m of [{size:SOCKETS_MAX_MESSAGE+1},{size:-1},{size:0},{bodyNull:true}])f.queue(m);
  assert.deepEqual(f.io.receive(),[]);assert.equal(f.io.diagnostics().discarded,4);assert.equal(f.arena.size,0);assert.equal(f.io.diagnostics().available,true);f.io.close();
});
test('receive is capped at 16; decoding errors release every entry, not just the failing first item', () => {
  const f=fixture();f.open();for(let i=0;i<20;i++)f.queue();assert.equal(f.io.receive().length,16);assert.equal(f.inbox.length,4);
  f.modes.failRead=true;assert.deepEqual(f.io.receive(),[]);assert.equal(f.arena.size,0);assert.equal(f.io.diagnostics().available,false);f.io.close();
});
test('invalid native counts and duplicate native pointers cannot leak or double-free returned allocations', () => {
  for(const mode of ['count','duplicate']) {
    const f=fixture();f.open();const p=f.queue();if(mode==='count'){f.queue();f.modes.badCount=17;}else f.inbox.push(p);
    assert.deepEqual(f.io.receive(),[]);assert.equal(f.arena.size,0);assert.equal(f.io.diagnostics().available,false);f.io.close();
  }
});
test('close detaches only owned handles and destroys its poll group once; stale objects cannot auto-reopen', () => {
  const f=fixture();f.open();assert.equal(f.io.detach(999),false);assert.equal(f.io.detach(10),true);assert.equal(f.io.send(10,Buffer.from('x'),'snapshot').reason,'peer-not-authorized');
  assert.equal(f.io.close(),true);assert.equal(f.io.close(),true);assert.equal(f.events.filter(e=>e.op==='destroy').length,1);assert.throws(()=>f.open(),/faulted/);
});

test('native connection identity is verified before trusting a manager-provided handle mapping', () => {
  const f=fixture();f.io.open({sdkInitialized:true,allowed:()=>true});f.modes.nativeIdentity=OTHER;
  assert.equal(f.io.attach(10,ID),false);assert.ok(!f.events.some(e=>e.op==='lanes'||e.op==='group'));
  f.modes.nativeIdentity=ID;f.modes.infoAvailable=false;assert.equal(f.io.attach(10,ID),false);
  assert.equal(f.io.send(10,Buffer.from('private game data'),'control').reason,'peer-not-authorized');
  f.modes.infoAvailable=true;assert.equal(f.io.attach(10,ID),true);f.io.close();
});

test('forget invalidated native handles is local-only, blocks future sends and never detaches foreign handles',()=>{
 const f=fixture();f.open();assert.equal(f.io.attach(17,ID),true);const before=f.events.length;
 assert.equal(f.io.forget(17),true);assert.equal(f.io.forget(17),false);
 assert.equal(f.events.length,before,'forget must not invoke native functions');
 assert.equal(f.io.send(17,Buffer.from('stale'),'control').status,'error');
 f.io.close();assert.equal(f.events.filter(e=>e.op==='group'&&e.connection===17&&e.group===0).length,0);
});
