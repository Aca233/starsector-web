import { LocalMuzzleEffects } from './LocalMuzzleEffects';
import { MotionPresence } from '../ui/core/MotionPresence';
import { lanTeamPresence } from "./LanBattleRoster";
import { FullscreenButton } from '../ui/FullscreenButton';
import { LanBattleReport } from "./LanBattleReport";
import { MAX_BATTLE_REPORT_BYTES } from "./battle-report.mjs";
import type { BattleEnded, BattleReport } from "./battle-report.mjs";
import { LocalContrails } from "./LocalContrails";
import { SnapshotPlayback } from "./SnapshotPlayback";
import { LanSnapshotDecoder } from "./LanSnapshotDecoder";
import type { SnapshotDecodeStats } from "./LanSnapshotDecoder";
import { MotionPrediction } from "./MotionPrediction";
import { LAN_SNAPSHOT_HZ, SnapshotReceiveRate } from "./SnapshotPolicy";
import type { HostPerformance } from "./SnapshotPolicy";
import { FleetDeployment } from '../ui/tactical/FleetDeployment';
import { TacticalMap } from '../ui/tactical/TacticalMap';
import { sameTeam } from "../engine/simulation/CombatTeams";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLanWorld, setLanPerspective } from "./LanWorld";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { WebGLCombatRenderer } from "../engine/render/webgl/WebGLCombatRenderer";
import { Vector2 } from "../engine/math/Vector2";
import { sound } from "../engine/audio/SoundManager";
import { VisualRandom } from "../engine/runtime/VisualRandom";
import { CameraController } from "../engine/runtime/CameraController";
import { clientToCombatWorld, zoomCombatView } from "../engine/runtime/PlayerControls";
import { isCombatTextEntry, hasCombatModal, hasCombatInputFocus } from '../engine/runtime/CombatInputFocus';
import { flightKey, shipCommandForKey } from "../engine/runtime/CombatCommands";
import { assetManager } from "../engine/assets/AssetResolver";
import { contentManifestManager } from "../engine/content/ContentManifest";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { Modal } from "../ui/core/UI";
import { ShipStage } from "../studio/ShipStage";
import { AuthenticTacticalConsole } from "../ui/hud/AuthenticTacticalConsole";
import { CombatRadar } from "../ui/hud/CombatRadar";
import { CombatContacts } from "../ui/hud/CombatContacts";
import { getHudDensity } from "../ui/hud/HudLayout";
import "../ui/combat-pause-menu.css";
import { applyCombatSnapshots } from "./CombatSnapshot";
import type { CombatSnapshot } from "./CombatSnapshot";
import { KEY_CODES, teamName, teamColor, LAN_BUILD } from "./protocol";
import type { Action, LanConnection, Match, Seat, PlayerInput } from "./protocol";

