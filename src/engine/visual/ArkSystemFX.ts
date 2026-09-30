import emission from './ark-system-emission-art.json';
import { ADUN_ARK_ART, ADUN_ARK_FORGE, ADUN_ARK_BARRIER, ADUN_ARK_REPAIR, type AdunArkOwner } from '../content/AdunArkIds';
import type { ShipRenderState, RenderShield } from '../render/ShipRenderState';
export interface ArkEmissionTile { file: string; box: number[]; size: number[] }
export const arkEmissionLayers: Readonly<Record<string, ArkEmissionTile | null>> = emission.layers;
export const arkEmissionTextures = [...new Set(Object.values(arkEmissionLayers).flatMap(f => f ? [ADUN_ARK_ART + f.file] : []))];
export const arkMembraneTextures = Array.from({ length: 4 }, (_, i) => `/game-assets/graphics/fx/web_adun_ark/field-v18/membrane-${i}.png`);
export const ARK_SYSTEM_ART = '/game-assets/graphics/fx/web_adun_ark/systems-v19/';
export type ArkSystemMaterial = 'forge' | 'barrier' | 'repair';
export const arkSystemTextures = ['forge', 'barrier', 'repair'].flatMap(key => Array.from({length: 4}, (_, i) => ARK_SYSTEM_ART + key + '-' + i + '.png'));
export const arkPluginTextures = ['reactor', 'coupler', 'matrix', 'hangar'].map(key => ARK_SYSTEM_ART + key + '.png');
/** Painted frame sampling is visual only and follows combat time, including pause. */
export function arkSystemMaterialFrame(material: ArkSystemMaterial, time: number) {
 const phase = Math.max(0, Number.isFinite(time) ? time : 0) * 3 % 4, index = Math.floor(phase);
 return { first: ARK_SYSTEM_ART + material + '-' + index + '.png', next: ARK_SYSTEM_ART + material + '-' + (index + 1) % 4 + '.png', mix: phase - index, scroll: Math.max(0, Number.isFinite(time) ? time : 0) * .22 % 1 };
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const q = clamp(x); return q * q * (3 - 2 * q); };
/** These are the actual source emission maps, not RGB threshold masks or new geometry. */
export function arkSystemEmission(ship: ShipRenderState, owner: AdunArkOwner, part?: ShipRenderState) {
  if (ship.isDead || ship.hullHp <= 0 || ship.isDocked || ship.isRetreated || ship.flux.isOverloaded || ship.flux.isVenting) return undefined;
  const system = ship.allSystems.find(s => [ADUN_ARK_FORGE, ADUN_ARK_BARRIER, ADUN_ARK_REPAIR].includes(s.type) && s.available && !s.disabled && s.isActive);
  if (!system) return undefined;
  // Power propagates through existing conduits on IN and drains back on OUT.
  // ACTIVE has no fabricated pulse clock; the moving ring supplies real motion.
  const onset = { CORE: 0, FORE: .16, PORT: .3, STARBOARD: .3, AFT: .44 }[owner];
  const q = smooth((system.effectLevel - onset) / (1 - onset));
  if (!q) return undefined;
  const repair = system.type === ADUN_ARK_REPAIR, barrier = system.type === ADUN_ARK_BARRIER;
  // Actual hull maximum already belongs to the native display projection.
  // Healthy parts show a quiet supply trace, NOT a fabricated healing target.
  const receivingRepair = !!part && part.hullHp < part.maxHullHp && part.hullHp > 0;
  return { alpha: q * (repair ? (receivingRepair ? .95 : .24) : barrier ? .86 : .96),
   material: (repair ? 'repair' : barrier ? 'barrier' : 'forge') as ArkSystemMaterial,
   color: repair ? [.6, 1, .87] : barrier ? [.72, .9, 1] : [1, .78, .34] };

}
export function arkBarrierLevel(ship: ShipRenderState): number {
  if (ship.flux.isOverloaded || ship.flux.isVenting || ship.isDead) return 0;
  const system = ship.allSystems.find(s => s.type === ADUN_ARK_BARRIER && s.available && !s.disabled && s.isActive);
  return clamp(system?.effectLevel ?? 0);
}
export function sampleArkMembrane(time: number) {
  if (!Number.isFinite(time) || time < 0) return [];
  const cursor = (time * 2) % 4, index = Math.floor(cursor), mix = cursor - index;
  return [{ url: arkMembraneTextures[index], weight: 1 - mix }, { url: arkMembraneTextures[(index + 1) % 4], weight: mix }].filter(f => f.weight > 1e-6);
}
/** Exact authority contact sectors: no random flash or fabricated global ripple. */
export function arkMembraneAlpha(shield: RenderShield, index: number, barrier: number): number {
  if (!shield.isVisuallyDeployed || !shield.hitSegmentLevels.length) return 0;
  const i = Math.max(0, Math.min(shield.hitSegmentLevels.length - 1, index));
  const lo = Math.floor(i), hi = Math.min(shield.hitSegmentLevels.length - 1, lo + 1), mix = i - lo;
  const level = shield.hitSegmentLevels[lo] * (1 - mix) + shield.hitSegmentLevels[hi] * mix;
  const hit = 1 - clamp(level / 100);
  const theta = index / Math.max(1, shield.hitSegmentLevels.length - 1) * shield.renderArcRad;
  const taper = shield.renderArcRad >= Math.PI * 2 - .001 ? 1 : smooth(Math.min(theta, shield.renderArcRad - theta) / Math.min(.12, shield.renderArcRad * .2));
  return shield.visualAlpha * taper * (.36 + .8 * clamp(barrier) + .34 * hit);
}
