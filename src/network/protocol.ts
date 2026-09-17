import config from "./protocol.json";
export const LAN_PROTOCOL = config.version;
export const LAN_SHIPS = config.ships;
export const LAN_BUILD = __LAN_BUILD_ID__;
export type Seat = 0 | 1;
export interface Member {
  id: string;
  name: string;
  seat: Seat;
  hull: string;
  ready: boolean;
}
export interface Match {
  id: string;
  seed: number;
  hulls: [string, string];
  hostId: string;
}
export interface Room {
  code: string;
  hostId: string;
  members: Member[];
  status: "lobby" | "loading" | "running" | "ended";
  match: Match | null;
  reason?: string;
}
export interface Action {
  id: number;
  kind: "shield" | "vent" | "system" | "group";
  value?: number;
}
export interface PlayerInput {
  seq: number;
  keys: number;
  aim: [number, number];
  firing: boolean;
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
  actions: [],
});
export type Listener = (message: any) => void;
/** No reconnect replay: a new connection obtains a new identity. P1 explicitly ends on disconnect. */
export class LanConnection {
  socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  emit(message: any) {
    for (const fn of this.listeners) fn(message);
  }
  connect(url: string, name: string) {
    this.socket?.close();
    const socket = (this.socket = new WebSocket(url));
    socket.onopen = () =>
      this.send({
        type: "hello",
        protocol: LAN_PROTOCOL,
        build: LAN_BUILD,
        name,
      });
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        this.emit(JSON.parse(event.data));
      } catch {
        this.emit({ type: "error", message: "无法解析服务器消息" });
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.emit({ type: "disconnected" });
    };
    socket.onerror = () => {
      if (this.socket === socket)
        this.emit({
          type: "error",
          message: "无法连接局域网服务。请检查地址、端口和专用网络防火墙。",
        });
    };
  }
  send(message: unknown): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > 2_000_000
    )
      return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  close() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.listeners.clear();
  }
}
