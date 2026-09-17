import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces, hostname } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import protocol from "../src/network/protocol.json" with { type: "json" };
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".fnt": "text/plain",
};
export async function createLanServer({
  host = "0.0.0.0",
  port = 3001,
  dist = path.join(project, "dist"),
} = {}) {
  const root = fs.realpathSync(dist);
  const { build } = JSON.parse(
    fs.readFileSync(path.join(root, "lan-build.json"), "utf8"),
  );
  const rooms = new Map(),
    peers = new Set();
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    hostname().toLowerCase(),
  ]);
  if (host !== "0.0.0.0" && host !== "::") allowedHosts.add(host.toLowerCase());
  const validHost = (req) => {
    try {
      const authority = new URL("http://" + req.headers.host);
      return (
        (allowedHosts.has(authority.hostname.toLowerCase()) ||
          Object.values(networkInterfaces())
            .flat()
            .some(
              (n) =>
                n &&
                n.address.toLowerCase() ===
                  authority.hostname.toLowerCase().replace(/^\[|\]$/g, ""),
            )) &&
        Number(authority.port || 80) === server.address().port
      );
    } catch {
      return false;
    }
  };
  const addresses = () =>
    Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal)
      .map(
        (n) =>
          "http://" + n.address + ":" + server.address().port + "/?view=lan",
      );
  const server = http.createServer((req, res) => {
    if (!validHost(req)) {
      res.writeHead(403);
      res.end("Host not allowed");
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/lan/info") {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            service: "starsector-web-lan",
            protocol: protocol.version,
            build,
            addresses: addresses(),
          }),
        );
        return;
      }
      const name = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (
        name.includes("\\") ||
        name.includes("\0") ||
        name.split("/").some((p) => p.startsWith("."))
      )
        throw Error("path");
      const candidate = path.resolve(root, "." + name);
      if (!candidate.startsWith(root + path.sep)) throw Error("path");
      const real = fs.realpathSync(candidate);
      if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile())
        throw Error("path");
      res.setHeader(
        "Content-Type",
        mime[path.extname(real)] ?? "application/octet-stream",
      );
      res.setHeader(
        "Cache-Control",
        name.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = fs.createReadStream(real);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2_000_000,
    perMessageDeflate: false,
  });
  const send = (peer, message) => {
    if (peer.ws.readyState !== WebSocket.OPEN) return false;
    if (peer.ws.bufferedAmount > 2_000_000) {
      peer.ws.close(1013, "Client too slow");
      return false;
    }
    peer.ws.send(JSON.stringify(message));
    return true;
  };
  const broadcast = (room, message, except) => {
    for (const p of room.peers) if (p !== except) send(p, message);
  };
  const view = (room) => ({
    code: room.code,
    hostId: room.hostId,
    members: room.peers.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      hull: p.hull,
      ready: p.ready,
    })),
    status: room.status,
    match: room.match,
    reason: room.reason,
  });
  const publish = (room) => broadcast(room, { type: "room", room: view(room) });
  const abort = (room, reason) => {
    if (!["loading", "running"].includes(room.status)) return;
    room.status = "ended";
    room.reason = reason;
    broadcast(room, { type: "ended", matchId: room.match?.id, reason });
    publish(room);
  };
  const leave = (peer) => {
    const room = peer.room;
    if (!room) return;
    peer.room = null;
    if (room.hostId === peer.id) {
      broadcast(
        room,
        { type: "roomClosed", message: "计算主机已离开，房间关闭。" },
        peer,
      );
      for (const p of room.peers) p.room = null;
      rooms.delete(room.code);
    } else {
      abort(room, "另一位玩家已离开，本局结束。");
      room.peers = room.peers.filter((p) => p !== peer);
      for (const p of room.peers) p.ready = false;
      publish(room);
    }
  };
  const requireRoom = (p) => {
    if (!p.room) throw Error("请先加入房间");
    return p.room;
  };
  const isHost = (p, r) => {
    if (p.id !== r.hostId) throw Error("只有计算主机可以执行此操作");
  };
  server.on("upgrade", (req, socket, head) => {
    try {
      const origin = new URL(req.headers.origin ?? "");
      if (
        !validHost(req) ||
        req.url !== "/lan/ws" ||
        !["http:", "https:"].includes(origin.protocol) ||
        origin.host !== req.headers.host ||
        peers.size >= 64
      )
        throw Error("upgrade");
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
  wss.on("connection", (ws) => {
    const p = {
      ws,
      id: randomUUID(),
      name: "",
      hello: false,
      room: null,
      seat: 0,
      hull: protocol.ships[0].id,
      ready: false,
      loaded: false,
      seq: -1,
      action: -1,
      alive: true,
      lastPong: Date.now(),
      connected: Date.now(),
      window: Date.now(),
      count: 0,
    };
    peers.add(p);
    ws.on("pong", () => {
      p.alive = true;
      p.lastPong = Date.now();
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      leave(p);
      peers.delete(p);
    });
    ws.on("message", (raw, binary) => {
      try {
        if (binary) throw Error("仅接受 JSON 消息");
        const now = Date.now();
        if (now - p.window >= 1000) {
          p.window = now;
          p.count = 0;
        }
        if (++p.count > 160) {
          ws.close(1008, "Rate limit");
          return;
        }
        const m = JSON.parse(raw.toString());
        if (!m || typeof m.type !== "string") throw Error("无效消息");
        if (m.type !== "state" && raw.length > 16384) {
          ws.close(1009, "Message too large");
          return;
        }
        if (!p.hello) {
          if (
            m.type !== "hello" ||
            m.protocol !== protocol.version ||
            m.build !== build
          ) {
            send(p, {
              type: "error",
              message: "游戏版本不一致，请刷新页面并使用同一服务器提供的游戏。",
            });
            ws.close(1008, "Version mismatch");
            return;
          }
          if (
            typeof m.name !== "string" ||
            !m.name.trim() ||
            m.name.length > 24 ||
            [...m.name].some((c) => c.charCodeAt(0) < 32)
          )
            throw Error("请输入 1–24 字的玩家名称");
          p.name = m.name.trim();
          p.hello = true;
          send(p, { type: "welcome", id: p.id });
          return;
        }
        if (m.type === "ping") {
          send(p, { type: "pong", sent: m.sent });
          return;
        }
        if (m.type === "leave") {
          leave(p);
          send(p, { type: "left" });
          return;
        }
        if (m.type === "create") {
          if (p.room) throw Error("请先离开当前房间");
          if (rooms.size >= 16) throw Error("房间数量已满");
          let code;
          do {
            code = randomBytes(3).toString("hex").toUpperCase();
          } while (rooms.has(code));
          const r = {
            code,
            hostId: p.id,
            peers: [p],
            status: "lobby",
            match: null,
            reason: "",
            since: now,
            lastState: now,
            lastSeq: -1,
          };
          p.seat = 0;
          p.ready = false;
          p.room = r;
          rooms.set(code, r);
          publish(r);
          return;
        }
        if (m.type === "join") {
          if (p.room) throw Error("请先离开当前房间");
          const r = rooms.get(String(m.code).trim().toUpperCase());
          if (!r) throw Error("房间不存在");
          if (r.peers.length >= 2) throw Error("双人房间已满");
          if (["loading", "running"].includes(r.status))
            throw Error("对局进行中，暂不支持中途加入");
          p.seat = 1;
          p.ready = false;
          p.room = r;
          r.peers.push(p);
          publish(r);
          return;
        }
        const r = requireRoom(p);
        if (m.type === "configure") {
          if (!["lobby", "ended"].includes(r.status))
            throw Error("战斗中不能更改配装");
          if (!protocol.ships.some((s) => s.id === m.hull))
            throw Error("不支持的舰船");
          p.hull = m.hull;
          p.ready = false;
          publish(r);
          return;
        }
        if (m.type === "ready") {
          if (!["lobby", "ended"].includes(r.status))
            throw Error("当前不能准备");
          p.ready = m.ready === true;
          publish(r);
          return;
        }
        if (m.type === "start") {
          isHost(p, r);
          if (
            !["lobby", "ended"].includes(r.status) ||
            r.peers.length !== 2 ||
            !r.peers.every((x) => x.ready)
          )
            throw Error("需要两位玩家准备完毕");
          r.match = {
            id: randomUUID(),
            hostId: r.hostId,
            seed: randomBytes(4).readUInt32LE(),
            hulls: r.peers.map((x) => x.hull),
          };
          r.status = "loading";
          r.reason = "";
          r.since = now;
          r.lastState = now;
          r.lastSeq = -1;
          for (const x of r.peers) {
            x.loaded = false;
            x.seq = -1;
            x.action = -1;
            x.ready = false;
          }
          publish(r);
          broadcast(r, { type: "match", match: r.match });
          return;
        }
        if (m.matchId !== r.match?.id) throw Error("已过期的对局消息");
        if (m.type === "fail") {
          abort(
            r,
            "客户端无法继续：" + String(m.reason ?? "未知错误").slice(0, 180),
          );
          return;
        }
        if (m.type === "loaded") {
          if (r.status !== "loading") return;
          p.loaded = true;
          if (r.peers.every((x) => x.loaded)) {
            r.status = "running";
            r.since = now;
            r.lastState = now;
            publish(r);
            broadcast(r, { type: "launch", matchId: r.match.id });
          }
          return;
        }
        if (r.status !== "running") return;
        if (m.type === "input") {
          const i = m.input;
          if (
            !i ||
            !Number.isSafeInteger(i.seq) ||
            i.seq < 0 ||
            !Number.isInteger(i.keys) ||
            i.keys < 0 ||
            i.keys > 255 ||
            typeof i.firing !== "boolean" ||
            !Array.isArray(i.aim) ||
            i.aim.length !== 2 ||
            !i.aim.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000) ||
            !Array.isArray(i.actions) ||
            i.actions.length > 16
          )
            throw Error("无效操作");
          if (i.seq <= p.seq) return;
          const actions = [];
          for (const a of i.actions) {
            if (
              !a ||
              !Number.isSafeInteger(a.id) ||
              a.id < 0 ||
              !["shield", "vent", "system", "group"].includes(a.kind) ||
              (a.kind === "group" &&
                (!Number.isInteger(a.value) || a.value < 0 || a.value > 6))
            )
              throw Error("无效操作事件");
            if (a.id > p.action) {
              actions.push({ id: a.id, kind: a.kind, value: a.value });
              p.action = a.id;
            }
          }
          p.seq = i.seq;
          send(r.peers[0], {
            type: "input",
            matchId: r.match.id,
            seat: p.seat,
            input: {
              seq: i.seq,
              keys: i.keys,
              aim: i.aim,
              firing: i.firing,
              actions,
            },
          });
          return;
        }
        if (m.type === "state") {
          isHost(p, r);
          if (!Number.isSafeInteger(m.seq) || m.seq <= r.lastSeq) return;
          if (
            !m.frame ||
            !Number.isSafeInteger(m.frame.tick) ||
            !Array.isArray(m.frame.ships) ||
            m.frame.ships.length !== 2
          )
            throw Error("无效战斗状态");
          r.lastSeq = m.seq;
          r.lastState = now;
          broadcast(
            r,
            { type: "state", matchId: r.match.id, seq: m.seq, frame: m.frame },
            p,
          );
          return;
        }
        if (m.type === "finish") {
          isHost(p, r);
          if (!["host", "guest", "draw"].includes(m.winner))
            throw Error("无效结果");
          r.status = "ended";
          r.reason = "战斗结束";
          broadcast(r, {
            type: "ended",
            matchId: r.match.id,
            winner: m.winner,
            reason: r.reason,
          });
          publish(r);
          return;
        }
        throw Error("未知消息");
      } catch (error) {
        send(p, {
          type: "error",
          message: error instanceof Error ? error.message : "消息处理失败",
        });
      }
    });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const p of peers) {
      if ((!p.hello && now - p.connected > 5000) || now - p.lastPong > 20000) {
        p.ws.terminate();
        continue;
      }
      p.ws.ping();
    }
    for (const r of rooms.values()) {
      if (r.status === "loading" && now - r.since > 60000)
        abort(r, "资源准备超时，请检查客户端并重试。");
      if (r.status === "running" && now - r.lastState > 6000)
        abort(r, "计算主机超过 6 秒未更新，本局已停止。");
    }
  }, 5000);
  timer.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    rooms,
    addresses: addresses(),
    close: async () => {
      clearInterval(timer);
      for (const p of peers) p.ws.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 3001),
    host = process.env.HOST ?? "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be 1–65535");
  try {
    const app = await createLanServer({ host, port });
    console.log("局域网双人服务已启动（仅可信局域网；不会修改防火墙）");
    console.log("本机：http://localhost:" + port + "/?view=lan");
    for (const address of app.addresses) console.log("局域网：" + address);
    console.log(
      process.env.LAN_BACKGROUND === "1"
        ? `后台进程 PID: ${process.pid}。关闭网页不会停止后台；结束此进程会结束所有对局。请仅允许可信网络访问。`
        : "请仅允许 Windows 专用网络访问。按 Ctrl+C 停止，正在进行的对局将结束。",
    );
    const stop = () => {
      void app.close().then(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    console.error(
      "启动失败。请先 npm run build，并检查端口是否占用。",
      error.message,
    );
    process.exitCode = 1;
  }
}
