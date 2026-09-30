import type { AIDecisionProfile } from '../shared/ai-decision-profile.mjs';
import type { LanVisualDelivery } from './LanPresentationVisuals';
import { inspectLanComponent, LAN_COMPONENT_LIMITS, type LanComponentDelivery } from './LanPresentationComponents';
import { inspectLanBinaryState, type LanBinaryDelivery, type LanBinaryIngressSession } from './LanBinaryStateIngress';
import { PresentationReceipts, type PresentationReceipt, type PresentationReceiptStatus, type PresentationReceiptToken } from './PresentationReceipts';
import { ANCHORED_VISUAL_LIMITS } from './AnchoredProjectileVisual.mjs';
import { networkCloseCause } from '../../desktop/network-diagnostic-record.mjs';
import { AuthorityComponentPublisher } from './AuthorityComponents.mjs';
import { networkFeaturePolicy, networkHelloFeatures, networkFeatureStatus } from './NetworkFeaturePolicy.mjs';
import { VisualPacketAssembler, visualReceipt } from './ProjectileVisualPacket.mjs';
import { publicAuthorityPerformance } from "./SnapshotFlow.mjs";
import type { PublicAuthorityPerformance } from "./SnapshotFlow.mjs";
import { LanDeltaReceiver, isLanDelta } from "./LanBinaryDelta.mjs";
import { RealtimeSendGate } from "./RealtimeSendPolicy.mjs";
import { createLanSocket, type LanSocket } from "./LanSocket";
import config from "./protocol.json";
import { decodeBinaryState, encodeBinaryState } from "./BinarySnapshot.mjs";
import { wireBytes } from "./room-fleet.mjs";
import type { Design } from "../studio/DesignModel";
export const LAN_PROTOCOL = config.version;
export const LAN_SHIPS = config.ships;
export const LAN_BUILD = __LAN_BUILD_ID__;
// Seat identifies controller ownership, not faction.
export type Seat = number;
export const LAN_MAX_PLAYERS = config.maxPlayers;
export type Team = number;
export { teamName } from "./room-fleet.mjs";
export { combatTeamColor as teamColor } from "../engine/simulation/CombatTeams";
export const LAN_MAX_OPTIONS_BYTES = config.maxOptionsBytes;
export const LAN_MAX_SNAPSHOT_BYTES = config.maxSnapshotBytes;
export const roomTeams = (options: RoomOptions) => options.aiHulls.map((_,i)=>i);
export interface Member {
  id: string;
  name: string;
  seat: Seat;
  team: Team;
  hull: string;
  design: Design | null;
  designRevision: number;
  editing: boolean;
  ready: boolean;
  loaded: boolean;
  connected: boolean;
  reconnectUntil: number | null;
}
export interface RoomOptions {
  /** Independently assigned AI loadout references, indexed by team. Raw hull IDs are legacy defaults. */
  aiHulls: string[][];
  /** Deduplicated immutable combat configurations; no design is repeated per ship. */
  aiLoadouts?: Record<string, Design>;
  aiNextId?: number;
  aiRevision?: number;
  assignment: "teams" | "solo";
  /** Whole-battle DP selected by the host. Frozen on match start. */
  battleSize: number;
  /** Host-selected gameplay rule, frozen in Match. Missing means standard. */
  aiDecisionProfile?: AIDecisionProfile;
  /** Server-derived per-team active DP ceiling. */
  deploymentLimit?: number;
  /** Initial DP target; humans and each team flagship always deploy. */
  initialDeploymentLimit?: number | null;
}
export interface Match {
  /** Omitted for the existing browser-hosted LAN/Steam mode. */
  authority?: "server";
  options: RoomOptions;
  id: string;
  seed: number;
  players: Array<Pick<Member, "id" | "name" | "seat" | "team" | "hull" | "design">>;
  snapshotHz: 2 | 5 | 10 | 20 | 60;
  hostId: string;
}
export interface Room {
  authority?: "server";
  code: string;
  capacity: number;
  hostId: string;
  members: Member[];
  status: "lobby" | "loading" | "running" | "ended";
  match: Match | null;
  reason?: string;
  options: RoomOptions;
  network?: { kind: "steam"; lobbyId: string; appId: number };
  passwordProtected: boolean;
  chat: Array<{ id: string; name: string; text: string; time: number }>;
}
export interface Action {
  id: number;
  kind: "shield" | "hullShield" | "vent" | "system" | "group" | "mode" | "autofire" | "target" | "recall" | "module";
  value?: number;
  /** Command-edge world point, independent of a later movement packet. */
  aim?: [number, number];
}
export interface PlayerInput {
  seq: number;
  keys: number;
  aim: [number, number];
  firing: boolean;
  /** True only after a real cockpit pointer event; menus/focus loss revoke it. */
  pointerActive: boolean;
  actions: Action[];
}
export const KEY_CODES = [
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "KeyX",
] as const;
export const blankInput = (): PlayerInput => ({
  seq: 0,
  keys: 0,
  aim: [0, 0],
  firing: false,
  pointerActive: false,
  actions: [],
});
export type Listener = (message: any, receipt?: PresentationReceipt) => void;
const STORAGE_KEY = "starsector.lan.session.v5";
/** Session token is tab-local. A new page can resume a guest, never reconstruct a host Worker. */
const NETWORK_FEATURE_POLICY = networkFeaturePolicy(import.meta.env);
// Full multirate remains opt-in. Default additive motion never slows full worlds.
export const LAN_LAYERED_SYNC_ENABLED = NETWORK_FEATURE_POLICY.mode === 'experimental';
export const LAN_MOTION_SYNC_ENABLED = NETWORK_FEATURE_POLICY.motion;
export const LAN_CRITICAL_COMBAT_ENABLED = NETWORK_FEATURE_POLICY.combat;

