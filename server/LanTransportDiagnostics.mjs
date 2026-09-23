import { lanControlMetrics } from "./LanControlLane.mjs";
import { lanCompressionStats } from './LanBroadcastCompression.mjs';
// Read-only, bounded LAN metrics carried by the existing application pong.
// Wire/compressed bytes are deliberately NOT inferred from bufferedAmount.
export function createLanFlowMetrics() {
  return { received: 0, lastReceivedBytes: null, lastReceiveMs: null, sent: 0, skippedSocket: 0, skippedCredit: 0, lastBytes: null, lastSeq: null };
}
function receiver(p) {
  return { seat: p.seat, motionAdmission: p.autoMotion?.stats() ?? null, visualBulkSent: p.visualBulkSent ?? 0, bulkChunks: !!p.bulkChunks, chunkDeferred: p.chunkDeferred ?? 0, combat: p.room?.combatStates?.stats(p) ?? null, motion: p.motionWindow ? { ...p.motionWindow.stats(), ...(p.autoMotion ? { detailIntervalMs: 0 } : {}) } : null, detailSkipped: p.detailSkipped ?? 0, codecDeferred: p.codecDeferred ?? 0, controlLane: lanControlMetrics(p), compression: typeof p.ws.extensions === 'string'
      ? p.ws.extensions.split(',').map(s => s.trim()).includes('permessage-deflate') : null,
    bufferedBytes: p.ws.bufferedAmount,
    credits: p.stateCredits?.stats() ?? null,
    network: p.stateCredits?.networkStats() ?? null,
    delta: p.lanDelta?.stats() ?? null,
    flow: p.lanFlow ? { ...p.lanFlow } : null };
}
export function lanTransportMetrics(p) {
  if (p.transport || !p.stateCredits) return null;
  const host = p.room?.hostId === p.id;
  const authority = p.room?.peers[0]?.lanFlow;
  return { mode: 'lan-websocket', role: host ? 'host' : 'guest',
    relaySeq: p.room?.lastSeq ?? null,
    // Chunk bytes are exact helper WS bytes, not IP/TCP/VPN overhead. Retained
    // bytes charge raw jobs, not physical zlib working-set/allocator overhead.
    bulk: p.room?.bulkScheduler?.stats() ?? null,
    criticalCombat: p.room?.combatStates?.stats() ?? null,
    projectileVisuals: p.room?.visuals?.stats() ?? null,
    captureDemand: p.room?.authority ? { held: p.room.authoritySnapshotTick != null,
      reason: p.room.authoritySnapshotTick != null ? p.room.authorityCaptureReason ?? null : null,
      heldTick: p.room.authoritySnapshotTick ?? null,
      heldMs: p.room.authoritySnapshotTick != null ? Math.max(0,performance.now()-(p.room.authorityCaptureHeldAt ?? performance.now())) : 0,
      granted: p.room.authorityCaptureGranted ?? 0, withheld: p.room.authorityCaptureWithheld ?? 0 } : null,
    visualUnavailable: p.room?.visualUnavailable ?? null,
    // Aggregate of this relay process, not per-room traffic or a wire ratio.
    compressionFanout: lanCompressionStats(p.ws),
    authority: authority ? { received: authority.received, lastBytes: authority.lastReceivedBytes, receiveMs: authority.lastReceiveMs } : null,
    receivers: host ? p.room.peers.filter(q => q !== p && !q.transport && !q.disconnected).slice(0, 9).map(receiver) : [receiver(p)] };
}
