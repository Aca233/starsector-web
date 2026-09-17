import { complexitySnapshotHz, HostRecoveryBudget } from "./SnapshotPolicy";
import { captureBattleReport } from "./CaptureBattleReport";
import { createLanWorld } from "./LanWorld";
import type { Ship } from "../engine/simulation/Ship";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Vector2 } from "../engine/math/Vector2";
import { applyPlayerControls } from "../engine/runtime/PlayerControls";
import { DEFAULT_MOUSE_STEERING } from "../engine/runtime/CombatControlSettings";
import { dispatchShipCommand } from "../engine/runtime/CombatCommands";
import { sound } from "../engine/audio/SoundManager";
import type { CombatSound } from "./CombatSnapshot";
import { captureCombat } from "./CombatSnapshot";
import { blankInput, KEY_CODES } from "./protocol";
import type { Match, PlayerInput, Seat, Action } from "./protocol";

let controlled = new Map<Seat, Ship>();
interface Controls {
  input: PlayerInput;
  received: number;
  acknowledged: number;
  lastAction: number;
  queued: Action[];
  online: boolean;
}
const controls = new Map<Seat, Controls>();
const deploymentReplies = new Map<string, Record<string, unknown>>();
let snapshotEvery = 3, networkHz = 20, captureMs = 0;
const recoveryBudget = new HostRecoveryBudget();
let engine: CombatEngine | null = null,
  tick = 0,
  running = false,
  last = 0,
  accumulator = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let elapsedCost = 0,
  samples = 0,
  soundId = 0;
