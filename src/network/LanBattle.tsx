import { combatHudView } from '../engine/runtime/CombatHudView';
import { engineTacticalMapSource } from '../engine/runtime/TacticalMapView';
import { engineDeploymentView } from '../engine/runtime/DeploymentView';
import { LocalTurretPrediction } from './LocalTurretPrediction';
import { combatRenderView } from '../engine/render/CombatRenderView';
import { LocalParticleEffects } from './LocalParticleEffects';
import { LocalFirePrediction } from './LocalFirePrediction';
import { CriticalCombatReplica } from "./CriticalCombatReplica";
import { combatStateFromText } from "./CriticalCombatState.mjs";
import { ProjectileVisualReplica } from './ProjectileVisualReplica';
import { downloadNetworkDiagnostics, nextDiagnosticBattle, recordNetworkDiagnostic } from "./NetworkDiagnosticLog";
import { NetworkRuntimeDiagnostics } from "./NetworkRuntimeDiagnostics";
import { SnapshotPipelineDiagnostics } from "./SnapshotPipelineDiagnostics";
import { FlowCounters } from "./SnapshotFlow.mjs";
import type { FlowSample } from "./SnapshotFlow.mjs";
import { LanNetworkDiagnostics } from "./LanNetworkDiagnostics";
import { SteamNetworkDiagnostics } from "./SteamNetworkDiagnostics";
import { getGraphicsSettings } from '../engine/runtime/GraphicsSettings';
import { PresentationSettingsPanel } from '../ui/PresentationSettingsPanel';
import { readSystemBindings, selectNextSystem } from '../engine/runtime/SystemBindings';
import { SystemBindingSettings } from '../ui/SystemBindingSettings';
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
import { MotionReplica, motionAuthority } from "./MotionReplica";
import { motionFromText } from "./MotionFrame.mjs";
import { ProjectileFlightPrediction } from "./ProjectileFlightPrediction";
import { MotionPrediction } from "./MotionPrediction";
import { submitRealtimeInput } from "./RealtimeSendPolicy.mjs";
import { InputSendBudget, LAN_INPUT_INTERVAL_MS } from "./InputSendBudget";
import { LAN_SNAPSHOT_HZ, SnapshotReceiveRate } from "./SnapshotPolicy";
import type { HostPerformance } from "./SnapshotPolicy";
import { FleetDeployment } from '../ui/tactical/FleetDeployment';
import { applyTacticalViewCommand } from '../engine/runtime/TacticalControl';
import { TacticalMap } from '../ui/tactical/TacticalMap';
import { sameTeam } from "../engine/simulation/CombatTeams";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applyCombatSnapshots, projectileSnapshotTick } from "./CombatSnapshot";
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
  ships: number;
  projectiles: number;
  explosions: number;
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
  input?: { sentSequence: number; acknowledgedSequence: number | null;
    trackedPending: number; oldestTrackedPendingMs: number | null; pendingActions: number };
  age: number;
  hz: number | null;
  appliedHz: number | null;
  motionHz: number | null;
  motionAgeMs: number | null;
  motionTick: number | null;
  localFlow: FlowSample;
  pipeline: unknown;
  pipelineAgeMs: number | null;
  capture: number;
  encode: number;
  parse: number;
  decodeQueue: SnapshotDecodeStats | null;
  apply: number;
  render: number;
  renderDrawCalls: number;
  spriteDrawCalls: number;
  spriteTextureSlots: number;
  renderCulling: { spritesEnabled: boolean; hullOverlaysEnabled: boolean; shipSpritesRejected: number; hullOverlaysRejected: number };
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
  steamTransport,
  roomHost,
}: {
  connection: LanConnection;
  match: Match;
  seat: Seat;
  ended: BattleEnded | null;
  onReturn: () => void;
  steamTransport?: unknown;
  roomHost?: boolean;
}) {
  const serverAuthority = match.authority === "server";
  const computesAuthority = seat === 0 && !serverAuthority;
  const canEndBattle = serverAuthority ? roomHost === true : seat === 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [networkStatus, setNetworkStatus] = useState("");
  const [controlsReady, setControlsReady] = useState(false);
  const [peerAway, setPeerAway] = useState("");
  const [status, setStatus] = useState("正在准备战斗资源…"),
    [error, setError] = useState("");
  const [hud, setHud] = useState<HUD | null>(null);
  const diagnosticBattle = useRef<number | null>(null);
  const diagnosticHud = useRef<{ value: HUD; at: number } | null>(null);
  const diagnosticInput = useRef<((now: number) => HUD["input"]) | null>(null);
  const diagnosticSteam = useRef<{ value: unknown; at: number } | null>(null);
  useEffect(() => { diagnosticSteam.current = { value: steamTransport, at: performance.now() }; }, [steamTransport]);
  useEffect(() => {
    const battle = nextDiagnosticBattle(); diagnosticBattle.current = battle;
    let previous = performance.now();
    const runtime = new NetworkRuntimeDiagnostics(previous);
    diagnosticHud.current = null;
    const write = (event: string) => {
      const now = performance.now(), sample = diagnosticHud.current, steam = diagnosticSteam.current;
      recordNetworkDiagnostic({ event, battle, transport: connection.transport, seat, role: seat === 0 ? 'host' : 'guest',
        hidden: document.visibilityState === 'hidden', connected: connection.ready, socketBufferedBytes: connection.socket?.bufferedAmount ?? null,
        sampleGapMs: event === 'sample' ? now - previous : null,
        runtime: runtime.sample(now, event === 'sample'),
        hudAgeMs: sample ? Math.max(0, now - sample.at) : null, hud: sample ? { ...sample.value, input: diagnosticInput.current?.(now) } : null,
        pipelineAgeMs: connection.snapshotPipelineAt === null ? null : Math.max(0, now - connection.snapshotPipelineAt) + connection.snapshotPipelineRoundTripMs,
        features: connection.networkFeatures, pipeline: connection.snapshotPipeline, lan: connection.lanTransport,
        steamAgeMs: steam ? Math.max(0, now - steam.at) : null, steam: steam?.value });
      if (event === 'sample') previous = now;
    };
    write('battle-start');
    // Independent of RAF and the diagnostics panel. A blocked JS thread still delays
    // this timer; sampleGapMs exposes the gap instead of inventing missed samples.
    const timer = setInterval(() => write('sample'), 1000);
    return () => { clearInterval(timer); try { write('battle-stop'); } finally { runtime.dispose(); } };
  }, [connection, match.id, seat]);
  const [displayEngine, setDisplayEngine] = useState<CombatEngine | null>(null);
  const mapSource = useMemo(() => displayEngine ? engineTacticalMapSource(displayEngine) : null, [displayEngine]);
  const deploymentView = useMemo(() => displayEngine ? engineDeploymentView(displayEngine) : null, [displayEngine]);
  const [menu, setMenu] = useState<"menu" | "help" | "settings" | "leave" | null>(null);
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
  const openMenu = useCallback((view: "menu" | "help" | "settings" | "leave") => {
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
      workerReady = !computesAuthority,
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
    let directAuthority = false;
    let authoritySocket: typeof connection.socket = null;
    const detachAuthority = () => { directAuthority = false; authoritySocket?.detachAuthority?.(); authoritySocket = null; worker?.postMessage({ type: "authority-fallback" }); };
    let fps = 0, frameCount = 0, fpsWindowAt = performance.now(), frameMs = 16.7;
    let parseMs = 0, applyMs = 0, renderMs = 0, encodeMs = 0;
    let authorityPerformance: HostPerformance | null = null, authorityPerformanceAt = 0;
    let authorityMulticore: AuthorityMulticore | null = null;
    let synced = false, syncId = "", minSyncTick = Infinity, lastSyncRequest = 0;
    let lastAckAt = 0, acknowledged = -1;
    const receiveRate = new SnapshotReceiveRate();
    const applyRate = new SnapshotReceiveRate();
    const motionRate = new SnapshotReceiveRate();
    const motion = new MotionReplica();
    const combat = new CriticalCombatReplica();
    const combatRate = new SnapshotReceiveRate();
    const projectileVisuals = new ProjectileVisualReplica(match.id);
    const localFlow = new FlowCounters(["uploaded", "uploadSkipped"]);
    let acknowledgementMs: number | null = null;
    const sentInputs = new Map<number, number>();
    const prediction = new MotionPrediction();
    const projectileFlight = new ProjectileFlightPrediction();
    const firePrediction = new LocalFirePrediction();
    const turretPrediction = new LocalTurretPrediction();
    const inputBudget = new InputSendBudget();
    let playback = new SnapshotPlayback();
    const localContrails = new LocalContrails();
    const localMuzzles = new LocalMuzzleEffects();
    const localParticles = new LocalParticleEffects();
    let finishedResult: {winner:number|"draw";report:BattleReport} | null = null;
    let lastFinish = 0;
    let failureReason = "";
    let keys = 0,
      firing = false,
      pointerActive = false,
      actions: Action[] = [],
      pointer = { x: 0, y: 0 },
      zoom = 0.65;
    // Read only on the existing diagnostic timer, not each RAF/HUD refresh.
    diagnosticInput.current = now => ({ sentSequence: seq, acknowledgedSequence: acknowledged >= 0 ? acknowledged : null,
      projectileVisuals: projectileVisuals.stats(),
      projectileFlight: projectileFlight.stats(),
      firePrediction: firePrediction.stats(),
      motionPrediction: prediction.stats(),
      turretPrediction: turretPrediction.stats(),
      localParticles: localParticles.stats(),
      criticalCombat: { tick: combat.tick, ageMs: combat.age(now), weaponTick: combat.weaponTick, weaponAgeMs: combat.weaponAge(now), hz: combatRate.sample(now) },
      trackedPending: sentInputs.size,
      oldestTrackedPendingMs: sentInputs.size ? Math.max(0, now - sentInputs.values().next().value!) : null,
      pendingActions: actions.length });
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
      motion.clear(); combat.clear(); combatRate.reset(); projectileVisuals.clear();
      decoder?.close();
      connection.clearAuthorityPerformance(match.id);
      if (!disposed) setStatus("本局已停止");
      launched = false;
      synced = false;
      if (!disposed) setControlsReady(false);
      if (engine) {
        prediction.clear(engine.playerShip); firePrediction.reset(engine); turretPrediction.reset(); projectileFlight.reset(); localContrails.reset(engine);
        // A successful terminal flush may not have reached RAF yet. Keep its
        // confirmed muzzle window for that last world; disposal/failure clears it.
        if (disposed || failureReason) { localMuzzles.reset(engine); localParticles.reset(engine); }
      }
      for(const request of fleetRequests.values()){clearTimeout(request.timer);request.reject(Error('战斗已停止。'));}fleetRequests.clear();
      keys = 0;
      firing = false;
      actions = [];
      detachAuthority();
      worker?.postMessage({ type: "stop" });
    };
    stopRef.current = stop;
    const fail = (reason: string, failureStage: string = "unknown") => {
      if (disposed || stopped || failureReason) return;
      recordNetworkDiagnostic({ event: "battle-failed", battle: diagnosticBattle.current, failureStage, transport: connection.transport, seat, role: seat === 0 ? "host" : "guest" });
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
    const acknowledgeInput = (ack: number, now: number) => {
      if (!Number.isSafeInteger(ack) || ack <= acknowledged || ack > seq) return;
      acknowledged = ack; lastAckAt = now;
      const sent = sentInputs.get(ack);
      if (sent !== undefined) acknowledgementMs = acknowledgementMs === null ? now - sent : acknowledgementMs * .7 + (now - sent) * .3;
      for (const sequence of sentInputs.keys()) if (sequence <= ack) sentInputs.delete(sequence);
    };
    const acceptMotion = (data: unknown, remote: boolean) => {
      if (disposed || stopped || !launched || !synced || !ready || document.visibilityState === "hidden") return;
      const frame = motionFromText(data), now = performance.now();
      // A valid received packet may be older than a just-applied full world. It
      // is still consumed, but cannot rewind the render pose or increment Hz.
      if (remote) send({ type: "motion-consumed", tick: frame.tick });
      if (!motion.receive(frame, now, appliedTick)) return;
      motionRate.receive(now); acknowledgeInput(frame.acknowledged[seat], now);
      const row = motion.row(engine.playerShip.id, now, appliedTick);
      if (row && !row[8]) prediction.receive(motionAuthority(engine.playerShip, row), frame.acknowledged[seat], now);
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
      acknowledgeInput(frame.acknowledged[seat], now);
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
    if (computesAuthority) decoder = new LanSnapshotDecoder({
      acknowledge: tick => worker?.postMessage({ type: "snapshot-consumed", tick }),
      consume: (frame, elapsed) => { parseMs = parseMs * .7 + elapsed * .3; accept(frame); },
      error: error => fail(error instanceof Error ? error.message : "无法解析主机快照", "snapshot-decode"),
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
        detachAuthority(); launched = false;
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
        fail(m.message || "服务器拒绝了战斗消息", "server-rejected");
        return;
      }
      if (m.type === "room") {
        const members = m.room.members as Array<{
          seat: number;
          connected: boolean;
          loaded: boolean;
        }>;
        const host = members.find((member) => member.seat === 0);
        const others = match.players.filter(player => (serverAuthority || player.seat !== 0) && player.seat !== seat);
        const away = others.filter(player => !members.some(member => member.seat === player.seat && member.connected));
        const syncing = others.filter(player => members.some(member => member.seat === player.seat && member.connected && !member.loaded));
        const peerStatus = [
          away.length ? away.map(player => player.name).join("、") + "离线或已离开，舰船由 AI 接管。" : "",
          syncing.length ? syncing.map(player => player.name).join("、") + "正在同步，舰船保持手动，暂不接受操作。" : "",
        ].filter(Boolean).join(" ");
        setPeerAway(
          m.room.status !== "running"
            ? ""
            : !serverAuthority && (!host?.connected || !host.loaded)
              ? "计算主机连接中断或正在恢复，等待战斗同步…"
              : peerStatus,
        );
        if (computesAuthority && !directAuthority)
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
      if (serverAuthority && m.type === "authority-performance") {
        authorityPerformance = m.performance;
        authorityPerformanceAt = performance.now();
        return;
      }
      if (m.type === "resume") {
        stateSeq = Math.max(stateSeq, m.stateSeq + 1);
        loaded();
      }
      if(m.type==='deployment'&&computesAuthority&&!directAuthority)worker?.postMessage(m);
      if(m.type==='deployment-result'){
        const request=fleetRequests.get(m.requestId);
        if(request){clearTimeout(request.timer);fleetRequests.delete(m.requestId);if(m.ok)request.resolve();else request.reject(Error(m.message||'主机拒绝了舰队操作。'));}
      }
      if (m.type === "presence" && computesAuthority && !directAuthority) worker?.postMessage(m);
      if (m.type === "input" && computesAuthority && !directAuthority)
        worker?.postMessage({ type: "input", seat: m.seat, input: m.input });
      if (m.type === 'projectile-visual' && connection.visualState && !computesAuthority && m.syncId === syncId && launched && synced && ready && !stopped && !disposed && document.visibilityState !== 'hidden') {
        try {
          projectileVisuals.receive(m.key,m.kind,m.visualBytes,performance.now(),minSyncTick);
          // Even a retained base older than minSyncTick is needed to decode the
          // next update; it grants base-ready, not a displayed authority tick.
          m.visualHandled = true;
        } catch { /* Atomic decoder keeps the last valid view; do not resurrect an older bulk world on corruption. */ }
      }
      if (m.type === "combat-state" && connection.combatState && !computesAuthority && m.syncId === syncId) {
        try {
          const frame = combatStateFromText(m.data), now = performance.now();
          if (frame.tick !== m.tick) throw Error("Critical combat tick mismatch");
          if (disposed || stopped || !launched || !synced || !ready || document.visibilityState === "hidden" || frame.tick < minSyncTick) { send({ type: "combat-consumed", tick: frame.tick, status: "discarded" }); return; }
          // Retained component ownership, never helper/TCP arrival, grants credit.
          if (combat.receive(frame, now, appliedTick)) combatRate.receive(now);
          send({ type: "combat-consumed", tick: frame.tick, status: "consumed" });
        } catch { fail("关键战斗状态校验失败", "snapshot-decode"); }
        return;
      }
      if (m.type === "motion" && connection.motionState && !computesAuthority && m.syncId === syncId) {
        try { acceptMotion(m.data, true); } catch { fail("关键状态校验失败", "snapshot-decode"); }
      }
      if (m.type === "state" && !computesAuthority) {
        try {
          bytes = connection.snapshotBytes;
          parseMs = parseMs * .7 + connection.snapshotParseMs * .3;
          accept(m.frame);
        } catch (error) {
          fail(error instanceof Error ? error.message : "无法接收战斗快照事件", "snapshot-apply");
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
        onContextLost: () => fail("显卡上下文丢失，请返回房间重试。", "graphics-context"),
        onContextRestoreFailed: () => fail("显卡恢复失败", "graphics-context"),
      });
      if (computesAuthority) {
        worker = new Worker(new URL("./host.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onerror = (event) =>
          fail("计算 Worker 启动失败：" + event.message, "worker-start");
        worker.onmessage = (event) => {
          if (disposed || stopped) return;
          const m = event.data;
          if (Number.isSafeInteger(m.nextSequence)) stateSeq = Math.max(stateSeq, m.nextSequence);
          if (m.type === "io-unavailable") directAuthority = false;
          // Recovery/error diagnostics remain useful when backpressure defers
          // full world snapshots. Never mistake a stale display tick for physics.
          if (m.type === "performance" || m.type === "recovered" || m.type === "error") {
            const performanceSample: HostPerformance | undefined = m.type === "performance" ? m : m.diagnostics;
            if (performanceSample) {
              authorityPerformance = performanceSample;
              connection.recordAuthorityPerformance(match.id, performanceSample);
              authorityMulticore = readAuthorityMulticore((performanceSample as HostPerformance & { multicore?: unknown }).multicore);
              authorityPerformanceAt = performance.now();
            }
          }
          if (m.type === "ready") {
            workerReady = true;
            loaded();
          }
          if (m.type === "error") fail(m.message, "worker-runtime");
          if (m.type === "recovered") {
            freeze("② 同步战场：房主短暂停顿后恢复，正在重新同步…");
            syncId = "";
            send({ type: "host-recovered", pauseMs: m.pauseMs });
          }
          if (m.type === "deployment-result") send(m);
          if (m.type === "motion") {
            try {
              if (launched && connection.ready && connection.motionState) send({ type: "motion", data: m.data });
              acceptMotion(m.data, false);
            } catch (error) { fail(error instanceof Error ? error.message : "关键状态失败", "snapshot-decode"); }
            finally { worker?.postMessage({ type: "motion-consumed", tick: m.tick }); }
          }
          if (m.type === "snapshot") {
            try {
              // Queue the authoritative state for peers before decoding our own
              // presentation copy. Local display work must not delay the uplink.
              bytes = m.bytes;
              encodeMs = m.encodeMs;
              if (!m.direct && launched && connection.ready) {
                const delivery = connection.sendSnapshot(match.id, stateSeq++, m);
                if (delivery === "sent") localFlow.count("uploaded");
                else if (delivery === "skipped") localFlow.count("uploadSkipped");
                if (delivery === "oversized") { fail("战斗快照超过 16 MiB 通信安全预算，请减少舰队规模后重试。", "snapshot-size"); return; }
              }
              if (stopped) return;
              // Upload first, then grant only reserved decode capacity. Parsing
              // happens in a later task, not inside the host publication ACK.
              // Hidden hosts keep publishing but deliberately skip presentation.
              if (document.visibilityState !== "hidden") decoder!.enqueue(m);
              else worker?.postMessage({ type: "snapshot-consumed", tick: m.tick });
            } catch (error) {
              fail(error instanceof Error ? error.message : "无法解析主机快照", "snapshot-decode");
            }
          }
          if (m.type === "finished") {
            decoder?.flush();
            if (stopped) return;
            if (new TextEncoder().encode(JSON.stringify(m.report)).byteLength > MAX_BATTLE_REPORT_BYTES) {
              fail("战斗报告超过通信安全预算，无法完成结算，请减少舰队规模后重试。", "report-size");
              return;
            }
            finishedResult = {winner:m.winner, report:m.report};
            sendFinish();
            stop();
          }
        };
        // Same authenticated connection, no extra network socket. Unsupported
        // plain-browser/native I/O retains the original main-thread path.
        if (import.meta.env.VITE_LAN_DIRECT_AUTHORITY !== 'false' && connection.socket?.attachAuthority) {
          const channel = new MessageChannel();
          if (connection.socket.attachAuthority(channel.port1, match.id, stateSeq)) {
            authoritySocket = connection.socket; directAuthority = true;
            worker.postMessage({ type: "authority-port", port: channel.port2 }, [channel.port2]);
          } else { channel.port1.close(); channel.port2.close(); }
        }
        worker.postMessage({ type: "init", match, hidden: document.visibilityState === "hidden", binarySnapshots: connection.canSendBinarySnapshots, motionState: connection.motionState });
      }
      void (async () => {
        try {
          await assetManager.ensureManifestLoaded();
          await contentManifestManager.ensureLoaded();
          if (disposed) return;
          await renderer!.prepareAssets(combatRenderView(engine));
          if (disposed) return;
          setDisplayEngine(engine);
          ready = true;
          loaded();
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e), "resource-load");
        }
      })();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e), "initialization");
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
          sendInput();
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
      playback = new SnapshotPlayback(); motion.clear(); combat.clear(); combatRate.reset(); projectileVisuals.clear(); motionRate.reset();
      latest = null; appliedTick = -1; receivedAt = 0; receiveRate.reset(); applyRate.reset(); localFlow.reset();
      synced = false;
      setControlsReady(false);
      resetInput();
      sentInputs.clear();
      if (engine) { prediction.clear(engine.playerShip); firePrediction.reset(engine); turretPrediction.reset(); projectileFlight.reset(); localContrails.reset(engine); localMuzzles.reset(engine); localParticles.reset(engine); }
      for (const request of fleetRequests.values()) { clearTimeout(request.timer); request.reject(Error("同步中断，请检查最新部署状态后再操作。")); }
      fleetRequests.clear();
      setNetworkStatus(message);
    };
    const clear = () => { resetInput(); if (engine) firePrediction.reset(engine); if (launched) sendInput(); };
    clearInputRef.current = clear;
    const sendInput = () => {
      if (!engine || !launched || !synced || !connection.ready) return;
      const now = performance.now();
      submitRealtimeInput<PlayerInput>({
        canSend: () => connection.canSendInput(),
        takeBudget: () => inputBudget.take(now),
        createInput: () => {
          // Resample held controls/aim after backpressure; never queue old inputs.
          // Explicit focus/reset transitions still discard actions as before.
          if (!active()) resetInput();
          const aim = pointerActive ? clientToCombatWorld(pointer, canvas, camera, zoom) : engine.playerShip.aimTargetWorld;
          return { seq: Math.max(seq, connection.inputSequence) + 1, keys,
            aim: [aim.x, aim.y], firing, pointerActive, actions };
        },
        send: input => send({ type: "input", input }),
        accepted: input => {
          seq = input.seq;
          sentInputs.set(input.seq, now);
          while (sentInputs.size > 120) sentInputs.delete(sentInputs.keys().next().value!);
          prediction.record(input, now);
          turretPrediction.record(input, now);
          firePrediction.record(engine, input, now, active());
          actions = [];
        },
      });
    };
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (isCombatTextEntry(event.target) || hasCombatModal()) return;
      if(event.code==='Tab'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!inputBlockedRef.current){event.preventDefault();openMapRef.current();return;}
      const command = shipCommandForKey(event, engine.playerShip);
      if (event.ctrlKey || event.altKey || event.metaKey) {
        if (command && active()) {
          event.preventDefault();
          if (!event.repeat) action(command.kind, 'value' in command ? command.value : undefined);
        } else clear();
        return;
      }
      if (!event.repeat && !endedRef.current && !inputBlockedRef.current && ['Escape', 'F1', 'Space'].includes(event.code)) {
        event.preventDefault();
        openMenu(event.code === 'F1' ? 'help' : 'menu');
        return;
      }
      if (!active()) return;
      if (command) {
        event.preventDefault();
        if (!event.repeat) action(command.kind, 'value' in command ? command.value : undefined);
        return;
      }
      if (flightKey(event.code)) {
        const previousKeys = keys;
        heldFlightKeys.add(event.code);
        refreshKeys();
        event.preventDefault();
        if (keys !== previousKeys) sendInput();
      }
    };
    const up = (event: KeyboardEvent) => {
      const previousKeys = keys;
      heldFlightKeys.delete(event.code);
      refreshKeys();
      if (keys !== previousKeys) sendInput();
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
      if (event.button === 0 && !firing) { firing = true; sendInput(); }
      if (event.button === 2) action(event.shiftKey ? "hullShield" : "shield");
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button === 0 && firing) { firing = false; sendInput(); }
    };
    const loseFocus = () => { cameraController.suspendPointer(); clear(); };
    const onFocus = (event: FocusEvent) => { if (isCombatTextEntry(event.target) || hasCombatModal()) loseFocus(); };
    const leaveCanvas = () => { pointerActive = false; cameraController.suspendPointer(); firing = false; if (launched) sendInput(); };
    const context = (event: MouseEvent) => event.preventDefault();
    const wheel = (event: WheelEvent) => {
      if (inputBlockedRef.current || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      if (event.shiftKey && readSystemBindings().wheelSelect) { selectNextSystem(engine.playerShip, event.deltaY); return; }
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
    }, LAN_INPUT_INTERVAL_MS);
    const frame = (now: number) => {
      if (disposed) return;
      frameId = requestAnimationFrame(frame);
      // Some browsers still schedule background RAFs; never restore/render an
      // invisible world or repeatedly request resync because its display is stale.
      if (document.visibilityState === "hidden" || !ready || !renderer || !engine) return;
      const gap = Math.max(0, now - lastFrame);
      const dt = Math.min(0.05, gap / 1000);
      frameMs = frameMs * .9 + gap * .1;
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
          if (presentation.reset) cameraController.reset(); // Reconnect baselines must not replay historical jumps.
          const started = performance.now();
          if (presentation.reset) { firePrediction.reset(engine); turretPrediction.reset(); projectileFlight.reset(); }
          applyCombatSnapshots(engine, presentation.frames, presentation.reset, snapshot => {
            // Prediction needs the player pose at EACH restored endpoint, not
            // all acknowledgements against the final world's pose.
            applyRate.receive(performance.now());
            appliedTick = snapshot.tick;
            latest = snapshot;
            if (snapshot.projectileVisuals !== 1) projectileFlight.receive(engine, snapshot.tick, now);
            else projectileFlight.reset();
            localParticles.receive(snapshot.particleEvents, snapshot.world.combatTime);
            firePrediction.receive(engine, snapshot.tick, snapshot.acknowledged[seat], now,
              (presentation.confirmedTime - snapshot.world.combatTime) * 1000);
            turretPrediction.receive(engine, snapshot.tick, snapshot.acknowledged[seat], now);
            combat.apply(engine, snapshot.tick);
            if (!motion.fresh(now, snapshot.tick)) prediction.receive(engine.playerShip, snapshot.acknowledged[seat], now);
          }, { nativeTargeting: true, nativeProjection: true }); // Locally owned native engine + plain network DTO frames.
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
        combat.apply(engine, appliedTick, true); // No repeated per-weapon writes between component arrivals/restores.
        motion.render(engine, now, appliedTick);
        projectileVisuals.render(engine, now, projectileSnapshotTick(engine));
        // The host also renders a snapshot replica; its authority lives in the
        // Worker. Predict only this display pose for every local pilot.
        {
          const p = engine.playerShip;
          const aim = pointerActive ? clientToCombatWorld(pointer, canvas, camera, zoom) : p.aimTargetWorld;
          const nearCollision = engine.capitalShips.some(other => other !== p && !other.isDead && other.pos.distanceTo(p.pos) < p.spec.collisionRadius + other.spec.collisionRadius + 60);
          const row = motion.row(p.id, now, appliedTick);
          // Reset suspended prediction internals without erasing a fresh motion
          // lane pose. Otherwise re-entry reconciles against a pre-collision frame.
          const predict = active() && !nearCollision && !row?.[8];
          if (predict) prediction.render(p,
            { seq, keys, aim: [aim.x, aim.y], firing: false, pointerActive, actions: [] }, now,
            true, row ? motionAuthority(p, row) : p, !!row);
          else prediction.suspend(p, !active() ? 'inactive' : nearCollision ? 'collision' : 'unavailable', !!row && !row[8]);
          turretPrediction.render(engine, { seq, keys, aim: [aim.x, aim.y], firing, pointerActive, actions: [] }, now, active());
        }
        const alpha = presentation.alpha;
        const focusShip = engine.playerShip.isDead
          ? (engine.capitalShips.find(
              (ship) =>
                !ship.isDead && sameTeam(ship, engine.playerShip),
            ) ?? engine.playerShip)
          : engine.playerShip;
        const focus = focusShip.interpolatedPos(alpha);
        cameraController.follow(camera, focus, canvas, zoom, dt, active() && !engine.isTacticalMap, focusShip);
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
        localParticles.update(engine, presentation.visualTime, presentation.reset);
        projectileFlight.render(engine, now, launched && synced && hasCombatInputFocus());
        firePrediction.render(engine, now, active() && now - receivedAt <= 250);
        renderer.updateVisual(combatRenderView(engine), launched ? dt : 0, frameContext);
        if (renderer.render(combatRenderView(engine), alpha, camera, zoom, frameContext)) frameCount++;
        renderMs = renderMs * .9 + (performance.now() - renderStarted) * .1;
        if (now - lastHUD > 100) {
          const p = engine.playerShip,
            e = engine.enemyShip;
          const metrics = authorityPerformance && authorityPerformance.tick >= (latest?.tick ?? -1)
            ? authorityPerformance : latest;
          const metricsFresh = now - Math.max(receivedAt, authorityPerformanceAt) < 2500;
          const renderStats = renderer.getResourceStats();
          const nextHud: HUD = {
            ships: engine.ships.length, projectiles: engine.projectiles.length, explosions: engine.explosions.length,
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
            appliedHz: applyRate.sample(now),
            motionHz: motionRate.sample(now), motionAgeMs: motion.age(now), motionTick: motion.tick < 0 ? null : motion.tick,
            localFlow: authorityPerformance?.io?.enabled && now - authorityPerformanceAt < 2500 ? authorityPerformance.io.flow : localFlow.sample(now),
            pipeline: connection.snapshotPipeline,
            pipelineAgeMs: connection.snapshotPipelineAt === null ? null : Math.max(0, now - connection.snapshotPipelineAt) + connection.snapshotPipelineRoundTripMs,
            capture: metrics?.captureMs ?? 0,
            encode: computesAuthority ? encodeMs : latest?.encodeMs ?? 0,
            parse: parseMs, decodeQueue: decoder?.stats ?? null, apply: applyMs, render: renderMs,
            renderDrawCalls: renderStats.drawCalls, spriteDrawCalls: renderer.batcher.drawCalls, spriteTextureSlots: renderer.batcher.textureCapacity,
            renderCulling: {
              spritesEnabled: import.meta.env.VITE_CULL_SPRITES !== 'false',
              hullOverlaysEnabled: import.meta.env.VITE_CULL_DAMAGE_OVERLAYS !== 'false',
              shipSpritesRejected: renderer.batcher.culledSprites,
              hullOverlaysRejected: renderer.shipPass.culledDamageOverlays,
            },
            gpu: renderStats.gpuTimeMs, fps, frameMs,
            realtimeRatio: metricsFresh ? metrics?.realtimeRatio ?? null : null,
            combatRate: metricsFresh ? metrics?.combatRate ?? null : null,
            authority: authorityPerformance ? { ...authorityPerformance, ageMs: Math.max(0, now - authorityPerformanceAt) } : null,
            multicore: authorityMulticore,
            playbackDelay: presentation.delayMs,
            px: p.pos.x,
            py: p.pos.y,
          };
          diagnosticHud.current = { value: nextHud, at: now };
          setHud(nextHud);
          lastHUD = now;
        }
        if (launched && receivedAt && now - receivedAt > 1200)
          setStatus("等待计算主机更新…");
        else if (launched && now - lastInput < 100) setStatus("战斗进行中");
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e), "frame-loop");
        ready = false;
      }
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      diagnosticInput.current = null;
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
  }, [connection, match, seat, openMenu, computesAuthority, serverAuthority]);
  const returnToRoom = () => {
    if (connection.ready && !ended && !canEndBattle) connection.send({ type: "leave" });
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
      {mapOpen && displayEngine && mapSource && !finished && <TacticalMap onControl={command => command.kind === 'tactical' ? applyTacticalViewCommand(displayEngine, command.command) : { accepted: false, reason: '联机地图不支持此命令。' }} source={mapSource} paused={false} onPausedChange={()=>{}} autopilot={false} onAutopilotChange={()=>{}} readOnlyCommands
        inputBlocked={!!menu||deploymentOpen} cameraPosRef={cameraRef} canvasRef={canvasRef}
        onClosed={()=>{setMapOpen(false);inputBlockedRef.current=!!menu||deploymentOpen;}}
        onOpenDeployment={()=>{clearInputRef.current();inputBlockedRef.current=true;setDeploymentOpen(true);}}
        onRetreat={(ids,full)=>fleetRequestRef.current(full?ids.filter(id=>!controlledIdsRef.current.has(id)||id===displayEngine.playerShip.id):ids,full?'withdraw':'retreat')} />}
      {deploymentOpen && displayEngine && deploymentView && !finished && <FleetDeployment source={deploymentView} team={displayEngine.playerShip.teamId}
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
          <CombatContacts engine={combatHudView(displayEngine)} cameraPosRef={cameraRef} zoomRef={hudZoomRef} canvasRef={canvasRef}
            blocked={!controlsReady || !!menu || finished || mapOpen || deploymentOpen} />
          <div className="hud-console-anchor pointer-events-auto absolute z-20">
            <AuthenticTacticalConsole onActivateSystem={value => actionRef.current('system', value)} onToggleRecall={() => actionRef.current('recall')}
              player={combatHudView(displayEngine).playerShip}
              engine={combatHudView(displayEngine)}
              weaponControls={{
                onSelectGroup: (index) => actionRef.current("group", index),
                onToggleMode: (index) => actionRef.current("mode", index),
                onToggleAutofire: (index) =>
                  actionRef.current("autofire", index),
              }}
            />
          </div>
          <div className="hud-radar-anchor pointer-events-none absolute z-20">
            <CombatRadar engine={combatHudView(displayEngine)} />
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
            · {serverAuthority ? "服务器计算" : seat === 0 ? "主机" : "玩家"}
          </span>
          <span className="lan-battle-teams" aria-label="阵营与舰船数量">{teamPresence.map(row=><span key={row.team} style={{color:teamColor(row.team)}}
            data-team={row.team} data-deployed={row.deployed} data-reserve={row.reserve} data-visible={row.visible}
            title={teamName(row.team)+"：编成 "+row.total+" · 在场 "+row.deployed+" · 可见 "+row.visible+" · 后备 "+row.reserve+" · 损失 "+row.destroyed+" · 撤离 "+row.retreated+"。在场不等于当前镜头内；后备需部署后才显示。"}>
            {teamName(row.team)}{row.team===displayEngine?.playerShip.teamId?"（己方）":""} · 场{row.deployed}/总{row.total}{row.reserve>0?" 待命"+row.reserve:""}
            {(row.missing>0||row.invalidPosition>0||(displayEngine?.openBattlefield&&row.visible<row.deployed))&&" ⚠显示异常"}
          </span>)}</span>
          {hud && <span className="lan-network-quality" data-quality={!controlsReady || hud.age > 1500 ? "syncing" : (hud.rtt ?? 0) > 180 || (hud.acknowledgementMs ?? 0) > 350 || (hud.fps > 0 && hud.fps < Math.min(40, (getGraphicsSettings().maxFrameRate || 60) * .75)) || (hud.realtimeRatio !== null && hud.realtimeRatio < .9) ? "slow" : "good"}
            title={"服务器往返延迟，不含房主计算；输入确认包含服务器转发、主机处理及权威回执返回（关键或完整状态）。低延迟不代表高帧率；打开菜单中的性能与网络诊断查看详情。"}>
            {!controlsReady ? "同步中" : "网络 " + (hud.rtt === null ? "测量中" : Math.round(hud.rtt) + " ms")}
            {" · 画面 " + (hud.fps ? Math.round(hud.fps) + " FPS" : "测量中") + (hud.motionHz === null ? "" : " · 关键 " + hud.motionHz.toFixed(0) + " Hz") + " · 完整 " + (hud.hz === null ? "测量中" : hud.hz.toFixed(0)) + " Hz · 战斗 " + (hud.combatRate === null ? "测量中" : hud.combatRate.toFixed(2) + "×")}
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
              <NativeButton className="combat-pause-button" font="action" align="right" onClick={() => openMenu("settings")}>声音与画面设置</NativeButton>
              <FullscreenButton className="combat-pause-button" font="action" align="right" />
              <NativeButton className="combat-pause-button" font="action" align="right" onClick={downloadNetworkDiagnostics}>导出联机性能日志</NativeButton>
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
                  {canEndBattle ? "结束本局" : "离开对局"}
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
      <MotionPresence>{!finished && menu === "settings" && (
        <Modal title="声音与画面设置" eyebrow="" onClose={closeMenu} footer={<NativeButton onClick={closeMenu}>返回游戏</NativeButton>}>
          <p className="lan-menu-note">仅调整本机声音与画面，不影响队友；联机对局仍在继续。</p>
          <PresentationSettingsPanel/>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{!finished && menu === "help" && (
        <Modal
          title="操纵与联机说明"
          eyebrow=""
          onClose={closeMenu}
          footer={<NativeButton onClick={closeMenu}>返回游戏</NativeButton>}
        >
          <div className="lan-help"><SystemBindingSettings/>
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
              <dd>排幅 / 技能槽 1（默认）；G / H 为技能槽 2 / 3，可改键或点击 HUD</dd>
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
                <kbd>F1</kbd>
              </dt>
              <dd>操纵说明</dd>
            </dl>
            <p className="lan-menu-note">
              可点击控制台切换射击模式和自动开火；Shift+数字切换射击模式，Ctrl+数字切换自动开火。客机短时断线保留
              30 秒，由 AI 临时接管。客机主动离开只退出自己，不能中途加入；房主结束本局会结束全场，刷新计算主机页面无法恢复战斗。
            </p>
            <details>
              <summary>性能与网络诊断</summary>
              <NativeButton onClick={downloadNetworkDiagnostics}>导出联机性能日志</NativeButton>
              <p>自动每秒记录，无需保持此面板打开。桌面端从本次启动到退出保存同一日志，Steam/LAN 切换与重连不会清空，导出为整个桌面会话；普通浏览器仅保留最近约 10 分钟，刷新页面会清空。断线后也可在联机入口或房间导出。</p>
              <SnapshotPipelineDiagnostics pipeline={hud?.pipeline}
                ageMs={hud?.pipelineAgeMs ?? null}
                receivedHz={hud?.hz ?? null} appliedHz={hud?.appliedHz ?? null} local={computesAuthority ? hud?.localFlow : undefined} />
              <LanNetworkDiagnostics transport={connection.lanTransport} />
              <SteamNetworkDiagnostics transport={steamTransport} />
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
              <p>客机仅对自己的舰船做最多 250 ms 的运动显示预测，接近舰船碰撞时停用。武器命中、伤害和胜负始终由{serverAuthority ? "服务器" : "房主"}判定。输入确认时间包含转发、主机处理及关键或完整状态返回，不等于服务器延迟。</p>
              <p>主机物理目标为 60Hz。支持分层同步的桌面局域网客机通过独立通道接收高频舰船运动与输入确认，完整世界低频补全，分别显示关键 Hz、完整 Hz 与画面 FPS。关键运动仅做有界插值/短时外推，不虚构伤害；不支持分层或通道失效时回退完整状态同步。计算、带宽与网络背压仍会限制实际接收频率，不补发重复状态、不伪造 60Hz。短断线先同步战场再恢复操控。切回前台会先重新同步。{serverAuthority ? "服务器持续计算；任一玩家刷新或断线不停止模拟，断线席位保留 30 秒。服务器持续过载或退出会明确结束本局。" : "房主后台暂停最多保留 5 分钟；真正断线仍须在 30 秒内重连。持续过载、主机刷新或页面被浏览器丢弃仍可能结束本局。"}</p>
            </details>
          </div>
        </Modal>
      )}</MotionPresence>
      <MotionPresence>{!finished && menu === "leave" && (
        <Modal
          title={canEndBattle ? "结束本局？" : "离开对局？"}
          eyebrow=""
          width="small"
          onClose={() => openMenu("menu")}
          initialFocus="panel"
          footer={
            <>
              <NativeButton onClick={() => openMenu("menu")}>取消</NativeButton>
              <NativeButton disabled={!connection.ready} onClick={returnToRoom}>
                {canEndBattle ? "结束并返回房间" : "离开对局并退出房间"}
              </NativeButton>
            </>
          }
        >
          <p className="lan-menu-note">
            {canEndBattle
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
