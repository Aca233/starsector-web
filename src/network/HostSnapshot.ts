import { HostParticleEvents, hostParticleEvents } from './HostParticleEvents';
import { enableDynamicParticleRecipes } from "../engine/visual/DynamicParticleRecipe";
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { enableExplosionPuffRecipes } from '../engine/visual/ExplosionPuffRecipe';
import { HostMuzzleEvents } from './HostMuzzleEvents';
import { captureCombat } from './CombatSnapshot';
import type { Seat } from './protocol';

/** Shared by the actual host Worker and offline verification. Keep cosmetic
 * setup/capture together so recordings cannot silently bypass muzzle events. */
export function configureHostCosmetics(engine: CombatEngine, compactPuffs = true, compactParticles = false, localParticles = false): HostMuzzleEvents {
  engine.contrailEngine.setEnabled(false);
  if (localParticles && !hostParticleEvents(engine.fxSystem)) new HostParticleEvents(engine.fxSystem);
  if (compactParticles) enableDynamicParticleRecipes(engine.visualRandom);
  if (compactPuffs) enableExplosionPuffRecipes(engine.visualRandom);
  return new HostMuzzleEvents(engine.fxSystem, () => engine.combatTime);
}
export function captureHostCombat(engine: CombatEngine, tick: number, acknowledged: Record<Seat, number>, simulationMs: number,
  muzzleEvents: HostMuzzleEvents | null, compactPuffs = true, compactProjectiles = true, nativeCapture = false, compactParticles = false, packedNumbers = false, components = false) {
  const frame = captureCombat(engine, tick, acknowledged, simulationMs, true, compactPuffs, compactProjectiles, nativeCapture, compactParticles, packedNumbers, components);
  if (muzzleEvents) frame.muzzleEvents = muzzleEvents.snapshot();
  const particles = hostParticleEvents(engine.fxSystem);
  if (particles) frame.particleEvents = particles.snapshot();
  return frame;
}

/** Common authority capture for Steam, LAN, web-relay hosts and the Node adapter.
 * Only use with the locally constructed createLanWorld graph (no Proxies or external
 * accessor instrumentation; component mode owns its write notifications). Binary-enabled callers explicitly request owned
 * packed numbers; JSON-only and generic captures retain the scalar-array shape.
 * Generic/custom callers must continue using captureHostCombat's default path. */
export function captureAuthorityCombat(engine: CombatEngine, tick: number, acknowledged: Record<Seat, number>, simulationMs: number,
  muzzleEvents: HostMuzzleEvents | null, compactParticles = false, packedNumbers = false, components = false) {
  return captureHostCombat(engine, tick, acknowledged, simulationMs, muzzleEvents, true, true, true, compactParticles, packedNumbers, components);
}
