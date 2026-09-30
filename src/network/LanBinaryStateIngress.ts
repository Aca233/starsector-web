import { decodeBinaryState, inspectBinaryState } from './BinarySnapshot.mjs';
import { isLanDelta, LAN_DELTA_HEADER, LAN_DELTA_MAX_BYTES, LanDeltaReceiver } from './LanBinaryDelta.mjs';
import type { LanComponentSession } from './LanPresentationComponents';
import type { CombatSnapshot } from './CombatSnapshot';

/** Explicit control-plane state, never learned from an arriving data packet. */
export interface LanBinaryIngressSession {
  readonly owner: string; readonly epoch: number; readonly matchId: string;
  readonly components?: LanComponentSession;
  readonly binaryDelta: boolean; readonly motionReference: boolean; readonly projectileVisuals: boolean;
}
export interface LanBinaryDelivery {
  readonly owner: string; readonly epoch: number; readonly matchId: string;
  readonly seq: number; readonly bytes: number; readonly data: ArrayBuffer;
}
export interface LanBinaryAdmission { matchId: string; seq: number; bytes: number }

/** Read at most the fixed delta header and 1024-byte SWB1 metadata. This is an
 * admission budget/ACK identity, NOT CRC, base, projection or frame validation. */
export function inspectLanBinaryState(data: ArrayBuffer, session: LanBinaryIngressSession): LanBinaryAdmission {
  if (!(data instanceof ArrayBuffer)) throw Error('Invalid binary ingress buffer');
  let result: LanBinaryAdmission;
  if (!isLanDelta(data)) result = inspectBinaryState(data);
  else {
    if (!session.binaryDelta || data.byteLength <= LAN_DELTA_HEADER || data.byteLength > LAN_DELTA_MAX_BYTES + LAN_DELTA_HEADER) throw Error('Invalid/unnegotiated LAN delta envelope');
    const view = new DataView(data), flags = view.getUint32(4), baseSeq = view.getFloat64(8), seq = view.getFloat64(16), bytes = view.getUint32(24);
    const motion = !!(flags & 4), steps = flags >>> 8;
    if (flags & ~0x3f07 || !Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(baseSeq) || baseSeq < 0
      || !bytes || bytes > LAN_DELTA_MAX_BYTES || (motion ? !session.motionReference || !(flags & 1) || steps < 1 || steps > 60 : steps !== 0)) throw Error('Invalid LAN delta admission');
    if (flags & 1) {
      if (baseSeq >= seq) throw Error('Invalid LAN delta base order');
      // A patch has no readable match header. Bind it to this explicit owner;
      // the full owner-side decoder MUST verify the restored inner identity.
      result = { matchId: session.matchId, seq, bytes };
    } else {
      if (baseSeq || view.getUint32(28) || data.byteLength !== LAN_DELTA_HEADER + bytes) throw Error('Invalid LAN full envelope');
      result = inspectBinaryState(new Uint8Array(data, LAN_DELTA_HEADER));
      if (result.seq !== seq || result.bytes !== bytes) throw Error('Conflicting LAN inner envelope');
    }
  }
  if (result.matchId !== session.matchId) throw Error('Binary state belongs to another match');
  return result;
}

/** Same decoder lives beside the presentation world, not in a decode-only
 * Worker that would clone its restored graph back. Two wire anchors at most. */
export class LanBinaryStateIngress {
  private readonly delta = new LanDeltaReceiver();
  private session: LanBinaryIngressSession | null = null;
  private failed = false;
  private closed = false;
  constructor(private readonly matchId: string) {}
  get stats() { return { retainedBytes: this.delta.retainedBytes, failed: this.failed, closed: this.closed, epoch: this.session?.epoch ?? 0, owner: this.session?.owner ?? null }; }
  reset(session: LanBinaryIngressSession): void {
    if (this.closed || !session || session.matchId !== this.matchId || !/^[a-f0-9]{32}$/.test(session.owner)
      || !Number.isSafeInteger(session.epoch) || session.epoch < 1
      || [session.binaryDelta, session.motionReference, session.projectileVisuals].some(value => typeof value !== 'boolean')
      || (session.motionReference && !session.binaryDelta)
      || (this.session?.owner === session.owner && session.epoch <= this.session.epoch)) throw Error('Invalid binary ingress reset');
    this.session = { ...session }; this.failed = false;
    this.delta.setMotionReference(session.motionReference);
  }
  decode(packet: LanBinaryDelivery): { frame: CombatSnapshot; bytes: number; parseMs: number } | null {
    if (this.closed || this.failed || !this.session) throw Error('Binary ingress is not active');
    if (!packet || packet.owner !== this.session.owner || packet.epoch !== this.session.epoch) return null;
    try {
      const started = performance.now(), admission = inspectLanBinaryState(packet.data, this.session);
      if (packet.matchId !== admission.matchId || packet.seq !== admission.seq || packet.bytes !== admission.bytes) throw Error('Binary admission identity changed');
      const bytes = this.session.binaryDelta ? this.delta.decode(packet.data) : new Uint8Array(packet.data);
      const state = decodeBinaryState(bytes);
      if (state.matchId !== admission.matchId || state.seq !== admission.seq || bytes.byteLength !== admission.bytes
        || !Number.isSafeInteger(state.frame?.tick) || state.frame.tick < 0
        || (state.frame.projectileVisuals === 1 && !this.session.projectileVisuals)) throw Error('Invalid binary presentation state');
      return { frame: state.frame, bytes: bytes.byteLength, parseMs: performance.now() - started };
    } catch (error) { this.failed = true; this.delta.reset(); throw error; }
  }
  close(): void { this.closed = true; this.session = null; this.delta.reset(); }
}
