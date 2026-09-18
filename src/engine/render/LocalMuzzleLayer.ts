import type { MuzzleParticle } from '../simulation/CombatTypes';
import type { CombatFXSystem } from '../simulation/systems/CombatFXSystem';
const layers=new WeakMap<CombatFXSystem,readonly MuzzleParticle[]>();
const empty:readonly MuzzleParticle[]=[];
/** Display-only particles are never projected back into the authority snapshot. */
export const localMuzzleLayer=(fx:CombatFXSystem):readonly MuzzleParticle[]=>layers.get(fx)??empty;
export function setLocalMuzzleLayer(fx:CombatFXSystem,particles?:readonly MuzzleParticle[]):void {
  if(particles) layers.set(fx,particles); else layers.delete(fx);
}
