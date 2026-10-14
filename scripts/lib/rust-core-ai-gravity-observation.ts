import type { Ship } from '../../src/engine/simulation/Ship';
import type { RustBodyHandle } from '../../src/engine/runtime/rust/RustCoreProtocol';
import type { RustWorldSnapshot } from '../../src/engine/runtime/rust/RustWorldProtocol';
import type { GravityTarget } from '../../src/engine/simulation/GravityTractorState';
type Compare = (a: number, b: number, label: string, geometry?: boolean, angular?: boolean) => void;
/** Read the actual numeric witness and compare every dynamic gravity field.
 * Metadata is skipped by its published schema; there is no host state import. */
export function compareAIGravity(world: RustWorldSnapshot | undefined, ships: readonly Ship[], handles: readonly RustBodyHandle[], serials: ReadonlyMap<number, number>, compare: Compare, label: string): number {
  if (!world?.gravity) return 0;
  const gravity = world.gravity, header = gravity.header.values, environments = new Map<string, number>(); let hp = 1;
  const environmentCount = header[hp++]; for (let i = 0; i < environmentCount; i++) { const kind = header[hp++], id = header[hp++], slot = header[hp++]; hp++; environments.set(kind + ':' + slot, id); }
  let fields = 0;
  for (const record of gravity.systems) {
    const v = record.values; let p = 0;
    const n = () => { if (p >= v.length) throw Error('Truncated gravity observation'); return v[p++]; };
    const option = () => n() === 1 ? n() : undefined;
    const string = () => { const count = n(); return String.fromCharCode(...Array.from({ length: count }, n)); };
    const slot = n(), generation = n(), systemId = n(); n(); const type = string();
    const row = handles.findIndex(h => h.slot === slot && h.generation === generation);
    if (row < 0) throw Error('Unknown gravity observation owner');
    const ship = ships[row], system = ship.allSystems[systemId - 1];
    if (!system || system.type !== type) throw Error('Wrong gravity observation system');
    const equal = (a: number, b: number, field: string, geometry = false, angular = false) => { fields++; compare(a, b, `${label} ship${row} gravity${systemId} ${field}`, geometry, angular); };
    const maybe = (actual: number | undefined, expected: number | undefined, field: string, geometry = false) => {
      equal(+!!(actual !== undefined), +!!(expected !== undefined), field + ' presence'); if (actual !== undefined && expected !== undefined) equal(actual, expected, field, geometry);
    };
    const actualTarget = (): GravityTarget => {
      const kind = n(), slot = n(), generation = n();
      if (kind === 0) { const r = handles.findIndex(h => h.slot === slot && h.generation === generation); if (r < 0) throw Error('Unknown gravity ship target'); return { kind: 'SHIP', id: ships[r].id }; }
      if (kind === 1) { const id = [...serials].find(([, serial]) => serial === slot)?.[0]; if (id === undefined || generation !== 1) throw Error('Unknown gravity projectile target'); return { kind: 'PROJECTILE', id }; }
      const id = environments.get(kind + ':' + slot); if (id === undefined || generation !== 1) throw Error('Unknown gravity environment target'); return { kind: kind === 2 ? 'ASTEROID' : 'HULK', id };
    };
    const target = (expected: GravityTarget, field: string) => { const actual = actualTarget(); equal(['SHIP', 'PROJECTILE', 'ASTEROID', 'HULK'].indexOf(actual.kind), ['SHIP', 'PROJECTILE', 'ASTEROID', 'HULK'].indexOf(expected.kind), field + ' kind');
      equal(+(actual.id === expected.id), 1, field + ' identity'); };
    // Actual static field/collapse/auto/maneuver/push metadata schema.
    if (n()) { n(); option(); option(); p += 9; } if (n()) p += 4; if (n()) p += 3; if (n()) p += 6; if (n()) p += 4;
    const input = n(); equal(input, +!!system.activationInput, 'accepted input');
    if (input) { const i = system.activationInput; if (!i) throw Error('Actual input missing');
      [i.point.x, i.point.y, i.origin.x, i.origin.y, i.velocity.x, i.velocity.y, i.facing].forEach((e, k) => equal(n(), e, 'input geometry' + k, true, k === 6));
      const targetPresent = n(); equal(targetPresent, +!!i.target, 'input target presence'); if (targetPresent) { const slot = n(), generation = n(), h = handles[ships.findIndex(s => s === i.target)]; equal(slot, h.slot, 'input target slot'); equal(generation, h.generation, 'input target generation'); }
      maybe(option(), i.gravityAnchorSerial, 'input anchor serial'); }
    const fieldPresent = n(), f = system.gravityField; equal(fieldPresent, +!!f, 'field presence');
    if (fieldPresent) { if (!f) throw Error('Actual field missing'); equal(n(), ['WELL', 'REPULSOR', 'COLLAPSE'].indexOf(f.kind), 'field kind');
      maybe(option(), f.serial, 'field serial'); maybe(option(), f.polarity, 'field polarity'); maybe(option(), f.cursorControlled === undefined ? undefined : +f.cursorControlled, 'field cursor');
      maybe(option(), f.lingerRemaining, 'field linger'); equal(n(), f.x, 'field x', true); equal(n(), f.y, 'field y', true); equal(n(), f.age, 'field age');
      maybe(option(), f.duration, 'field duration'); equal(n(), f.radius, 'field radius'); equal(n(), f.shipBudgetRemaining, 'field ship budget'); equal(n(), f.projectileBudgetRemaining, 'field projectile budget');
      maybe(option(), f.environmentBudgetRemaining, 'field environment budget');
      const shipsHit = n(); equal(shipsHit, f.shipHits.length, 'field ship hit count'); for (let i = 0; i < shipsHit; i++) { const slot = n(), generation = n(), h = handles[ships.findIndex(s => s.id === f.shipHits[i])]; equal(slot, h.slot, 'field ship hit slot'); equal(generation, h.generation, 'field ship hit generation'); }
      const projectilesHit = n(); equal(projectilesHit, f.projectileHits.length, 'field projectile hit count'); for (let i = 0; i < projectilesHit; i++) { equal(n(), serials.get(f.projectileHits[i])!, 'field projectile hit serial'); equal(n(), 1, 'field projectile hit generation'); }
      const environmentPresent = n(); equal(environmentPresent, +(f.environmentHits !== undefined), 'field environment hit presence'); if (environmentPresent) { const count = n(); equal(count, f.environmentHits!.length, 'field environment hit count'); for (let i = 0; i < count; i++) { const [kind, id] = f.environmentHits![i].split(':'); target({ kind, id: Number(id) } as GravityTarget, 'field environment hit'); } }
      const releasesPresent = n(); equal(releasesPresent, +(f.releaseTargets !== undefined), 'field release presence'); if (releasesPresent) { const count = n(); equal(count, f.releaseTargets!.length, 'field release count'); for (let i = 0; i < count; i++) target(f.releaseTargets![i], 'field release'); }
      maybe(option(), f.collapseApplied === undefined ? undefined : +f.collapseApplied, 'field collapsed'); }
    const maneuverPresent = n(), m = system.gravityManeuver; equal(maneuverPresent, +!!m, 'maneuver presence'); if (maneuverPresent) { if (!m) throw Error('Actual maneuver missing'); equal(n(), m.targetAngle, 'maneuver target angle', true, true); equal(n(), m.age, 'maneuver age'); equal(n(), m.turnRemaining, 'maneuver remaining angle', true); }
    const pushPresent = n(), push = system.gravityPush; equal(pushPresent, +!!push, 'push presence'); if (pushPresent) { if (!push) throw Error('Actual push missing'); const present = n(); equal(present, +!!push.target, 'push target presence'); if (present) target(push.target!, 'push target');
      [push.x, push.y, push.radius, push.dx, push.dy, push.age].forEach((e, k) => equal(n(), e, 'push' + k, k < 2 || k === 3 || k === 4)); equal(+(string() === push.status), 1, 'push status'); }
    maybe(option(), system.gravityPolarity, 'owner polarity'); equal(n(), +system.gravityControlHeld, 'held'); equal(p, v.length, 'exact witness width');
  }
  return fields;
}
