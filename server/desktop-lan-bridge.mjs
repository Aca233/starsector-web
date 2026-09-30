import { COMBAT_WIRE_MAGIC, readCombatEnvelope, CombatWireReceiver } from "./CriticalCombatWire.mjs";
import {MotionWireReceiver,decodeMotionWireEnvelope} from './MotionWire.mjs';
import {VisualWireReceiver,decodeVisualWireEnvelope} from './ProjectileVisualWire.mjs';
import { SnapshotChunkReceiver, isSnapshotChunk } from './SnapshotChunkCodec.mjs';
import { WebSocket, WebSocketServer } from 'ws';
import { isLanControlMessage, LAN_CONTROL_LIMIT, LAN_CONTROL_PATH } from './LanControlLane.mjs';
import { lanClientCompression, lanPerMessageDeflate } from './lan-websocket.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const PATH = '/desktop/lan/ws';
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
/** Keep remote code out of Electron: only an explicitly selected game's WebSocket
 * crosses this loopback-only bridge. No remote HTML, files, cookies or general IPC. */
export class DesktopLanBridge {
  constructor(port) {
    this.origin = 'http://127.0.0.1:' + port;
    this.pairs = new Set(); this.closed = false;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: protocol.maxSnapshotBytes, perMessageDeflate: false });
    this.extension = {
      http: (req, res) => {
        if (req.url !== '/desktop/lan/info') return false;
        const allowed = this.localRequest(req) && req.method === 'GET';
        res.writeHead(allowed ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(allowed ? { available: true, defaultPort: 32110 } : { error: '仅限本机桌面连接' }));
        return true;
      },
      isUpgrade: value => { try { return new URL(value, this.origin).pathname === PATH; } catch { return false; } },
      upgrade: (req, socket, head) => this.upgrade(req, socket, head),
    };
  }
  localRequest(req) {
    return loopback(req.socket.remoteAddress) && req.headers.host === new URL(this.origin).host;
  }
  upgrade(req, socket, head) {
    if (this.closed || !this.localRequest(req) || req.headers.origin !== this.origin || this.pairs.size >= 4) throw Error('本机连接不可用');
    const target = new URL(new URL(req.url, this.origin).searchParams.get('target'));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
      || target.pathname !== '/' || target.search || target.hash) throw Error('无效的房主地址');
    const remoteUrl = new URL('/lan/ws', target);
    remoteUrl.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    this.wss.handleUpgrade(req, socket, head, local => {
      // A reconnect opens a new transport; the app's existing resume token and
      // protocol handshake still belong to the remote authority, not this proxy.
      const remote = new WebSocket(remoteUrl, { origin: target.origin, handshakeTimeout: 5000,
        followRedirects: false, ...lanClientCompression(), maxPayload: protocol.maxSnapshotBytes });
      const pair = { local, remote }; this.pairs.add(pair);
      const chunkReceiver = new SnapshotChunkReceiver();
      const visualWire = new VisualWireReceiver();
      const motionWire = new MotionWireReceiver();
      let motionWireOffered=false,motionWireEnabled=false,motionEpoch=null,visualWireOffered=false,visualWireEnabled=false;
      let chunkOffered = false, chunkEnabled = false;
      let ended = false, pendingBytes = 0, control = null, controlReady = false, controlTimer = null;
      // Only the latest five idempotent control messages are retained (<=64KB).
      // A TCP send callback is not an authority receipt. Losing the optional lane
      // after its last consumption ACK would otherwise strand all state credits.
      let combatEnabled = false; const combatWire = new CombatWireReceiver();
      const replay = new Map();
      const stopControl = () => {
        clearTimeout(controlTimer); controlReady = false; visualWire.reset(); motionWire.reset(); combatWire.reset();
        const previous = control; control = null; previous?.terminate();
        const retry = [...replay.values()]; replay.clear();
        if (!ended) for (const data of retry) forward(remote, data, false);
      };
      const pending = [];
      const release = () => {
        if (local.readyState !== WebSocket.CLOSED || remote.readyState !== WebSocket.CLOSED) return;
        clearTimeout(pair.timer); this.pairs.delete(pair);
      };
      pair.terminate = () => {
        ended = true; chunkReceiver.reset(); visualWire.reset(); motionWire.reset(); combatWire.reset(); pending.length = 0; pendingBytes = 0; clearTimeout(pair.timer);
        stopControl(); local.terminate(); remote.terminate(); release();
      };
      const close = (code = 1013, reason = '与房主连接中断，正在重连') => {
        if (ended) return;
        ended = true; chunkReceiver.reset(); pending.length = 0; pendingBytes = 0; stopControl();
        // Closing is still a live allocation and counts against capacity. A peer
        // that stops reading must not retain sockets/buffers for ws's 30s timeout.
        pair.timer = setTimeout(pair.terminate, 1000); pair.timer.unref();
        for (const ws of [local, remote]) {
          if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
          else if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
        }
      };
      const forward = (ws, data, binary) => {
        if (ended) return;
        if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount + data.length > protocol.maxSnapshotBytes * 2) { close(); return; }
        ws.send(data, { binary }, error => { if (error) close(); });
      };
      const upstream = (data, binary) => {
        if (controlReady && isLanControlMessage(data, binary)) {
          const lane = control;
          if (lane?.readyState === WebSocket.OPEN && lane.bufferedAmount + data.length <= LAN_CONTROL_LIMIT * 2) {
            const message = JSON.parse(data);
            if (message.type !== 'ping') replay.set(message.type, data);
            lane.send(data, { binary: false }, error => { if (error && control === lane) stopControl(); }); return;
          }
          // Switch permanently back to primary instead of interleaving an
          // unhealthy lane and the FIFO. Existing seq/match checks deduplicate.
          stopControl();
        }
        forward(remote, data, binary);
      };
      local.on('message', (data, binary) => {
        if (!binary && data.length <= LAN_CONTROL_LIMIT) {
          try { const m = JSON.parse(data); if (m.type === 'leave') replay.clear(); if (m.type === 'hello') { visualWireOffered = m.visualState === 1; motionWireOffered = m.motionState === 1; chunkOffered = m.motionAuto !== 1 && m.motionState === 1 && m.binaryDelta === 1 && m.stateCredits === 1; data = Buffer.from(JSON.stringify({ ...m, controlLane: 1, ...(visualWireOffered ? {visualWire:1} : {}), ...(motionWireOffered ? {motionWire:1} : {}), ...(chunkOffered ? { bulkChunks: 1 } : {}) })); } } catch { /* Primary validates malformed requests. */ }
        }
        if (remote.readyState === WebSocket.CONNECTING) {
          // Usually only hello. Never build an unbounded input queue during a dial.
          if (pendingBytes + data.length > 65536 || pending.length >= 8) { close(); return; }
          pending.push({ data, binary }); pendingBytes += data.length;
        } else upstream(data, binary);
      });
      remote.on('open', () => {
        if (ended) { remote.close(); return; }
        for (const item of pending) upstream(item.data, item.binary);
        pending.length = 0; pendingBytes = 0;
      });
      remote.on('message', (data, binary) => {
        if (ended) return;
        if (binary && isSnapshotChunk(data)) {
          if (!chunkEnabled) { close(1008, 'Unnegotiated chunk stream'); return; }
          try {
            const decoded = chunkReceiver.receive(data);
            upstream(Buffer.from(JSON.stringify(decoded.receipt)), false);
            if (!decoded.payload) return;
            data = decoded.payload; // Complete original SLD1/SWB1; renderer ACK remains separate.
          } catch { close(1008, 'Invalid chunk stream'); return; }
        }
        if (!ended && !binary && data.length <= LAN_CONTROL_LIMIT) {
          try {
            const m = JSON.parse(data), offer = m.type === 'welcome' && m.controlLane;
            if (m.type === 'welcome') {combatEnabled=m.combatState===1;chunkEnabled = chunkOffered && m.bulkChunks === 1;motionWireEnabled=motionWireOffered&&m.motionWire===1;visualWireEnabled=visualWireOffered&&m.visualWire===1;}
            if (['welcome', 'launch', 'left', 'ended', 'roomClosed'].includes(m.type)) {
              const nextEpoch = m.type === 'launch' && typeof m.matchId === 'string' && m.matchId.length > 0 && m.matchId.length <= 128 &&
                typeof m.syncId === 'string' && m.syncId.length > 0 && m.syncId.length <= 128 && Number.isSafeInteger(m.minTick) && m.minTick >= 0
                ? { matchId: m.matchId, syncId: m.syncId, minTick: m.minTick } : null;
              // Resync retries may repeat a launch on the primary TCP stream
              // after this epoch's first control-lane delta has arrived. Only a
              // NEW valid epoch (or an invalid/lifecycle message) resets bases.
              // Keep pending real receipts too: losing the lane must still
              // replay its final ACK through ordinary primary validation.
              const repeated = nextEpoch !== null && motionEpoch !== null && nextEpoch.matchId === motionEpoch.matchId &&
                nextEpoch.syncId === motionEpoch.syncId && nextEpoch.minTick === motionEpoch.minTick;
              if (!repeated) { chunkReceiver.reset(); visualWire.reset(); motionWire.reset(); combatWire.reset(); replay.clear(); }
              motionEpoch = nextEpoch;
            }
            if (offer?.version === 1 && /^[0-9a-f]{64}$/.test(offer.token) && !control) {
              // Derive only from the user-selected authority, never a server-supplied URL.
              const url = new URL(remoteUrl); url.pathname = LAN_CONTROL_PATH; url.search = '?token=' + offer.token;
              const lane = control = new WebSocket(url, { origin: target.origin, handshakeTimeout: 3000,
                followRedirects: false, perMessageDeflate: lanPerMessageDeflate(), maxPayload: LAN_CONTROL_LIMIT });
              controlTimer = setTimeout(() => { if (control === lane && !controlReady) stopControl(); }, 4000); controlTimer.unref();
              lane.on('error', () => { if (control === lane) stopControl(); });
              lane.on('close', () => { if (control === lane) stopControl(); });
              lane.on('message', (raw, isBinary) => {
                if (ended || control !== lane) return;
                try {
                  if(isBinary){
                    if(!controlReady)throw Error('Unnegotiated binary control');
                    if (raw.length >= 4 && raw.readUInt32BE(0) === COMBAT_WIRE_MAGIC) {
                      if (!combatEnabled) throw Error('Unnegotiated critical combat state');
                      const value = readCombatEnvelope(raw);
                      if (!motionEpoch || value.matchId !== motionEpoch.matchId || value.syncId !== motionEpoch.syncId) { upstream(Buffer.from(JSON.stringify({type:'combat-consumed',matchId:value.matchId,syncId:value.syncId,tick:value.tick,status:'discarded'})), false); return; }
                      forward(local, Buffer.from(JSON.stringify(combatWire.decode(value))), false); return;
                    }
                    if(raw.length>=4&&raw.readUInt32BE(0)===0x53564c31){
                      if(!visualWireEnabled)throw Error('Unnegotiated binary visual');
                      const value=decodeVisualWireEnvelope(raw);
                      // Retired visual receipts may release their original debt;
                      // they must never establish a baseline in the new epoch.
                      if(!motionEpoch||value.matchId!==motionEpoch.matchId||value.syncId!==motionEpoch.syncId){upstream(Buffer.from(JSON.stringify({type:'visual-consumed',matchId:value.matchId,syncId:value.syncId,key:value.key,tick:value.tick,kind:value.kind,offset:value.offset,total:value.total,status:'discarded'})),false);return;}
                      try {const decoded=visualWire.take(value);if(decoded.receipt)upstream(Buffer.from(JSON.stringify(decoded.receipt)),false);if(decoded.packet)forward(local,Buffer.from(JSON.stringify(decoded.packet)),false);}
                      catch {visualWire.reset();upstream(Buffer.from(JSON.stringify({type:'visual-consumed',matchId:value.matchId,syncId:value.syncId,key:value.key,tick:value.tick,kind:value.kind,offset:value.offset,total:value.total,status:'discarded'})),false);}
                      return;
                    }
                    if(!motionWireEnabled)throw Error('Unnegotiated binary motion');
                    const encoded=decodeMotionWireEnvelope(raw);
                    // Primary launch can overtake an old control-lane delta.
                    // Retired epochs are inert; they must not poison the new
                    // chain or tear down an otherwise healthy optional lane.
                    if(!motionEpoch||encoded.matchId!==motionEpoch.matchId||encoded.syncId!==motionEpoch.syncId)return;
                    const message=motionWire.decode(encoded);
                    forward(local,Buffer.from(JSON.stringify(message)),false);return;
                  }
                  const value = JSON.parse(raw);
                  if (!controlReady) {
                    if (value.type !== 'control-lane-ready' || value.version !== 1) throw Error('Invalid control greeting');
                    controlReady = true; clearTimeout(controlTimer); return;
                  }
                  if (value.type !== 'pong' && value.type !== 'controls-ready' && value.type !== 'motion' && value.type !== 'projectile-visual') throw Error('Unexpected control message');
                  if (value.type === 'controls-ready') replay.delete('sync-ready');
                  if(value.type==='projectile-visual'){
                    try { const decoded=visualWire.take(value);if(decoded.receipt)upstream(Buffer.from(JSON.stringify(decoded.receipt)),false);if(decoded.packet)forward(local,Buffer.from(JSON.stringify(decoded.packet)),false); }
                    catch { visualWire.reset();upstream(Buffer.from(JSON.stringify({type:'visual-consumed',matchId:value.matchId,syncId:value.syncId,key:value.key,tick:value.tick,kind:value.kind,offset:value.offset,total:value.total,status:'discarded'})),false); }
                    return;
                  }
                  forward(local, raw, false);
                } catch { stopControl(); }
              });
            }
          } catch { /* Old/unknown servers stay on the ordinary primary connection. */ }
        }
        forward(local, data, binary);
      });
      const onClose = (code, reason) => close(code === 1000 || (code >= 3000 && code <= 4999) || [1008, 1009, 1012, 1013].includes(code) ? code : 1013,
        reason.length <= 123 ? reason.toString() : '与房主连接中断');
      local.on('close', (code, reason) => { onClose(code, reason); release(); });
      remote.on('close', (code, reason) => { onClose(code, reason); release(); });
      local.on('error', () => close()); remote.on('error', () => close());
    });
  }
  close() {
    this.closed = true;
    for (const pair of this.pairs) pair.terminate();
    this.pairs.clear(); this.wss.close();
  }
}
