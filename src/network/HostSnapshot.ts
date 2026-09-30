import { HostParticleEvents, hostParticleEvents } from './HostParticleEvents';
import { enableDynamicParticleRecipes } from "../engine/visual/DynamicParticleRecipe";
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { enableExplosionPuffRecipes } from '../engine/visual/ExplosionPuffRecipe';
import { HostMuzzleEvents } from './HostMuzzleEvents';
import { captureCombat } from './AuthorityCombatSnapshot';
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
  muzzleEvents: HostMuzzleEvents | null, compactPuffs = true, compactProjectiles = true, nativeCapture = false, compactParticles = false, packedNumbers = false, components = false, fixedDisplay = false, recordDeltas = false, weaponPresentation = false, renderDamageMarks = false) {
  const frame = captureCombat(engine, tick, acknowledged, simulationMs, true, compactPuffs, compactProjectiles, nativeCapture, compactParticles, packedNumbers, components, fixedDisplay, recordDeltas, weaponPresentation, renderDamageMarks);
  if (muzzleEvents) frame.muzzleEvents = muzzleEvents.snapshot();
  const particles = hostParticleEvents(engine.fxSystem);
  if (particles) frame.particleEvents = particles.snapshot();
  return frame;
}

/** Legacy authority/encoding diagnostic capture. Production hosts use captureLanDisplayCombat.
 * Only use with the locally constructed createLanWorld graph (no Proxies or external
 * accessor instrumentation; component mode owns its write notifications). Binary-enabled callers explicitly request owned
 * packed numbers; JSON-only and generic captures retain the scalar-array shape.
 * Drop authority-only weapon work and damage-animation internals by default; diagnostic capture stays full.
 * Fixed hot records are integrated but opt-in: the full-path CPU gate is not yet met.
 * Generic/custom callers must continue using captureHostCombat's default path. */
export function captureAuthorityCombat(engine: CombatEngine, tick: number, acknowledged: Record<Seat, number>, simulationMs: number,
  muzzleEvents: HostMuzzleEvents | null, compactParticles = false, packedNumbers = false, components = false, fixedDisplay = import.meta.env.VITE_LAN_FIXED_DISPLAY === 'true', recordDeltas = import.meta.env.VITE_LAN_RECORD_DELTAS === 'true', weaponPresentation = import.meta.env.VITE_LAN_PRUNE_WEAPON_AUTHORITY !== 'false', renderDamageMarks = import.meta.env.VITE_LAN_DAMAGE_MARK_VIEW !== 'false') {
  return captureHostCombat(engine, tick, acknowledged, simulationMs, muzzleEvents, true, true, true, compactParticles, packedNumbers, components, fixedDisplay, recordDeltas, weaponPresentation, renderDamageMarks);
}

/** Production LAN packet: explicit display data plus transport metadata.
 * Simulation component capsules and experimental fixed/record-delta leaves are
 * diagnostic-only; none may enter this versioned receiver contract. */
export function captureLanDisplayCombat(engine:CombatEngine,tick:number,acknowledged:Record<Seat,number>,simulationMs:number,muzzleEvents:HostMuzzleEvents|null,
 compactParticles=false,packedNumbers=false,displayDefinitions=import.meta.env.VITE_LAN_DISPLAY_DEFINITIONS === 'true') {
 const frame=captureCombat(engine,tick,acknowledged,simulationMs,true,true,true,true,compactParticles,packedNumbers,false,false,false,false,false,true,displayDefinitions);
 if(muzzleEvents)frame.muzzleEvents=muzzleEvents.snapshot();
 const particles=hostParticleEvents(engine.fxSystem);if(particles)frame.particleEvents=particles.snapshot();
 return frame;
}
