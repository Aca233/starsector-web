import { sameTeam } from "../simulation/CombatTeams";
import type { Ship } from '../simulation/Ship';
import { Vector2 } from '../math/Vector2';
import type { SystemWorld } from './ship-systems/Types';
import type { NativeMineWeapon } from './NativeMines';
interface IncomingMine { point: Vector2; target: Ship; delay: number }
interface Minefield { source: Ship; weapon: NativeMineWeapon; remaining: number; incoming: IncomingMine[] }
const fields = new WeakMap<object, Minefield>();
const eligible = (ship: Ship) => !ship.isAttachedModule && ship.spec.hullSize !== 'FIGHTER' && !ship.isSystemDrone
  && !(ship.spec.sourceHullTraits ?? []).some(h => h === 'DRONE' || h === 'STATION' || h === 'STATION_MODULE');
/** StealthMinefield/StealthMinefieldLT: one shared source across both teams/variants. */
export function advanceStealthMinefield(ship: Ship, dt: number, world: SystemWorld): void {
  if (!(dt > 0) || !world.combatScope || !world.spawnNativeMine) return;
  let field = fields.get(world.combatScope);
  if (!field) {
    const lowTech = [...(ship.spec.builtInHullMods ?? []), ...(ship.spec.hullMods ?? [])].includes('stealth_minefield_lt');
    field = { source: ship, weapon: lowTech ? 'minelayer1' : 'minelayer2', remaining: .5 + world.combatRandom.next(), incoming: [] };
    fields.set(world.combatScope, field);
  }
  if (field.source !== ship || ship.isDead || ship.isDocked || ship.isRetreated || ship.hullHp <= 0) return;
  for (let i = field.incoming.length - 1; i >= 0; i--) {
    const incoming = field.incoming[i]; incoming.delay -= dt;
    if (incoming.delay > 0) continue;
    const position = incoming.point.clone().add(Vector2.fromAngle(world.combatRandom.next() * Math.PI * 2, 50 + world.combatRandom.next() * 50));
    world.spawnNativeMine(position, ship, field.weapon, incoming.target);
    field.incoming.splice(i, 1);
  }
  field.remaining -= dt;
  if (field.remaining > 0) return;
  field.remaining += .5 + world.combatRandom.next();
  const candidates: IncomingMine[] = [];
  for (const enemy of world.ships) {
    if (enemy === ship || enemy.isDead || enemy.hullHp <= 0 || enemy.isDocked || enemy.isRetreated || sameTeam(enemy, ship) || !eligible(enemy)) continue;
    if (enemy.allSystems.some(system => system.definition.sourceIds.includes('traveldrive') && system.isActive)) continue;
    if (world.combatRandom.next() > .25) continue;
    const radius = enemy.spec.collisionRadius + 400;
    const point = enemy.pos.clone().add(Vector2.fromAngle(world.combatRandom.next() * Math.PI * 2, radius + 200 * world.combatRandom.next()));
    // Native clearance tests centers, not the radius of every other hull.
    if (world.ships.some(other => other.spec.hullSize !== 'FIGHTER' && !other.isSystemDrone && !(other.spec.sourceHullTraits ?? []).includes('DRONE') && point.distanceTo(other.pos) < radius)) continue;
    if ((world.asteroids ?? []).some(a => point.distanceTo(a.pos) < a.radius + 100)) continue;
    candidates.push({ point, target: enemy, delay: world.combatRandom.next() * 1.5 });
  }
  const count = Math.min(5 + Math.floor(world.combatRandom.next() * 6), candidates.length);
  for (let i = 0; i < count; i++) {
    const index = Math.floor(world.combatRandom.next() * candidates.length);
    field.incoming.push(candidates.splice(index, 1)[0]);
  }
}
