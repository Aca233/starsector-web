import type { MuzzleParticle } from '../simulation/CombatTypes';
const layers=new WeakMap<object,readonly MuzzleParticle[]>();
const empty:readonly MuzzleParticle[]=[];
/** Display-only particles are never projected back into the authority snapshot. */
export const localMuzzleLayer=(fx:object):readonly MuzzleParticle[]=>layers.get(fx)??empty;
export function setLocalMuzzleLayer(fx:object,particles?:readonly MuzzleParticle[]):void {
  if(particles) layers.set(fx,particles); else layers.delete(fx);
}
