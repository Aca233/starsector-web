import { FlowCounters, publicAuthorityPerformance } from '../src/network/SnapshotFlow.mjs';
const peers = new WeakMap(), authorities = new WeakMap();
const keys = ['received', 'queued', 'skippedSocket', 'skippedCredit', 'consumed'];
function flow(peer, now) {
  const match = peer.room?.match?.id;
  if (!match) return null;
  let state = peers.get(peer);
  if (!state || state.match !== match) {
    state = { match, counters: new FlowCounters(keys, now) }; peers.set(peer, state);
  }
  return state.counters;
}
export function countSnapshotStage(peer, stage, now = performance.now()) {
  flow(peer, now)?.count(stage);
}
export function acceptAuthorityPerformance(peer, probe, now = performance.now()) {
  const room = peer.room;
  // This piggybacks on the existing ping, not on replaceable world snapshots.
  // It is still subject to the same network FIFO and is not a separate channel.
  if (!room || room.status !== 'running' || room.hostId !== peer.id || !probe || probe.matchId !== room.match?.id
    || !Number.isFinite(probe.ageMs) || probe.ageMs < 0 || probe.ageMs > 5000) return false;
  const sample = publicAuthorityPerformance(probe.performance);
  if (!sample) return false;
  authorities.set(room, { match: room.match.id, at: now, localAge: probe.ageMs, sample });
  return true;
}
export function snapshotPipelineMetrics(peer, now = performance.now()) {
  const room = peer.room;
  if (!room?.match || room.status !== 'running') return null;
  const host = room.hostId === peer.id, authority = room.peers.find(p => p.id === room.hostId);
  const stored = authorities.get(room);
  const age = stored && stored.match === room.match.id ? Math.max(0, now - stored.at) + stored.localAge : null;
  const source = age !== null ? { performance: age <= 5000 ? stored.sample : null, knownAgeMs: age, stale: age > 5000 } : null;
  return { version: 1, role: host ? 'host' : 'guest', authority: source,
    ingress: authority ? flow(authority, now).sample(now) : null,
    receivers: (host ? room.peers.filter(p => p !== peer && !p.disconnected).slice(0, 9) : [peer])
      .map(p => ({ seat: p.seat, consumptionCredits: !!p.stateCredits, stages: flow(p, now).sample(now) })) };
}
