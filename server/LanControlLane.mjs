import {encodeVisualWireEnvelope} from './ProjectileVisualWire.mjs';
import {MotionWireSender,encodeMotionWireEnvelope} from './MotionWire.mjs';
import { randomBytes } from 'node:crypto';
import { lanPerMessageDeflate } from './lan-websocket.mjs';
import { WebSocketServer, WebSocket } from 'ws';

export const LAN_CONTROL_PATH = '/lan/control-ws';
export const LAN_CONTROL_LIMIT = 16 * 1024;
const inbound = new Set(['input', 'ping', 'state-consumed', 'sync-ready', 'motion-consumed', 'combat-consumed', 'bulk-ack']);
const outbound = new Set(['pong', 'controls-ready']);
export function isLanControlMessage(data, binary = false) {
  if (binary || Buffer.byteLength(data) > LAN_CONTROL_LIMIT) return false;
  try { return inbound.has(JSON.parse(data.toString()).type); } catch { return false; }
}
export function lanControlMetrics(p) {
  const lane = p.controlLane;
  return { active: lane?.socket?.readyState === WebSocket.OPEN,
    received: lane?.received ?? 0, sent: lane?.sent ?? 0, fallbacks: lane?.fallbacks ?? 0,
    motionWire: lane?.motionWire?.stats() ?? null, bufferedBytes: lane?.socket?.bufferedAmount ?? 0 };
}
/** Optional independent TCP lane for small controls and bounded critical poses,
 * never complete-world snapshots or room lifecycle.
 * controls-ready is only the existing battle synchronization receipt.
 * A one-use random capability belongs to ONE already-authenticated primary WS.
 * Incoming controls re-enter that WS's existing validation, ownership, sequence,
 * match, input-rate and exact consumption-credit checks. No alternate authority.
 */
