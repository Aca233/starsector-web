import { systemWeaponSpec } from '../extensions/ship-systems/SystemWeaponCatalog';
import { resolveSystemId, shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import { weaponEffects } from '../extensions/weapon-effects/Registry';
import { installedHullMods } from '../extensions/HullMods';
import type { ExtensionResources } from '../extensions/Dependencies';
import { DEBRIS_TEXTURES } from './CombatFXAssets';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from '../content/ShipSpec';
import { contentRegistry } from '../content/ContentRegistry';
import { ESSENTIAL_TEXTURE_URLS } from '../render/TextureCache';

const WEAPON_TEXTURE_FIELDS = [
  'turretSpriteUrl', 'turretGunSpriteUrl', 'hardpointSpriteUrl', 'hardpointGunSpriteUrl',
  'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'projSpriteUrl'
] as const satisfies readonly (keyof WeaponSpec)[];

/** Include current combatants, their equipment, and craft that can be rebuilt. */
export function collectCombatTextureUrls(engine: CombatEngine): string[] {
  const urls = new Set<string>(ESSENTIAL_TEXTURE_URLS);
  // Future impacts may choose any shard, even when no debris exists at prepare time.
  for (const variants of Object.values(DEBRIS_TEXTURES)) for (const path of variants) urls.add('/game-assets/' + path);
  for (const shard of engine.debris) if (shard.spriteUrl) urls.add('/game-assets/' + shard.spriteUrl);
  if (engine.environment.backgroundUrl) urls.add(engine.environment.backgroundUrl);
  const visitedHulls = new Set<string>(), visitedWeapons = new Set<string>();
  const addResources = (resources?: ExtensionResources) => {
    for (const url of resources?.textures ?? []) urls.add(url);
    for (const id of resources?.ships ?? []) {
      if (visitedHulls.has(id)) continue;
      visitedHulls.add(id);
      const spec = contentRegistry.getShip(id);
      if (!spec) throw new Error('Unknown extension craft: '+id);
      addHull(spec);
      for (const slot of spec.weaponSlots) if (slot.defaultWeaponId) {
        const weapon = contentRegistry.getWeapon(slot.defaultWeaponId);
        if (weapon) addWeapon(weapon);
      }
    }
    for (const id of resources?.weapons ?? []) {
      const weapon = contentRegistry.getWeapon(id) ?? systemWeaponSpec(id);
      if (!weapon) throw new Error('Unknown extension weapon: '+id);
      addWeapon(weapon);
    }
  };
  const addWeapon = (spec: WeaponSpec) => {
    if (visitedWeapons.has(spec.id)) return;
    visitedWeapons.add(spec.id);
    for (const field of WEAPON_TEXTURE_FIELDS) if (spec[field]) urls.add(spec[field]);
    for (const id of [spec.beamEffect,spec.onHitEffect,spec.everyFrameEffect,spec.mirv?.childProjectile.onHitEffect]) if (id) addResources(weaponEffects.require(id).resources);
    const child = spec.mirv?.childProjectile;
    if (child) for (const field of WEAPON_TEXTURE_FIELDS) if (child[field]) urls.add(child[field]);
  };
  const addHull = (spec: ShipSpec) => {
    // Runtime refits can share an id but differ in systems; visit their resources before deduping artwork.
    for (const decoration of spec.decorativeWeapons ?? []) urls.add(decoration.spriteUrl);
    for (const id of [spec.systemType, spec.defenseSystemType ?? 'NONE']) addResources(shipSystemDefinitions.require(resolveSystemId(id)).resources);
    for (const mod of installedHullMods(spec)) addResources(mod.resources);
    urls.add(spec.spriteUrl);
    if (spec.phaseHighlightSpriteUrl) urls.add(spec.phaseHighlightSpriteUrl);
    if (spec.phaseDiffuseSpriteUrl) urls.add(spec.phaseDiffuseSpriteUrl);
  };
  for (const ship of new Set([...engine.allCapitalShips, ...engine.ships])) {
    for (const wing of ship.spec.fighterWings ?? []) addResources({ ships: [wing.specId] });
    addHull(ship.spec);
    for (const mount of ship.weapons) addWeapon(mount.spec);
  }
  for (const wing of [...engine.playerWings, ...engine.enemyWings]) {
    const spec = contentRegistry.getShip(wing.specId);
    if (!spec) throw new Error(`Unknown flight deck craft: ${wing.specId}`);
    addHull(spec);
    for (const slot of spec.weaponSlots) {
      const weapon = slot.defaultWeaponId && contentRegistry.getWeapon(slot.defaultWeaponId);
      if (weapon) addWeapon(weapon);
    }
  }
  for (const { sourceShip } of engine.hulkFragments) {
    addHull(sourceShip.spec);
    for (const mount of sourceShip.weapons) addWeapon(mount.spec);
  }
  for (const projectile of engine.projectiles) if (projectile.projSpriteUrl) urls.add(projectile.projSpriteUrl);
  for (const nebula of engine.nebulae) urls.add(nebula.spriteUrl);
  for (const asteroid of engine.asteroids) urls.add(asteroid.spriteUrl);
  return [...urls];
}
