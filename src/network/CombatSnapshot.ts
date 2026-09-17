import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Ship } from "../engine/simulation/Ship";
import { Vector2 } from "../engine/math/Vector2";
import type { Seat } from "./protocol";

/** P1 presentation projection, NOT a resumable simulation checkpoint. Static specs and executable hooks remain local. */
const SKIP = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "spec",
  "definition",
  "hullStats",
  "random",
  "visualRandom",
  "autofire",
  "combatShips",
  "currentTargetShip",
  "tacticalAI",
  "fireControlWorld",
  "statusEffects",
  "damageTakenModifiers",
  "lowCRDamageSequence",
]);
type Wire = any;
function pack(value: any, seen = new Set<object>()): Wire {
  if (value === undefined) return { $undefined: 1 };
  if (typeof value === "number" && !Number.isFinite(value))
    return { $number: String(value) };
  if (value === null || typeof value !== "object")
    return typeof value === "function" ? { $undefined: 1 } : value;
  if (value instanceof Ship) return { $ship: value.id };
  if (value instanceof Vector2) return { $vector: [value.x, value.y] };
  if (ArrayBuffer.isView(value))
    return { $typed: value.constructor.name, values: Array.from(value as any) };
  if (seen.has(value)) return { $undefined: 1 };
  seen.add(value);
  let result: Wire;
  if (value instanceof Map)
    result = {
      $map: [...value.entries()].map(([k, v]) => [
        pack(k, seen),
        pack(v, seen),
      ]),
    };
  else if (value instanceof Set)
    result = { $set: [...value].map((v) => pack(v, seen)) };
  else if (Array.isArray(value)) result = value.map((v) => pack(v, seen));
  else {
    result = {};
    for (const [k, v] of Object.entries(value))
      if (!SKIP.has(k) && typeof v !== "function") result[k] = pack(v, seen);
  }
  seen.delete(value);
  return result;
}
const typed: Record<string, any> = {
  Float32Array,
  Float64Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
};
function unpack(
  value: Wire,
  target: any,
  ships: Map<string, Ship>,
  depth = 0,
): any {
  if (depth > 64) throw Error("Snapshot nesting exceeds limit");
  if (value === null || typeof value !== "object") return value;
  if (value.$undefined) return undefined;
  if (value.$ship) {
    const ship = ships.get(value.$ship);
    if (!ship) throw Error("Unknown snapshot ship");
    return ship;
  }
  if (value.$vector) {
    if (
      !Array.isArray(value.$vector) ||
      value.$vector.length !== 2 ||
      !value.$vector.every(Number.isFinite)
    )
      throw Error("Invalid vector");
    return new Vector2(value.$vector[0], value.$vector[1]);
  }
  if (value.$number)
    return value.$number === "Infinity"
      ? Infinity
      : value.$number === "-Infinity"
        ? -Infinity
        : NaN;
  if (value.$typed) {
    if (!Object.hasOwn(typed, value.$typed) || !Array.isArray(value.values))
      throw Error("Invalid typed array");
    return new typed[value.$typed](value.values);
  }
  if (value.$map)
    return new Map(
      value.$map.map(([k, v]: any[]) => [
        unpack(k, undefined, ships, depth + 1),
        unpack(v, undefined, ships, depth + 1),
      ]),
    );
  if (value.$set)
    return new Set(
      value.$set.map((v: any) => unpack(v, undefined, ships, depth + 1)),
    );
  if (Array.isArray(value))
    return value.map((v, i) =>
      unpack(
        v,
        Array.isArray(target) ? target[i] : undefined,
        ships,
        depth + 1,
      ),
    );
  const output =
    target && typeof target === "object" && !Array.isArray(target)
      ? target
      : {};
  for (const [k, v] of Object.entries(value))
    if (!SKIP.has(k)) output[k] = unpack(v, output[k], ships, depth + 1);
  return output;
}
export interface CombatSound {
  id: number;
  key: string;
  volume: number;
  rate: number;
  pos?: [number, number];
}
export interface CombatSnapshot {
  sounds?: CombatSound[];
  tick: number;
  acknowledged: [number, number];
  ships: Array<{ id: string; state: Wire }>;
  world: Wire;
  simulationMs: number;
}
const WORLD_KEYS = [
  "combatTime",
  "cameraShakeIntensity",
  "battleResult",
  "environment",
  "projectiles",
  "beams",
  "fxSystem",
  "contrailEngine",
  "asteroidSystem",
  "nebulaSystem",
  "mineSystem",
] as const;
export function captureCombat(
  engine: CombatEngine,
  tick: number,
  acknowledged: [number, number],
  simulationMs: number,
): CombatSnapshot {
  const world: Record<string, unknown> = {};
  for (const k of WORLD_KEYS) world[k] = engine[k];
  return {
    tick,
    acknowledged,
    simulationMs,
    ships: engine.capitalShips.map((ship) => ({
      id: ship.id,
      state: pack({ ...ship }),
    })),
    world: pack(world),
  };
}
/** Retains existing Ship/component prototypes and static definitions. Never calls fixedUpdate on a guest. */
export function applyCombatSnapshot(
  engine: CombatEngine,
  frame: CombatSnapshot,
  seat: Seat,
) {
  if (
    !frame ||
    !Number.isSafeInteger(frame.tick) ||
    !Array.isArray(frame.ships) ||
    frame.ships.length !== 2
  )
    throw Error("Invalid combat snapshot");
  const ships = new Map(engine.capitalShips.map((s) => [s.id, s]));
  for (const row of frame.ships) {
    const ship = ships.get(row.id);
    if (!ship) throw Error("Unknown ship");
    const pos = ship.pos.clone(),
      angle = ship.facingRad;
    unpack(row.state, ship, ships);
    ship.prevPos = pos;
    ship.prevFacingRad = angle;
  }
  // Only permit presentation fields, never methods or subsystem ownership from the wire.
  for (const key of WORLD_KEYS)
    if (Object.hasOwn(frame.world, key))
      (engine as any)[key] = unpack(frame.world[key], engine[key], ships);
  const host = ships.get("player_ship")!,
    guest = ships.get("enemy_ship")!;
  engine.playerShip = seat === 0 ? host : guest;
  engine.enemyShip = seat === 0 ? guest : host;
  host.currentTargetShip = guest;
  guest.currentTargetShip = host;
}