// Visual Lab geometry probes are opt-in, not part of normal multiplayer combat.
const LAYERS = new Set([
  "background",
  "nebula",
  "asteroid",
  "trail",
  "hull",
  "weapon",
  "beam",
  "shield",
  "explosion",
  "identification",
]);
interface AuthorityMulticore { mode: string; reason: string | null }
function readAuthorityMulticore(value: unknown): AuthorityMulticore | null {
  if (!value || typeof value !== "object") return null;
  const status = value as { mode?: unknown; reason?: unknown };
  if (typeof status.mode !== "string" || !status.mode.trim()) return null;
  return { mode: status.mode.slice(0, 128), reason: typeof status.reason === "string" ? status.reason.slice(0, 512) : null };
}
interface HUD {
  hp: number;
  max: number;
  enemy: number;
  enemyMax: number;
  flux: number;
  capacity: number;
  group: number;
  tick: number;
  sim: number;
  bytes: number;
  rtt: number | null;
  jitter: number;
  acknowledgementMs: number | null;
  age: number;
  hz: number | null;
  capture: number;
  encode: number;
  parse: number;
  decodeQueue: SnapshotDecodeStats | null;
  apply: number;
  render: number;
  gpu: number | null;
  fps: number;
  frameMs: number;
  realtimeRatio: number | null;
  combatRate: number | null;
  playbackDelay: number;
  authority: (HostPerformance & { ageMs: number }) | null;
  multicore: AuthorityMulticore | null;
  px: number;
  py: number;
}
export function LanBattle({
  connection,
  match,
  seat,
  ended,
  onReturn,
}: {
  connection: LanConnection;
  match: Match;
  seat: Seat;
  ended: BattleEnded | null;
  onReturn: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [networkStatus, setNetworkStatus] = useState("");
  const [controlsReady, setControlsReady] = useState(false);
  const [peerAway, setPeerAway] = useState("");
  const [status, setStatus] = useState("正在准备战斗资源…"),
    [error, setError] = useState("");
  const [hud, setHud] = useState<HUD | null>(null);
  const [displayEngine, setDisplayEngine] = useState<CombatEngine | null>(null);
  const [menu, setMenu] = useState<"menu" | "help" | "leave" | null>(null);
  const [density, setDensity] = useState(() =>
    getHudDensity(window.innerWidth, window.innerHeight),
  );
  const [mapOpen,setMapOpen]=useState(false),[deploymentOpen,setDeploymentOpen]=useState(false);
  const openMapRef=useRef<()=>void>(()=>{});
  const fleetRequestRef=useRef<(ids:string[],operation:'deploy'|'retreat'|'withdraw')=>Promise<void>>(async()=>{throw Error('战斗尚未就绪');});
  const controlledIdsRef=useRef(new Set<string>());
  const cameraRef = useRef(new Vector2());
  const hudZoomRef = useRef(0.65);
  const inputBlockedRef = useRef(false);
  const clearInputRef = useRef<() => void>(() => {});
  const actionRef = useRef<(kind: Action["kind"], value?: number) => void>(
    () => {},
  );
  const openMenu = useCallback((view: "menu" | "help" | "leave") => {
    inputBlockedRef.current = true;
    clearInputRef.current();
    setMenu(view);
  }, []);
  const closeMenu = () => {
    inputBlockedRef.current = mapOpen || deploymentOpen;
    setMenu(null);
  };
  useEffect(() => {
    const resize = () =>
      setDensity(getHudDensity(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(()=>{inputBlockedRef.current=!!menu||mapOpen||deploymentOpen;if(inputBlockedRef.current)clearInputRef.current();},[menu,mapOpen,deploymentOpen]);
  const endedRef = useRef(ended);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    endedRef.current = ended;
    if (ended) stopRef.current();
  }, [ended]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    let stopped = false;
    let decoder: LanSnapshotDecoder | null = null;
    let disposed = false,
      ready = false,
      launched = false,
      workerReady = seat !== 0,
      worker: Worker | null = null,
      renderer: WebGLCombatRenderer | null = null;
    let engine: CombatEngine,
      latest: CombatSnapshot | null = null,
      appliedTick = -1,
      receivedAt = 0,
      bytes = 0,
      frameId = 0,
      seq = connection.inputSequence,
      stateSeq = 0,
      actionId = connection.actionSequence,
      lastFrame = performance.now(),
      lastHUD = 0,
      lastInput = 0,
      lastSound = 0;
    let fps = 0, frameCount = 0, fpsWindowAt = performance.now(), frameMs = 16.7;
    let parseMs = 0, applyMs = 0, renderMs = 0, encodeMs = 0;
    let authorityPerformance: HostPerformance | null = null, authorityPerformanceAt = 0;
    let authorityMulticore: AuthorityMulticore | null = null;
    let synced = false, syncId = "", minSyncTick = Infinity, lastSyncRequest = 0;
    let lastAckAt = 0, acknowledged = -1;
    const receiveRate = new SnapshotReceiveRate();
    let acknowledgementMs: number | null = null;
    const sentInputs = new Map<number, number>();
    const prediction = new MotionPrediction();
    let playback = new SnapshotPlayback();
    const localContrails = new LocalContrails();
    const localMuzzles = new LocalMuzzleEffects();
    let finishedResult: {winner:number|"draw";report:BattleReport} | null = null;
    let lastFinish = 0;
    let failureReason = "";
    let keys = 0,
      firing = false,
      pointerActive = false,
      actions: Action[] = [],
      pointer = { x: 0, y: 0 },
      zoom = 0.65;
    const camera = cameraRef.current,
      cameraController = new CameraController(),
      random = new VisualRandom(match.seed);
    const send = (message: Record<string, unknown>) =>
      connection.send({ ...message, matchId: match.id, syncId });
    const sendFinish = () => {
      if (!finishedResult || failureReason || endedRef.current || !connection.ready) return;
      lastFinish = performance.now();
      send({type:"finish", ...finishedResult});
    };
    const fleetRequests=new Map<string,{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
    fleetRequestRef.current=(ids,operation)=>new Promise<void>((resolve,reject)=>{
      if(!launched||!synced||!connection.ready||endedRef.current){reject(Error('战场尚未同步完成，暂不能操作舰队。'));return;}
      const requestId=crypto.randomUUID();
      const timer=setTimeout(()=>{fleetRequests.delete(requestId);reject(Error('尚未收到主机确认，请查看最新部署状态后再操作。'));},8000);
      fleetRequests.set(requestId,{resolve,reject,timer});
      if(!send({type:'deployment',requestId,operation,ids})){clearTimeout(timer);fleetRequests.delete(requestId);reject(Error('连接不可用，增援请求未发送。'));}
    });
    const stop = () => {
      stopped = true;
      decoder?.close();
      if (!disposed) setStatus("本局已停止");
      launched = false;
      synced = false;
      if (!disposed) setControlsReady(false);
      if (engine) {
        prediction.clear(engine.playerShip); localContrails.reset(engine);
        // A successful terminal flush may not have reached RAF yet. Keep its
        // confirmed muzzle window for that last world; disposal/failure clears it.
        if (disposed || failureReason) localMuzzles.reset(engine);
      }
      for(const request of fleetRequests.values()){clearTimeout(request.timer);request.reject(Error('战斗已停止。'));}fleetRequests.clear();
      keys = 0;
      firing = false;
      actions = [];
      worker?.postMessage({ type: "stop" });
    };
    stopRef.current = stop;
    const fail = (reason: string) => {
      if (disposed || stopped || failureReason) return;
      failureReason = reason;
      setError(reason);
      stop();
      if (connection.ready) send({ type: "fail", reason });
    };
    const loaded = () => {
      if (failureReason) {
        if (connection.ready) send({ type: "fail", reason: failureReason });
        return;
      }
      if (ready && workerReady && !disposed && connection.ready) {
        setStatus("已就绪，等待其他玩家加载…");
        send({ type: "loaded" });
      }
    };
    const accept = (frame: CombatSnapshot) => {
      if (disposed || stopped || (syncId && frame.tick < minSyncTick)) return;
      if (!playback.push(frame)) return;
      // Discrete events are independent of the replaceable world endpoints.
      // Playback may evict 8+ queued worlds or sample only the final pair; every
      // decoded muzzle window must nevertheless be received in authority order.
      localMuzzles.receive(frame.muzzleEvents);
      const now = performance.now();
      receiveRate.receive(now);
      receivedAt = now;
      const ack = frame.acknowledged[seat];
      if (Number.isSafeInteger(ack) && ack > acknowledged) {
        acknowledged = ack;
        lastAckAt = now;
        const sent = sentInputs.get(ack);
        if (sent !== undefined) acknowledgementMs = acknowledgementMs === null ? now - sent : acknowledgementMs * .7 + (now - sent) * .3;
        for (const sequence of sentInputs.keys()) if (sequence <= ack) sentInputs.delete(sequence);
      }
      if (launched && synced && ready && engine)
        for (const event of (frame.sounds ?? []).slice(0, 64)) {
          if (!Number.isSafeInteger(event.id) || event.id <= lastSound)
            continue;
          lastSound = event.id;
          if (
            typeof event.key !== "string" ||
            !Object.hasOwn(sound.SOUND_MAP, event.key) ||
            !Number.isFinite(event.volume) ||
            !Number.isFinite(event.rate)
          )
            continue;
          const volume = Math.max(0, Math.min(1, event.volume)),
            rate = Math.max(0.25, Math.min(4, event.rate));
          if (event.pos?.length === 2 && event.pos.every(Number.isFinite))
            sound.playAtPos(
              event.key,
              { x: event.pos[0], y: event.pos[1] },
              engine.playerShip.pos,
              volume,
              rate,
            );
          else sound.play(event.key, volume, rate);
        }
    };
    if (seat === 0) decoder = new LanSnapshotDecoder({
      acknowledge: tick => worker?.postMessage({ type: "snapshot-consumed", tick }),
      consume: (frame, elapsed) => { parseMs = parseMs * .7 + elapsed * .3; accept(frame); },
      error: error => fail(error instanceof Error ? error.message : "无法解析主机快照"),
    });
    const unsubscribe = connection.subscribe((m) => {
      if (disposed) return;
      if (m.type === "page-visibility") {
        worker?.postMessage({ type: "visibility", hidden: m.hidden });
        // Hidden tabs do not consume display tasks; release any retained credit
        // now, rather than waiting for a throttled timer and blocking peer state.
        if (m.hidden) decoder?.reset();
        clear();
        if (!m.hidden && launched && !endedRef.current) {
          freeze("② 同步战场：已回到前台，等待最新状态后恢复操控…");
          syncId = "";
          if (connection.ready) send({ type: "resync" });
        }
        return;
      }
      if (m.type === "reconnecting") {
        freeze("① 恢复连接：连接中断，正在自动重连（席位保留 30 秒）…");
        syncId = "";
        return;
      }
      if (m.type === "welcome") {
        freeze("② 同步战场：连接已恢复，等待房主最新状态…");
        seq = Math.max(seq, connection.inputSequence);
        actionId = Math.max(actionId, connection.actionSequence);
        loaded();
        sendFinish();
        return;
      }
      if (m.type === "error") {
        fail(m.message || "服务器拒绝了战斗消息");
        return;
      }
      if (m.type === "room") {
        const members = m.room.members as Array<{
          seat: number;
          connected: boolean;
          loaded: boolean;
        }>;
        const host = members.find((member) => member.seat === 0);
        const others = match.players.filter(player => player.seat !== 0 && player.seat !== seat);
        const away = others.filter(player => !members.some(member => member.seat === player.seat && member.connected));
        const syncing = others.filter(player => members.some(member => member.seat === player.seat && member.connected && !member.loaded));
        const peerStatus = [
          away.length ? away.map(player => player.name).join("、") + "离线或已离开，舰船由 AI 接管。" : "",
          syncing.length ? syncing.map(player => player.name).join("、") + "正在同步，舰船保持手动，暂不接受操作。" : "",
        ].filter(Boolean).join(" ");
        setPeerAway(
          m.room.status !== "running"
            ? ""
            : !host?.connected || !host.loaded
              ? "计算主机连接中断或正在恢复，等待战斗同步…"
              : peerStatus,
        );
        if (seat === 0)
          for (const player of match.players) {
            const member = members.find(
              (member) => member.seat === player.seat,
            );
            worker?.postMessage({
              type: "presence",
              seat: player.seat,
              connected: !!member?.connected,
              online: !!member?.connected && !!member.loaded,
            });
          }
        return;
      }
      if (m.matchId !== match.id) return;
      if (m.type === "resume") {
        stateSeq = Math.max(stateSeq, m.stateSeq + 1);
        loaded();
      }
      if(m.type==='deployment'&&seat===0)worker?.postMessage(m);
      if(m.type==='deployment-result'){
        const request=fleetRequests.get(m.requestId);
        if(request){clearTimeout(request.timer);fleetRequests.delete(m.requestId);if(m.ok)request.resolve();else request.reject(Error(m.message||'主机拒绝了舰队操作。'));}
      }
      if (m.type === "presence" && seat === 0) worker?.postMessage(m);
      if (m.type === "input" && seat === 0)
        worker?.postMessage({ type: "input", seat: m.seat, input: m.input });
      if (m.type === "state" && seat !== 0) {
        try {
          bytes = connection.snapshotBytes;
          parseMs = parseMs * .7 + connection.snapshotParseMs * .3;
          accept(m.frame);
        } catch (error) {
          fail(error instanceof Error ? error.message : "无法接收战斗快照事件");
        }
      }
      if (m.type === "controls-ready" && m.syncId === syncId && !synced) {
        if (performance.now() - receivedAt > 1500 || appliedTick < minSyncTick) return;
        resetInput();
        synced = true;
        lastAckAt = performance.now();
        acknowledgementMs = null;
        setControlsReady(true);
        setNetworkStatus("");
        setStatus("战斗进行中");
      }
      if (m.type === "launch") {
        if (failureReason || endedRef.current) return;
        if (finishedResult !== null) {
          sendFinish();
          return;
        }
        if (stopped) return;
        if (syncId !== m.syncId) {
          freeze("② 同步战场：正在接收最新状态，完成前暂不可操控…");
          syncId = m.syncId;
          minSyncTick = m.minTick;
          lastSyncRequest = 0;
        }
        launched = true;
        lastInput = 0;
        worker?.postMessage({ type: "start" });
      }
      if (m.type === "ended") stop();
    });
    try {
      const world = createLanWorld(match);
      engine = world.engine;
      controlledIdsRef.current=new Set([...world.controlled.values()].map(ship=>ship.id));
      setLanPerspective(engine, world.controlled, seat);
      camera.copy(engine.playerShip.pos);
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
      });
      if (!gl) throw Error("当前浏览器无法创建 WebGL2 战斗画面");
      renderer = new WebGLCombatRenderer(canvas, gl, {
        onContextLost: () => fail("显卡上下文丢失，请返回房间重试。"),
        onContextRestoreFailed: () => fail("显卡恢复失败"),
      });
      if (seat === 0) {
        worker = new Worker(new URL("./host.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onerror = (event) =>
          fail("计算 Worker 启动失败：" + event.message);
        worker.onmessage = (event) => {
          if (disposed || stopped) return;
          const m = event.data;
          // Recovery/error diagnostics remain useful when backpressure defers
          // full world snapshots. Never mistake a stale display tick for physics.
          if (m.type === "performance" || m.type === "recovered" || m.type === "error") {
            const performanceSample: HostPerformance | undefined = m.type === "performance" ? m : m.diagnostics;
            if (performanceSample) {
              authorityPerformance = performanceSample;
              authorityMulticore = readAuthorityMulticore((performanceSample as HostPerformance & { multicore?: unknown }).multicore);
              authorityPerformanceAt = performance.now();
            }
          }
          if (m.type === "ready") {
            workerReady = true;
            loaded();
          }
          if (m.type === "error") fail(m.message);
          if (m.type === "recovered") {
            freeze("② 同步战场：房主短暂停顿后恢复，正在重新同步…");
            syncId = "";
            send({ type: "host-recovered", pauseMs: m.pauseMs });
          }
          if (m.type === "deployment-result") send(m);
          if (m.type === "snapshot") {
            try {
              // Queue the authoritative state for peers before decoding our own
              // presentation copy. Local display work must not delay the uplink.
              bytes = m.bytes;
              encodeMs = m.encodeMs;
              if (launched && connection.ready) {
                const delivery = connection.sendSnapshot(match.id, stateSeq++, m);
                if (delivery === "oversized") { fail("战斗快照超过 16 MiB 通信安全预算，请减少舰队规模后重试。"); return; }
              }
              if (stopped) return;
              // Upload first, then grant only reserved decode capacity. Parsing
              // happens in a later task, not inside the host publication ACK.
              // Hidden hosts keep publishing but deliberately skip presentation.
              if (document.visibilityState !== "hidden") decoder!.enqueue(m);
              else worker?.postMessage({ type: "snapshot-consumed", tick: m.tick });
            } catch (error) {
              fail(error instanceof Error ? error.message : "无法解析主机快照");
            }
          }
          if (m.type === "finished") {
            decoder?.flush();
            if (stopped) return;
            if (new TextEncoder().encode(JSON.stringify(m.report)).byteLength > MAX_BATTLE_REPORT_BYTES) {
              fail("战斗报告超过通信安全预算，无法完成结算，请减少舰队规模后重试。");
              return;
            }
            finishedResult = {winner:m.winner, report:m.report};
            sendFinish();
            stop();
          }
        };
        worker.postMessage({ type: "init", match, hidden: document.visibilityState === "hidden", binarySnapshots: connection.transport === "lan" });
      }
      void (async () => {
        try {
          await assetManager.ensureManifestLoaded();
          await contentManifestManager.ensureLoaded();
          if (disposed) return;
          await renderer!.prepareAssets(engine);
          if (disposed) return;
          setDisplayEngine(engine);
          ready = true;
          loaded();
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      })();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
    openMapRef.current=()=>{if(!engine||!launched||!synced||endedRef.current)return;clearInputRef.current();inputBlockedRef.current=true;engine.isTacticalMap=true;setMapOpen(true);};
    const active = () =>
      launched &&
      synced &&
      connection.ready &&
      !endedRef.current &&
      !inputBlockedRef.current &&
      hasCombatInputFocus();
    const action = (kind: Action["kind"], value?: number) => {
      if (active() && actions.length < 16)
        {
          const aim = clientToCombatWorld(pointer, canvas, camera, zoom);
          actions.push({
            id: (actionId = Math.max(actionId, connection.actionSequence) + 1),
            kind, value, ...(pointerActive ? { aim: [aim.x, aim.y] as [number, number] } : {}),
          });
        }
    };
    actionRef.current = action;
    const heldFlightKeys = new Set<string>();
    const refreshKeys = () => {
      keys = 0;
      for (const code of heldFlightKeys) {
        const bit = KEY_CODES.indexOf(flightKey(code) as typeof KEY_CODES[number]);
        if (bit >= 0) keys |= 1 << bit;
      }
    };
    const resetInput = () => {
      heldFlightKeys.clear();
      keys = 0;
      firing = false;
      pointerActive = false;
      actions = [];
    };
    const freeze = (message: string) => {
      if (disposed || stopped) return;
      // A new sync epoch must not apply queued old worlds or inherit their tick
      // as evidence for sync-ready. Cancel tasks before releasing held credits.
      decoder?.reset();
      playback = new SnapshotPlayback();
      latest = null; appliedTick = -1; receivedAt = 0; receiveRate.reset();
      synced = false;
      setControlsReady(false);
      resetInput();
      sentInputs.clear();
      if (engine) { prediction.clear(engine.playerShip); localContrails.reset(engine); localMuzzles.reset(engine); }
      for (const request of fleetRequests.values()) { clearTimeout(request.timer); request.reject(Error("同步中断，请检查最新部署状态后再操作。")); }
      fleetRequests.clear();
      setNetworkStatus(message);
    };
    const clear = () => { resetInput(); if (launched) sendInput(); };
    clearInputRef.current = clear;
    const sendInput = () => {
      if (!engine || !launched || !synced || !connection.ready) return;
      if ((connection.socket?.bufferedAmount ?? 0) > 65536) { actions = []; return; }
      // Keep sending neutral packets while unfocused; silence alone leaves stale
      // controls active until the host timeout and cannot express pointer ownership.
      if (!active()) resetInput();
      const aim = pointerActive ? clientToCombatWorld(pointer, canvas, camera, zoom) : engine.playerShip.aimTargetWorld;
      const input: PlayerInput = {
        seq: (seq = Math.max(seq, connection.inputSequence) + 1),
        keys,
        aim: [aim.x, aim.y],
        firing,
        pointerActive,
        actions,
      };
      if (send({ type: "input", input })) {
        const now = performance.now();
        sentInputs.set(input.seq, now);
        while (sentInputs.size > 120) sentInputs.delete(sentInputs.keys().next().value!);
        prediction.record(input, now);
        actions = [];
      }
    };
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (isCombatTextEntry(event.target) || hasCombatModal()) return;
      if(event.code==='Tab'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!inputBlockedRef.current){event.preventDefault();openMapRef.current();return;}
      const command = shipCommandForKey(event);
      if (event.ctrlKey || event.altKey || event.metaKey) {
        if (command && active()) {
          event.preventDefault();
          if (!event.repeat) action(command.kind, 'value' in command ? command.value : undefined);
        } else clear();
        return;
      }
      if (!event.repeat && !endedRef.current && !inputBlockedRef.current && ['Escape', 'KeyH', 'Space'].includes(event.code)) {
        event.preventDefault();
        openMenu(event.code === 'KeyH' ? 'help' : 'menu');
        return;
      }
      if (!active()) return;
      if (command) {
        event.preventDefault();
        if (!event.repeat) action(command.kind, 'value' in command ? command.value : undefined);
        return;
      }
      if (flightKey(event.code)) {
        heldFlightKeys.add(event.code);
        refreshKeys();
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      heldFlightKeys.delete(event.code);
      refreshKeys();
    };
    const move = (event: MouseEvent) => {
      if (!active()) { pointerActive = false; cameraController.suspendPointer(); return; }
      pointer = { x: event.clientX, y: event.clientY };
      pointerActive = true;
      cameraController.samplePointer(event.clientX, event.clientY);
    };
    const mouseDown = (event: MouseEvent) => {
      if (!active() || event.ctrlKey || event.altKey || event.metaKey) return;
      sound.play("ui_button_press", 0);
      pointer = { x: event.clientX, y: event.clientY };
      pointerActive = true;
      cameraController.samplePointer(event.clientX, event.clientY);
      if (event.button === 0) firing = true;
      if (event.button === 2) action("shield");
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button === 0) firing = false;
    };
    const loseFocus = () => { cameraController.suspendPointer(); clear(); };
    const onFocus = (event: FocusEvent) => { if (isCombatTextEntry(event.target) || hasCombatModal()) loseFocus(); };
    const leaveCanvas = () => { pointerActive = false; cameraController.suspendPointer(); firing = false; if (launched) sendInput(); };
    const context = (event: MouseEvent) => event.preventDefault();
    const wheel = (event: WheelEvent) => {
      if (inputBlockedRef.current || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      zoom = zoomCombatView(zoom, event.deltaY);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", loseFocus);
    document.addEventListener("visibilitychange", loseFocus);
    document.addEventListener("focusin", onFocus);
    canvas.addEventListener("mouseleave", leaveCanvas);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mousedown", mouseDown);
    window.addEventListener("mouseup", mouseUp);
    canvas.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    const inputTimer = setInterval(() => {
      if (finishedResult && performance.now()-lastFinish > 1500) sendFinish();
      if (launched) {
        sendInput();
        lastInput = performance.now();
      }
    }, 1000 / 30);
    const frame = (now: number) => {
      if (disposed) return;
      frameId = requestAnimationFrame(frame);
      // Some browsers still schedule background RAFs; never restore/render an
      // invisible world or repeatedly request resync because its display is stale.
      if (document.visibilityState === "hidden" || !ready || !renderer || !engine) return;
      const gap = Math.max(0, now - lastFrame);
      const dt = Math.min(0.05, gap / 1000);
      frameMs = frameMs * .9 + gap * .1;
      frameCount++;
      if (now - fpsWindowAt >= 500) { fps = frameCount * 1000 / (now - fpsWindowAt); frameCount = 0; fpsWindowAt = now; }
      lastFrame = now;
      try {
        const rect = canvas.getBoundingClientRect(),
          ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(rect.width * ratio)),
          height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        // Renderer zoom is in backing pixels; DOM HUD positions are CSS pixels.
        hudZoomRef.current = zoom / (canvas.width / Math.max(1, rect.width));
        const presentation = playback.sample(now, !launched || !synced);
        if (presentation.frames.length) {
          const started = performance.now();
          applyCombatSnapshots(engine, presentation.frames, presentation.reset, snapshot => {
            // Prediction needs the player pose at EACH restored endpoint, not
            // all acknowledgements against the final world's pose.
            appliedTick = snapshot.tick;
            latest = snapshot;
            prediction.receive(engine.playerShip, snapshot.acknowledged[seat], now);
          }, { nativeTargeting: true }); // createLanWorld owns a native, non-Proxy graph.
          applyMs = applyMs * .7 + (performance.now() - started) * .3;
        }
        if (launched && synced && (now - receivedAt > 1500 || now - lastAckAt > 2000 || (acknowledgementMs ?? 0) > 2000)) {
          freeze("② 同步战场：更新或输入确认中断，已停止操控，等待最新状态…");
          syncId = "";
          send({ type: "resync" });
          lastSyncRequest = now;
        }
        if (launched && !synced && connection.ready && now - lastSyncRequest > 500) {
          if (syncId && appliedTick >= minSyncTick && now - receivedAt < 1500) {
            setNetworkStatus("③ 恢复操控：战场已同步，等待房主确认…");
            send({ type: "sync-ready", tick: appliedTick });
          } else if (now - lastSyncRequest > 1000) send({ type: "resync" });
          if ((syncId && appliedTick >= minSyncTick) || now - lastSyncRequest > 1000) lastSyncRequest = now;
        }
        // The host also renders a snapshot replica; its authority lives in the
        // Worker. Predict only this display pose for every local pilot.
        {
          const p = engine.playerShip;
          const aim = pointerActive ? clientToCombatWorld(pointer, canvas, camera, zoom) : p.aimTargetWorld;
          const nearCollision = engine.capitalShips.some(other => other !== p && !other.isDead && other.pos.distanceTo(p.pos) < p.spec.collisionRadius + other.spec.collisionRadius + 60);
          prediction.render(p, { seq, keys, aim: [aim.x, aim.y], firing: false, pointerActive, actions: [] }, now, active() && !nearCollision);
        }
        const alpha = presentation.alpha;
        const focusShip = engine.playerShip.isDead
          ? (engine.capitalShips.find(
              (ship) =>
                !ship.isDead && sameTeam(ship, engine.playerShip),
            ) ?? engine.playerShip)
          : engine.playerShip;
        const focus = focusShip.interpolatedPos(alpha);
        cameraController.follow(camera, focus, canvas, zoom, dt, active() && !engine.isTacticalMap);
        const frameContext = {
          visualTime: presentation.visualTime,
          random,
          layers: LAYERS,
          damageEnabled: true,
        };
        const renderStarted = performance.now();
        if (launched && synced) localContrails.update(engine, presentation.visualTime, alpha, presentation.reset);
        else localContrails.reset(engine);
        if (launched && synced) localMuzzles.update(engine, presentation.visualTime, presentation.reset);
        else localMuzzles.reset(engine);
        renderer.updateVisual(engine, launched ? dt : 0, frameContext);
        renderer.render(engine, alpha, camera, zoom, frameContext);
        renderMs = renderMs * .9 + (performance.now() - renderStarted) * .1;
        if (now - lastHUD > 100) {
          const p = engine.playerShip,
            e = engine.enemyShip;
          const metrics = authorityPerformance && authorityPerformance.tick >= (latest?.tick ?? -1)
            ? authorityPerformance : latest;
          const metricsFresh = now - Math.max(receivedAt, authorityPerformanceAt) < 2500;
          setHud({
            hp: p.hullHp,
            max: p.maxHullHp,
            enemy: e.hullHp,
            enemyMax: e.maxHullHp,
            flux: p.flux.totalFlux,
            capacity: p.flux.maxFlux,
            group: p.selectedGroupIndex + 1,
            tick: appliedTick,
            sim: metrics?.simulationMs ?? 0,
            bytes,
            rtt: connection.rttMs,
            jitter: connection.jitterMs,
            acknowledgementMs,
            age: Math.max(0, now - receivedAt),
            hz: receiveRate.sample(now),
            capture: metrics?.captureMs ?? 0,
            encode: seat === 0 ? encodeMs : latest?.encodeMs ?? 0,
            parse: parseMs, decodeQueue: decoder?.stats ?? null, apply: applyMs, render: renderMs,
            gpu: renderer.getResourceStats().gpuTimeMs, fps, frameMs,
            realtimeRatio: metricsFresh ? metrics?.realtimeRatio ?? null : null,
            combatRate: metricsFresh ? metrics?.combatRate ?? null : null,
            authority: authorityPerformance ? { ...authorityPerformance, ageMs: Math.max(0, now - authorityPerformanceAt) } : null,
            multicore: authorityMulticore,
            playbackDelay: presentation.delayMs,
            px: p.pos.x,
            py: p.pos.y,
          });
          lastHUD = now;
        }
        if (launched && receivedAt && now - receivedAt > 1200)
          setStatus("等待计算主机更新…");
        else if (launched && now - lastInput < 100) setStatus("战斗进行中");
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
        ready = false;
      }
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      stop();
      clearInterval(inputTimer);
      cancelAnimationFrame(frameId);
      unsubscribe();
      worker?.terminate();
      renderer?.dispose();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", loseFocus);
      document.removeEventListener("visibilitychange", loseFocus);
      document.removeEventListener("focusin", onFocus);
      canvas.removeEventListener("mouseleave", leaveCanvas);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [connection, match, seat, openMenu]);
  const returnToRoom = () => {
    if (connection.ready && !ended && seat !== 0) connection.send({ type: "leave" });
    else if (connection.ready && !ended)
      connection.send({
        type: error ? "fail" : "end",
        matchId: match.id,
        reason: error || undefined,
      });
    stopRef.current();
    onReturn();
  };
  const finished = !!(error || ended);
  const teamPresence = displayEngine ? lanTeamPresence(match, displayEngine) : [];
  return (
    <main className="lan-battle">
      <canvas ref={canvasRef} className="lan-canvas" aria-label="局域网战场" />
      {mapOpen && displayEngine && !finished && <TacticalMap engine={displayEngine} paused={false} onPausedChange={()=>{}} autopilot={false} onAutopilotChange={()=>{}} readOnlyCommands
        inputBlocked={!!menu||deploymentOpen} cameraPosRef={cameraRef} canvasRef={canvasRef}
        onClosed={()=>{setMapOpen(false);inputBlockedRef.current=!!menu||deploymentOpen;}}
        onOpenDeployment={()=>{clearInputRef.current();inputBlockedRef.current=true;setDeploymentOpen(true);}}
        onRetreat={(ids,full)=>fleetRequestRef.current(full?ids.filter(id=>!controlledIdsRef.current.has(id)||id===displayEngine.playerShip.id):ids,full?'withdraw':'retreat')} />}
      {deploymentOpen && displayEngine && !finished && <FleetDeployment engine={displayEngine} team={displayEngine.playerShip.teamId}
        onDeploy={ids=>fleetRequestRef.current(ids,'deploy')}
        onClose={()=>{setDeploymentOpen(false);inputBlockedRef.current=mapOpen||!!menu;}}
        onDeployed={()=>{if(displayEngine.isTacticalMap)displayEngine.toggleTacticalMap();setDeploymentOpen(false);setMapOpen(false);inputBlockedRef.current=!!menu;canvasRef.current?.focus();}} />}
      {hud && displayEngine && (
        <div
          className="lan-hud hud-overlay ui-font select-none"
          data-hud-density={density}
          data-combat-input-block
          inert={!controlsReady || !!menu || finished || mapOpen || deploymentOpen}
          data-tick={hud.tick}
          data-player-x={hud.px.toFixed(2)}
          data-player-y={hud.py.toFixed(2)}
          data-hp={hud.hp.toFixed(1)}
          data-enemy-hp={hud.enemy.toFixed(1)}
          data-group={hud.group}
        >
          <CombatContacts engine={displayEngine} cameraPosRef={cameraRef} zoomRef={hudZoomRef} canvasRef={canvasRef}
            blocked={!controlsReady || !!menu || finished || mapOpen || deploymentOpen} />
          <div className="hud-console-anchor pointer-events-auto absolute z-20">
            <AuthenticTacticalConsole onToggleRecall={() => actionRef.current('recall')}
              player={displayEngine.playerShip}
              engine={displayEngine}
              weaponControls={{
                onSelectGroup: (index) => actionRef.current("group", index),
                onToggleMode: (index) => actionRef.current("mode", index),
                onToggleAutofire: (index) =>
                  actionRef.current("autofire", index),
              }}
            />
          </div>
          <div className="hud-radar-anchor pointer-events-none absolute z-20">
            <CombatRadar engine={displayEngine} />
          </div>
        </div>
      )}
      {!finished && (
        <div className="lan-battle-tools">
          <span>
            {(match.options.assignment === "solo" ? "个人混战 · " : "分队战斗 · ") +
              teamName(
                match.players.find((player) => player.seat === seat)!.team
              )}{" "}
            · {seat === 0 ? "主机" : "玩家"}
          </span>
          <span className="lan-battle-teams" aria-label="阵营与舰船数量">{teamPresence.map(row=><span key={row.team} style={{color:teamColor(row.team)}}
            data-team={row.team} data-deployed={row.deployed} data-reserve={row.reserve} data-visible={row.visible}
            title={teamName(row.team)+"：编成 "+row.total+" · 在场 "+row.deployed+" · 可见 "+row.visible+" · 后备 "+row.reserve+" · 损失 "+row.destroyed+" · 撤离 "+row.retreated+"。在场不等于当前镜头内；后备需部署后才显示。"}>
            {teamName(row.team)}{row.team===displayEngine?.playerShip.teamId?"（己方）":""} · 场{row.deployed}/总{row.total}{row.reserve>0?" 待命"+row.reserve:""}
            {(row.missing>0||row.invalidPosition>0||(displayEngine?.openBattlefield&&row.visible<row.deployed))&&" ⚠显示异常"}
          </span>)}</span>
          {hud && <span className="lan-network-quality" data-quality={!controlsReady || hud.age > 1500 ? "syncing" : (hud.rtt ?? 0) > 180 || (hud.acknowledgementMs ?? 0) > 350 || (hud.fps > 0 && hud.fps < 40) || (hud.realtimeRatio !== null && hud.realtimeRatio < .9) ? "slow" : "good"}
            title={"服务器往返延迟，不含房主计算；输入确认包含服务器转发、主机处理及快照返回。低延迟不代表高帧率；打开菜单中的性能与网络诊断查看详情。"}>
            {!controlsReady ? "同步中" : "网络 " + (hud.rtt === null ? "测量中" : Math.round(hud.rtt) + " ms")}
            {" · 画面 " + (hud.fps ? Math.round(hud.fps) + " FPS" : "测量中") + " · 状态 " + (hud.hz === null ? "测量中" : hud.hz.toFixed(0)) + " Hz · 战斗 " + (hud.combatRate === null ? "测量中" : hud.combatRate.toFixed(2) + "×")}
          </span>}
          <NativeButton shortcut="Tab" disabled={!controlsReady||mapOpen||deploymentOpen||!!menu||finished||!hud?.tick} onClick={()=>openMapRef.current()}>战术地图 / 增援</NativeButton>
          <NativeButton shortcut="Esc" onClick={() => openMenu("menu")}>
            菜单
          </NativeButton>
        </div>
      )}
      {!finished && (networkStatus || peerAway || status !== "战斗进行中") && (
        <NativeFrame className="lan-battle-status" surface="glass">
          <span role="status">{networkStatus || peerAway || status}</span>
        </NativeFrame>
      )}
      <MotionPresence>{!finished && menu === "menu" && (
        <Modal
          title="联机菜单"
          eyebrow=""
          className="lan-combat-menu"
          onClose={closeMenu}
          initialFocus="panel"
        >
          <p className="lan-menu-note">
            战斗仍在继续。菜单只屏蔽你的操作，不会暂停对局。
          </p>
          <div className="combat-pause-layout">
            <section className="combat-pause-ship" aria-label="当前舰船">
              {displayEngine && (
                <>
                  <div className="combat-pause-ship-name">
                    <NativeBitmapText font="caption">
                      {displayEngine.playerShip.shipName}
                    </NativeBitmapText>
                  </div>
                  <div className="combat-pause-portrait">
                    <ShipStage spec={displayEngine.playerShip.spec} home />
                  </div>
                </>
              )}
            </section>
            <div className="combat-pause-actions">
              <FullscreenButton className="combat-pause-button" font="action" align="right" />
              <NativeButton
                className="combat-pause-button"
                font="action"
                align="right"
                onClick={() => openMenu("help")}
              >
                操纵与联机说明
              </NativeButton>
              <div className="combat-pause-end-actions">
                <NativeButton
                  className="combat-pause-button"
                  font="action"
                  align="right"
                  onClick={() => openMenu("leave")}
                >
                  {seat === 0 ? "结束本局" : "离开对局"}
                </NativeButton>
                <NativeButton
                  className="combat-pause-button"
                  font="action"
                  align="right"
                  onClick={closeMenu}
                >
                  返回游戏
                </NativeButton>
              </div>
            </div>
          </div>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{!finished && menu === "help" && (
        <Modal
          title="操纵与联机说明"
          eyebrow=""
          onClose={closeMenu}
          footer={<NativeButton onClick={closeMenu}>返回游戏</NativeButton>}
        >
          <div className="lan-help">
            <dl className="lan-controls">
              <dt>
                <kbd>W / S</kbd>
              </dt>
              <dd>推进 / 倒车</dd>
              <dt>
                <kbd>A / D</kbd>
              </dt>
              <dd>侧向平移（按住 Shift 改为转向）</dd>
              <dt>
                <kbd>Q / E</kbd>
              </dt>
              <dd>侧向平移</dd>
              <dt>
                <kbd>Shift</kbd>
              </dt>
              <dd>暂时关闭鼠标转向，恢复键盘转向</dd>
              <dt>
                <kbd>X</kbd>
              </dt>
              <dd>制动</dd>
              <dt>
                <kbd>鼠标左键 / 右键</kbd>
              </dt>
              <dd>选定组开火 / 独立防御（没有独立槽时开关护盾或相位）</dd>
              <dt>
                <kbd>V / F</kbd>
              </dt>
              <dd>排幅 / 舰船系统</dd>
              <dt><kbd>R / Z</kbd></dt>
              <dd>锁定鼠标下敌舰（再次按下取消）/ 当前舰船联队召回</dd>
              <dt>
                <kbd>1–7</kbd>
              </dt>
              <dd>选择武器组（也可点击控制台）</dd>
              <dt>
                <kbd>滚轮</kbd>
              </dt>
              <dd>缩放战场</dd>
              <dt>
                <kbd>Esc / 空格</kbd>
              </dt>
              <dd>联机菜单，不暂停对局</dd>
              <dt>
                <kbd>H</kbd>
              </dt>
              <dd>操纵说明</dd>
            </dl>
            <p className="lan-menu-note">
              可点击控制台切换射击模式和自动开火；Shift+数字切换射击模式，Ctrl+数字切换自动开火。客机短时断线保留
              30 秒，由 AI 临时接管。客机主动离开只退出自己，不能中途加入；房主结束本局会结束全场，刷新计算主机页面无法恢复战斗。
            </p>
            <details>
              <summary>性能与网络诊断</summary>
              <p>页面构建：<code>{LAN_BUILD}</code><br />当前地址：{window.location.host} · {displayEngine?.openBattlefield?"联机公开战场":"传感器视野"}</p>
              {teamPresence.map(row=><p key={row.team}>{teamName(row.team)}：编成 {row.total} · 已同步 {row.known} · 在场 {row.deployed} · 可见 {row.visible} · 后备 {row.reserve} · 损失 {row.destroyed} · 撤离 {row.retreated}{row.missing>0?" · 缺少身份 "+row.missing:""}{row.invalidPosition>0?" · 坐标异常 "+row.invalidPosition:""}</p>)}
              {hud && (
                <p>
                  显示状态步 {hud.tick} · 主机模拟 {hud.sim.toFixed(2)} ms/步 ·
                  完整快照约 {(hud.bytes / 1024).toFixed(1)} KB<br />
                  计算推进 {hud.realtimeRatio === null ? "测量中" : hud.realtimeRatio.toFixed(2) + "×"} · 战斗时间 {hud.combatRate === null ? "测量中" : hud.combatRate.toFixed(2) + "×"} · 显示缓冲 {Math.round(hud.playbackDelay)} ms
                </p>
              )}
              {hud?.authority && <p>
                主机实际计算步 {hud.authority.tick} · 诊断更新于 {Math.round(hud.authority.ageMs)} ms 前{hud.authority.ageMs > 2500 ? "（已过期）" : ""}<br />
                最近一步 {hud.authority.lastStepMs.toFixed(1)} ms · 采样窗口最慢一步 {hud.authority.maxStepMs.toFixed(1)} ms · 回调间隔 {hud.authority.callbackGapMs.toFixed(1)} ms · 待补计算 {hud.authority.backlogMs.toFixed(1)} ms。以上是墙钟耗时，可能包含线程等待，不等于纯 CPU 计算耗时；诊断不依赖完整快照发送。
              </p>}
              {hud?.authority && <p>AI 实际模式：{hud.multicore?.mode ?? "未报告（不能确认多核）"}{hud.multicore?.reason ? " · 原因：" + (hud.multicore.reason === "ai-workers-disabled" ? "已关闭 AI 多 Worker，不自动试跑" : hud.multicore.reason) : ""}。serial / fallback 表示串行或回退，并非多核运行。</p>}
              {hud && <p>服务器往返 {hud.rtt === null ? "测量中" : Math.round(hud.rtt) + " ms"} · 网络抖动 {Math.round(hud.jitter)} ms · 输入确认 {hud.acknowledgementMs === null ? "测量中" : Math.round(hud.acknowledgementMs) + " ms"}<br />
                目标 {LAN_SNAPSHOT_HZ} Hz · 实际接收约 {hud.hz === null ? "测量中" : hud.hz.toFixed(1)} 次/秒 · 最新状态距今 {Math.round(hud.age)} ms · 主机快照采集 {hud.capture.toFixed(1)} ms/次</p>}
              {hud && <p>画面 {Math.round(hud.fps)} FPS · 帧间隔 {hud.frameMs.toFixed(1)} ms · 绘制提交 {hud.render.toFixed(1)} ms/帧 · GPU {hud.gpu === null ? "不可测" : hud.gpu.toFixed(1) + " ms"}<br />
                快照编码 {hud.encode.toFixed(1)} ms（Worker） · 本机解析 {hud.parse.toFixed(1)} ms · 批量还原 {hud.apply.toFixed(1)} ms/批。计算推进 1.00× 表示每现实秒完成约 60 个物理步；低于 1.00× 表示主机实际落后。战斗时间还受舰船时间系统影响，不能仅凭 FPS 判断。</p>}
              {hud?.decodeQueue && <p>本机解码队列 {hud.decodeQueue.queued}/2（另预留 1 个末帧槽） · 峰值 {hud.decodeQueue.peakQueued} 帧 / {(hud.decodeQueue.peakBytes / 1048576).toFixed(2)} MiB · 等待 {hud.decodeQueue.waitMs.toFixed(1)} ms（峰值 {hud.decodeQueue.maxWaitMs.toFixed(1)} ms） · 背压 {hud.decodeQueue.backpressure} 次。上行 ACK 受 credits 约束，解码不额外跨 Worker 克隆对象图。</p>}
              <p>客机仅对自己的舰船做最多 250 ms 的运动显示预测，接近舰船碰撞时停用。武器命中、伤害和胜负始终由房主判定。输入确认时间包含转发、主机处理及快照返回，不等于服务器延迟。</p>
              <p>运动按连续战斗时间轴平滑，不再随每个网络包重新计时；断流时停止在已知状态，不虚构命中。同步目标固定 60Hz，不再按舰队规模或负载主动降频。计算不足或网络背压仍会使实际接收低于目标，不补发重复状态、不伪造 60Hz。短断线先同步战场再恢复操控。切回前台会先重新同步。房主后台暂停最多保留 5 分钟；真正断线仍须在 30 秒内重连。持续过载、主机刷新或页面被浏览器丢弃仍可能结束本局。</p>
            </details>
          </div>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{!finished && menu === "leave" && (
        <Modal
          title={seat === 0 ? "结束本局？" : "离开对局？"}
          eyebrow=""
          width="small"
          onClose={() => openMenu("menu")}
          initialFocus="panel"
          footer={
            <>
              <NativeButton onClick={() => openMenu("menu")}>取消</NativeButton>
              <NativeButton disabled={!connection.ready} onClick={returnToRoom}>
                {seat === 0 ? "结束并返回房间" : "离开对局并退出房间"}
              </NativeButton>
            </>
          }
        >
          <p className="lan-menu-note">
            {seat === 0
              ? "这会结束所有人的战斗，房间保留，可以重新准备再开一局。"
              : "只退出你自己，舰船由 AI 接管，其他玩家继续战斗。主动退出后不能中途重新加入。"}
            连接中断时，请等待重连后确认。
          </p>
        </Modal>
      )}</MotionPresence>
      {finished && <LanBattleReport match={match} seat={seat} result={ended} error={error} onReturn={returnToRoom} />}
    </main>
  );
}
