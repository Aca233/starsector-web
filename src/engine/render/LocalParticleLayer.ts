import type { Particle } from '../simulation/CombatTypes';
const layers = new WeakMap<object, readonly Particle[]>();
const empty: readonly Particle[] = Object.freeze([]);
export const localParticleLayer = (fx:object): readonly Particle[] => layers.get(fx) ?? empty;
export function setLocalParticleLayer(fx:object, particles?:readonly Particle[]):void { if(particles)layers.set(fx,particles);else layers.delete(fx); }