export class LanControlLanes {
  constructor() {
    this.offers = new Map(); this.entries = new Set(); this.closed = false;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: LAN_CONTROL_LIMIT, perMessageDeflate: lanPerMessageDeflate() });
  }
  issue(peer, primary) {
    this.revoke(peer);
    if (this.closed || this.entries.size >= 64) return null;
    const token = randomBytes(32).toString('hex');
    const entry = { peer, primary, token, socket: null, received: 0, sent: 0, fallbacks: 0, motionWire: peer.motionWire ? new MotionWireSender() : null };
    peer.controlLane = entry; this.entries.add(entry); this.offers.set(token, entry);
    entry.timer = setTimeout(() => {
      this.offers.delete(token); this.entries.delete(entry);
      if (peer.controlLane === entry) peer.controlLane = null;
    }, 10000);
    entry.timer.unref();
    return { version: 1, token };
  }
  revoke(peer) {
    const entry = peer.controlLane;
    if (!entry) return;
    peer.controlLane = null; clearTimeout(entry.timer); entry.motionWire?.reset();
    this.offers.delete(entry.token); this.entries.delete(entry); entry.socket?.terminate();
  }
  upgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost'), token = url.searchParams.get('token');
    const entry = this.offers.get(token);
    if (this.closed || url.pathname !== LAN_CONTROL_PATH || url.searchParams.size !== 1 ||
        !entry || entry.peer.ws !== entry.primary || entry.primary.readyState !== WebSocket.OPEN || entry.peer.disconnected)
      throw Error('Invalid control lane');
    // Consume before asynchronous HTTP upgrade: duplicate dials cannot bind twice.
    this.offers.delete(token); clearTimeout(entry.timer);
    this.wss.handleUpgrade(req, socket, head, ws => {
      if (entry.peer.controlLane !== entry || entry.peer.ws !== entry.primary || entry.primary.readyState !== WebSocket.OPEN) {
        ws.terminate(); this.entries.delete(entry); return;
      }
      entry.socket = ws;
      // Ping precedes every critical payload on this TCP stream. Its pong may
      // arrive after a battle starts, but no later state can be ahead of it.
      if (entry.peer.motionWindow) {
        const probe = randomBytes(8), started = performance.now();
        const onPong = raw => { if (!raw.equals(probe)) return; ws.off('pong', onPong); entry.peer.motionWindow?.recordNetworkRtt(performance.now() - started); };
        ws.on('pong', onPong); ws.ping(probe);
      }
      ws.on('error', () => {});
      ws.on('close', () => { entry.motionWire?.reset(); if (entry.socket === ws) entry.socket = null; this.entries.delete(entry); });
      ws.on('message', (data, binary) => {
        if (entry.peer.controlLane !== entry || entry.peer.ws !== entry.primary || entry.primary.readyState !== WebSocket.OPEN) { ws.terminate(); return; }
        if (!isLanControlMessage(data, binary)) { ws.close(1008, 'Small controls only'); return; }
        entry.received++;
        entry.primary.emit('message', data, false);
      });
      ws.send(JSON.stringify({ type: 'control-lane-ready', version: 1 }));
    });
  }
  motionActive(peer) { const e = peer.controlLane; return !!e && peer.ws === e.primary && e.socket?.readyState === WebSocket.OPEN; }
  motionWritable(peer) { return this.motionActive(peer) && peer.controlLane.socket.bufferedAmount === 0; }
  prepareMotion(peer,message,target=null) {
    if (!this.motionWritable(peer) || message.type !== 'motion') return null;
    const entry=peer.controlLane,choice=entry.motionWire&&target?entry.motionWire.prepare(target,message):null;
    const data=choice?encodeMotionWireEnvelope(message,choice):JSON.stringify(message);
    if(Buffer.byteLength(data)>LAN_CONTROL_LIMIT)return null;
    return {entry,choice,data};
  }
  sendMotion(peer,message,prepared=this.prepareMotion(peer,message)) {
    if(!prepared||!this.motionWritable(peer)||peer.controlLane!==prepared.entry)return false;
    const {entry,choice,data}=prepared;
    // Commit only after native WS admission; a refused write may not become a
    // later packet's baseline. CRC failure at the helper closes this lane.
    entry.socket.send(data,{binary:!!choice,compress:!choice},error=>{if(error)entry.socket?.terminate();});
    if(choice&&!entry.motionWire.commit(choice)) { entry.socket.terminate(); return false; }
    entry.sent++;return true;
  }
  sendCombat(peer, data) {
    if (!this.motionWritable(peer) || !peer.combatState || !Buffer.isBuffer(data) || data.length > LAN_CONTROL_LIMIT) return false;
    const entry = peer.controlLane;
    entry.socket.send(data, { binary: true, compress: false }, error => { if (error) entry.socket?.terminate(); }); entry.sent++; return true;
  }
  encodeVisual(peer,message) { return peer.visualWire?encodeVisualWireEnvelope(message):JSON.stringify(message); }
  sendVisual(peer,message,data=this.encodeVisual(peer,message)) {
    if (!this.motionWritable(peer) || message.type !== 'projectile-visual' || !['update','baseline'].includes(message.kind)) return false;
    const e = peer.controlLane;
    if (Buffer.byteLength(data) > LAN_CONTROL_LIMIT) return false;
    e.socket.send(data,{binary:Buffer.isBuffer(data),compress:!Buffer.isBuffer(data)},error=>{if(error)e.socket?.terminate();}); e.sent++; return true;
  }
  send(peer, message) {
    if (!outbound.has(message.type)) return false;
    const entry = peer.controlLane;
    if (!entry) return false;
    const data = JSON.stringify(message), bytes = Buffer.byteLength(data);
    if (peer.ws !== entry.primary || entry.socket?.readyState !== WebSocket.OPEN ||
        bytes > LAN_CONTROL_LIMIT || entry.socket.bufferedAmount + bytes > LAN_CONTROL_LIMIT * 2) {
      entry.fallbacks++; return false;
    }
    entry.socket.send(data, error => { if (error) entry.socket?.terminate(); }); entry.sent++;
    return true;
  }
  async close() {
    this.closed = true;
    for (const entry of [...this.entries]) this.revoke(entry.peer);
    this.offers.clear();
    await new Promise(resolve => this.wss.close(resolve));
  }
}
