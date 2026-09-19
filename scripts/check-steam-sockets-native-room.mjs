// Actual native fixture host lifecycle/status/IO -> room/session/pacer adapter
// -> simulated JS guest/browser. Never initializes or connects the Steam DLL.
import { EventEmitter } from 'node:events';
import { bindSteamSocketsLifecycleV012 } from '../server/steam/sockets-lifecycle-v012.mjs';
import { bindSteamSocketsStatusV012 } from '../server/steam/sockets-status-v012.mjs';
import { SteamSocketRoom } from '../server/steam/sockets-room.mjs';
import { socketWireHeader } from '../server/steam/sockets-wire.mjs';
export function checkNativeRoom({ library, memory, check, metric, queue, next }) {
  const HOST = '76561198000000001', GUEST = '76561198000000002', ROOM = '10977524000000001';
  const incoming = library.func('uint32_t SW_TestIncoming(uint32_t listener, uint64_t identity)');
  const readLast = library.func('int SW_TestReadLast(void *output, int capacity)');
  const life = bindSteamSocketsLifecycleV012(library, memory, { statusReader: bindSteamSocketsStatusV012(library) });
  const guestTicket = { handle: 5000, lease: '987', remote: HOST, scope: ROOM }, guestInbox = [], guestNotices = [], app = [];
  let now = 0, nativeTicket = null, peer = null, sends = 0, receives = 0, packedNativePackets = 0, blocked = false, allowed = true;
  const native = Object.fromEntries(['open', 'connect', 'poll', 'receive', 'send', 'sample', 'disconnect', 'close'].map(k => [k, life[k].bind(life)]));
  native.poll = time => {
    const notices = life.poll(time);
    for (const notice of notices) if (notice.type === 'connected') nativeTicket = notice.ticket;
    return notices;
  };
  native.send = (ticket, data, kind) => {
    next(blocked ? -25 : 1); const result = life.send(ticket, data, kind); sends++;
    check(metric(0), 0, 'room adapter native send allocation consumed');
    check(metric(6), kind === 'snapshot' ? 5 : 9, 'room adapter native flags');
    check(metric(7), ({ control: 0, anchor: 1, snapshot: 2 })[kind], 'room adapter native lane');
    if (result.status === 'accepted') {
      const output = Buffer.alloc(data.length); check(readLast(output, output.length), data.length, 'room adapter reads C++ copied payload');
      check(output, data, 'room adapter native wire fidelity'); if (socketWireHeader(kind, output).packedState) packedNativePackets++; guestInbox.push({ ticket: guestTicket, kind, data: output });
    }
    return result;
  };
  native.disconnect = ticket => { const result = life.disconnect(ticket); if (result) guestNotices.push({ type: 'disconnected', ticket: guestTicket }); return result; };
  const remote = {
    open() {}, connect() { incoming(metric(19), BigInt(GUEST)); guestNotices.push({ type: 'connected', ticket: guestTicket }); return guestTicket; },
    poll() { return guestNotices.splice(0); }, receive() { return guestInbox.splice(0, 16); },
    send(_ticket, data, kind) {
      if (!nativeTicket) return { status: 'backpressure' };
      receives++; queue(nativeTicket.handle, BigInt(GUEST), ({ control: 0, anchor: 1, snapshot: 2 })[kind], kind === 'snapshot' ? 0 : 8, data, data.length);
      return { status: 'accepted' };
    },
    sample() { return { available: true, pendingBytes: 0, unackedReliableBytes: 0, lanes: [0, 1, 2].map(lane => ({ lane, queueMs: 0 })) }; },
    disconnect() { return nativeTicket ? life.disconnect(nativeTicket) : false; }, close() {},
  };
  const base = { ownerId: HOST, scope: ROOM, build: 'native-room-fixture', gameProtocol: 25, now: () => now, isCurrent: () => true };
  const host = new SteamSocketRoom({ ...base, lifecycle: native, localId: HOST, allowed: id => allowed && id === GUEST,
    acceptTransport(p, identity) { peer = p; check(identity.identity, GUEST, 'native authenticated identity reaches room relay'); check(identity.canHost, false, 'guest cannot create relay room'); p.on('message', raw => app.push(JSON.parse(raw))); } });
  const guest = new SteamSocketRoom({ ...base, lifecycle: remote, localId: GUEST, allowed: id => id === HOST, acceptTransport() { throw Error('Guest has no remote relay'); } });
  const browser = new EventEmitter(); Object.assign(browser, { readyState: 1, bufferedAmount: 0, messages: [], closes: [] });
  browser.send = (text, done) => { browser.messages.push(JSON.parse(text)); done?.(); };
  browser.close = (code, reason) => { if (browser.readyState === 3) return; browser.readyState = 3; browser.closes.push({ code, reason }); browser.emit('close'); };
  const message = value => browser.emit('message', Buffer.from(JSON.stringify(value)), false);
  function exchange(rounds = 32) { for (let i = 0; i < rounds; i++) { host.poll(); guest.poll(); now += 8; } }
  try {
    guest.attachBrowser(browser); message({ type: 'hello', name: 'fixture' }); exchange();
    check(Boolean(peer), true, 'native room creates websocket-like relay after wire ready'); check(app, [{ type: 'hello', name: 'fixture' }], 'pre-ready browser input traverses native receive and wire');
    peer.send(JSON.stringify({ type: 'welcome', test: true })); exchange(); check(browser.messages.at(-1), { type: 'welcome', test: true }, 'relay control reaches browser through native room');
    const input = { type: 'input', matchId: 'room-battle', syncId: 'native-input', input: { seq: 1, keys: 1, firing: false, pointerActive: true, aim: [10, 20], actions: [] } };
    message(input); exchange(); check(app.at(-1), input, 'guest input uses reliable native lane separate from heartbeat control');
    check(guest.flightBudget.bytes, 0, 'actual native host input receipt returns guest input credit');
    peer.send(JSON.stringify({ type: 'match', match: { id: 'room-battle' } }));
    let seed = 121; const ballast = Array.from({ length: 20000 }, () => String.fromCharCode(33 + ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) % 89))).join('');
    const state = seq => ({ type: 'state', matchId: 'room-battle', seq, frame: { tick: seq, ballast, x: seq * 1.23, moving: Array.from({ length: 80 }, (_, i) => ({ x: Math.sin(seq + i) * 1000, y: Math.cos(seq - i) * 1000, precision: Number.MIN_VALUE })) } });
    peer.send(JSON.stringify(state(1))); exchange(80); check(browser.messages.at(-1), state(1), 'native room anchor/ACK and presentation');
    blocked = true; peer.send(JSON.stringify(state(2))); exchange(3); check(browser.messages.at(-1), state(1), 'native backpressure retains rather than falsely presents state');
    blocked = false; exchange(30); check(browser.messages.at(-1), state(2), 'native room retries pending snapshot after backpressure');
    check(packedNativePackets > 0, true, 'packed float-plane payload was copied through actual native fixture memory');
    let pongs = 0; peer.on('pong', () => pongs++); exchange(150); check(pongs > 0, true, 'real native receive of challenge pong emits relay heartbeat');
    peer.send(JSON.stringify({ type: 'ended', matchId: 'room-battle' })); exchange(); check(browser.messages.at(-1).type, 'ended', 'native room terminal control');
    peer.close(1008, 'Native fixture close'); exchange(); check(browser.closes, [{ code: 1008, reason: 'Native fixture close' }], 'native close envelope preserves relay code');
    check(host.records.size, 0, 'close acknowledgement drains native room session'); check(metric(11), 0, 'native close handshake releases owned connection');
  } finally { allowed = false; host.close(); guest.close(); }
  check(metric(0), 0, 'native room allocations zero'); check(metric(10), 0, 'native room listeners zero'); check(metric(11), 0, 'native room connections zero');
  check(metric(4), 0, 'native room poll-group attachments zero'); check(metric(13), 0, 'native room callback has no native reentry');
  check(host.wireBudget.bytes + guest.wireBudget.bytes, 0, 'native room no retained reassembly');
  return { scope: 'Native C++ fixture host room adapter plus simulated JS guest/browser, NOT a Steam networking test', sends, receives, packedNativePackets,
    hostClosed: host.closed, guestClosed: guest.closed, wireBytes: host.wireBudget.bytes + guest.wireBudget.bytes, liveNativeMessages: metric(0), listeners: metric(10), connections: metric(11) };
}
