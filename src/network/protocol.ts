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
  kind: "shield" | "hullShield" | "vent" | "system" | "group" | "mode" | "autofire" | "target" | "recall";
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
export type Listener = (message: any) => void;
const STORAGE_KEY = "starsector.lan.session.v5";
/** Session token is tab-local. A new page can resume a guest, never reconstruct a host Worker. */
const NETWORK_FEATURE_POLICY = networkFeaturePolicy(import.meta.env);
// Full multirate remains opt-in. Default additive motion never slows full worlds.
export const LAN_LAYERED_SYNC_ENABLED = NETWORK_FEATURE_POLICY.mode === 'experimental';
export const LAN_MOTION_SYNC_ENABLED = NETWORK_FEATURE_POLICY.motion;
export const LAN_CRITICAL_COMBAT_ENABLED = NETWORK_FEATURE_POLICY.combat;

export class LanConnection {
  socket: LanSocket | null = null;
  private readonly realtimeGate = new RealtimeSendGate();
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
  emit(message: any) {
    for (const fn of this.listeners) fn(message);
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
    this.binaryDelta = false;
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
      let m: any;
      try {
        const started = performance.now();
        const binary = event.data instanceof ArrayBuffer;
        const packet = binary && this.binaryDelta ? this.deltaReceiver.decode(event.data) : event.data;
        m = binary ? decodeBinaryState(packet) : JSON.parse(packet);
        if (!binary && (m.type === "state" || m.type === "match")) this.deltaReceiver.reset();
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
        this.deltaReceiver.setMotionReference(this.binaryDelta && m.motionReference === 1);
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
      if (m.type === "layered-ready" && this.transport === "steam") { this.visualState = NETWORK_FEATURE_POLICY.visuals && m.visualState === 1; this.combatState = NETWORK_FEATURE_POLICY.combat && m.combatState === 1; this.networkFeatures = { ...this.networkFeatures, visuals: this.visualState, combat: this.combatState, reason: "steam-components-check-receiver" }; }
      if (m.type === "layered-unavailable") { this.visualState = this.combatState = false; this.visualPackets.reset(); this.networkFeatures = { ...this.networkFeatures, visuals: false, combat: false, reason: "component-fallback" }; }
      if (m.type === "match" || m.type === "ended") {
        this.authorityComponents.reset();
        this.resetPipeline();
        if (m.type === "ended" || this.authoritySample?.matchId !== m.match?.id) this.authoritySample = null;
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
      if (m.type === 'projectile-visual') {
        if (!this.visualState) return;
        try { m.visualBytes = this.visualPackets.take(m); } catch { this.visualPackets.reset(); this.send(visualReceipt(m,'discarded')); return; }
        if (!m.visualBytes) { this.send(visualReceipt(m,'fragment')); return; }
        // Synchronous subscribers set visualHandled only after successful CRC,
        // epoch and projection validation/retention. No listener => discard,
        // which frees bounded flight but never grants baseline-ready credit.
        this.emit(m);
        this.send(visualReceipt(m,m.visualHandled === true ? 'consumed' : 'discarded'));
        return;
      }
      this.emit(m);
      // Application consumption credit, never a GPU/display ACK or RTT sample.
      // Release only after the synchronous subscribers have retained the frame
      // and its discrete events. Hidden/resync epochs are reset by the relay.
      if (m.type === "state" && this.stateCredits && this.socket === socket)
        this.send({type:"state-consumed",matchId:m.matchId,seq:m.seq});
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
    if (clearListeners) this.listeners.clear();
  }
}
