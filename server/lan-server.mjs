import { LanStateCredits } from "./LanStateCredits.mjs";
import { teamName, checkFleetBudget, editAiFleet } from "../src/network/room-fleet.mjs";
import { MAX_BATTLE_REPORT_BYTES, validateBattleReport } from "../src/network/battle-report.mjs";
import { summarizeCombatFrame, reusableStateText } from "./lan-state.mjs";
import { decodeBinaryState } from "../src/network/BinarySnapshot.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces, hostname } from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { isLanAddress, lanPerMessageDeflate } from "./lan-websocket.mjs";
import { DEFAULT_BATTLE_SIZE, MAX_BATTLE_SIZE, validBattleSize, battleTeamCount, battleTeamLimit } from "../src/shared/battle-size.mjs";
import protocol from "../src/network/protocol.json" with { type: "json" };
import { aiHullId, aiLoadout, pruneAiLoadouts, aiDesignSignature } from "../src/network/ai-loadouts.mjs";
import { wireDesign, MAX_DESIGN_BYTES } from "../src/network/design-wire.mjs";
import { roomStartBlockReason } from "../src/network/room-start.mjs";
import hullCatalog from "../src/engine/data/generated/ships.json" with { type: "json" };
const aiHullIds = new Set(Object.values(hullCatalog).filter(hull => hull.hullSize !== "FIGHTER").map(hull => hull.id));
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
  extension = null,
  dist = path.join(project, "dist"),
  // Localhost hosts can share immutable AI input with their own Workers.
  // Plain HTTP LAN-IP guests remain supported without SharedArrayBuffer.
  isolated = true,
  portable = null,
} = {}) {
  const root = fs.realpathSync(dist);
  const { build } = JSON.parse(
    fs.readFileSync(path.join(root, "lan-build.json"), "utf8"),
  );
  const sessions = new Map();
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
      .filter((n) => n && n.family === "IPv4" && !n.internal
        && (["0.0.0.0", "::"].includes(host) || n.address === host))
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
    if (isolated) {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (extension?.http?.(req, res)) return;
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
            ...(portable ? { portable } : {}),
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
  // Separate immutable policies: browser <-> localhost stays uncompressed.
  // Both groups share admission, transport handling and the original limits.
  const websocketServers = [false, lanPerMessageDeflate()].map(perMessageDeflate =>
    new WebSocketServer({ noServer: true, maxPayload: protocol.maxSnapshotBytes, perMessageDeflate }));
  const connected = (p) =>
    !p.disconnected && p.ws.readyState === WebSocket.OPEN;
  const sendEncoded = (p, encoded) => {
    if (!connected(p)) return false;
    if (p.ws.bufferedAmount > protocol.maxSnapshotBytes * 2) {
      p.ws.close(1013, "Client too slow");
      return false;
    }
    p.ws.send(encoded);
    return true;
  };
  const send = (p, message) => sendEncoded(p, JSON.stringify(message));
  const broadcast = (r, message, except, encoded) => {
    // Encode lazily, once per broadcast; validated host states can reuse their text.
    for (const p of r.peers) {
      if (p === except || !connected(p)) continue;
      // Snapshots are replaceable. Do not queue stale views behind a slow receiver.
      if (message.type === "state") {
        // Resource readiness is distinct from controls-ready: syncing peers still
        // need the next full frame. Loading/hidden peers cannot present it yet;
        // returning visible peers request a fresh baseline through resync.
        if (!p.assetsLoaded || p.background) continue;
        // Forward every host tick to a ready peer. A busy socket still skips
        // replaceable state instead of accumulating stale megabyte snapshots.
        // Steam uses ACK-based bounded pipeline credit; ordinary WebSockets keep
        // their existing zero-buffer policy. This does not change simulation Hz.
        if (p.ws.snapshotWritable === false || (p.ws.snapshotWritable === undefined && p.ws.bufferedAmount > 0)) continue;
      }
      encoded ??= JSON.stringify(message);
      // TCP receipt does not prove that the guest renderer consumed the frame.
      // This gates only replaceable, not-yet-sent states; never input/control.
      // No stale payload is retained or retried after a terminal message.
      if (message.type === "state" && p.stateCredits &&
          !p.stateCredits.reserve(message.seq, Buffer.byteLength(encoded))) continue;
      sendEncoded(p, encoded);
    }
  };
  const view = (r) => ({
    code: r.code,
    capacity: r.capacity,
    hostId: r.hostId,
    status: r.status,
    match: r.match,
    reason: r.reason,
    options: r.options,
    ...(r.network ? { network: r.network } : {}),
    passwordProtected: !!r.passwordHash,
    chat: r.chat,
    members: r.peers.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      team: p.team,
      hull: p.hull,
      design: p.design,
      designRevision: p.designRevision,
      editing: p.editing,
      ready: p.ready,
      loaded: p.loaded,
      connected: connected(p),
      reconnectUntil: p.disconnected
        ? p.disconnected + protocol.reconnectMs
        : null,
    })),
  });
  const syncSolo = (r) => {
    if (r.options.assignment !== "solo" || !["lobby","ended"].includes(r.status)) return;
    const ai = r.options.aiHulls.flat();
    const rows = Array.from({length:Math.max(2,r.peers.length + ai.length)},()=>[]);
    r.peers.forEach((member,index)=>{ if(member.team!==index) member.ready=false; member.team=index; });
    ai.forEach((hull,index)=>rows[r.peers.length+index].push(hull));
    if(JSON.stringify(r.options.aiHulls)!==JSON.stringify(rows))r.options.aiRevision=(r.options.aiRevision??0)+1;
    r.options.aiHulls = rows;
  };
  const publish = (r) => {
    syncSolo(r);
    if (["lobby", "ended"].includes(r.status)) r.options.deploymentLimit = battleTeamLimit(r.options.battleSize, battleTeamCount(r.peers,r.options.aiHulls));
    broadcast(r, { type: "room", room: view(r) });
    extension?.roomChanged?.(r);
  };
  const presence = (r, p, online) =>
    send(r.peers[0], {
      type: "presence",
      matchId: r.match?.id,
      seat: p.seat,
      connected: p.room === r && connected(p),
      online,
    });
  // Loading resources is not permission to send controls. A fresh full frame must
  // be applied and acknowledged with this connection's epoch first.
  const beginSync = (r, p) => {
    p.stateCredits?.reset();
    p.loaded = false;
    p.sync = { id: randomUUID(), tick: Math.max(0, r.lastTick + 1), since: Date.now() };
    presence(r, p, false);
    send(p, { type: "launch", matchId: r.match.id, syncId: p.sync.id, minTick: p.sync.tick });
  };
  const abort = (r, reason) => {
    if (!["loading", "running"].includes(r.status)) return;
    r.status = "ended";
    r.reason = reason;
    r.result = { type: "ended", matchId: r.match?.id, reason };
    broadcast(r, r.result);
    publish(r);
  };
  const leave = (p, reason = "玩家在加载期间离开，请重新准备。") => {
    p.stateCredits?.reset();
    const r = p.room;
    if (!r) return;
    p.room = null;
    p.ready = false;
    if (r.hostId === p.id) {
      broadcast(
        r,
        { type: "roomClosed", message: "计算主机已离开，房间关闭。" },
        p,
      );
      for (const other of r.peers) {
        other.room = null;
        other.ready = false;
      }
      rooms.delete(r.code);
    } else {
      presence(r, p, false);
      if (r.status === "loading") abort(r, reason);
      r.peers = r.peers.filter((x) => x !== p);
      for (const other of r.peers) other.ready = false;
      publish(r);
    }
  };
  const requireRoom = (p) => {
    if (!p.room) throw Error("请先加入房间");
    return p.room;
  };
  const isHost = (p, r) => {
    if (p.id !== r.hostId) throw Error("只有房主可以执行此操作");
  };
  const editable = (r) => {
    if (!["lobby", "ended"].includes(r.status))
      throw Error("战斗中不能修改房间");
  };
  const passwordHash = (password, salt) =>
    createHash("sha256")
      .update(salt + password)
      .digest("hex");
  const validTeam = (team, count = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(team) && team >= 0 && team < count;
  const validOptions = (o) =>
    o &&
    Array.isArray(o.aiHulls) &&
    o.aiHulls.length >= 2 &&
    ["teams", "solo"].includes(o.assignment) &&
    validBattleSize(o.battleSize) &&
    (o.initialDeploymentLimit == null || (Number.isInteger(o.initialDeploymentLimit) && o.initialDeploymentLimit >= 0 && o.initialDeploymentLimit <= MAX_BATTLE_SIZE)) &&
    o.aiHulls.every(
      (hulls) =>
        Array.isArray(hulls) &&
        hulls.every((key) => typeof key === "string" && aiHullIds.has(aiHullId(o,key)) && (!key.startsWith("fit:") || !!aiLoadout(o,key))),
    );
  const copyOptions = (o) => ({
    assignment: o.assignment,
    aiLoadouts: structuredClone(o.aiLoadouts ?? {}), aiNextId:o.aiNextId ?? 1, aiRevision:o.aiRevision ?? 0,
    battleSize: o.battleSize,
    deploymentLimit: o.deploymentLimit,
    initialDeploymentLimit: o.initialDeploymentLimit ?? null,
    aiHulls: o.aiHulls.map((hulls) => [...hulls]),
  });
  const expectedShips = (r) =>
    r.match.players.length +
    r.match.options.aiHulls.reduce((total,hulls)=>total+hulls.length,0);
  server.on("upgrade", (req, socket, head) => {
    try {
      const origin = new URL(req.headers.origin ?? "");
      if (
        !validHost(req) ||
        (req.url !== "/lan/ws" && !extension?.isUpgrade?.(req.url)) ||
        !["http:", "https:"].includes(origin.protocol) ||
        origin.host !== req.headers.host ||
        peers.size >= 64
      )
        throw Error("upgrade");
      if (extension?.isUpgrade?.(req.url)) { extension.upgrade(req, socket, head); return; }
      const wss = websocketServers[isLanAddress(socket.remoteAddress) ? 1 : 0];
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
  const acceptTransport = (ws, transport = null) => {
    let p = {
      ws,
      transport,
      id: randomUUID(),
      name: "",
      hello: false,
      room: null,
      seat: 0,
      team: 0,
      hull: protocol.ships[0].id,
      design: null,
      designRevision: 0,
      editing: false,
      ready: false,
      loaded: false,
      assetsLoaded: false,
      sync: null,
      seq: -1,
      action: -1,
      lastPong: Date.now(),
      connected: Date.now(),
      disconnected: 0,
      window: Date.now(),
      count: 0,
      token: "",
      instance: "",
      lastChat: 0,
      lastResync: 0,
      background: false,
      stateCredits: null,
      nativeProbe: null,
    };
    peers.add(p);
    ws.on("pong", (data) => {
      if (p.ws !== ws) return;
      p.lastPong = Date.now();
      if (p.stateCredits && p.nativeProbe && Buffer.isBuffer(data) && data.equals(p.nativeProbe.data)) {
        p.stateCredits.recordNetworkRtt(performance.now() - p.nativeProbe.at);
        p.nativeProbe = null;
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      if (p.ws !== ws) return;
      peers.delete(p);
      if (!p.hello) return;
      p.stateCredits?.reset();
      p.nativeProbe = null;
      p.disconnected = Date.now();
      p.ready = false;
      p.loaded = false;
      p.assetsLoaded = false;
      p.sync = null;
      if (p.room) {
        presence(p.room, p, false);
        publish(p.room);
      }
    });
    ws.on("message", (raw, binary) => {
      if (p.ws !== ws) return;
      let requestId;
      try {
        if (binary && (!p.hello || p.transport || !p.room || p.room.hostId !== p.id))
          throw Error("只有局域网计算主机可以发送二进制状态");
        const now = Date.now();
        if (now - p.window >= 1000) {
          p.window = now;
          p.count = 0;
        }
        // Consumption receipts are transport flow control, not player requests.
        // Only exact outstanding LAN credits may bypass the request budget; their
        // count/bytes are already bounded by our sends. Invalid/duplicate receipts
        // and malformed JSON still take the original 160-message request path.
        // Otherwise a healthy backlog drain can consume the input/control budget.
        let receipt;
        if (!binary && p.stateCredits && raw.length <= 256 &&
            p.room && p.room.hostId !== p.id) {
          try { receipt = JSON.parse(raw.toString()); } catch { /* counted below */ }
          if (receipt?.type === "state-consumed" && receipt.matchId === p.room.match?.id &&
              p.stateCredits.ack(receipt.seq)) return;
        }
        if (++p.count > 160) {
          ws.close(1008, "Rate limit");
          return;
        }
        const text = binary ? null : raw.toString();
        const m = receipt ?? (binary ? decodeBinaryState(raw) : JSON.parse(text));
        if (!m || typeof m.type !== "string") throw Error("无效消息");
        if (["configure","ai","ready","start"].includes(m.type) && typeof m.requestId === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(m.requestId)) requestId = m.requestId;
        if (m.type !== "state" && raw.length > (["configure","ai"].includes(m.type) ? MAX_DESIGN_BYTES * 4 + 4096 : m.type === "options" ? protocol.maxOptionsBytes + 4096 : m.type === "finish" ? MAX_BATTLE_REPORT_BYTES + 4096 : 16384)) {
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
              code: "VERSION",
              message: "游戏版本不一致，请使用同一服务器的最新页面。",
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
          if (typeof m.instance !== "string" || m.instance.length > 80)
            throw Error("缺少客户端实例标识");
          let resumed = false,
            hostReload = false;
          if (m.resumeToken) {
            const previous = sessions.get(m.resumeToken);
            if (
              !previous ||
              (previous.disconnected &&
                now - previous.disconnected > protocol.reconnectMs)
            ) {
              send(p, {
                type: "error",
                code: "RESUME_EXPIRED",
                message: "重连保留时间已过，请重新连接并加入房间。",
              });
              ws.close(4003, "Resume expired");
              return;
            }
            if ((previous.transport?.identity ?? "") !== (transport?.identity ?? "") || (previous.transport?.scope ?? "") !== (transport?.scope ?? "")) {
              send(p, { type: "error", code: "RESUME_EXPIRED", message: "重连身份或 Steam 房间不匹配。" });
              ws.close(4003, "Identity mismatch");
              return;
            }
            peers.delete(p);
            const old = previous.ws;
            hostReload =
              previous.room?.hostId === previous.id &&
              previous.instance !== m.instance;
            p = previous;
            p.ws = ws;
            p.disconnected = 0;
            // Retain visibility until the resumed page reports it. A previously
            // hidden host returning visible still needs fresh-state grace.
            p.loaded = false;
            p.assetsLoaded = false;
            p.sync = null;
            p.lastPong = now;
            p.window = now;
            p.count = 0;
            peers.add(p);
            if (old !== ws) old.close(4001, "Replaced connection");
            resumed = true;
          } else {
            if (sessions.size >= 128) {
              send(p, {
                type: "error",
                message: "服务器会话数量已满，请稍后再试",
              });
              ws.close(1008, "Session limit");
              return;
            }
            p.token = randomBytes(32).toString("hex");
            sessions.set(p.token, p);
          }
          p.name = m.name.trim();
          p.instance = m.instance;
          p.hello = true;
          // Explicit LAN-only capability. Steam has its own transport ACK windows.
          p.stateCredits = !p.transport && m.stateCredits === 1 ? new LanStateCredits({maxBytes:protocol.maxSnapshotBytes*2}) : null;
          p.nativeProbe = null;
          send(p, {
            type: "welcome",
            ...(p.stateCredits ? {stateCredits:1} : {}),
            id: p.id,
            resumeToken: p.token,
            resumed,
            hasRoom: !!p.room,
            inputSeq: p.seq,
            actionId: p.action,
            reconnectMs: protocol.reconnectMs,
          });
          if (p.room) {
            const r = p.room;
            if (r.hostId === p.id) r.recoveryUntil = Math.min(now + 3000, r.lastState + protocol.reconnectMs);
            if (hostReload)
              abort(
                r,
                "计算主机页面已重新加载，无法恢复权威模拟。请重新准备开局。",
              );
            // Reclaim manual ownership immediately, before the resumed page has
            // reloaded resources. Being connected is not yet permission for input.
            if (["loading", "running"].includes(r.status)) presence(r, p, false);
            publish(r);
            if (["loading", "running"].includes(r.status)) {
              send(p, { type: "match", match: r.match });
              send(p, {
                type: "resume",
                matchId: r.match.id,
                stateSeq: r.lastSeq,
              });
            } else if (r.result) send(p, r.result);
          }
          return;
        }
        if (m.type === "visibility") {
          if (typeof m.hidden !== "boolean") throw Error("无效页面可见状态");
          // Repeating a visibility message never renews the inactivity deadline.
          if (p.background && !m.hidden && p.room?.hostId === p.id && p.room.status === "running") {
            const r = p.room;
            r.recoveryUntil = Math.min(now + protocol.hostStateTimeoutMs, r.lastState + protocol.backgroundGraceMs);
          }
          if (p.background !== m.hidden) p.stateCredits?.reset();
          p.background = m.hidden;
          return;
        }
        if (m.type === "ping") {
          send(p, { type: "pong", sent: m.sent });
          return;
        }
        if (m.type === "state-consumed") {
          // Exact sent-sequence validation is inside the window. A stale socket,
          // old match, host ACK or forged/future sequence cannot create credit.
          if (p.stateCredits && p.room && p.room.hostId !== p.id &&
              m.matchId === p.room.match?.id) p.stateCredits.ack(m.seq);
          return;
        }
        if (m.type === "leave") {
          leave(p);
          send(p, { type: "left" });
          return;
        }
        if (m.type === "create") {
          if (p.transport && !p.transport.canHost) throw Error("只有 Steam 大厅房主可以创建游戏房间。");
          if (p.room) throw Error("请先离开当前房间");
          if (rooms.size >= 16) throw Error("房间数量已满");
          const battleSize = m.battleSize ?? DEFAULT_BATTLE_SIZE;
          if (!validBattleSize(battleSize)) throw Error("战斗规模须为 200–3200 DP，步进 20");
          const password = m.password ?? "";
          if (typeof password !== "string" || password.length > 32)
            throw Error("房间密码最多 32 字");
          let code;
          do {
            code = randomBytes(3).toString("hex").toUpperCase();
          } while (rooms.has(code));
          const salt = randomBytes(16).toString("hex");
          const r = {
            code,
            capacity: protocol.defaultCapacity,
            hostId: p.id,
            scope: p.transport?.scope ?? "",
            network: p.transport ? { kind: "steam", lobbyId: p.transport.scope, appId: p.transport.appId } : null,
            peers: [p],
            status: "lobby",
            match: null,
            reason: "",
            since: now,
            lastState: now,
            lastSeq: -1,
            lastTick: -1,
            frame: null,
            result: null,
            salt,
            passwordHash: password ? passwordHash(password, salt) : "",
            chat: [],
            options: { aiHulls: [[], []], assignment: "teams", battleSize, deploymentLimit: battleTeamLimit(battleSize), initialDeploymentLimit: null },
          };
          p.seat = 0;
          p.team = 0;
          p.ready = false;
          p.room = r;
          rooms.set(code, r);
          publish(r);
          return;
        }
        if (m.type === "join") {
          if (p.room) throw Error("请先离开当前房间");
          const r = rooms.get(String(m.code).trim().toUpperCase());
          if (!r || (r.scope ?? "") !== (p.transport?.scope ?? "")) throw Error("房间不存在或连接方式不匹配");
          if (p.transport && r.peers.some(member => member.id !== p.id && member.transport?.identity === p.transport.identity)) throw Error("这个 Steam 账号已占用席位，请在原页面重连或等待席位释放。");
          if (r.peers.length >= r.capacity)
            throw Error("房间已满；掉线玩家的席位会保留 30 秒");
          editable(r);
          const password = m.password ?? "";
          if (
            typeof password !== "string" ||
            password.length > 32 ||
            (r.passwordHash &&
              passwordHash(password, r.salt) !== r.passwordHash)
          )
            throw Error("房间密码错误或未填写");
          p.seat = 1;
          while (r.peers.some((member) => member.seat === p.seat)) p.seat++;
          const counts = r.options.aiHulls.map((_,team) => team).map(
            (team) => r.peers.filter((member) => member.team === team).length,
          );
          p.team = counts.indexOf(Math.min(...counts));
          p.ready = false;
          p.room = r;
          r.peers.push(p);
          for (const member of r.peers) member.ready = false;
          publish(r);
          return;
        }
        const r = requireRoom(p);
        if (m.type === "capacity") {
          isHost(p, r);
          editable(r);
          if (
            !Number.isInteger(m.capacity) ||
            m.capacity < 2 ||
            m.capacity > protocol.maxPlayers
          )
            throw Error("房间容量必须为 2–10 人");
          // Reserved disconnected seats count too; resizing must never silently evict someone.
          if (m.capacity < r.peers.length)
            throw Error("容量不能小于当前成员数（包含掉线保留席位）");
          if (r.capacity !== m.capacity) {
            r.capacity = m.capacity;
            for (const member of r.peers) member.ready = false;
            publish(r);
          }
          return;
        }
        if (m.type === "ai") {
          isHost(p, r); editable(r);
          if(!requestId || m.roomCode!==r.code || !Number.isSafeInteger(m.baseRevision))throw Error('缺少 AI 编成确认信息，请刷新页面后重新操作');
          const next=editAiFleet(r.options,m,protocol.maxOptionsBytes,protocol.maxPlayers);
          if(!validOptions(next))throw Error('不支持此 AI 舰体或配装引用');
          r.options=next;
          for (const member of r.peers) member.ready = false;
          publish(r);
          if(requestId)send(p,{type:'ai-configured',requestId,roomCode:r.code,revision:r.options.aiRevision,design:m.design?Object.values(r.options.aiLoadouts??{}).find(d=>aiDesignSignature(d)===aiDesignSignature(m.design)):null});
          return;
        }
        if (m.type === "options") {
          isHost(p, r);
          editable(r);
          if (!m.options || typeof m.options !== "object" || Array.isArray(m.options)) throw Error("房间规则无效");
          if(['aiLoadouts','aiNextId','aiRevision'].some(key=>Object.hasOwn(m.options,key)))throw Error('AI 配装请使用独立编成操作');
          if(m.options.aiHulls !== undefined && m.baseRevision !== (r.options.aiRevision ?? 0))throw Error('AI 编成已变化，请重新操作编队');
          const next = pruneAiLoadouts({ ...r.options, ...m.options, aiRevision:(r.options.aiRevision??0)+(m.options.aiHulls!==undefined||m.options.assignment!==undefined?1:0) });
          if (!validOptions(next)) throw Error("房间规则无效（规模须为 200–3200 DP、步进 20；至少两个队伍，AI 须使用支持的舰体）");
          checkFleetBudget(next, protocol.maxOptionsBytes, protocol.maxPlayers);
          if (next.assignment === "teams" && r.peers.some(member=>member.team >= next.aiHulls.length))
            throw Error("该队仍有玩家，请先移动成员再移除队伍");
          r.options = copyOptions(next);
          for (const member of r.peers) member.ready = false;
          publish(r);
          return;
        }
        if (m.type === "team") {
          editable(r);
          if (r.options.assignment === "solo") throw Error("各自为战时每人独立一队；请房主先切回自由分队");
          if (!validTeam(m.team, r.options.aiHulls.length)) throw Error("无效队伍");
          const member =
            m.id === undefined ? p : r.peers.find((x) => x.id === m.id);
          if (!member) throw Error("玩家不在当前房间");
          if (member !== p) isHost(p, r);
          if (member.team !== m.team) {
            member.team = m.team;
            for (const player of r.peers) player.ready = false;
            publish(r);
          }
          return;
        }
        if (m.type === "protect") {
          isHost(p, r);
          editable(r);
          if (typeof m.password !== "string" || m.password.length > 32)
            throw Error("密码最多 32 字");
          r.passwordHash = m.password ? passwordHash(m.password, r.salt) : "";
          publish(r);
          return;
        }
        if (m.type === "kick") {
          isHost(p, r);
          editable(r);
          const target = r.peers.find((x) => x.id === m.id && x !== p);
          if (!target) throw Error("无法移除此玩家");
          leave(target, "房主已移除玩家");
          send(target, { type: "left", message: "你已被房主移出房间。" });
          return;
        }
        if (m.type === "chat") {
          if (
            typeof m.text !== "string" ||
            !m.text.trim() ||
            m.text.length > 200
          )
            throw Error("消息需为 1–200 字");
          if (now - p.lastChat < 750) throw Error("消息发送太快");
          p.lastChat = now;
          r.chat.push({
            id: randomUUID(),
            name: p.name,
            text: m.text.trim(),
            time: now,
          });
          r.chat = r.chat.slice(-40);
          publish(r);
          return;
        }
        if (m.type === "editing") {
          editable(r);
          if (typeof m.editing !== "boolean") throw Error("改装状态无效");
          if (p.editing !== m.editing) {
            p.editing = m.editing;
            if (p.editing) p.ready = false;
            publish(r);
          }
          return;
        }
        if (m.type === "configure") {
          editable(r);
          if (m.requestId !== undefined && !requestId) throw Error("配装请求标识无效");
          if (requestId && (!Number.isSafeInteger(m.baseRevision) || m.baseRevision !== p.designRevision || m.roomCode !== r.code))
            throw Error("房间配装版本已变化，请确认当前草稿后重新应用");
          const design = m.design == null ? null : wireDesign(m.design);
          if (!design && !protocol.ships.some((s) => s.id === m.hull))
            throw Error("不支持的舰船");
          if (design && m.hull !== design.hullId) throw Error("方案与舰体不一致");
          p.hull = m.hull;
          p.design = design;
          p.designRevision++;
          p.editing = false;
          // Everyone must confirm the new opposing/allied loadout before a start.
          for (const member of r.peers) member.ready = false;
          publish(r);
          if (requestId) send(p, {type:"configured", requestId, roomCode:r.code, revision:p.designRevision, design:p.design, hull:p.hull});
          return;
        }
        if (m.type === "ready") {
          editable(r);
          if (m.ready === true && p.editing) throw Error("请先应用或放弃未提交的改装");
          p.ready = m.ready === true;
          publish(r);
          return;
        }
        if (m.type === "start") {
          isHost(p, r);
          editable(r);
          const blocked = roomStartBlockReason({
            status: r.status, hostId: r.hostId, aiHulls: r.options.aiHulls, options:r.options,
            members: r.peers.map(member => ({id:member.id, name:member.name, hull:member.hull, design:member.design, team:member.team, ready:member.ready, editing:member.editing, connected:connected(member)})),
          });
          if (blocked) throw Error(blocked);
          r.match = {
            id: randomUUID(),
            hostId: r.hostId,
            seed: randomBytes(4).readUInt32LE(),
            players: [...r.peers]
              .sort((a, b) => a.seat - b.seat)
              .map(({ id, name, seat, team, hull, design }) => ({
                id,
                name,
                seat,
                team,
                hull,
                design: design ? structuredClone(design) : null,
              })),
            snapshotHz: protocol.snapshotHz, // Fixed target; bounded sockets may still skip congested state.
            options: copyOptions(r.options),
          };
          r.status = "loading";
          r.reason = "";
          r.since = now;
          r.lastState = now;
          r.lastSeq = -1;
          r.lastTick = -1;
          r.frame = null;
          r.result = null;
          for (const member of r.peers) {
            member.loaded = false;
            member.assetsLoaded = false;
            member.sync = null;
            member.ready = false;
          }
          publish(r);
          broadcast(r, { type: "match", match: r.match });
          return;
        }
        if (m.matchId !== r.match?.id) {
          if(m.type==='deployment'){send(p,{type:'deployment-result',matchId:m.matchId,requestId:m.requestId,ok:false,message:'部署请求属于已结束的旧对局。'});return;}
          if(m.type==='deployment-result'||m.type==='finish')return;
          throw Error("已过期的对局消息");
        }
        if (m.type === "end") {
          isHost(p, r);
          abort(r, "房主结束了本局，可以重新准备。");
          return;
        }
        if (m.type === "fail") {
          const reason =
            "客户端无法继续：" + String(m.reason ?? "未知错误").slice(0, 180);
          if (p.id === r.hostId) abort(r, reason);
          else {
            leave(p, reason);
            send(p, {
              type: "left",
              message: reason + "。你已退出房间，已开始的战斗由 AI 接管舰船。",
            });
          }
          return;
        }
        if (m.type === "loaded") {
          if (!["loading", "running"].includes(r.status)) return;
          if (p.assetsLoaded) return; // welcome/resume can both announce resource readiness.
          p.assetsLoaded = true;
          if (r.status === "running") {
            beginSync(r, p);
            publish(r);
          } else if (r.peers.every((x) => x.assetsLoaded && connected(x))) {
            r.status = "running";
            r.since = now;
            r.lastState = now;
            for (const member of r.peers) beginSync(r, member);
            publish(r);
          }
          return;
        }
        if (m.type === "sync-ready") {
          if (r.status !== "running" || !p.sync || m.syncId !== p.sync.id) return;
          if (!Number.isSafeInteger(m.tick) || m.tick < p.sync.tick || m.tick > r.lastTick || r.lastTick - m.tick > 120 || now - r.lastState > 1500) return;
          if (!p.loaded) {
            p.loaded = true;
            presence(r, p, true);
            publish(r);
          }
          send(p, { type: "controls-ready", matchId: r.match.id, syncId: p.sync.id });
          return;
        }
        if (m.type === "resync") {
          if (r.status !== "running" || !p.assetsLoaded || now - p.lastResync < 1000) return;
          p.lastResync = now;
          if (p.loaded || !p.sync) { beginSync(r, p); publish(r); }
          else send(p, { type: "launch", matchId: r.match.id, syncId: p.sync.id, minTick: p.sync.tick });
          // No cached stale frame: wait for the next authoritative snapshot.
          return;
        }
        if (m.type === "host-recovered") {
          isHost(p, r);
          if (r.status !== "running") return;
          for (const member of r.peers) if (connected(member) && member.assetsLoaded) beginSync(r, member);
          publish(r);
          return;
        }
        if (m.type === "deployment") {
          const reject=(message)=>send(p,{type:"deployment-result",matchId:r.match.id,requestId:m.requestId,ok:false,message});
          if(r.status!=="running"||!p.loaded||m.syncId!==p.sync?.id){reject("战斗尚未运行或已经结束。");return;}
          if(typeof m.requestId!=="string"||m.requestId.length>80||!["deploy","retreat","withdraw"].includes(m.operation)||!Array.isArray(m.ids)||m.ids.length>128||new Set(m.ids).size!==m.ids.length||m.ids.some(id=>typeof id!=="string"||id.length>256)) {reject("无效增援请求。");return;}
          const team=r.match.players.find(member=>member.seat===p.seat)?.team;
          if(team===undefined){reject("当前玩家没有参战席位。");return;}
          if(r.frame && m.ids.some(id=>!r.frame.deployment?.rows.some(row=>row.id===id&&row.teamId===team))){reject("只能操作本队战前编成中的舰船。");return;}
          send(r.peers[0],{type:"deployment",matchId:r.match.id,seat:p.seat,requestId:m.requestId,operation:m.operation,ids:m.ids});return;
        }
        if (m.type === "deployment-result") {
          isHost(p,r);
          const target=r.peers.find(member=>member.seat===m.seat);
          if(target&&typeof m.requestId==="string"&&m.requestId.length<=80&&typeof m.ok==="boolean")send(target,{type:"deployment-result",matchId:r.match.id,requestId:m.requestId,ok:m.ok,message:typeof m.message==="string"?m.message.slice(0,300):""});
          return;
        }
        // Handle terminal retries before the active-battle gate.
        if (m.type === "finish" && r.status === "ended" && r.result) { isHost(p, r); send(p, r.result); return; }
        if (r.status !== "running") return;
        if (m.type === "input") {
          if (!p.loaded || m.syncId !== p.sync?.id) return;
          const i = m.input;
          if (
            !i ||
            !Number.isSafeInteger(i.seq) ||
            i.seq < 0 ||
            !Number.isInteger(i.keys) ||
            i.keys < 0 ||
            i.keys > 255 ||
            typeof i.firing !== "boolean" ||
            typeof i.pointerActive !== "boolean" ||
            !Array.isArray(i.aim) ||
            i.aim.length !== 2 ||
            !i.aim.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000) ||
            !Array.isArray(i.actions) ||
            i.actions.length > 16
          )
            throw Error("无效操作");
          if (i.seq <= p.seq) return;
          const actions = [];
          let watermark = p.action;
          for (const a of i.actions) {
            if (
              !a ||
              !Number.isSafeInteger(a.id) ||
              a.id < 0 ||
              ![
                "shield",
                "target",
                "recall",
                "vent",
                "system",
                "group",
                "mode",
                "autofire",
              ].includes(a.kind) ||
              (a.aim !== undefined && (!Array.isArray(a.aim) || a.aim.length !== 2 || !a.aim.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000))) ||
              (a.kind === "system" && a.value !== undefined && (!Number.isInteger(a.value) || a.value < 0 || a.value >= 64)) ||
              (["group", "mode", "autofire"].includes(a.kind) &&
                (!Number.isInteger(a.value) || a.value < 0 || a.value > 6))
            )
              throw Error("无效操作事件");
            if (a.id > watermark) {
              actions.push({ id: a.id, kind: a.kind, value: a.value, ...(a.aim ? { aim: a.aim } : {}) });
              watermark = a.id;
            }
          }
          p.seq = i.seq;
          p.action = watermark;
          send(r.peers[0], {
            type: "input",
            matchId: r.match.id,
            seat: p.seat,
            input: {
              seq: i.seq,
              keys: i.keys,
              aim: i.aim,
              firing: i.firing,
              pointerActive: i.pointerActive,
              actions,
            },
          });
          return;
        }
        if (m.type === "state") {
          isHost(p, r);
          if (r.status !== "running") return;
          if (!Number.isSafeInteger(m.seq) || m.seq <= r.lastSeq) return;
          const f = m.frame;
          const summary = summarizeCombatFrame(f, expectedShips(r), r.lastTick);
          r.lastSeq = m.seq;
          r.lastTick = f.tick;
          r.lastState = now;
          // Rejoin waits for a fresh frame; only deployment/report validation
          // needs retained state, not the weapon, projectile or effect graph.
          r.frame = summary;
          broadcast(
            r,
            { type: "state", matchId: r.match.id, seq: m.seq, frame: f },
            p,
            binary ? raw : reusableStateText(m, text),
          );
          return;
        }
        if (m.type === "finish") {
          isHost(p, r);
          if (r.status !== "running" || !r.match) throw Error("当前没有运行中的对局");
          const teams = new Set([...r.match.players.map(member=>member.team), ...r.match.options.aiHulls.flatMap((hulls,team)=>hulls.length?[team]:[])]);
          if (m.winner !== "draw" && (!validTeam(m.winner) || !teams.has(m.winner))) throw Error("无效结果");
          const report = validateBattleReport(m.report, r.match, r.frame);
          r.status = "ended";
          const winnerName = r.match.options.assignment === "solo" ? r.match.players.find(member=>member.team===m.winner)?.name : null;
          r.reason = m.winner === "draw" ? "所有阵营均被消灭，平局" : (winnerName ?? teamName(m.winner)) + "获胜";
          r.result = {
            type: "ended",
            matchId: r.match.id,
            winner: m.winner,
            reason: r.reason,
            report,
          };
          broadcast(r, r.result);
          publish(r);
          return;
        }
        throw Error("未知消息");
      } catch (error) {
        send(p, {
          type: "error",
          message: error instanceof Error ? error.message : "消息处理失败",
          ...(requestId ? {requestId} : {}),
        });
      }
    });
  };
  for (const wss of websocketServers) wss.on("connection", ws => acceptTransport(ws));
  const timer = setInterval(() => {
    const now = Date.now();
    for (const p of peers) {
      if ((!p.hello && now - p.connected > 5000) || now - p.lastPong > 15000) {
        p.ws.terminate();
        continue;
      }
      if (p.stateCredits && !p.transport && p.ws.readyState === WebSocket.OPEN) {
        if (!p.nativeProbe) {
          const data = randomBytes(12);
          p.nativeProbe = { data, at: performance.now() };
          p.ws.ping(data);
        }
      } else p.ws.ping();
    }
    for (const [token, p] of sessions) {
      if (p.disconnected && now - p.disconnected > protocol.reconnectMs) {
        leave(p, "玩家未能在 30 秒内重连，加载取消。");
        sessions.delete(token);
      }
    }
    for (const r of rooms.values()) {
      if (r.status === "loading" && now - r.since > 60000)
        abort(r, "资源准备超时，请重试。");
      if (
        r.status === "running" &&
        connected(r.peers[0]) &&
        now > (r.recoveryUntil ?? 0) &&
        now - r.lastState > (r.peers[0].background ? protocol.backgroundGraceMs : protocol.hostStateTimeoutMs)
      )
        abort(r, r.peers[0].background
          ? "计算主机后台超过 5 分钟未更新，恢复超时，本局停止。"
          : "计算主机超过 12 秒未更新，恢复超时，本局停止。");
    }
  }, 1000);
  timer.unref();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    clearInterval(timer);
    for (const wss of websocketServers) wss.close();
    throw error;
  }
  return {
    server,
    rooms,
    acceptTransport,
    closeRoom: code => { const room = rooms.get(code); if (room) leave(room.peers[0]); },
    addresses: addresses(),
    close: async () => {
      clearInterval(timer);
      for (const p of peers) p.ws.terminate();
      await Promise.all(websocketServers.map(wss => new Promise(resolve => wss.close(resolve))));
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
    console.log("局域网分队服务已启动（仅可信局域网；不会修改防火墙）");
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
