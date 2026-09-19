// Read-only, bounded LAN metrics carried by the existing application pong.
// Wire/compressed bytes are deliberately NOT inferred from bufferedAmount.
export function createLanFlowMetrics() {
  return { received: 0, lastReceivedBytes: null, lastReceiveMs: null, sent: 0, skippedSocket: 0, skippedCredit: 0, lastBytes: null, lastSeq: null };
}
function receiver(p) {
  return { seat: p.seat, compression: typeof p.ws.extensions === 'string'
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
    authority: authority ? { received: authority.received, lastBytes: authority.lastReceivedBytes, receiveMs: authority.lastReceiveMs } : null,
    receivers: host ? p.room.peers.filter(q => q !== p && !q.transport && !q.disconnected).slice(0, 9).map(receiver) : [receiver(p)] };
}
