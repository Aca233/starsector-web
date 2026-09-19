import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
import { SteamPacketCodec } from './packet-codec.mjs';
import { SnapshotHostBudget } from './snapshot-host-budget.mjs';
import { SteamSessionMetrics, loadSteamSessionReader } from './session-metrics.mjs';
import { SteamSnapshotEncoder, SteamSnapshotSender, SteamSnapshotReceiver } from './snapshot-delta.mjs';
import { SteamReliableQueue } from './reliable-queue.mjs';
import { SteamConsumptionWindow, SteamRendererReceipts } from './state-consumption.mjs';
import { SnapshotSendWindow, INITIAL_SNAPSHOT_WINDOW, MAX_SNAPSHOT_WINDOW } from './snapshot-window.mjs';
const require = createRequire(import.meta.url);
export const STEAM_GAME_KEY = 'starsector-web-browser-v1';
// Test-injected only. Production imports no experimental native/socket modules.
export const STEAM_SOCKET_TRANSPORT = 'sockets-v012-app1';
const LEGACY_TRANSPORT = 'legacy-p2p';
const idString = value => String(value?.steamId64 ?? value);
export function lobbyId(value, appId) {
  let text = String(value ?? '').trim();
  if (text.startsWith('steam://')) {
    const url = new URL(text);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname !== 'joinlobby' || parts[0] !== String(appId)) throw Error('Steam 邀请的 AppID 不匹配');
    text = parts[1] ?? '';
  }
  if (!/^[0-9]{16,20}$/.test(text) || BigInt(text) > 18446744073709551615n) throw Error('请输入完整的 Steam 房间号或邀请链接');
  return text;
}
const wait = (promise, ms = 20000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Steam 响应超时，请检查客户端和网络')), ms); })]).finally(() => clearTimeout(timer));
};
// A bounded pipeline avoids stop-and-wait's one-frame-per-RTT ceiling. The wire
// format/ACK is unchanged. Never build a backlog of replaceable full snapshots.
export const STEAM_SNAPSHOT_WINDOW = MAX_SNAPSHOT_WINDOW;
export const STEAM_INITIAL_SNAPSHOT_WINDOW = INITIAL_SNAPSHOT_WINDOW;
export const STEAM_SNAPSHOT_BYTES = 64 * 1024;
class SteamPeer extends EventEmitter {
  constructor(gateway, remote, connection, supportsConsumption = false) {
    super(); this.gateway = gateway; this.remote = remote; this.connection = connection; this.readyState = 1;
    this.inflight = new Map(); this.inflightBytes = 0; this.snapshotSender = new SteamSnapshotSender(); this.snapshotWindow = new SnapshotSendWindow();
    this.sentStates = 0; this.skippedStates = 0; this.ackedStates = 0; this.ackMs = null;
    this.lastSnapshot = null; this.lastSnapshotSkip = null;
    this.supportsConsumption = supportsConsumption; this.requestedConsumption = false; this.helloSeen = false; this.consumption = null;
  }
  get bufferedAmount() { return this.inflightBytes; }
  // One extra consumption slot covers the local WS/renderer hop. Only the
  // existing network ACK controller may grow this bounded window.
  get consumptionLimit() { return Math.min(MAX_SNAPSHOT_WINDOW, this.snapshotWindow.limit + 1); }
  get snapshotBlockReason() {
    if (this.readyState !== 1) return 'disconnected';
    if (this.inflight.size >= this.snapshotWindow.limit) return 'frame-window';
    if (this.inflightBytes >= STEAM_SNAPSHOT_BYTES) return 'wire-byte-window';
    if (this.consumption && !this.consumption.writable(this.consumptionLimit)) return 'renderer-consumption';
    return null;
  }
  get snapshotWritable() { return this.snapshotBlockReason === null; }
  diagnostics(now = Date.now()) {
    return { blockedBy: this.snapshotBlockReason, lastSnapshot: this.lastSnapshot, lastSnapshotSkip: this.lastSnapshotSkip, consumption: { enabled: !!this.consumption, inflight: this.consumption?.pending.size ?? 0, bytes: this.consumption?.bytes ?? 0, rawBytes: this.consumption?.rawBytes ?? 0, consumed: this.consumption?.consumed ?? 0, oldestMs: this.consumption?.oldestMs(now) ?? 0 }, nativeSession: this.gateway.sessionMetrics.get(this.remote, now), delta: this.snapshotSender.diagnostics(), window: this.snapshotWindow.limit, probing: this.snapshotWindow.probe, baseAckMs: this.snapshotWindow.baseRtt === null ? null : Math.round(this.snapshotWindow.baseRtt), sentStates: this.sentStates, skippedStates: this.skippedStates, ackedStates: this.ackedStates, queueAckMs: this.snapshotWindow.queueRtt === null ? null : Math.round(this.snapshotWindow.queueRtt),
      ackMs: this.ackMs === null ? null : Math.round(this.ackMs), inflight: this.inflight.size,
      inflightBytes: this.inflightBytes, oldestAckMs: this.inflight.size ? now - this.inflight.values().next().value.since : 0 };
  }
  acknowledge(id) {
    const frame = this.inflight.get(id);
    if (!frame) return; // Duplicate, stale or forged ACKs must not grant credit.
    const now = Date.now(), sample = now - frame.since, sharedBytes = this.gateway.snapshotBudget.totalBytes();
    this.snapshotWindow.acknowledge(sample, now, this.inflight.size);
    this.inflight.delete(id); this.inflightBytes -= frame.bytes; this.ackedStates++;
    this.gateway.snapshotBudget.acknowledge(this.snapshotWindow.queueRtt ?? sample, this.snapshotWindow.baseRtt, now, sharedBytes);
    this.ackMs = this.ackMs === null ? sample : this.ackMs * .8 + sample * .2;
  }
  send(encoded) {
    if (this.readyState !== 1) return;
    try {
      const state = encoded.startsWith('{"type":"state",');
      if (!state && this.requestedConsumption && encoded.startsWith('{"type":"welcome",')) {
        // Only an accepted relay hello can negotiate renderer consumption. The
        // relay's LAN window stays disabled for authenticated Steam peers.
        this.consumption ??= new SteamConsumptionWindow({ maxFrames: MAX_SNAPSHOT_WINDOW, maxBytes: STEAM_SNAPSHOT_BYTES, maxRawBytes: protocol.maxSnapshotBytes * 2 });
        encoded = JSON.stringify({ ...JSON.parse(encoded), stateCredits: 1 });
      }
      if (state && !this.snapshotWritable) { this.lastSnapshotSkip = this.snapshotBlockReason; this.gateway.snapshotBudget.remove(this); this.skippedStates++; return; }
      const prepareAt = state ? performance.now() : 0;
      const choice = state ? this.snapshotSender.prepare(encoded, this.gateway.snapshotEncoder, this.gateway.codec) : null;
      const payload = choice?.prepared ?? this.gateway.codec.prepare('data', encoded);
      const rawBytes = state ? Buffer.byteLength(encoded) : 0;
      if (state && this.consumption && !this.consumption.allows(payload.payload.length, rawBytes, this.consumptionLimit)) { this.lastSnapshotSkip = 'renderer-consumption'; this.gateway.snapshotBudget.remove(this); this.skippedStates++; return; }
      // A frame larger than the byte window may travel alone (original size limit
      // still applies), but must not be stacked behind other snapshots.
      if (state && this.inflight.size && this.inflightBytes + payload.payload.length > STEAM_SNAPSHOT_BYTES) { this.lastSnapshotSkip = 'wire-byte-window'; this.gateway.snapshotBudget.remove(this); this.skippedStates++; return; }
      if (state && !this.gateway.snapshotBudget.allows(this, payload.payload.length)) { this.lastSnapshotSkip = 'shared-uplink-window'; this.skippedStates++; return; }
      const prepared = this.gateway.codec.frame(this.connection, 'data', payload);
      this.gateway.transmitEncoded(this.remote, prepared);
      if (choice) this.snapshotSender.commit(choice);
      if (state) {
        this.inflight.set(prepared.id, { bytes: prepared.bytes, since: Date.now() });
        this.inflightBytes += prepared.bytes; this.sentStates++;
        this.lastSnapshotSkip = null;
        this.lastSnapshot = { rawBytes, wireBytes: prepared.packets.reduce((sum, packet) => sum + packet.length, 0), fragments: prepared.packets.length,
          prepareMs: Math.round((performance.now() - prepareAt) * 1000) / 1000,
          format: choice?.delta ? 'delta' : choice?.target ? 'full' : 'legacy-full' };
        this.consumption?.track(prepared.id, prepared.bytes, rawBytes);
      }
    } catch { this.close(1013, 'Steam 发送失败，正在重新连接'); }
  }
  ping() { if (this.readyState === 1) { try { this.gateway.transmit(this.remote, this.connection, 'ping', {}); } catch { this.terminate(); } } }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.gateway.report('peer-close', { code, reason, ...this.diagnostics() });
    this.gateway.snapshotBudget.remove(this); this.gateway.sessionMetrics.forget(this.remote);
    this.readyState = 3; this.inflight.clear(); this.inflightBytes = 0; this.snapshotSender.reset(); this.consumption?.clear();
    try { this.gateway.transmit(this.remote, this.connection, 'close', { code, reason }); } catch { /* already disconnected */ }
    this.emit('close');
    if (this.gateway.peers.get(this.remote) === this) this.gateway.peers.delete(this.remote);
  }
  terminate(reason = 'Steam 链路超时') { this.close(1013, reason); }
}
/** Native Steam stays in this localhost helper, never in the browser process. */
export class SteamGateway {
  constructor({ appId = 480, build, client = null, overlay = null, log = () => {}, sessionReader = null, socketRoomFactory = null }) {
    if (socketRoomFactory !== null && typeof socketRoomFactory !== 'function') throw Error('Invalid socket room factory');
    this.socketRoomFactory = socketRoomFactory; this.socketRoom = null;
    this.sessionMetrics = new SteamSessionMetrics({ read: sessionReader, reason: client ? 'injected-client' : 'not-initialized' });
    this.log = log; this.receivedStates = 0; this.lastStateAt = 0; this.lastTransportLog = 0; this.lastRoomStatus = null;
    this.overlay = overlay; this.appId = appId; this.build = build; this.client = client; this.initialized = false; this.networkLost = false; this.error = '';
    this.selected = null; this.pendingInvite = null; this.renderer = null; this.guestConnection = null; this.guestOutbound = null;
    this.rendererReceipts = null; this.rendererRequestedCredits = false;
    this.peers = new Map(); this.snapshotBudget = new SnapshotHostBudget(() => this.peers.values()); this.codec = new SteamPacketCodec(); this.snapshotEncoder = new SteamSnapshotEncoder(); this.snapshotReceiver = null; this.callbacks = []; this.busy = false; this.generation = 0;
    this.owner = ''; this.name = ''; this.lastAudit = 0; this.relay = null; this.faults = new Map();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: protocol.maxSnapshotBytes, perMessageDeflate: false });
    this.extension = {
      http: (req, res) => this.http(req, res),
      isUpgrade: url => /^\/steam\/ws\?/.test(url ?? ''),
      upgrade: (req, socket, head) => this.wss.handleUpgrade(req, socket, head, ws => this.connectBrowser(ws, new URL(req.url, 'http://localhost'))),
      roomChanged: room => this.roomChanged(room),
    };
  }
  initialize() {
    if (this.initialized) return this.status();
    try {
      if (!this.client) {
        this.client = require('steamworks.js').init(this.appId);
        this.sessionMetrics = new SteamSessionMetrics(loadSteamSessionReader());
      }
      this.owner = idString(this.client.localplayer.getSteamId()); this.name = this.client.localplayer.getName();
      if (!/^[0-9]{16,20}$/.test(this.owner)) throw Error('没有可用的 Steam 登录身份');
      this.callbacks.push(this.client.callback.register(1, () => { this.networkLost = false; this.error = ''; }));
      for (const event of [2, 3]) this.callbacks.push(this.client.callback.register(event, () => { this.networkLost = true; this.report('steam-disconnected', { sdkEvent: event }); this.error = 'Steam 网络连接中断，请恢复 Steam 客户端连接；长时间断线可能无法续局。'; }));
      this.callbacks.push(this.client.callback.register(6, ({ remote }) => { if (!this.socketRoom && this.allowed(idString(remote))) this.client.networking.acceptP2PSession(remote); }));
      this.callbacks.push(this.client.callback.register(7, ({ remote, error }) => {
        if (this.socketRoom) return; // Legacy callbacks cannot tear down a sockets room.
        const id = idString(remote);
        if (!this.peers.has(id) && this.selected?.owner !== id) return;
        // Preserve the cached observation before close/leave clears it. Never
        // issue a synchronous native query from inside an SDK failure callback.
        this.report('native-link-failed', {
          errorCode: Number.isInteger(error) && error >= 0 && error <= 255 ? error : null,
          nativeSession: this.sessionMetrics.get(id),
        });
        this.peers.get(id)?.terminate('Steam 原生 P2P 连接失败');
        if (this.selected?.owner === id && id !== this.owner) this.renderer?.close(1013, 'Steam link failed');
      }));
      this.callbacks.push(this.client.callback.register(8, ({ lobby_steam_id }) => { this.pendingInvite = idString(lobby_steam_id); }));
      this.timer = setInterval(() => this.poll(), 8); this.timer.unref(); this.initialized = true; this.error = '';
    } catch (error) { this.error = 'Steam 接口未就绪：请先打开并登录 Steam，再点击重试。' + String(error.message ?? error).slice(0, 240); }
    return this.status();
  }
  report(event, details = {}) {
    // Only bounded metrics/reasons, never Steam IDs, chat, inputs or snapshots.
    try { this.log('[steam-transport] ' + JSON.stringify({ event, ...details })); } catch { /* logging cannot break networking */ }
  }
  transportStatus(now = Date.now()) {
    if (this.socketRoom) return { mode: STEAM_SOCKET_TRANSPORT, experimental: true, role: this.selected?.owner === this.owner ? 'host' : 'guest', ...this.socketRoom.diagnostics() };
    return { mode: LEGACY_TRANSPORT, role: !this.selected ? null : this.selected.owner === this.owner ? 'host' : 'guest',
      nativeSessions: this.sessionMetrics.status(), nativeHostSession: this.selected && this.selected.owner !== this.owner ? this.sessionMetrics.get(this.selected.owner, now) : null,
      sharedSnapshots: this.snapshotBudget.diagnostics(now), outbound: this.guestOutbound?.diagnostics(now) ?? null, incomingSnapshots: this.snapshotReceiver?.diagnostics() ?? null,
      receivedStates: this.receivedStates, lastStateAgeMs: this.lastStateAt ? now - this.lastStateAt : null,
      peers: [...this.peers.values()].map(peer => peer.diagnostics(now)) };
  }
  status() {
    return { service: 'starsector-web-steam', available: this.initialized && !this.networkLost, protocol: protocol.version, build: this.build,
      appId: this.appId, testApp: this.appId === 480, name: this.name, steamId: this.owner, error: this.error, busy: this.busy,
      occupied: this.renderer?.readyState === 1, pendingInvite: this.pendingInvite, transport: this.transportStatus(),
      overlay: this.overlay?.status() ?? { supported: false, available: false, reason: '浏览器版不支持 Steam 浮层，请复制完整房间号邀请朋友，或使用桌面版。' },
      lobby: this.selected ? { id: this.selected.id, owner: this.selected.owner, host: this.selected.owner === this.owner, code: this.selected.code } : null };
  }
  allowed(remote) {
    if (!this.selected || remote === this.owner) return false;
    try { return this.selected.lobby.getMembers().some(member => idString(member) === remote) && (this.selected.owner === this.owner || remote === this.selected.owner); } catch { return false; }
  }
  async select(kind, value) {
    if (!this.initialized || this.networkLost) throw Error(this.error || 'Steam 未连接');
    if (this.busy) throw Error('正在处理 Steam 请求，请稍候');
    if (this.selected) throw Error('请先返回原房间，或明确离开当前 Steam 房间');
    this.busy = true; const generation = ++this.generation;
    const pending = Promise.resolve().then(() => kind === 'create' ? this.client.matchmaking.createLobby(value === 'public' ? 2 : 1, protocol.maxPlayers) : this.client.matchmaking.joinLobby(BigInt(lobbyId(value, this.appId))));
    pending.then(lobby => { if (generation !== this.generation) lobby.leave(); }).catch(() => {});
    let lobby;
    try {
      lobby = await wait(pending);
      if (generation !== this.generation) throw Error('Steam 请求已取消');
      const id = idString(lobby.id), owner = idString(lobby.getOwner());
      if (kind === 'create') {
        if (owner !== this.owner) throw Error('Steam 大厅所有权校验失败');
        if (!lobby.mergeFullData({ sw_game: STEAM_GAME_KEY, sw_build: this.build, sw_protocol: String(protocol.version), sw_owner: owner, sw_code: '', sw_status: 'creating', sw_transport: this.socketRoomFactory ? STEAM_SOCKET_TRANSPORT : LEGACY_TRANSPORT, sw_name: this.name.slice(0, 60) })) throw Error('Steam 房间信息写入失败');
      } else {
        if (lobby.getData('sw_game') !== STEAM_GAME_KEY) throw Error('这不是本游戏的 Steam 房间');
        if (lobby.getData('sw_build') !== this.build || lobby.getData('sw_protocol') !== String(protocol.version)) throw Error('双方游戏版本不同，请使用同一份启动包');
        if (lobby.getData('sw_owner') !== owner) throw Error('房主已改变；本版本不支持主机迁移');
        if (!['lobby', 'ended'].includes(lobby.getData('sw_status'))) throw Error('房间尚未创建完成或战斗已经开始，不能中途加入');
        if (!/^[A-F0-9]{6}$/.test(lobby.getData('sw_code') ?? '')) throw Error('Steam 房间信息不完整，请房主重建房间');
      }
      const transport = lobby.getData('sw_transport') || LEGACY_TRANSPORT;
      if (![LEGACY_TRANSPORT, STEAM_SOCKET_TRANSPORT].includes(transport)) throw Error('Steam 房间传输版本不兼容');
      if (transport === STEAM_SOCKET_TRANSPORT && !this.socketRoomFactory) throw Error('此房间使用未启用的实验传输；请双方使用相同启动版本');
      const selected = this.selected = { lobby, id, owner, code: lobby.getData('sw_code') ?? '', transport };
      if (transport === STEAM_SOCKET_TRANSPORT) {
        this.socketRoom = this.socketRoomFactory({ localId: this.owner, ownerId: owner, scope: id, build: this.build, gameProtocol: protocol.version, appId: this.appId,
          allowed: remote => this.allowed(remote), isCurrent: () => this.selected === selected && generation === this.generation,
          acceptTransport: (peer, identity) => this.relay.acceptTransport(peer, identity),
          onClosed: (_code, reason) => { if (this.selected === selected) this.report('sockets-room-closed', { reason }); } });
        if (!this.socketRoom || ['poll', 'attachBrowser', 'close', 'diagnostics'].some(k => typeof this.socketRoom[k] !== 'function')) throw Error('Invalid experimental Steam room adapter');
      }
      this.pendingInvite = null; this.error = '';
      return this.status();
    } catch (error) {
      if (generation === this.generation) {
        ++this.generation; this.socketRoom?.close?.(); this.socketRoom = null;
        if (this.selected?.lobby === lobby) this.selected = null;
      }
      lobby?.leave(); throw error;
    }
    finally { this.busy = false; }
  }
  roomChanged(room) {
    const selected = this.selected;
    if (!selected || selected.owner !== this.owner || room.scope !== selected.id) return;
    selected.code = room.code;
    if (this.lastRoomStatus !== room.status) {
      this.lastRoomStatus = room.status;
      this.report('room-status', { status: room.status, reason: String(room.reason ?? '').slice(0, 200) });
    }
    const values = { sw_code: room.code, sw_status: room.status, sw_players: String(room.peers.length), sw_capacity: String(room.capacity) };
    try {
      for (const [key, value] of Object.entries(values)) if (selected.lobby.getData(key) !== value) selected.lobby.setData(key, value);
      const joinable = ['lobby', 'ended'].includes(room.status);
      if (selected.joinable !== joinable && selected.lobby.setJoinable(joinable)) selected.joinable = joinable;
    } catch { this.error = 'Steam 房间信息暂未更新，请检查 Steam 网络'; }
  }
  transmit(remote, connection, op, data) {
    const encoded = this.codec.encode(connection, op, data);
    return this.transmitEncoded(remote, encoded);
  }
  transmitEncoded(remote, encoded) {
    // Reliable=2 preserves ordering without ReliableWithBuffering/Nagle (=3).
    for (const packet of encoded.packets) if (!this.client.networking.sendP2PPacket(BigInt(remote), 2, packet)) throw Error('Steam 发送失败');
    return encoded;
  }
  connectBrowser(ws, url) {
    ws.on('error', () => {});
    const selected = this.selected;
    if (!this.initialized || !selected || url.searchParams.get('lobby') !== selected.id) { ws.close(1008, 'Select a Steam lobby first'); return; }
    if (this.renderer?.readyState === 1) { ws.close(4001, 'Use the already connected browser tab'); return; }
    this.renderer = ws;
    ws.on('close', (code, reason) => { if (this.renderer !== ws) return; this.report('browser-close', { code, reason: String(reason ?? '').slice(0, 120), ...this.transportStatus() }); this.renderer = null; const connection = this.guestConnection; this.guestConnection = null; this.snapshotReceiver = null; this.rendererReceipts?.clear(); this.rendererReceipts = null; this.rendererRequestedCredits = false; this.guestOutbound?.clear(); this.guestOutbound = null; if (connection) { try { this.transmit(selected.owner, connection, 'close', { code: 1001, reason: 'Browser disconnected' }); } catch {} } });
    if (selected.owner === this.owner) {
      this.relay.acceptTransport(ws, { identity: this.owner, scope: selected.id, canHost: true, appId: this.appId });
      return;
    }
    if (this.socketRoom) { this.socketRoom.attachBrowser(ws); return; }
    const connection = this.guestConnection = randomBytes(16).toString('hex');
    this.snapshotReceiver = new SteamSnapshotReceiver();
    this.rendererReceipts = null; this.rendererRequestedCredits = false;
    const outbound = this.guestOutbound = new SteamReliableQueue(text => this.transmit(selected.owner, connection, 'data', text));
    // Reliable open/data ordering preserves the existing hello/welcome handshake.
    try { this.transmit(selected.owner, connection, 'open', { lobby: selected.id, build: this.build, protocol: protocol.version, stateConsumption: 1 }); }
    catch { ws.close(1013, 'Steam connection failed'); return; }
    ws.on('message', (raw, binary) => {
      if (this.renderer !== ws || this.guestConnection !== connection) return;
      if (binary) { ws.close(1008, 'Text messages only'); return; }
      try {
        const text = raw.toString();
        // The loopback frontend proposes in hello, but it is NOT enabled until
        // the remote gateway accepts it in welcome. Old hosts keep old ACKs.
        if (raw.length <= 4096) {
          let control; try { control = JSON.parse(text); } catch { /* relay validates malformed control */ }
          if (control?.type === 'hello') this.rendererRequestedCredits = control.stateCredits === 1;
          if (raw.length <= 256 && control?.type === 'state-consumed' && this.rendererReceipts) {
            const id = this.rendererReceipts.consume(control);
            if (id !== null) { this.transmit(selected.owner, connection, 'ack', { id, consumed: true }); return; }
          }
        }
        // Invalid/unnegotiated receipts take the normal relay validation/rate
        // limit path. Valid receipts never crowd out input/control messages.
        outbound.enqueue(text);
      }
      catch { ws.close(1013, 'Steam send failed'); }
    });
  }
  dispatch(remote, message) {
    const selected = this.selected;
    if (!selected || this.socketRoom || selected.transport === STEAM_SOCKET_TRANSPORT || !this.allowed(remote)) return;
    const { connection, op, data, id } = message;
    if (selected.owner === this.owner) {
      let peer = this.peers.get(remote);
      if (op === 'open') {
        if (data?.lobby !== selected.id || data?.build !== this.build || data?.protocol !== protocol.version) { this.transmit(remote, connection, 'close', { code: 1008, reason: 'Steam room version mismatch' }); return; }
        if (peer?.connection === connection) return;
        peer?.close(1001, 'Connection replaced');
        peer = new SteamPeer(this, remote, connection, data.stateConsumption === 1); this.peers.set(remote, peer);
        this.relay.acceptTransport(peer, { identity: remote, scope: selected.id, canHost: false, appId: this.appId });
        this.transmit(remote, connection, 'opened', {}); return;
      }
      if (!peer || peer.connection !== connection) return;
      if (op === 'data') {
        if (data?.type === 'hello' && !peer.helloSeen) {
          peer.helloSeen = true;
          peer.requestedConsumption = peer.supportsConsumption && data.stateCredits === 1;
        }
        peer.emit('message', Buffer.from(JSON.stringify(data)), false);
        if (peer.readyState === 1) this.transmit(remote, connection, 'ack', { id });
      }
      else if (op === 'pong') peer.emit('pong');
      else if (op === 'ack') {
        // A renderer receipt releases ONLY the consumption gate. Feeding its
        // main-thread delay into network RTT would grow queues under load.
        if (data?.consumed === true) { peer.consumption?.acknowledge(data.id); return; }
        const current = peer.inflight.has(data?.id);
        peer.acknowledge(data?.id);
        if (current && data?.needsFull === true) peer.snapshotSender.reset();
      }
      else if (op === 'close') peer.close(1001, 'Remote browser closed');
    } else {
      const ws = this.renderer;
      if (!ws || ws.readyState !== 1 || connection !== this.guestConnection) return;
      if (op === 'data') {
        this.snapshotReceiver ??= new SteamSnapshotReceiver();
        const incoming = this.snapshotReceiver.receive(data);
        if (incoming.needsFull) {
          // Consume/drop this frame's credit, but never forward an undecodable
          // delta or renew frontend liveness. The host's next state is full.
          this.transmit(remote, connection, 'ack', { id, needsFull: true });
          if (this.rendererReceipts) this.transmit(remote, connection, 'ack', { id, consumed: true });
          return;
        }
        const delivered = incoming.data;
        if (delivered?.type === 'welcome' && delivered.stateCredits === 1 && this.rendererRequestedCredits && !this.rendererReceipts) {
          this.rendererReceipts = new SteamRendererReceipts({ maxFrames: MAX_SNAPSHOT_WINDOW, maxBytes: protocol.maxSnapshotBytes * 2 });
        }
        if (delivered?.type === 'state') { this.receivedStates++; this.lastStateAt = Date.now(); }
        if (data?.type === 'ended' || data?.type === 'roomClosed') this.report('match-ended', { reason: String(data.reason ?? data.message ?? '').slice(0, 200) });
        if (ws.bufferedAmount > protocol.maxSnapshotBytes * 2) { ws.close(1013, 'Browser too slow'); return; }
        const text = JSON.stringify(delivered);
        if (delivered?.type === 'state' && this.rendererReceipts && !this.rendererReceipts.track(delivered, id, Buffer.byteLength(text))) {
          ws.close(1013, 'Steam renderer receipt budget exceeded'); return;
        }
        ws.send(text, error => { if (!error && delivered?.type === 'state' && this.selected === selected && this.renderer === ws && this.guestConnection === connection) { try { this.transmit(remote, connection, 'ack', { id }); } catch {} } });
      } else if (op === 'ack') {
        try { this.guestOutbound?.ack(data?.id); }
        catch { ws.close(1013, 'Steam send failed'); }
      } else if (op === 'ping') this.transmit(remote, connection, 'pong', {});
      else if (op === 'close') {
        const code = [1000, 1001, 1008, 1009, 1013, 4001, 4003].includes(data?.code) ? data.code : 1013;
        if ([1008, 4003].includes(code)) ws.send(JSON.stringify({ type: 'error', message: data?.reason || 'Steam 房间连接已关闭' }));
        ws.close(code, String(data?.reason ?? '').slice(0, 30));
        if ([1008, 4003].includes(code)) void this.leave();
      }
    }
  }
  poll() {
    // No game P2P traffic is needed before joining a lobby or while Steam is offline.
    if (!this.selected || this.networkLost) return;
    if (this.socketRoom) {
      // A room chooses its transport once. Never probe legacy networking or
      // silently fall back after a native ownership/handshake failure.
      try {
        if (idString(this.selected.lobby.getOwner()) !== this.selected.owner) {
          this.error = 'Steam 房主已经离开或发生转移，本局不能迁移到新主机。';
          this.renderer?.send(JSON.stringify({ type: 'roomClosed', message: this.error })); void this.leave(); return;
        }
        this.socketRoom.poll();
      } catch { this.socketRoom.close(1013, 'Steam transport failed'); this.error = 'Steam 实验传输已关闭，请离开房间后重试'; }
      return;
    }
    try {
      const started = performance.now();
      for (let count = 0; count < 64 && performance.now() - started < 5; count++) {
        const size = this.client.networking.isP2PPacketAvailable(); if (!size) break;
        // SDK caps reliable packets at 1 MiB. Do not allocate attacker-declared message sizes.
        if (size > 1024 * 1024) break;
        const packet = this.client.networking.readP2PPacket(size), remote = idString(packet.steamId);
        if (!this.allowed(remote) || (this.faults.get(remote)?.until ?? 0) > Date.now()) continue;
        try { const message = this.codec.receive(remote, packet.data); if (message) this.dispatch(remote, message); }
        catch (error) { this.report('invalid-packet', { reason: String(error.message ?? error).slice(0, 120) }); this.faults.set(remote, { until: Date.now() + 10000 }); this.codec.forget(remote); this.peers.get(remote)?.terminate(); }
      }
      const now = Date.now();
      if (now - this.lastAudit > 1000) {
        this.lastAudit = now; this.codec.sweep(now);
        this.sessionMetrics.sample((this.selected.owner === this.owner ? [...this.peers.keys()] : [this.selected.owner]).filter(remote => this.allowed(remote)), now);
        for (const [remote, peer] of this.peers) {
          if (!this.allowed(remote)) peer.terminate('Steam 大厅成员已离开');
          else if (peer.diagnostics(now).oldestAckMs > 8000) peer.terminate('Steam 状态确认超过 8 秒未返回');
          else if (peer.consumption?.oldestMs(now) > 8000) peer.terminate('Steam 前台消费确认超过 8 秒未返回');
        }
        if (now - this.lastTransportLog >= 15000) { this.lastTransportLog = now; this.report('sample', this.transportStatus(now)); }
        if (this.guestOutbound?.window.expired(now)) this.renderer?.close(1013, 'Steam link stalled');
        for (const [remote, fault] of this.faults) if (fault.until < now) this.faults.delete(remote);
        if (this.selected && idString(this.selected.lobby.getOwner()) !== this.selected.owner) {
          this.error = 'Steam 房主已经离开或发生转移，本局不能迁移到新主机。';
          this.renderer?.send(JSON.stringify({ type: 'roomClosed', message: this.error }));
          void this.leave();
        }
      }
    } catch { this.error = 'Steam 网络暂不可用，请检查客户端连接'; }
  }
  async leave() {
    ++this.generation;
    const selected = this.selected;
    if (selected?.owner === this.owner && selected.code) this.relay?.closeRoom(selected.code);
    this.socketRoom?.close(); this.socketRoom = null;
    for (const peer of [...this.peers.values()]) peer.close(1008, 'Steam host left the room');
    this.renderer?.close(1000, 'Left Steam lobby'); this.renderer = null; this.guestConnection = null;
    this.guestOutbound?.clear(); this.guestOutbound = null;
    this.report('leave', this.transportStatus());
    this.rendererReceipts?.clear(); this.rendererReceipts = null; this.rendererRequestedCredits = false;
    this.selected = null; this.codec.clear(); this.sessionMetrics.clear(); this.snapshotBudget.clear(); this.snapshotEncoder.clear(); this.snapshotReceiver = null; this.faults.clear(); this.lastRoomStatus = null;
    this.receivedStates = 0; this.lastStateAt = 0;
    try { selected?.lobby.leave(); } catch { /* disconnected from Steam */ }
    return this.status();
  }
  http(req, res) {
    const url = new URL(req.url, 'http://' + req.headers.host);
    if (!url.pathname.startsWith('/steam/')) return false;
    const reply = (status, data) => { if (res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/steam/status' && req.method === 'GET') { reply(200, this.status()); return true; }
    // No native API reachable through cross-origin forms, DNS rebinding, or GET links.
    if (req.method !== 'POST' || req.headers.origin !== 'http://' + req.headers.host || req.headers['x-starsector-steam'] !== '1' || req.headers['content-type']?.split(';')[0] !== 'application/json') { reply(403, { error: 'Steam 操作只能从本机游戏页面发起' }); return true; }
    const now = Date.now();
    if (!this.requestWindow || now - this.requestWindow > 5000) { this.requestWindow = now; this.requestCount = 0; }
    if (++this.requestCount > 20) { reply(429, { error: 'Steam 操作过于频繁，请稍候再试' }); return true; }
    let body = '', rejected = false;
    req.on('data', chunk => { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) { rejected = true; reply(413, { error: 'Steam 请求过大' }); req.destroy(); } });
    req.on('end', () => { if (rejected) return; void (async () => {
      try {
        const value = JSON.parse(body || '{}'); let result;
        if (url.pathname === '/steam/retry') result = this.initialize();
        else if (url.pathname === '/steam/create') result = await this.select('create', value.visibility);
        else if (url.pathname === '/steam/join') result = await this.select('join', value.lobby);
        else if (url.pathname === '/steam/leave') result = await this.leave();
        else if (url.pathname === '/steam/invite') {
          if (!this.selected) throw Error('请先进入 Steam 房间');
          if (!this.initialized || this.networkLost) throw Error(this.error || 'Steam 未连接');
          if (!this.overlay) throw Error(this.status().overlay.reason);
          result = await this.overlay.invite(this.selected.id, this.owner);
        }
        else if (url.pathname === '/steam/list') {
          if (!this.initialized || this.networkLost || this.busy) throw Error('Steam 尚未就绪或有请求正在进行');
          this.busy = true;
          try {
            const lobbies = await wait(this.client.matchmaking.getLobbies(), 10000);
            result = { rooms: lobbies.filter(lobby => lobby.getData('sw_game') === STEAM_GAME_KEY && lobby.getData('sw_build') === this.build && lobby.getData('sw_protocol') === String(protocol.version) && ['lobby', 'ended'].includes(lobby.getData('sw_status'))).slice(0, 50).map(lobby => ({ id: idString(lobby.id), name: lobby.getData('sw_name') ?? '房间', players: lobby.getData('sw_players') ?? '?', capacity: lobby.getData('sw_capacity') ?? '10' })) };
          } finally { this.busy = false; }
        } else if (url.pathname === '/steam/lan') { if (this.selected || this.renderer) throw Error('请先离开 Steam 房间'); if (!this.startLan) throw Error('此启动器未提供局域网入口'); result = await this.startLan(); }
        else if (url.pathname === '/steam/shutdown') { if (this.busy || this.selected || this.renderer || this.canShutdown && !this.canShutdown()) throw Error('请先离开房间，再退出启动器'); result = { ok: true }; setTimeout(() => this.shutdown?.(), 100); }
        else { reply(404, { error: '未知 Steam 操作' }); return; }
        reply(200, result);
      } catch (error) { reply(400, { error: String(error.message ?? error) }); }
    })(); });
    return true;
  }
  async close() {
    clearInterval(this.timer);
    for (const callback of this.callbacks) callback.disconnect(); this.callbacks = [];
    await this.leave(); for (const ws of this.wss.clients) ws.terminate();
    await new Promise(resolve => this.wss.close(resolve));
  }
}
