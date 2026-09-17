import { contentRegistry } from '../../content/ContentRegistry';
import { systemWeaponSpec } from './SystemWeaponCatalog';
import { effectiveHullModWeaponSpec } from '../HullMods';
import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../../simulation/Ship';
import type { Projectile } from '../../simulation/Weapon';
import { bindProjectileSource } from '../../simulation/systems/weapon/OutgoingDamage';
import { initializeSourceProjectile } from '../../simulation/systems/weapon/SourceProjectileLifecycle';
import { combatProjectileSpeed, combatWeaponRange } from '../../simulation/WeaponRange';
import type { SystemWorld } from './Types';

/** Fake system weapons use the same source spec/launch modifiers as a normal mounted weapon. */
export function spawnSystemProjectile(ship: Ship, weaponId: string, position: Vector2, angle: number,
  world: SystemWorld, overrides: Partial<Projectile> = {}): Projectile {
  const base = contentRegistry.getWeapon(weaponId) ?? systemWeaponSpec(weaponId);
  if (!base || base.isBeam) throw new Error('Missing projectile system weapon: ' + weaponId);
  if (!world.projectiles) throw new Error('System projectile collection is required');
  const w = base.systemOnly ? base : effectiveHullModWeaponSpec(ship.spec, base);
  const range = base.systemOnly ? base.range : combatWeaponRange(ship, w);
  const mult = ship.crDamageDealtMultiplier * ship.getWeaponDamageMultiplier(w.weaponType);
  const p: Projectile = {
    id: world.combatRandom.next(), sourceShipId: ship.id, isPlayer: ship.isPlayer, teamId: ship.teamId, specId: w.id,
    pos: position.clone(), prevPos: position.clone(), vel: Vector2.fromAngle(angle, w.launchSpeed ?? w.projSpeed).add(ship.vel),
    facingRad: angle, damage: w.damagePerShot * mult, baseDamage: w.damagePerShot, damageType: w.type,
    sourceDamageMultiplier: mult, sourceWeaponType: w.weaponType, spawnLocation: position.clone(),
    empDamage: w.empPerShot, radius: w.projRadius, rangeRemaining: range, totalRange: range, elapsedTime: 0,
    color: w.color, spawnType: w.spawnType, visualSpawnType: w.visualSpawnType, renderTargetIndicator: w.renderTargetIndicator,
    textureType: w.textureType, textureScrollSpeed: w.textureScrollSpeed, fadeTime: w.fadeTime, pixelsPerTexel: w.pixelsPerTexel,
    fringeColor: w.fringeColor, coreColor: w.coreColor, glowColor: w.glowColor, hitGlowRadius: w.hitGlowRadius,
    glowRadius: w.glowRadius, coreWidthMult: w.coreWidthMult, projSpriteUrl: w.projSpriteUrl, projLength: w.projLength, projWidth: w.projWidth,
    isRocket: w.isRocket || w.spawnType === 'MISSILE', isGuided: w.isGuided,
    eccmChance: w.eccmChanceBonus, guidanceBonus: w.missileGuidanceBonus,
    flightTimeRemaining: w.flightTime, maxFlightTime: w.flightTime, armingTimeRemaining: w.armingTime,
    engineAcceleration: w.engineAcceleration, missileDeceleration: w.missileDeceleration,
    maxSpeed: w.maxSpeed ?? w.projSpeed, maxTurnRate: w.maxTurnRate, maxTurnAcceleration: w.maxTurnAcceleration,
    engineFlameColor: w.engineFlameColor, missileEngineVisualSpec: w.missileEngineVisualSpec,
    missileTrailSpec: w.missileTrailSpec, missileExplosionVisualSpec: w.missileExplosionVisualSpec,
    projectileExplosionSpec: w.projectileExplosionSpec, isTwoStage: w.isTwoStage, mirv: w.mirv,
    proximityFuse: w.proximityFuse, hitpoints: w.missileHp, maxHitpoints: w.missileHp,
    onHitEffect: w.onHitEffect, passThroughMissiles: w.passThroughMissiles, passThroughFighters: w.passThroughFighters,
    passThroughFightersOnlyWhenDestroyed: w.passThroughFightersOnlyWhenDestroyed,
  };
  initializeSourceProjectile(p, combatProjectileSpeed(ship, w), ship.vel);
  Object.assign(p, overrides);
  world.projectiles.push(bindProjectileSource(p, ship));
  return p;
}
