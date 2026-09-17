import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Ship } from "../engine/simulation/Ship";
import { Vector2 } from "../engine/math/Vector2";
import type { ShipSpec } from "../engine/content/ShipSpec";
import { validateShipSpec } from "../engine/modding/ContentValidation";
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
  "externalPhaseEffects",
  "deployedWingCraft",
  "lowCRDamageSequence",
]);
type Wire = any;
function pack(value: any, seen = new Set<object>(), refs = new Map<string, Ship>()): Wire {
  if (value === undefined) return { $undefined: 1 };
  if (typeof value === "number" && !Number.isFinite(value))
    return { $number: String(value) };
  if (value === null || typeof value !== "object")
    return typeof value === "function" ? { $undefined: 1 } : value;
  if (value instanceof Ship) { refs.set(value.id, value); return { $ship: value.id }; }
  if (value instanceof Vector2) return { $vector: [value.x, value.y] };
  if (ArrayBuffer.isView(value))
    return { $typed: value.constructor.name, values: Array.from(value as any) };
  if (seen.has(value)) return { $undefined: 1 };
  seen.add(value);
  let result: Wire;
  if (value instanceof Map)
    result = {
      $map: [...value.entries()].map(([k, v]) => [
        pack(k, seen, refs),
        pack(v, seen, refs),
      ]),
    };
  else if (value instanceof Set)
    result = { $set: [...value].map((v) => pack(v, seen, refs)) };
  else if (Array.isArray(value)) result = value.map((v) => pack(v, seen, refs));
  else {
    result = {};
    for (const [k, v] of Object.entries(value))
      if (!SKIP.has(k) && typeof v !== "function") result[k] = pack(v, seen, refs);
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
  deployment?: import("../engine/simulation/CombatDeployment").DeploymentState;
  tick: number;
  acknowledged: Record<Seat, number>;
  ships: Array<{ id: string; state: Wire }>;
  crafts: Array<{ id: string; kind: "fighter" | "bomber" | "drone" | "detached"; spec: number; state: Wire }>;
  craftSpecs: ShipSpec[];
  world: Wire;
  simulationMs: number;
  snapshotHz?: number;
  captureMs?: number;
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
  acknowledged: Record<Seat, number>,
  simulationMs: number,
): CombatSnapshot {
  const world: Record<string, unknown> = {};
  for (const k of WORLD_KEYS) world[k] = engine[k];
  const capitals = new Set(engine.allCapitalShips);
  const refs = new Map(engine.ships.map(ship => [ship.id, ship]));
  const project = (value: unknown) => pack(value, new Set(), refs);
  // A reserve cannot change in simulation. Its frozen match loadout is already present on viewers;
  // avoid resending every inactive weapon/controller/component at snapshot frequency.
  const ships = engine.allCapitalShips.map(ship => ({id:ship.id,state:project(engine.deployment.isReserve(ship.id)
    ? {id:ship.id,teamId:ship.teamId,isPlayer:ship.isPlayer,hullHp:ship.hullHp,currentCR:ship.currentCR,isDead:ship.isDead,isRetreated:ship.isRetreated}
    : {...ship})}));
  const projectedWorld = project(world);
  const craftSpecs: ShipSpec[] = [], specs = new Map<string,number>();
  const crafts: CombatSnapshot['crafts'] = [];
  // Packing a hull/FX may discover a detached craft still referenced by wrecks or launchers.
  for (const ship of refs.values()) {
    if (capitals.has(ship)) continue;
    const signature = JSON.stringify(ship.spec);
    let spec = specs.get(signature);
    if (spec === undefined) {spec=craftSpecs.length;specs.set(signature,spec);craftSpecs.push(ship.spec);}
    const kind = engine.fighters.includes(ship) ? 'fighter' : engine.bombers.includes(ship) ? 'bomber' : engine.droneSystem.drones.includes(ship) ? 'drone' : 'detached';
    crafts.push({id:ship.id,kind,spec,state:project({...ship})});
  }
  return {tick,acknowledged,simulationMs,ships,crafts,craftSpecs,world:projectedWorld, ...(engine.deployment.enabled ? {deployment:engine.deployment.snapshot()} : {})};
}
const displayCrafts = new WeakMap<CombatEngine, Map<string, Ship>>();
const validatedSpecs = new WeakMap<CombatEngine, Set<string>>();
/** Retains existing Ship/component prototypes and static definitions. Never calls fixedUpdate on a guest. */
export function applyCombatSnapshot(
  engine: CombatEngine,
  frame: CombatSnapshot,
) {
  if (
    !frame ||
    !Number.isSafeInteger(frame.tick) ||
    !Array.isArray(frame.ships) ||
    frame.ships.length !== engine.allCapitalShips.length ||
    new Set(frame.ships.map((row) => row.id)).size !== frame.ships.length
  )
    throw Error("Invalid combat snapshot");
  if (!Array.isArray(frame.crafts) || !Array.isArray(frame.craftSpecs))
    throw Error('Invalid dynamic craft snapshot');
  const ships = new Map(engine.allCapitalShips.map((s) => [s.id, s]));
  const previous = displayCrafts.get(engine) ?? new Map([...engine.fighters,...engine.bombers,...engine.droneSystem.drones].map(s=>[s.id,s]));
  const cache = validatedSpecs.get(engine) ?? new Set<string>();
  for (const spec of frame.craftSpecs) {
    const signature=JSON.stringify(spec);
    if (!cache.has(signature)) {
      validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:true});
      if(cache.size>512)cache.clear();
      cache.add(signature);
    }
  }
  validatedSpecs.set(engine,cache);
  const next = new Map<string,Ship>();
  for (const row of frame.crafts) {
    if (typeof row.id !== 'string' || row.id.length > 256 || ships.has(row.id) || !['fighter','bomber','drone','detached'].includes(row.kind) || !Number.isInteger(row.spec) || !frame.craftSpecs[row.spec]) throw Error('Invalid craft identity');
    const spec=frame.craftSpecs[row.spec];
    const carrierId=row.state?.sourceCarrier?.$ship;
    const carrier=carrierId ? ships.get(carrierId) : undefined;
    const ship=previous.get(row.id) ?? new Ship(row.id,spec,!!row.state?.isPlayer,new Vector2(),0,undefined,undefined,carrier);
    ships.set(row.id,ship);next.set(row.id,ship);
  }
  const fighters:Ship[]=[], bombers:Ship[]=[], drones:Ship[]=[];
  for (const row of frame.crafts) {
    const ship=ships.get(row.id)!;
    if(row.kind==='fighter')fighters.push(ship);
    if(row.kind==='bomber')bombers.push(ship);
    if(row.kind==='drone')drones.push(ship);
  }
  engine.fighters.splice(0,engine.fighters.length,...fighters);
  engine.bombers.splice(0,engine.bombers.length,...bombers);
  engine.droneSystem.drones.splice(0,engine.droneSystem.drones.length,...drones);
  displayCrafts.set(engine,next);
  for (const row of [...frame.ships,...frame.crafts]) {
    const ship = ships.get(row.id);
    if (!ship) throw Error("Unknown ship");
    const wasReserve=engine.deployment.isReserve(ship.id);
    const pos = ship.pos.clone(),
      angle = ship.facingRad;
    unpack(row.state, ship, ships);
    ship.prevPos = wasReserve ? ship.pos.clone() : pos;
    ship.prevFacingRad = wasReserve ? ship.facingRad : angle;
  }
  // Only permit presentation fields, never methods or subsystem ownership from the wire.
  for (const key of WORLD_KEYS)
    if (Object.hasOwn(frame.world, key))
      (engine as any)[key] = unpack(frame.world[key], engine[key], ships);
  if (engine.deployment.enabled) { if (!frame.deployment) throw Error("Missing deployment snapshot"); engine.deployment.applySnapshot(frame.deployment); }
  for (const ship of ships.values()) {
    ship.combatShips = engine.ships;
    ship.currentTargetShip = ship.fireControlMode === 'MANUAL'
      ? ships.get(ship.playerTargetId ?? '') ?? null : engine.findHostile(ship) ?? null;
  }
}
