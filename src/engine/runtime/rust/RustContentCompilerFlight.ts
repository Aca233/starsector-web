/** One-time values for flight_owner::StaticShip and its resident ShipMeta. */
import type { Ship } from '../../simulation/Ship';
import type { ShipSpec } from '../../content/ShipSpec';
import { glorianaCraftRole } from '../../content/GlorianaAviation';
import { isArkCraft, isArkInterceptor } from '../../extensions/AdunArkFlight';
import { moduleOffset } from '../../content/ModuleGeometry';
import wingRanges from '../../extensions/native-wing-ranges.json';
import type { SystemModifiers } from '../../extensions/ship-systems/Types';
import { encodeRustCommands, RUST_COMMAND_WIDTH, RustHullSize, type RustBodyHandle,
  type RustCommand, type RustFireSpec, type RustFireQueryMount, type RustLifecycleSpec,
  type RustSystemKind, type RustWorldShipConfig } from './RustCoreProtocol';
import { rustQueryMount, rustWorldSystem } from './RustContentCompilerFields';
import type { RustGeneratedAdmission } from './RustGeneratedAdmission';

export type RustFlightRole = 'ORDINARY' | 'ARK_INTERCEPTOR' | 'ARK_STRIKER' | 'FURY' | 'STARHAWK' | 'THUNDERHAWK';
export interface RustFlightFootprint {
  readonly radius: number; readonly width: number; readonly height: number; readonly pivotX: number; readonly pivotY: number;
  readonly bounds: readonly (readonly [number, number])[];
}
export interface RustFlightCarrierStats {
  readonly rangeMultiplier: number; readonly refitMultiplier: number; readonly rearmFraction: number;
  readonly decreaseMultiplier: number; readonly increasePercent: number; readonly increaseMultiplier: number;
  readonly reserveDeck: boolean; readonly pointDefenseSkill?: number;
}
export interface RustFlightWingSpec {
  readonly template: string; readonly specId: string; readonly role: 'FIGHTER' | 'BOMBER'; readonly tags: readonly string[];
  readonly count: number; readonly rebuildSeconds?: number; readonly range?: number; readonly specialName: boolean;
}
export interface RustFlightStaticShip {
  readonly spawnAdmission: RustGeneratedAdmission;
  readonly carrierSpecKey: string;
  readonly specId: string; readonly footprint: RustFlightFootprint; readonly role: RustFlightRole; readonly hullSize: number;
  readonly flux: readonly number[]; readonly armor: readonly number[]; readonly armorStats: readonly number[];
  readonly shield: { readonly install: readonly number[]; readonly damage: readonly number[]; readonly void?: readonly number[] };
  readonly damagePolicy: readonly number[];
  readonly mounts: readonly { readonly slot: string; readonly generation: number; readonly component: readonly number[];
    readonly install: readonly number[]; readonly minSpread: number;
    /** Encoded by the same authoritative admission as initialize-fire/query. */
    readonly fire: RustFireSpec; readonly query: RustFireQueryMount; readonly systemOnly: boolean;
    readonly maxAmmoPresent: boolean; readonly regenPresent: boolean; readonly guidedSpeed?: number }[];
  readonly groups: readonly { readonly index: number; readonly linked: boolean; readonly automatic: boolean; readonly members: readonly number[] }[];
  readonly selected?: number; readonly weaponPolicy: readonly number[];
  readonly systems: readonly { readonly id: number; readonly spec: number; readonly definition: RustLifecycleSpec;
    readonly defense: boolean; readonly upkeep: readonly number[]; readonly kind: keyof typeof RustSystemKind }[];
  readonly children: readonly { readonly template: string; readonly offset: readonly [number, number]; readonly angle: number;
    readonly independent: boolean; readonly manual: boolean }[];
  readonly engineHealth: number; readonly engines: readonly (readonly number[])[];
  readonly engineMotion: readonly number[]; readonly enginePolicy: readonly number[];
  readonly attrs: readonly number[]; readonly shieldPierced: number; readonly motionFlags: number;
  readonly query: readonly number[]; readonly visible: readonly { readonly team: number; readonly visible: boolean }[];
  readonly readiness: readonly number[]; readonly death: RustWorldShipConfig;
  readonly worldFlags: number; readonly rangeMultiplier: number; readonly side: -1 | 0 | 1; readonly muzzle?: readonly [number, number];
  readonly wings: readonly RustFlightWingSpec[]; readonly bays: number; readonly carrierStats: RustFlightCarrierStats;
  readonly hooks: readonly ({ readonly kind: 'LOCK_SHIELD' } | { readonly kind: 'RUNTIME'; readonly id: string; readonly modifiers: Readonly<SystemModifiers> })[];
  readonly hooksComplete: true;
}
export interface RustFlightShipMeta {
  readonly carrierSpecKey: string;
  readonly id: number; readonly handle: RustBodyHandle; readonly stableId: string; readonly specId: string;
  readonly role: RustFlightRole; readonly footprint: RustFlightFootprint;
  readonly sourceCarrier?: RustBodyHandle;
  readonly module?: { readonly parent: RustBodyHandle; readonly offset: readonly [number, number]; readonly angle: number; readonly independent: boolean };
  readonly wing?: string; readonly deployed: readonly RustBodyHandle[]; readonly recall: boolean;
  readonly wings: readonly RustFlightWingSpec[]; readonly bays: number; readonly carrierStats: RustFlightCarrierStats;
  readonly mounts: readonly { readonly component: number; readonly slot: string; readonly generation: number; readonly systemOnly: boolean;
    readonly maxAmmoPresent: boolean; readonly regenPresent: boolean; readonly guidedSpeed?: number }[];
  readonly engineSlots: readonly (readonly [number, number])[];
}
export function flightRole(ship: Pick<Ship, 'spec'>): RustFlightRole {
  const role = glorianaCraftRole(ship.spec);
  if (role) return ({ fury: 'FURY', starhawk: 'STARHAWK', thunderhawk: 'THUNDERHAWK' } as const)[role];
  return isArkCraft(ship) ? isArkInterceptor(ship) ? 'ARK_INTERCEPTOR' : 'ARK_STRIKER' : 'ORDINARY';
}
function footprint(spec: ShipSpec): RustFlightFootprint {
  return { radius: spec.collisionRadius, width: spec.spriteWidth, height: spec.spriteHeight,
    pivotX: spec.pivotX, pivotY: spec.pivotY, bounds: spec.bounds };
}
function carrierStats(ship: Ship): RustFlightCarrierStats {
  const h = ship.hullStats; return { rangeMultiplier: h.fighterWingRangeMultiplier, refitMultiplier: h.fighterRefitTimeMultiplier,
    rearmFraction: h.fighterRearmTimeFraction, decreaseMultiplier: h.replacementRateDecreaseMultiplier,
    increasePercent: h.replacementRateIncreasePercent, increaseMultiplier: h.replacementRateIncreaseMultiplier,
    reserveDeck: !!h.reserveDeck, pointDefenseSkill: ship.spec.captainSkills?.point_defense || undefined };
}
function wings(ship: Ship, template: (specId: string) => string): RustFlightWingSpec[] {
  return (ship.spec.fighterWings ?? []).map(wing => ({ template: template(wing.specId), specId: wing.specId, role: wing.role,
    tags: wing.tags ?? [], count: wing.count, rebuildSeconds: wing.rebuildSeconds,
    range: wing.range ?? (wingRanges as Record<string, number>)[wing.specId + '#' + wing.count],
    specialName: !!glorianaCraftRole({ id: wing.specId }) || isArkCraft({ spec: { id: wing.specId } as ShipSpec }) }));
}
export function compileRustFlightMeta(ship: Ship, id: number, handle: RustBodyHandle,
  handleOf: (ship: Ship) => RustBodyHandle, template: (specId: string) => string, carrierSpecKey: string): RustFlightShipMeta {
  const m = ship.moduleMount, offset = m ? moduleOffset(m) : undefined;
  return { id, handle, carrierSpecKey, stableId: ship.id, specId: ship.spec.id, role: flightRole(ship), footprint: footprint(ship.spec),
    sourceCarrier: ship.sourceCarrier ? handleOf(ship.sourceCarrier) : undefined,
    module: m && ship.parentShip ? { parent: handleOf(ship.parentShip), offset: [offset!.x, offset!.y],
      angle: m.angleDeg * Math.PI / 180, independent: !!ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION') } : undefined,
    wing: ship.flightDeckWingId, deployed: [...ship.deployedWingCraft].map(handleOf), recall: ship.fighterRecall,
    wings: wings(ship, template), bays: Math.max(0, ship.hullStats.fighterBays), carrierStats: carrierStats(ship),
    mounts: ship.weapons.map((m, i) => ({ component: i + 1, slot: m.slotId, generation: 1, systemOnly: !!m.spec.systemOnly,
      maxAmmoPresent: m.spec.maxAmmo !== undefined, regenPresent: m.spec.ammoRegenPerSec !== undefined,
      guidedSpeed: m.spec.maxSpeed })), engineSlots: ship.spec.engineSlots.map(s => [s.x, s.y]) };
}
/** Decode the public typed encoder only for fixed constructor arrays. Runtime
 * state rows and RNG-dependent trackers are deliberately not retained. */
export function compileRustFlightStatic(ship: Ship, domains: readonly RustCommand[], death: RustWorldShipConfig,
  children: RustFlightStaticShip['children'], visible: RustFlightStaticShip['visible'], template: (specId: string) => string, carrierSpecKey: string, spawnAdmission: RustGeneratedAdmission): RustFlightStaticShip {
  const encoded = encodeRustCommands(domains);
  const rows = Array.from({ length: encoded.length / RUST_COMMAND_WIDTH }, (_, i) =>
    Array.from(encoded.slice(i * RUST_COMMAND_WIDTH, (i + 1) * RUST_COMMAND_WIDTH)));
  const tagged = (tag: number) => rows.filter(row => row[0] === tag).map(row => row.slice(4));
  const one = (tag: number, count: number) => { const row = tagged(tag); if (row.length !== 1) throw Error(ship.spec.id + ': missing static constructor tag ' + tag); return row[0].slice(0, count); };
  const command = <K extends RustCommand['kind']>(kind: K) => {
    const found = domains.find(c => c.kind === kind); if (!found) throw Error(ship.spec.id + ': missing static constructor ' + kind);
    return found as Extract<RustCommand, { kind: K }>;
  };
  const fire = command('initialize-fire'), weapon = command('initialize-weapons'), world = rustWorldSystem(ship, () => ({ slot: 0, generation: 1 }));
  const runtime = ship.runtimeModifiers as unknown as { sources: ReadonlyMap<string, SystemModifiers> };
  const hooks: RustFlightStaticShip['hooks'][number][] = ship.shield.toggleLocked ? [{ kind: 'LOCK_SHIELD' }] : [];
  hooks.push(...[...runtime.sources].map(([id, modifiers]) => ({ kind: 'RUNTIME' as const, id, modifiers })));
  const systemInstalls = tagged(11), upkeep = tagged(20), definitions = domains.filter((c): c is Extract<RustCommand, { kind: 'define-lifecycle' }> => c.kind === 'define-lifecycle');
  return { spawnAdmission, carrierSpecKey, specId: ship.spec.id, footprint: footprint(ship.spec), role: flightRole(ship), hullSize: RustHullSize[ship.spec.hullSize],
    flux: one(5, 17), armor: one(23, 17), armorStats: one(24, 15),
    shield: { install: one(14, 19), damage: one(22, 3), void: tagged(17)[0]?.slice(0, 5) }, damagePolicy: one(38, 8),
    mounts: ship.weapons.map((mount, i) => ({ slot: mount.slotId, generation: 1, component: tagged(27)[i].slice(0, 7),
      install: tagged(42)[i].slice(0, 16), minSpread: mount.spec.minSpread ?? 0, fire: fire.mounts[i], query: rustQueryMount(ship, mount),
      systemOnly: !!mount.spec.systemOnly, maxAmmoPresent: mount.spec.maxAmmo !== undefined,
      regenPresent: mount.spec.ammoRegenPerSec !== undefined, guidedSpeed: mount.spec.maxSpeed })),
    groups: weapon.groups.map(g => ({ index: g.index, linked: g.mode === 'LINKED', automatic: !!g.autofire, members: g.members })),
    selected: weapon.groups.length ? ship.weaponControl.selectedGroupIndex : undefined, weaponPolicy: one(46, 16).slice(1),
    systems: systemInstalls.map((s, i) => ({ id: s[0], spec: s[1], definition: definitions.find(d => d.id === s[1])!.spec,
      defense: s[2] === 1, upkeep: upkeep[i].slice(1, 9), kind: world.systems[i].kind })), children,
    engineHealth: ship.engineHealthMultiplier, engines: tagged(34).map(row => row.slice(0, 10)), engineMotion: one(36, 21), enginePolicy: one(35, 5),
    attrs: one(51, 20), shieldPierced: ship.shieldPiercedMultiplier, motionFlags: 0,
    query: [visible.length, 0, 0, Number(ship.hasVastBulk), Number(ship.spec.sourceHullTraits?.includes('do_not_fire_through') ?? false),
      Number(ship.hasNativeThreatPhaseHooks), ship.hullStats.pdIgnoresFlares, ship.hullStats.autofireAimAccuracy, 1, 1, 0, 1],
    visible, readiness: one(64, 9), death, worldFlags: world.traits, rangeMultiplier: world.rangeMultiplier ?? 1,
    side: world.side ?? 0, muzzle: world.yamatoMuzzle, wings: wings(ship, template), bays: Math.max(0, ship.hullStats.fighterBays),
    carrierStats: carrierStats(ship), hooks, hooksComplete: true };
}
