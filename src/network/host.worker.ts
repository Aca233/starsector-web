import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Vector2 } from "../engine/math/Vector2";
import { applyPlayerControls } from "../engine/runtime/PlayerControls";
import { sound } from "../engine/audio/SoundManager";
import type { CombatSound } from "./CombatSnapshot";
import { captureCombat } from "./CombatSnapshot";
import { blankInput, KEY_CODES } from "./protocol";
import type { Match, PlayerInput, Seat, Action } from "./protocol";

let engine: CombatEngine | null = null,
  tick = 0,
  running = false,
  last = 0,
  accumulator = 0;
let inputs: [PlayerInput, PlayerInput] = [blankInput(), blankInput()];
let received = [0, 0],
  acknowledged: [number, number] = [0, 0],
  lastActions = [-1, -1];
let queued: [Action[], Action[]] = [[], []];
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
function snapshot() {
  if (engine) {
    const frame = captureCombat(
      engine,
      tick,
      [...acknowledged],
      samples ? elapsedCost / samples : 0,
    );
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
function step() {
  if (!running || !engine) return;
  const now = performance.now(),
    elapsed = now - last;
  last = now;
  if (elapsed > 1000) {
    fail(Error("计算主机暂停超过 1 秒，请重新开始对局。"));
    return;
  }
  accumulator += elapsed;
  let steps = 0;
  try {
    while (accumulator >= 1000 / 60 && steps < 6) {
      const start = performance.now();
      for (const seat of [0, 1] as Seat[]) {
        const ship = seat === 0 ? engine.playerShip : engine.enemyShip;
        const fresh = now - received[seat] < 500,
          input = inputs[seat];
        const keys: Record<string, boolean> = {};
        KEY_CODES.forEach((key, bit) => {
          keys[key] = fresh && !!(input.keys & (1 << bit));
        });
        applyPlayerControls(
          ship,
          keys,
          new Vector2(...input.aim),
          fresh && input.firing,
        );
        for (const action of queued[seat].splice(0)) {
          if (action.id <= lastActions[seat]) continue;
          lastActions[seat] = action.id;
          if (ship.isDead) continue;
          if (action.kind === "shield" && ship.canUseShields())
            ship.shield.toggle();
          if (action.kind === "vent") ship.startVenting();
          if (action.kind === "system") ship.system.activate();
          if (action.kind === "group")
            ship.selectWeaponGroup(action.value ?? 0);
        }
        acknowledged[seat] = input.seq;
      }
      engine.fixedUpdate(1 / 60);
      tick++;
      accumulator -= 1000 / 60;
      steps++;
      elapsedCost += performance.now() - start;
      samples++;
      if (tick % 3 === 0) snapshot();
      if (engine.isBattleResultReady) {
        snapshot();
        send({
          type: "finished",
          winner:
            engine.playerShip.isDead && engine.enemyShip.isDead
              ? "draw"
              : engine.battleResult?.isVictory
                ? "host"
                : "guest",
        });
        running = false;
        break;
      }
    }
    // Bounded catch-up: do not accumulate minutes of stale simulation after a slow host.
    if (accumulator > 250)
      throw Error("计算主机无法跟上战斗模拟，本局已停止。");
  } catch (error) {
    fail(error);
  }
}
self.onmessage = (event: MessageEvent) => {
  try {
    const m = event.data;
    if (m.type === "init") {
      const match = m.match as Match;
      engine = new CombatEngine(match.hulls[0], match.hulls[1], match.seed);
      engine.externallyControlledShipIds.add(engine.playerShip.id);
      engine.externallyControlledShipIds.add(engine.enemyShip.id);
      inputs = [blankInput(), blankInput()];
      acknowledged = [0, 0];
      received = [performance.now(), performance.now()];
      queued = [[], []];
      lastActions = [-1, -1];
      tick = 0;
      snapshot();
      send({ type: "ready" });
    } else if (m.type === "input") {
      const seat = m.seat as Seat;
      if (seat !== 0 && seat !== 1) return;
      const input = m.input as PlayerInput;
      if (input.seq <= inputs[seat].seq) return;
      if (queued[seat].length + input.actions.length > 64)
        throw Error("输入事件积压过多");
      inputs[seat] = input;
      received[seat] = performance.now();
      queued[seat].push(...input.actions);
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
