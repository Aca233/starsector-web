import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
import { SteamPacketCodec } from './packet-codec.mjs';
const require = createRequire(import.meta.url);
export const STEAM_GAME_KEY = 'starsector-web-browser-v1';
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
class SteamPeer extends EventEmitter {
  constructor(gateway, remote, connection) { super(); this.gateway = gateway; this.remote = remote; this.connection = connection; this.readyState = 1; this.inflight = null; }
  get bufferedAmount() { return this.inflight?.bytes ?? 0; }
  send(encoded) {
    if (this.readyState !== 1) return;
    try {
      const sent = this.gateway.transmit(this.remote, this.connection, 'data', encoded);
      if (encoded.startsWith('{"type":"state",')) this.inflight = { id: sent.id, bytes: sent.bytes, since: Date.now() };
    } catch { this.close(1013, 'Steam 发送失败，正在重新连接'); }
  }
  ping() { if (this.readyState === 1) { try { this.gateway.transmit(this.remote, this.connection, 'ping', {}); } catch { this.terminate(); } } }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3; this.inflight = null;
    try { this.gateway.transmit(this.remote, this.connection, 'close', { code, reason }); } catch { /* already disconnected */ }
    this.emit('close');
    if (this.gateway.peers.get(this.remote) === this) this.gateway.peers.delete(this.remote);
  }
  terminate() { this.close(1013, 'Steam 链路超时'); }
}
/** Native Steam stays in this localhost helper, never in the browser process. */
export class SteamGateway {
  constructor({ appId = 480, build, client = null, overlay = null }) {
    this.overlay = overlay; this.appId = appId; this.build = build; this.client = client; this.initialized = false; this.networkLost = false; this.error = '';
    this.selected = null; this.pendingInvite = null; this.renderer = null; this.guestConnection = null;
    this.peers = new Map(); this.codec = new SteamPacketCodec(); this.callbacks = []; this.busy = false; this.generation = 0;
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
      this.client ??= require('steamworks.js').init(this.appId);
      this.owner = idString(this.client.localplayer.getSteamId()); this.name = this.client.localplayer.getName();
      if (!/^[0-9]{16,20}$/.test(this.owner)) throw Error('没有可用的 Steam 登录身份');
      this.callbacks.push(this.client.callback.register(1, () => { this.networkLost = false; this.error = ''; }));
      for (const event of [2, 3]) this.callbacks.push(this.client.callback.register(event, () => { this.networkLost = true; this.error = 'Steam 网络连接中断，请恢复 Steam 客户端连接；长时间断线可能无法续局。'; }));
      this.callbacks.push(this.client.callback.register(6, ({ remote }) => { if (this.allowed(idString(remote))) this.client.networking.acceptP2PSession(remote); }));
      this.callbacks.push(this.client.callback.register(7, ({ remote }) => { const id = idString(remote); this.peers.get(id)?.terminate(); if (this.selected?.owner === id && id !== this.owner) this.renderer?.close(1013, 'Steam link failed'); }));
      this.callbacks.push(this.client.callback.register(8, ({ lobby_steam_id }) => { this.pendingInvite = idString(lobby_steam_id); }));
      this.timer = setInterval(() => this.poll(), 8); this.timer.unref(); this.initialized = true; this.error = '';
    } catch (error) { this.error = 'Steam 接口未就绪：请先打开并登录 Steam，再点击重试。' + String(error.message ?? error).slice(0, 240); }
    return this.status();
  }
  status() {
    return { service: 'starsector-web-steam', available: this.initialized && !this.networkLost, protocol: protocol.version, build: this.build,
      appId: this.appId, testApp: this.appId === 480, name: this.name, steamId: this.owner, error: this.error, busy: this.busy,
      occupied: this.renderer?.readyState === 1, pendingInvite: this.pendingInvite,
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
        if (!lobby.mergeFullData({ sw_game: STEAM_GAME_KEY, sw_build: this.build, sw_protocol: String(protocol.version), sw_owner: owner, sw_code: '', sw_status: 'creating', sw_name: this.name.slice(0, 60) })) throw Error('Steam 房间信息写入失败');
      } else {
        if (lobby.getData('sw_game') !== STEAM_GAME_KEY) throw Error('这不是本游戏的 Steam 房间');
        if (lobby.getData('sw_build') !== this.build || lobby.getData('sw_protocol') !== String(protocol.version)) throw Error('双方游戏版本不同，请使用同一份启动包');
        if (lobby.getData('sw_owner') !== owner) throw Error('房主已改变；本版本不支持主机迁移');
        if (!['lobby', 'ended'].includes(lobby.getData('sw_status'))) throw Error('房间尚未创建完成或战斗已经开始，不能中途加入');
        if (!/^[A-F0-9]{6}$/.test(lobby.getData('sw_code') ?? '')) throw Error('Steam 房间信息不完整，请房主重建房间');
      }
      this.selected = { lobby, id, owner, code: lobby.getData('sw_code') ?? '' };
      this.pendingInvite = null; this.error = '';
      return this.status();
    } catch (error) { if (generation === this.generation) ++this.generation; lobby?.leave(); throw error; }
    finally { this.busy = false; }
  }
  roomChanged(room) {
    const selected = this.selected;
    if (!selected || selected.owner !== this.owner || room.scope !== selected.id) return;
    selected.code = room.code;
    const values = { sw_code: room.code, sw_status: room.status, sw_players: String(room.peers.length), sw_capacity: String(room.capacity) };
    try {
      for (const [key, value] of Object.entries(values)) if (selected.lobby.getData(key) !== value) selected.lobby.setData(key, value);
      const joinable = ['lobby', 'ended'].includes(room.status);
      if (selected.joinable !== joinable && selected.lobby.setJoinable(joinable)) selected.joinable = joinable;
    } catch { this.error = 'Steam 房间信息暂未更新，请检查 Steam 网络'; }
  }
  transmit(remote, connection, op, data) {
    const encoded = this.codec.encode(connection, op, data);
    for (const packet of encoded.packets) if (!this.client.networking.sendP2PPacket(BigInt(remote), 2, packet)) throw Error('Steam 发送失败');
    return encoded;
  }
  connectBrowser(ws, url) {
    ws.on('error', () => {});
    const selected = this.selected;
    if (!this.initialized || !selected || url.searchParams.get('lobby') !== selected.id) { ws.close(1008, 'Select a Steam lobby first'); return; }
    if (this.renderer?.readyState === 1) { ws.close(4001, 'Use the already connected browser tab'); return; }
    this.renderer = ws;
    ws.on('close', () => { if (this.renderer !== ws) return; this.renderer = null; const connection = this.guestConnection; this.guestConnection = null; if (connection) { try { this.transmit(selected.owner, connection, 'close', { code: 1001, reason: 'Browser disconnected' }); } catch {} } });
    if (selected.owner === this.owner) {
      this.relay.acceptTransport(ws, { identity: this.owner, scope: selected.id, canHost: true, appId: this.appId });
      return;
    }
    const connection = this.guestConnection = randomBytes(16).toString('hex');
    // Reliable open/data ordering preserves the existing hello/welcome handshake.
    try { this.transmit(selected.owner, connection, 'open', { lobby: selected.id, build: this.build, protocol: protocol.version }); }
    catch { ws.close(1013, 'Steam connection failed'); return; }
    ws.on('message', (raw, binary) => {
      if (this.renderer !== ws || this.guestConnection !== connection) return;
      if (binary) { ws.close(1008, 'Text messages only'); return; }
      try { this.transmit(selected.owner, connection, 'data', raw.toString()); }
      catch { ws.close(1013, 'Steam send failed'); }
    });
  }
  dispatch(remote, message) {
    const selected = this.selected;
    if (!selected || !this.allowed(remote)) return;
    const { connection, op, data, id } = message;
    if (selected.owner === this.owner) {
      let peer = this.peers.get(remote);
      if (op === 'open') {
        if (data?.lobby !== selected.id || data?.build !== this.build || data?.protocol !== protocol.version) { this.transmit(remote, connection, 'close', { code: 1008, reason: 'Steam room version mismatch' }); return; }
        if (peer?.connection === connection) return;
        peer?.close(1001, 'Connection replaced');
        peer = new SteamPeer(this, remote, connection); this.peers.set(remote, peer);
        this.relay.acceptTransport(peer, { identity: remote, scope: selected.id, canHost: false, appId: this.appId });
        this.transmit(remote, connection, 'opened', {}); return;
      }
      if (!peer || peer.connection !== connection) return;
      if (op === 'data') peer.emit('message', Buffer.from(JSON.stringify(data)), false);
      else if (op === 'pong') peer.emit('pong');
      else if (op === 'ack' && data?.id === peer.inflight?.id) peer.inflight = null;
      else if (op === 'close') peer.close(1001, 'Remote browser closed');
    } else {
      const ws = this.renderer;
      if (!ws || ws.readyState !== 1 || connection !== this.guestConnection) return;
      if (op === 'data') {
        if (ws.bufferedAmount > protocol.maxSnapshotBytes * 2) { ws.close(1013, 'Browser too slow'); return; }
        ws.send(JSON.stringify(data), error => { if (!error && data?.type === 'state' && this.selected === selected) { try { this.transmit(remote, connection, 'ack', { id }); } catch {} } });
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
    try {
      const started = performance.now();
      for (let count = 0; count < 64 && performance.now() - started < 5; count++) {
        const size = this.client.networking.isP2PPacketAvailable(); if (!size) break;
        // SDK caps reliable packets at 1 MiB. Do not allocate attacker-declared message sizes.
        if (size > 1024 * 1024) break;
        const packet = this.client.networking.readP2PPacket(size), remote = idString(packet.steamId);
        if (!this.allowed(remote) || (this.faults.get(remote)?.until ?? 0) > Date.now()) continue;
        try { const message = this.codec.receive(remote, packet.data); if (message) this.dispatch(remote, message); }
        catch { this.faults.set(remote, { until: Date.now() + 10000 }); this.codec.forget(remote); this.peers.get(remote)?.terminate(); }
      }
      const now = Date.now();
      if (now - this.lastAudit > 1000) {
        this.lastAudit = now; this.codec.sweep(now);
        for (const [remote, peer] of this.peers) if (!this.allowed(remote) || peer.inflight && now - peer.inflight.since > 8000) peer.terminate();
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
    for (const peer of [...this.peers.values()]) peer.close(1008, 'Steam host left the room');
    this.renderer?.close(1000, 'Left Steam lobby'); this.renderer = null; this.guestConnection = null;
    this.selected = null; this.codec.clear(); this.faults.clear();
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