export interface LanBinaryStateOwner {
  readonly matchId: string;
  /** Must synchronously fence old jobs; an async owner sends an ordered reset. */
  reset(session: LanBinaryIngressSession): void;
  /** Defer synchronously before transferring data; complete only after retain. */
  receive(packet: LanBinaryDelivery, receipt: PresentationReceipt): void;
  receiveComponent?(packet: LanComponentDelivery, receipt: PresentationReceipt): void;
  receiveVisual?(packet: LanVisualDelivery, receipt: PresentationReceipt): void;
}
export class LanConnection {
  private binaryOwner: LanBinaryStateOwner | null = null;
  private binaryOwnerId = '';
  private binaryOwnerEpoch = 0;
  private binaryOwnerFailed = false;
  private binaryStateSeen = false;
  private presentationEncoding: 'binary' | 'json' | null = null;
  private motionReference = false;
  private binarySession(): LanBinaryIngressSession {
    return { owner: this.binaryOwnerId, epoch: this.binaryOwnerEpoch, matchId: this.binaryOwner!.matchId,
      binaryDelta: this.binaryDelta, motionReference: this.motionReference, projectileVisuals: this.visualState,
      components: { syncId: this.presentationSyncKey ? JSON.parse(this.presentationSyncKey)[1] : '', motion: this.motionState, combat: this.combatState } };
  }
  private resetBinaryOwner(): void {
    if (!this.binaryOwner) return;
    this.binaryOwnerEpoch++;
    try { this.binaryOwner.reset(this.binarySession()); this.binaryOwnerFailed = false; }
    catch (error) {
      this.binaryOwnerFailed = true; this.presentationReceipts.reset();
      this.emit({ type: 'error', code: 'PRESENTATION_INGRESS', message: String(error) });
    }
  }
  /** Opt-in before the first binary state, never silently switch a live anchor
   * chain. JSON states remain on the legacy subscriber path and fence this lane.
   * Releasing an active stream reconnects to obtain a fresh main-thread anchor. */
  claimBinaryState(owner: LanBinaryStateOwner): (() => void) | null {
    if (this.binaryOwner || this.binaryStateSeen) return null;
    if (!owner || typeof owner.matchId !== 'string' || !owner.matchId || owner.matchId.length > 128) throw Error('Invalid binary presentation owner');
    this.binaryOwner = owner;
    this.binaryOwnerId = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    this.binaryOwnerEpoch = 0; this.deltaReceiver.reset(); this.resetBinaryOwner();
    return () => {
      if (this.binaryOwner !== owner) return;
      // Components/visuals can arrive before the first binary anchor. Revoking
      // their receipts also needs fresh remote credits, not a silent handoff.
      const active = this.binaryStateSeen || this.presentationReceipts.stats.pending > 0;
      this.resetPresentationConsumption(); this.binaryOwner = null; this.deltaReceiver.reset();
      if (active && this.socket && this.ready) this.retry(this.socket, 1006, 'presentation-owner-changed');
    };
  }
  /** Format handoff, not a per-JSON-frame reset: repeatedly revoking an
   * unchanged JSON stream destroys playback/UI and prevents stable prediction.
   * Never overtake retained events from the other format. */
  private enterPresentationEncoding(encoding: 'binary' | 'json', socket: LanSocket): boolean {
    if (this.binaryOwner && this.presentationEncoding !== null && this.presentationEncoding !== encoding) {
      if (this.presentationReceipts.stats.pending) { this.retry(socket, 1006, 'binary-json-handoff'); return false; }
      this.resetPresentationConsumption();
    }
    this.presentationEncoding = encoding;
    return true;
  }
  private deliverBinaryState(data: ArrayBuffer, socket: LanSocket): void {
    const owner = this.binaryOwner;
    if (!owner || this.binaryOwnerFailed) return;
    try {
      const session = this.binarySession(), identity = inspectLanBinaryState(data, session);
      this.snapshotBytes = identity.bytes; this.snapshotParseMs = 0;
      this.lastMessageAt = performance.now();
      const acknowledge = this.stateCredits
        ? this.receiptSender(socket, { type: 'state-consumed', matchId: identity.matchId, seq: identity.seq }) : () => true;
      // This is the decoded wire budget, not patch length or restored heap size.
      this.presentationReceipts.deliver('state', identity.bytes, acknowledge, receipt => {
        this.requirePresentationClaim(receipt, required => owner.receive({ owner: session.owner, epoch: session.epoch, ...identity, data }, required));
      });
    } catch {
      // Failed admission/dispatch grants no ACK; reset both owner and wire chain.
      this.retry(socket, 1006, 'decode-failed');
    }
  }
  private requirePresentationClaim(receipt: PresentationReceipt, dispatch: (required: PresentationReceipt) => void): void {
    let claimed = false;
    const required: PresentationReceipt = {
      defer: cancel => { const token = receipt.defer(cancel); claimed = true; return token; },
      complete: status => { claimed = true; return receipt.complete(status); },
      reject: error => { claimed = true; receipt.reject(error); },
    };
    const result: unknown = dispatch(required);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void Promise.resolve(result).catch(() => {});
      throw Error('Presentation owner must defer before returning, not return a Promise');
    }
    if (!claimed) throw Error('Presentation owner did not claim consumption');
  }
  private deliverComponent(m: any, socket: LanSocket): void {
    const kind = m.type === 'motion' ? 'motion' : 'combat';
    if (!(kind === 'motion' ? this.motionState : this.combatState) || (this.binaryOwner && this.binaryOwnerFailed)) return;
    if (typeof m.matchId !== 'string' || !m.matchId || m.matchId.length > 128 || typeof m.syncId !== 'string'
      || !m.syncId || m.syncId.length > 128 || JSON.stringify([m.matchId, m.syncId]) !== this.presentationSyncKey) return;
    const owner = this.binaryOwner;
    if (owner && owner.matchId !== m.matchId) return;
    try {
      const tick = inspectLanComponent(kind, m.data);
      if (kind === 'combat' && tick !== m.tick) throw Error('Critical combat tick mismatch');
      const acknowledge = this.receiptSender(socket, { type: kind === 'motion' ? 'motion-consumed' : 'combat-consumed',
        matchId: m.matchId, syncId: m.syncId, tick }, kind === 'combat', kind === 'motion');
      // Discarding inactive motion must NOT activate the relay's motion lane.
      const packet: LanComponentDelivery = { owner: this.binaryOwnerId, epoch: this.binaryOwnerEpoch,
        matchId: m.matchId, syncId: m.syncId, kind, tick, data: m.data };
      this.presentationReceipts.deliver(kind, m.data.length, acknowledge, receipt => {
        if (owner?.receiveComponent) this.requirePresentationClaim(receipt, required => owner.receiveComponent!(packet, required));
        else this.emit(m, receipt);
      });
    } catch { this.retry(socket, 1006, 'decode-failed'); }
  }
  private deliverVisual(m: any, socket: LanSocket): void {
    if (!this.visualState) return;
    const owner = this.binaryOwner;
    if (owner?.receiveVisual && (this.binaryOwnerFailed || m.matchId !== owner.matchId
      || JSON.stringify([m.matchId, m.syncId]) !== this.presentationSyncKey)) return;
    let bytes: Uint8Array | null;
    try { bytes = this.visualPackets.take(m); }
    catch { this.visualPackets.reset(); this.send(visualReceipt(m, 'discarded')); return; }
    if (!bytes) { this.send(visualReceipt(m, 'fragment')); return; }
    const acknowledge = this.receiptSender(socket, visualReceipt(m), true);
    const identity = { owner: this.binaryOwnerId, epoch: this.binaryOwnerEpoch, matchId: m.matchId,
      syncId: m.syncId, key: m.key, tick: m.tick, kind: m.kind };
    this.presentationReceipts.deliver('visual', bytes.byteLength, acknowledge, receipt => {
      if (owner?.receiveVisual) {
        // Assembler owns these bytes; transfer without retaining or restoring a
        // projectile graph on the UI thread. Never transfer a pooled backing slab.
        const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer as ArrayBuffer : bytes.slice().buffer as ArrayBuffer;
        this.requirePresentationClaim(receipt, required => owner.receiveVisual!({ ...identity, data }, required));
      } else this.emit({ ...m, visualBytes: bytes }, receipt);
    });
  }
  socket: LanSocket | null = null;
  private readonly realtimeGate = new RealtimeSendGate();
  private presentationSyncKey = '';
  private readonly presentationReceipts = new PresentationReceipts(error => {
    if (this.binaryOwner) this.binaryOwnerFailed = true;
    this.emit({ type: 'error', code: 'PRESENTATION_CONSUMPTION', message: '呈现接收失败：' + (error instanceof Error ? error.message : String(error)) });
  }, { state: { count: 64, units: config.maxSnapshotBytes * 2 },
    visual: { count: 4, units: ANCHORED_VISUAL_LIMITS.baselineBytes * 4 }, ...LAN_COMPONENT_LIMITS });
  /** These tokens are local correlation, never authority input or server ACKs. */
  completePresentation(token: PresentationReceiptToken, status: PresentationReceiptStatus): boolean {
    return this.presentationReceipts.complete(token, status);
  }
  resetPresentationConsumption(): void {
    this.presentationReceipts.reset();
    if (this.binaryOwner?.receiveVisual) this.visualPackets.reset();
    this.resetBinaryOwner();
  }
  get presentationConsumption() { return this.presentationReceipts.stats; }
  // Separate scope deliberately keeps pending ACK closures from retaining m.frame,
  // decoded arrays or the onmessage event through a shared closure environment.
  private receiptSender(socket: LanSocket, receipt: Record<string, unknown>, statusField = false, discardWithoutSend = false) {
    return (status: PresentationReceiptStatus) => (discardWithoutSend && status === 'discarded')
      || (this.socket === socket && this.send(statusField ? { ...receipt, status } : receipt));
  }
  canSendInput(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.realtimeGate.canSendInput(this.socket.bufferedAmount, performance.now());
  }
  ready = false;
  private stateCredits = false;
  combatState = false;
  private componentUpload = false;
  get canPublishVisual() { return this.componentUpload && NETWORK_FEATURE_POLICY.visuals; }
  get canPublishCombat() { return this.componentUpload && NETWORK_FEATURE_POLICY.combat; }
  private authorityComponents = new AuthorityComponentPublisher();
  motionState = false;
  visualState = false;
  private readonly visualPackets = new VisualPacketAssembler();
  private binaryDelta = false;
  private steamBinarySnapshots = false;
  get canSendBinarySnapshots(): boolean { return this.transport === "lan" || this.steamBinarySnapshots; }
  private readonly deltaReceiver = new LanDeltaReceiver();
  /** Read-only LAN relay metrics from the existing pong; absent for Steam/old servers. */
  lanTransport: unknown = null;
  snapshotPipeline: unknown = null;
  snapshotPipelineAt: number | null = null;
  snapshotPipelineRoundTripMs = 0;
  private pipelineEpoch = 0;
  private pipelineProbeEpoch = -1;
  private resetPipeline(): void {
    this.presentationSyncKey = ''; this.resetPresentationConsumption(); this.binaryStateSeen = false; this.presentationEncoding = null;
    this.visualPackets.reset();
    this.snapshotPipeline = null;
    this.snapshotPipelineAt = null;
    this.snapshotPipelineRoundTripMs = 0;
    this.pipelineEpoch++;
  }
  private authoritySample: { matchId: string; performance: PublicAuthorityPerformance; at: number } | null = null;
  recordAuthorityPerformance(matchId: string, value: unknown): void {
    const sample = publicAuthorityPerformance(value);
    if (sample) this.authoritySample = { matchId, performance: sample, at: performance.now() };
  }
  clearAuthorityPerformance(matchId: string): void {
    if (this.authoritySample?.matchId === matchId) this.authoritySample = null;
  }
  /** Browser-to-relay round trip, not host simulation or end-to-end input delay. */
  rttMs: number | null = null;
  jitterMs = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private pingSent = 0;
  private lastMessageAt = 0;
  private background = false;
  inputSequence = 0;
  actionSequence = 0;
  saved: { token: string; name: string; url: string; build: string } | null =
    null;
  private listeners = new Set<Listener>();
  private url = "";
  private name = "";
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private deadline = 0;
  private attempts = 0;
  private readonly instance = Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  networkFeatures: ReturnType<typeof networkFeatureStatus>;
  constructor(public readonly transport: "lan" | "steam" = "lan") {
    this.networkFeatures = networkFeatureStatus(transport, NETWORK_FEATURE_POLICY);
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.storageKey) ?? "null");
      if (
        saved?.build === LAN_BUILD &&
        typeof saved.token === "string" &&
        /^[a-f0-9]{64}$/.test(saved.token) &&
        typeof saved.url === "string" &&
        typeof saved.name === "string"
      )
        this.saved = saved;
    } catch {
      /* Storage may be unavailable in a private/embedded browser. */
    }
  }
  private get storageKey() { return STORAGE_KEY + (this.transport === "steam" ? ".steam" : ""); }
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  emit(message: any, receipt?: PresentationReceipt) {
    for (const fn of this.listeners) {
      const result: unknown = fn(message, receipt);
      // Async work must explicitly defer before returning; an async listener is
      // otherwise indistinguishable from a silently dropped presentation packet.
      if (receipt && result && typeof (result as Promise<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw Error('Presentation listeners must explicitly defer, not return a Promise');
      }
    }
  }
  private forget() {
    this.saved = null;
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      /* optional */
    }
  }
  /** Visibility, not focus: another window must not disable real network checks. */
  private onVisibility = () => {
    const hidden = document.visibilityState === "hidden";
    if (hidden === this.background) return;
    this.deltaReceiver.reset();
    this.resetPipeline();
    this.background = hidden;
    if (!hidden) {
      // Old probes/timestamps include browser suspension, not network latency.
      this.lastMessageAt = performance.now();
      this.pingSent = 0;
      this.rttMs = null;
      this.jitterMs = 0;
    }
    if (this.ready) this.send({ type: "visibility", hidden });
    this.emit({ type: "page-visibility", hidden });
    if (!hidden) this.probe();
  };
  private probe() {
    const socket = this.socket;
    // Keep at most one outstanding probe, including while backgrounded.
    // A 60 Hz input/snapshot stream need not be completely idle to carry a tiny
    // heartbeat. Still avoid measuring a probe buried behind a large upload.
    if (!this.ready || !socket || this.pingSent || socket.bufferedAmount > 16384) return;
    this.pingSent = performance.now();
    this.pipelineProbeEpoch = this.pipelineEpoch;
    const sample = this.authoritySample;
    const ageMs = sample ? Math.max(0, performance.now() - sample.at) : Infinity;
    const authority = sample && ageMs <= 5000 ? { matchId: sample.matchId, performance: sample.performance, ageMs } : undefined;
    if (!this.send({ type: "ping", sent: this.pingSent, ...(authority ? { authority } : {}) })) this.pingSent = 0;
  }
  connect(url: string, name: string) {
    this.background = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", this.onVisibility);
    clearTimeout(this.retryTimer);
    this.stopped = false;
    this.deadline = 0;
    this.attempts = 0;
    if (this.saved && this.saved.url !== url) this.forget();
    this.url = url;
    this.name = name;
    this.open();
  }
  private open() {
    this.lanTransport = null;
    this.resetPipeline();
    this.authoritySample = null;
    this.stateCredits = false;
    this.networkFeatures = networkFeatureStatus(this.transport, NETWORK_FEATURE_POLICY);
    this.motionState = false; this.visualState = false; this.combatState = false;
    this.binaryDelta = false; this.motionReference = false;
    this.steamBinarySnapshots = false;
    this.deltaReceiver.setMotionReference(false);
    this.deltaReceiver.reset();
    clearTimeout(this.handshakeTimer);
    clearInterval(this.heartbeatTimer);
    this.rttMs = null;
    this.jitterMs = 0;
    const old = this.socket;
    this.socket = null;
    old?.close();
    this.ready = false;
    const socket = (this.socket = createLanSocket(this.url));
    socket.binaryType = "arraybuffer";
    this.handshakeTimer = setTimeout(
      () => {
        if (this.socket === socket && !this.ready) this.retry(socket, 1006, 'handshake-timeout');
      },
      Math.min(
        this.transport === "steam" ? 15000 : 5000,
        this.deadline ? Math.max(1, this.deadline - Date.now()) : (this.transport === "steam" ? 15000 : 5000),
      ),
    );
    socket.onopen = () => {
      if (this.socket === socket)
        this.send({
          type: "hello",
          stateCredits: 1,
          ...networkHelloFeatures(this.transport, NETWORK_FEATURE_POLICY),
          protocol: LAN_PROTOCOL,
          build: LAN_BUILD,
          name: this.name,
          instance: this.instance,
          resumeToken: this.saved?.token,
        });
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      // Drop replaceable views already in flight when the page became hidden.
      // Heartbeats, room changes and terminal reports must still be processed.
      if (document.visibilityState === "hidden" && (event.data instanceof ArrayBuffer ||
          (typeof event.data === "string" && event.data.startsWith('{"type":"state",')))) return;
      if (event.data instanceof ArrayBuffer) {
        if (!this.enterPresentationEncoding('binary', socket)) return;
        this.binaryStateSeen = true;
        if (this.binaryOwner) { this.deliverBinaryState(event.data, socket); return; }
      }
      let m: any;
      try {
        const started = performance.now();
        const binary = event.data instanceof ArrayBuffer;
        const packet = binary && this.binaryDelta ? this.deltaReceiver.decode(event.data) : event.data;
        m = binary ? decodeBinaryState(packet) : JSON.parse(packet);
        if (!binary && (m.type === "state" || m.type === "match")) this.deltaReceiver.reset();
        if (!binary && m.type === "state" && !this.enterPresentationEncoding('json', socket)) return;
        if (m.type === "state") {
          if (m.frame?.projectileVisuals === 1 && !this.visualState) throw Error("Unnegotiated projectile projection");
          this.snapshotBytes = event.data instanceof ArrayBuffer ? packet.byteLength : event.data.length;
          this.snapshotParseMs = performance.now() - started;
        }
      } catch {
        if (this.binaryDelta && event.data instanceof ArrayBuffer && isLanDelta(event.data)) {
          // Never ACK/consume a corrupt or missing-base state. Existing bounded
          // reconnect/resume establishes a fresh anchor; no invented state.
          this.deltaReceiver.reset(); this.retry(socket, 1006, 'decode-failed'); return;
        }
        this.emit({ type: "error", message: "无法解析服务器消息" });
        return;
      }
      // Fresh state/control traffic also proves the connection is alive. A busy
      // upload may postpone sending a probe; an UNSENT ping is not a lost pong.
      if (typeof m?.type === "string") this.lastMessageAt = performance.now();
      if (m.type === "welcome") {
        // Opt in only when the relay confirms; legacy LAN/Steam relays omit it.
        this.componentUpload = m.componentUpload === 1;
        this.authorityComponents.reset();
        this.stateCredits = m.stateCredits === 1;
        this.combatState = networkFeatureStatus(this.transport, NETWORK_FEATURE_POLICY, m).combat;
        this.visualState = networkFeatureStatus(this.transport, NETWORK_FEATURE_POLICY, m).visuals;
        this.motionState = networkFeatureStatus(this.transport, NETWORK_FEATURE_POLICY, m).motion;
        this.networkFeatures = networkFeatureStatus(this.transport, NETWORK_FEATURE_POLICY, m);
        this.binaryDelta = this.transport === "lan" && this.stateCredits && m.binaryDelta === 1;
        this.steamBinarySnapshots = this.transport === "steam" && m.binarySnapshots === 1;
        this.motionReference = this.binaryDelta && m.motionReference === 1;
        this.deltaReceiver.setMotionReference(this.motionReference);
        this.resetBinaryOwner();
        clearTimeout(this.handshakeTimer);
        this.ready = true;
        this.lastMessageAt = performance.now();
        this.pingSent = 0;
        this.background = document.visibilityState === "hidden";
        this.send({ type: "visibility", hidden: this.background });
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.socket !== socket || !this.ready) return;
          // Visibility events can be queued behind the first resumed timer.
          this.onVisibility();
          const now = performance.now();
          const silent = now - this.lastMessageAt > 10000;
          const unanswered = this.pingSent > 0 && now - this.pingSent > 10000;
          if (!this.background && (silent || unanswered)) {
            this.retry(socket, 1006, 'heartbeat-timeout');
            return;
          }
          this.probe();
        }, 1000);
        this.deadline = 0;
        this.attempts = 0;
        this.inputSequence = Math.max(this.inputSequence, m.inputSeq ?? 0);
        this.actionSequence = Math.max(this.actionSequence, m.actionId ?? 0);
        this.saved = {
          token: m.resumeToken,
          name: this.name,
          url: this.url,
          build: LAN_BUILD,
        };
        try {
          sessionStorage.setItem(this.storageKey, JSON.stringify(this.saved));
        } catch {
          /* optional */
        }
      }
      if (m.type === "layered-ready" && this.transport === "steam") { this.visualState = NETWORK_FEATURE_POLICY.visuals && m.visualState === 1; this.combatState = NETWORK_FEATURE_POLICY.combat && m.combatState === 1; this.networkFeatures = { ...this.networkFeatures, visuals: this.visualState, combat: this.combatState, reason: "steam-components-check-receiver" }; if (this.binaryOwner) { this.resetPresentationConsumption(); if (this.binaryStateSeen) this.send({type:'resync',matchId:this.binaryOwner.matchId}); } }
      if (m.type === "layered-unavailable") { this.visualState = this.combatState = false; this.visualPackets.reset(); this.presentationReceipts.discardVisual(); this.networkFeatures = { ...this.networkFeatures, visuals: false, combat: false, reason: "component-fallback" }; if (this.binaryOwner) { this.resetPresentationConsumption(); if (this.binaryStateSeen) this.send({type:'resync',matchId:this.binaryOwner.matchId}); } }
      if (m.type === 'launch') {
        const key = JSON.stringify([m.matchId, m.syncId]);
        if (key !== this.presentationSyncKey) {
          this.presentationSyncKey = key; this.resetPresentationConsumption(); this.visualPackets.reset();
        }
      }
      if (m.type === 'roomClosed' || m.type === 'left') this.resetPipeline();
      if (m.type === 'ended') {
        // The last async receive must finish before LanApp/React can stop its
        // owner. Heartbeats still pass; this retains only one bounded report.
        this.presentationReceipts.afterPending(m.matchId, () => {
          if (this.socket !== socket) return;
          this.authorityComponents.reset(); this.resetPipeline(); this.authoritySample = null;
          this.emit(m);
        });
        return;
      }
      if (m.type === "match") {
        this.authorityComponents.reset();
        this.resetPipeline();
        if (this.authoritySample?.matchId !== m.match?.id) this.authoritySample = null;
      }
      if (m.type === "pong" && m.sent === this.pingSent && this.pingSent > 0) {
        if (this.transport === "lan") this.lanTransport = m.lanTransport ?? null;
        const now = performance.now(), sample = Math.max(0, now - this.pingSent);
        if (this.pipelineProbeEpoch === this.pipelineEpoch) {
          this.snapshotPipeline = m.snapshotPipeline ?? null;
          this.snapshotPipelineAt = this.snapshotPipeline === null ? null : now;
          // Conservatively include the whole heartbeat round trip: a delayed
          // pong must not make an old report look newly sampled.
          this.snapshotPipelineRoundTripMs = sample;
        }
        if (!this.background) {
          this.jitterMs = this.rttMs === null ? 0 : this.jitterMs * .8 + Math.abs(sample - this.rttMs) * .2;
          this.rttMs = this.rttMs === null ? sample : this.rttMs * .7 + sample * .3;
        }
        this.lastMessageAt = now;
        this.pingSent = 0;
      }
      if (m.type === "error" && ["RESUME_EXPIRED", "VERSION"].includes(m.code))
        this.forget();
      if (m.type === 'motion' || m.type === 'combat-state') { this.deliverComponent(m, socket); return; }
      if (m.type === 'projectile-visual') { this.deliverVisual(m, socket); return; }
      if (m.type === 'state') {
        if (typeof m.matchId !== 'string' || !m.matchId || m.matchId.length > 128 || !Number.isSafeInteger(m.seq) || m.seq < 0) {
          this.presentationReceipts.reset(); this.emit({ type: 'error', message: '无效快照回执身份' }); return;
        }
        const acknowledge = this.stateCredits
          ? this.receiptSender(socket, { type: 'state-consumed', matchId: m.matchId, seq: m.seq }) : () => true;
        // snapshotBytes is exact for binary, string code-unit length for JSON,
        // as in diagnostics. This bounds encoded units, not restored heap bytes.
        this.presentationReceipts.deliver('state', this.snapshotBytes, acknowledge, receipt => this.emit(m, receipt));
        return;
      }
      this.emit(m);
    };
    socket.onclose = (event) => this.retry(socket, event.code, networkCloseCause(event.reason));
    socket.onerror = () => {}; // close owns retry/error reporting.
  }
  private retry(socket: LanSocket, code: number, cause: string = 'socket-close') {
    if (this.socket !== socket || this.stopped) return;
    const close = { code, cause };
    clearTimeout(this.handshakeTimer);
    clearInterval(this.heartbeatTimer);
    this.socket = null;
    this.resetPresentationConsumption();
    socket.close();
    this.ready = false;
    if ([1008, 1009, 4001, 4003].includes(code) || !this.saved) {
      this.forget();
      this.emit({
        type: "disconnected", close,
        reason:
          code === 4001
            ? "此身份已在另一个页面连接。"
            : "连接已关闭，请重新连接。",
      });
      return;
    }
    if (!this.deadline) this.deadline = Date.now() + config.reconnectMs;
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) {
      this.forget();
      this.emit({
        type: "disconnected", close,
        reason: "30 秒内未能重新连接，请重新加入房间。",
      });
      return;
    }
    this.emit({
      type: "reconnecting", close,
      remaining: Math.ceil(remaining / 1000),
    });
    this.retryTimer = setTimeout(
      () => this.open(),
      Math.min(4000, 500 * 2 ** this.attempts++, remaining),
    );
  }
  /** Last received state packet length; a cheap approximate size for diagnostics. */
  snapshotBytes = 0;
  snapshotParseMs = 0;
  /** Bound snapshot backlog; reuse the JSON and UTF-8 length produced by our own Worker. */
  sendSnapshot(matchId: string, seq: number, frame: { json?: string; binary?: ArrayBuffer; bytes: number }): "sent" | "skipped" | "oversized" | "disconnected" {
    if (this.socket?.readyState !== WebSocket.OPEN) return "disconnected";
    if (!this.realtimeGate.canSendSnapshot(this.socket.bufferedAmount, performance.now())) return "skipped";
    try {
      if (frame.binary instanceof ArrayBuffer) {
        if (!this.canSendBinarySnapshots || frame.bytes !== frame.binary.byteLength) return "disconnected";
        if (frame.bytes >= LAN_MAX_SNAPSHOT_BYTES) return "oversized";
        this.socket.send(encodeBinaryState(matchId, seq, frame.binary));
        this.realtimeGate.snapshotSent(performance.now());
        return "sent";
      }
      if (typeof frame.json !== "string") return "disconnected";
      const prefix = JSON.stringify({ type: "state", matchId, seq }).slice(0, -1) + ',"frame":';
      if (!Number.isSafeInteger(frame.bytes) || frame.bytes < 0 || frame.bytes + new TextEncoder().encode(prefix).byteLength + 1 > LAN_MAX_SNAPSHOT_BYTES) return "oversized";
      this.socket.send(prefix + frame.json + "}");
      this.realtimeGate.snapshotSent(performance.now());
      return "sent";
    } catch (error) { return error instanceof RangeError ? "oversized" : "disconnected"; }
  }
  sendAuthorityComponent(matchId: string, message: { type: string }): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 0 ||
        (message.type === 'combat-state' ? !this.canPublishCombat : !this.canPublishVisual)) return false;
    const choice = this.authorityComponents.prepare(matchId, message);
    if (!this.send(choice.message)) return false;
    choice.commit(); return true;
  }
  send(message: unknown): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > LAN_MAX_SNAPSHOT_BYTES * 2
    )
      return false;
    // Both routes share this browser/worker FIFO. Admit only a fresh batch
    // (one input + one snapshot); reject further input before serialization.
    // Action/sequence state advances only after a successful local admission.
    if ((message as { type?: string } | null)?.type === "input" && !this.canSendInput()) return false;
    if ((message as { type?: string } | null)?.type === "motion" && !this.realtimeGate.canSendMotion(this.socket.bufferedAmount, performance.now())) return false;
    try {
      if (wireBytes(message) > LAN_MAX_SNAPSHOT_BYTES) return false;
      this.socket.send(JSON.stringify(message));
      const m = message as { type?: string; input?: PlayerInput };
      if (m.type === "input") this.realtimeGate.inputSent(performance.now());
      if (m.type === "motion") this.realtimeGate.motionSent(performance.now());
      if (m.type === "input" && m.input) {
        this.inputSequence = Math.max(this.inputSequence, m.input.seq);
        for (const a of m.input.actions)
          this.actionSequence = Math.max(this.actionSequence, a.id);
      }
      return true;
    } catch {
      return false;
    }
  }
  close(intentional = true, clearListeners = true) {
    this.stopped = true;
    this.resetPipeline();
    this.authoritySample = null;
    this.realtimeGate.reset();
    document.removeEventListener("visibilitychange", this.onVisibility);
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeatTimer);
    if (intentional) {
      this.send({ type: "leave" });
      this.forget();
    }
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    socket?.close();
    if (clearListeners) { this.listeners.clear(); this.binaryOwner = null; }
  }
}