const sounds: CombatSound[] = [];
const queueSound = (
  key: string,
  volume: number,
  rate: number,
  pos?: [number, number],
) => {
  if (sounds.length < 64)
    sounds.push({ id: ++soundId, key, volume, rate, pos });
};
// Worker emits data-only one-shot events; each client plays them at its own listener position.
sound.play = (key, volume = 0.8, rate = 1) => {
  queueSound(key, volume, rate);
};
sound.playAtPos = (key, pos, _listener, volume = 0.8, rate = 1) => {
  queueSound(key, volume, rate, [pos.x, pos.y]);
};
const send = (message: unknown) => self.postMessage(message);
let lastSnapshotTick = -1;
function snapshot() {
  if (tick === lastSnapshotTick) return;
  lastSnapshotTick = tick;
  if (engine) {
    const started = performance.now();
    const hz = Math.min(networkHz, complexitySnapshotHz(engine.capitalShips.filter(ship => !ship.isDead).length, engine.ships.length - engine.capitalShips.length, captureMs));
    snapshotEvery = 60 / hz;
    const frame = captureCombat(
      engine,
      tick,
      Object.fromEntries(
        [...controls].map(([seat, state]) => [seat, state.acknowledged]),
      ),
      samples ? elapsedCost / samples : 0,
    );
    captureMs = captureMs * .7 + (performance.now() - started) * .3;
    frame.snapshotHz = 60 / snapshotEvery;
    frame.captureMs = captureMs;
    frame.sounds = sounds.splice(0);
    send({ type: "snapshot", frame });
  }
  elapsedCost = 0;
  samples = 0;
}
function fail(error: unknown) {
  running = false;
  if (timer) clearInterval(timer);
  send({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
function recover(now: number, pauseMs: number) {
  if (!recoveryBudget.allow(now, pauseMs)) throw Error("计算主机持续过载或暂停过久，恢复失败。请降低战斗规模后重试。");
  accumulator = 0;
  sounds.length = 0;
  for (const [seat, state] of controls) {
    state.lastAction = Math.max(state.lastAction, ...state.queued.map(action => action.id));
    state.input = { ...state.input, keys: 0, firing: false, pointerActive: false, actions: [] };
    state.queued = [];
    state.received = 0;
    state.online = false;
    const ship = controlled.get(seat);
    if (ship) { ship.clearInput(); engine?.externallyControlledShipIds.delete(ship.id); }
  }
  send({ type: "recovered", pauseMs: Math.round(pauseMs) });
}
function step() {
  if (!running || !engine) return;
  const now = performance.now(),
    elapsed = now - last;
  last = now;
  let steps = 0;
  try {
    if (elapsed > 1000) recover(now, elapsed);
    else accumulator += elapsed;
    while (accumulator >= 1000 / 60 && steps < 6) {
      const start = performance.now();
      for (const [seat, ship] of controlled) {
        const state = controls.get(seat)!;
        if (!state.online) continue;
        const fresh = now - state.received < 500,
          input = state.input;
        const keys: Record<string, boolean> = {};
        KEY_CODES.forEach((key, bit) => {
          keys[key] = fresh && !!(input.keys & (1 << bit));
        });
        applyPlayerControls(
          ship,
          keys,
          new Vector2(...input.aim),
          fresh && input.firing,
          DEFAULT_MOUSE_STEERING,
          fresh && input.pointerActive,
        );
        const queued = state.queued.splice(0);
        for (const action of queued) {
          if (action.id <= state.lastAction) continue;
          state.lastAction = action.id;
          if (!fresh) continue; // Expired edge commands must not fire after recovery.
          if (action.kind === 'group' || action.kind === 'mode' || action.kind === 'autofire') {
            dispatchShipCommand(ship, { kind: action.kind, value: action.value ?? 0 }, action.aim ? new Vector2(...action.aim) : undefined);
          } else dispatchShipCommand(ship, { kind: action.kind }, action.aim ? new Vector2(...action.aim) : undefined, engine.ships);
        }
        state.acknowledged = input.seq;
      }
      engine.fixedUpdate(1 / 60);
      tick++;
      accumulator -= 1000 / 60;
      steps++;
      elapsedCost += performance.now() - start;
      samples++;
      if (tick % snapshotEvery === 0) snapshot();
      if (engine.isBattleResultReady) {
        snapshot();
        send({
          type: "finished",
          winner: engine.winningTeam ?? "draw",
          report: captureBattleReport(engine, controlled, tick),
        });
        running = false;
        break;
      }
    }
    // Bounded catch-up: do not accumulate minutes of stale simulation after a slow host.
    if (accumulator > 250) recover(performance.now(), accumulator);
  } catch (error) {
    fail(error);
  }
}
self.onmessage = (event: MessageEvent) => {
  try {
    const m = event.data;
    if (m.type === "init") {
      const match = m.match as Match;
      const world = createLanWorld(match);
      engine = world.engine;
      controlled = world.controlled;
      snapshotEvery = 60 / match.snapshotHz;
      controls.clear();
      deploymentReplies.clear();
      for (const [seat, ship] of controlled) {
        engine.externallyControlledShipIds.delete(ship.id);
        controls.set(seat, {
          input: blankInput(),
          received: performance.now(),
          acknowledged: 0,
          lastAction: -1,
          queued: [],
          online: false,
        });
      }
      tick = 0;
      lastSnapshotTick = -1;
      snapshot();
      send({ type: "ready" });
    } else if (m.type === "deployment" && engine) {
      const key=m.seat+":"+m.requestId, cached=deploymentReplies.get(key);
      if(cached){send(cached);return;}
      const response:Record<string,unknown>={type:"deployment-result",seat:m.seat,requestId:m.requestId,ok:false};
      try{
        const ship=controlled.get(m.seat), control=controls.get(m.seat);
        if(!running||!ship||!control?.online)throw Error("当前玩家不能部署。");
        if(!Array.isArray(m.ids)||m.ids.length>128||m.ids.some((id:unknown)=>typeof id!=="string"))throw Error("无效舰船名单。");
        if(m.operation==='deploy')engine.deployment.deploy(m.ids,ship.teamId);
        else if(m.operation==='retreat'||m.operation==='withdraw'){
          if(m.ids.some((id:string)=>[...controlled].some(([seat,other])=>seat!==m.seat&&other.id===id)))throw Error("不能替其他真人玩家下达撤退。");
          engine.deployment.requestRetreat(m.ids,ship.teamId,m.operation==='withdraw');
        } else throw Error("未知舰队操作。");
        response.ok=true;
      }catch(error){response.message=error instanceof Error?error.message:String(error);}
      deploymentReplies.set(key,response);if(deploymentReplies.size>128)deploymentReplies.delete(deploymentReplies.keys().next().value!);
      send(response);
    } else if (m.type === "network-budget") {
      if ([2, 5, 10, 20].includes(m.hz)) networkHz = m.hz;
    } else if (m.type === "presence" && engine) {
      const state = controls.get(m.seat),
        ship = controlled.get(m.seat);
      if (!state || !ship || state.online === !!m.online) return;
      state.online = !!m.online;
      state.input = { ...state.input, keys: 0, firing: false, pointerActive: false, actions: [] };
      state.queued = [];
      state.received = 0;
      if (state.online) engine.externallyControlledShipIds.add(ship.id);
      else engine.externallyControlledShipIds.delete(ship.id);
    } else if (m.type === "input") {
      const state = controls.get(m.seat);
      if (!state || !state.online) return;
      const input = m.input as PlayerInput;
      if (input.seq <= state.input.seq) return;
      if (state.queued.length + input.actions.length > 64)
        throw Error("输入事件积压过多");
      state.input = input;
      state.received = performance.now();
      state.queued.push(...input.actions);
    } else if (m.type === "start" && engine && !running) {
      running = true;
      last = performance.now();
      accumulator = 0;
      timer = setInterval(step, 4);
    } else if (m.type === "stop") {
      running = false;
      if (timer) clearInterval(timer);
    }
  } catch (error) {
    fail(error);
  }
};
