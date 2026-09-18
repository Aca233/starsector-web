import { deflateRawSync, inflateRawSync } from 'node:zlib';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
const HEADER = 40, CHUNK = 32 * 1024;
const MAX_MESSAGE = protocol.maxSnapshotBytes + 4096;
const OPS = ['open', 'opened', 'data', 'close', 'ping', 'pong', 'ack'];
export const validConnection = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
/** Framed Steam P2P messages. No unbounded allocations or unbounded inflation. */
export class SteamPacketCodec {
  constructor() { this.sequence = 0; this.pending = new Map(); this.bytes = 0; this.cache = null; }
  encode(connection, op, value) {
    if (!validConnection(connection) || !OPS.includes(op)) throw Error('无效 Steam 传输标识');
    const raw = op === 'data' && typeof value === 'string' ? value : JSON.stringify(value);
    let prepared = this.cache?.raw === raw ? this.cache : null;
    if (!prepared) {
      const input = Buffer.from(raw);
      if (input.length > MAX_MESSAGE) throw Error('Steam 消息超过安全预算');
      const compressed = input.length > 4096 ? deflateRawSync(input, { level: 1 }) : input;
      const zipped = compressed.length < input.length;
      prepared = { raw, payload: zipped ? compressed : input, rawBytes: input.length, zipped };
      // One broadcast snapshot is compressed once, independent of recipient nonce.
      if (op === 'data' && raw.startsWith('{"type":"state",')) this.cache = prepared;
    }
    const { payload, rawBytes, zipped } = prepared, id = this.sequence = (this.sequence + 1) >>> 0;
    const count = Math.max(1, Math.ceil(payload.length / CHUNK)), packets = [];
    for (let index = 0; index < count; index++) {
      const part = payload.subarray(index * CHUNK, (index + 1) * CHUNK), packet = Buffer.alloc(HEADER + part.length);
      packet.write('SWSP', 0, 'ascii'); packet[4] = 1; packet[5] = OPS.indexOf(op); packet[6] = Number(zipped);
      packet.writeUInt32LE(id, 8); packet.writeUInt16LE(index, 12); packet.writeUInt16LE(count, 14);
      packet.writeUInt32LE(payload.length, 16); packet.writeUInt32LE(rawBytes, 20);
      Buffer.from(connection, 'hex').copy(packet, 24); part.copy(packet, HEADER); packets.push(packet);
    }
    return { id, packets, bytes: payload.length };
  }
  remove(key) { const item = this.pending.get(key); if (item) { this.bytes -= item.bytes; this.pending.delete(key); } }
  sweep(now = Date.now()) { for (const [key, item] of this.pending) if (now - item.since > 8000) this.remove(key); }
  forget(peer) { for (const [key, item] of this.pending) if (item.peer === peer) this.remove(key); }
  clear() { this.pending.clear(); this.bytes = 0; this.cache = null; }
  receive(peer, packet, now = Date.now()) {
    this.sweep(now);
    if (!Buffer.isBuffer(packet) || packet.length < HEADER || packet.length > HEADER + CHUNK || packet.toString('ascii', 0, 4) !== 'SWSP' || packet[4] !== 1 || packet[5] >= OPS.length || packet[6] > 1 || packet[7] !== 0) return null;
    const id = packet.readUInt32LE(8), index = packet.readUInt16LE(12), count = packet.readUInt16LE(14);
    const encoded = packet.readUInt32LE(16), raw = packet.readUInt32LE(20), connection = packet.subarray(24, 40).toString('hex');
    if (encoded < 1 || encoded > MAX_MESSAGE || raw < 1 || raw > MAX_MESSAGE || count !== Math.ceil(encoded / CHUNK) || index >= count || packet.length - HEADER !== Math.min(CHUNK, encoded - index * CHUNK) || (!packet[6] && encoded !== raw)) throw Error('无效 Steam 分片');
    const key = peer + ':' + connection + ':' + id;
    let item = this.pending.get(key);
    if (!item) {
      if ([...this.pending.values()].filter(value => value.peer === peer).length >= 4 || this.pending.size >= 32) throw Error('Steam 分片数量超限');
      item = { peer, connection, id, op: OPS[packet[5]], zipped: packet[6], encoded, raw, count, parts: new Map(), bytes: 0, since: now };
      this.pending.set(key, item);
    }
    if (item.count !== count || item.encoded !== encoded || item.raw !== raw || item.op !== OPS[packet[5]] || item.zipped !== packet[6]) { this.remove(key); throw Error('Steam 分片元数据不一致'); }
    if (!item.parts.has(index)) {
      const part = Buffer.from(packet.subarray(HEADER));
      if (this.bytes + part.length > MAX_MESSAGE * 2) { this.remove(key); throw Error('Steam 重组内存预算超限'); }
      item.parts.set(index, part); item.bytes += part.length; this.bytes += part.length;
    }
    if (item.parts.size !== count) return null;
    this.remove(key);
    const assembled = Buffer.concat(Array.from({ length: count }, (_, i) => item.parts.get(i)), encoded);
    const decoded = item.zipped ? inflateRawSync(assembled, { maxOutputLength: raw }) : assembled;
    if (decoded.length !== raw) throw Error('Steam 消息长度不匹配');
    return { connection, id, op: item.op, data: JSON.parse(decoded.toString('utf8')) };
  }
}
