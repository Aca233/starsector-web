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
  options: RoomOptions;
  id: string;
  seed: number;
  players: Array<Pick<Member, "id" | "name" | "seat" | "team" | "hull" | "design">>;
  snapshotHz: 2 | 5 | 10 | 20 | 60;
  hostId: string;
}
export interface Room {
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
  kind: "shield" | "vent" | "system" | "group" | "mode" | "autofire" | "target" | "recall";
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
export class LanConnection {
  socket: WebSocket | null = null;
  ready = false;
  /** Browser-to-relay round trip, not host simulation or end-to-end input delay. */
  rttMs: number | null = null;
  jitterMs = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private pingSent = 0;
  private pongAt = 0;
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
  constructor(public readonly transport: "lan" | "steam" = "lan") {
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
    this.background = hidden;
    if (!hidden) {
      // Old probes/timestamps include browser suspension, not network latency.
      this.pongAt = performance.now();
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
    if (!this.ready || !socket || this.pingSent || socket.bufferedAmount !== 0) return;
    this.pingSent = performance.now();
    if (!this.send({ type: "ping", sent: this.pingSent })) this.pingSent = 0;
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
    clearTimeout(this.handshakeTimer);
    clearInterval(this.heartbeatTimer);
    this.rttMs = null;
    this.jitterMs = 0;
    const old = this.socket;
    this.socket = null;
    old?.close();
    this.ready = false;
    const socket = (this.socket = new WebSocket(this.url));
    socket.binaryType = "arraybuffer";
    this.handshakeTimer = setTimeout(
      () => {
        if (this.socket === socket && !this.ready) this.retry(socket, 1006);
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
        m = event.data instanceof ArrayBuffer ? decodeBinaryState(event.data) : JSON.parse(event.data);
        if (m.type === "state") {
          this.snapshotBytes = event.data instanceof ArrayBuffer ? event.data.byteLength : event.data.length;
          this.snapshotParseMs = performance.now() - started;
        }
      } catch {
        this.emit({ type: "error", message: "无法解析服务器消息" });
        return;
      }
      if (m.type === "welcome") {
        clearTimeout(this.handshakeTimer);
        this.ready = true;
        this.pongAt = performance.now();
        this.pingSent = 0;
        this.background = document.visibilityState === "hidden";
        this.send({ type: "visibility", hidden: this.background });
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.socket !== socket || !this.ready) return;
          // Visibility events can be queued behind the first resumed timer.
          this.onVisibility();
          const now = performance.now();
          if (!this.background && now - this.pongAt > 10000) {
            this.retry(socket, 1006);
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
      if (m.type === "pong" && m.sent === this.pingSent && this.pingSent > 0) {
        const now = performance.now(), sample = Math.max(0, now - this.pingSent);
        if (!this.background) {
          this.jitterMs = this.rttMs === null ? 0 : this.jitterMs * .8 + Math.abs(sample - this.rttMs) * .2;
          this.rttMs = this.rttMs === null ? sample : this.rttMs * .7 + sample * .3;
        }
        this.pongAt = now;
        this.pingSent = 0;
      }
      if (m.type === "error" && ["RESUME_EXPIRED", "VERSION"].includes(m.code))
        this.forget();
      this.emit(m);
    };
    socket.onclose = (event) => this.retry(socket, event.code);
    socket.onerror = () => {}; // close owns retry/error reporting.
  }
  private retry(socket: WebSocket, code: number) {
    if (this.socket !== socket || this.stopped) return;
    clearTimeout(this.handshakeTimer);
    clearInterval(this.heartbeatTimer);
    this.socket = null;
    socket.close();
    this.ready = false;
    if ([1008, 1009, 4001, 4003].includes(code) || !this.saved) {
      this.forget();
      this.emit({
        type: "disconnected",
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
        type: "disconnected",
        reason: "30 秒内未能重新连接，请重新加入房间。",
      });
      return;
    }
    this.emit({
      type: "reconnecting",
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
    if (this.socket.bufferedAmount > 16384) return "skipped";
    try {
      if (frame.binary instanceof ArrayBuffer) {
        if (this.transport !== "lan" || frame.bytes !== frame.binary.byteLength) return "disconnected";
        if (frame.bytes >= LAN_MAX_SNAPSHOT_BYTES) return "oversized";
        this.socket.send(encodeBinaryState(matchId, seq, frame.binary));
        return "sent";
      }
      if (typeof frame.json !== "string") return "disconnected";
      const prefix = JSON.stringify({ type: "state", matchId, seq }).slice(0, -1) + ',"frame":';
      if (!Number.isSafeInteger(frame.bytes) || frame.bytes < 0 || frame.bytes + new TextEncoder().encode(prefix).byteLength + 1 > LAN_MAX_SNAPSHOT_BYTES) return "oversized";
      this.socket.send(prefix + frame.json + "}");
      return "sent";
    } catch (error) { return error instanceof RangeError ? "oversized" : "disconnected"; }
  }
  send(message: unknown): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > LAN_MAX_SNAPSHOT_BYTES * 2
    )
      return false;
    try {
      if (wireBytes(message) > LAN_MAX_SNAPSHOT_BYTES) return false;
      this.socket.send(JSON.stringify(message));
      const m = message as { type?: string; input?: PlayerInput };
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
