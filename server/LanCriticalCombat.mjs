import { prepareCombatState, coreCombatTarget, CombatWireSender } from './CriticalCombatWire.mjs';
/** One newest complete authority component, no payload retained per-flight.
 * Ordered helper byte references are separate from application/world baselines.
 * Exact browser consumption receipts bound decode load as well as wire debt. */
export class LanCriticalCombat {
  constructor(matchId, { now = () => performance.now() } = {}) {
    this.matchId = matchId; this.now = now; this.target = null; this.peers = new Map(); this.bytes = 0; this.cursor = 0;
    this.totals = { publications: 0, sent: 0, consumed: 0, discarded: 0, abandonedBytes: 0, skipped: 0, oversize: 0, weaponFallbacks: 0, peakFlightBytes: 0, wireBytes: 0 };
  }
  publish(data, tick) {
    if (this.closed || this.target && tick <= this.target.tick) return false;
    const next = prepareCombatState(data);
    if (!Number.isSafeInteger(tick) || next.tick !== tick) throw Error('Combat worker tick mismatch');
    this.target = next; this.totals.publications++; return true;
  }
  reset(peer) {
    const row = this.peers.get(peer); if (row) { row.syncId = null; row.last = -1; row.tick = -1; row.ackMs = null; row.wire.reset(); }
  }
  hasDebt(peer) { return !!this.peers.get(peer)?.pending.size; }
  abandon(peer) {
    const row = this.peers.get(peer); if (row) { this.bytes -= row.bytes; this.totals.abandonedBytes += row.bytes; }
    this.peers.delete(peer);
  }
  flush(recipients, { writable, send, ordered = () => true }) {
    const target = this.target; if (!target) return;
    const start = this.cursor++ % Math.max(1, recipients.length);
    for (const { peer, syncId, idleRttMs } of [...recipients.slice(start), ...recipients.slice(0, start)]) {
      let row = this.peers.get(peer);
      if (row && row.syncId !== syncId) { this.reset(peer); row.syncId = syncId; }
      if (!row) {
        if (this.peers.size >= 10) continue;
        row = { wire: new CombatWireSender(), syncId, last: -1, pending: new Map(), bytes: 0, ackMs: null, tick: -1 }; this.peers.set(peer, row);
      }
      const capacity = Math.max(2, Math.min(6, Math.ceil((idleRttMs ?? 0) * .02) + 1));
      if (target.tick <= row.last) continue;
      if (row.pending.size >= capacity || !writable(peer)) { this.totals.skipped++; continue; }
      // Unordered optional datagrams never depend on a previous wire packet.
      if (!ordered(peer)) row.wire.reset();
      let choice;
      try { choice = row.wire.prepare(target, this.matchId, syncId); }
      catch {
        this.totals.oversize++;
        if (!target.hasWeapons) continue;
        try { choice = row.wire.prepare(coreCombatTarget(target), this.matchId, syncId); } catch { continue; }
      }
      let data = choice.data, bytes = data.length + (data.length < 126 ? 2 : 4);
      if (target.hasWeapons && choice.target === target && (row.bytes + bytes > 16384 || this.bytes + bytes > 32768)) {
        try { choice = row.wire.prepare(coreCombatTarget(target), this.matchId, syncId); } catch { this.totals.skipped++; continue; }
        data = choice.data; bytes = data.length + (data.length < 126 ? 2 : 4);
      }
      if (row.bytes + bytes > 16384 || this.bytes + bytes > 32768) { this.totals.skipped++; continue; }
      if (!send(peer, data)) continue;
      if (!row.wire.commit(choice)) throw Error("Combat wire admission mismatch");
      row.last = target.tick; row.pending.set(`${syncId}:${target.tick}`, { bytes, at: this.now(), syncId }); row.bytes += bytes; this.bytes += bytes;
      if (target.hasWeapons && !choice.target.hasWeapons) this.totals.weaponFallbacks++;
      this.totals.sent++; this.totals.wireBytes += bytes; this.totals.peakFlightBytes = Math.max(this.totals.peakFlightBytes, this.bytes);
    }
  }
  acknowledge(peer, m) {
    if (!Number.isSafeInteger(m?.tick) || m.tick < 0) return false;
    const row = this.peers.get(peer), key = `${m.syncId}:${m.tick}`, flight = row?.pending.get(key);
    if (!flight || m.type !== 'combat-consumed' || m.matchId !== this.matchId || m.syncId !== flight.syncId || !['consumed', 'discarded'].includes(m.status)) return false;
    if (m.status === 'consumed' && m.syncId === row.syncId) { row.ackMs = Math.max(0, this.now() - flight.at); row.tick = Math.max(row.tick, m.tick); }
    // Exact, not cumulative: a newer receipt cannot manufacture older credit.
    row.pending.delete(key); row.bytes -= flight.bytes; this.bytes -= flight.bytes; this.totals[m.status]++; return true;
  }
  stats(peer) {
    if (peer) { const r = this.peers.get(peer); return { inflight: r?.pending.size ?? 0, bytes: r?.bytes ?? 0, acknowledgementMs: r?.ackMs ?? null, tick: r?.tick ?? -1 }; }
    return { ...this.totals, flightBytes: this.bytes, peers: this.peers.size, retainedBytes: (this.target?.bytes.length ?? 0) + (this.target?.payload.length ?? 0) + [...(this.target?.cache.values() ?? [])].reduce((n,v)=>n+v.payload.length,0), coreFallbackBytes: this.target?.core ? this.target.core.bytes.length + this.target.core.payload.length + [...this.target.core.cache.values()].reduce((n,v)=>n+v.payload.length,0) : 0, baseBytes: [...this.peers.values()].reduce((n,r)=>n+(r.wire.base?.bytes.length ?? 0)+(r.wire.base?.previous?.bytes.length ?? 0),0), wireFull: [...this.peers.values()].reduce((n,r)=>n+r.wire.full,0), wireDelta: [...this.peers.values()].reduce((n,r)=>n+r.wire.delta,0), wireSpatial: [...this.peers.values()].reduce((n,r)=>n+r.wire.spatial,0), wirePredicted: [...this.peers.values()].reduce((n,r)=>n+r.wire.predicted,0), tick: this.target?.tick ?? -1 };
  }
  close() { this.target = null; this.closed = true; for (const peer of this.peers.keys()) this.reset(peer); }
}
