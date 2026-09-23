import type { Vector2 } from '../math/Vector2';
import type { SimulationRandom } from '../simulation/SimulationRandom';
/** Native authority-only sidecar; never becomes serialized FX/gameplay state. */
export interface ParticleEventSink {
  readonly activeParticles: number;
  emit(kind: 0 | 2, pos: Vector2, count: number, color: [number, number, number], random: SimulationRandom): boolean;
  advance(dt: number): void;
  afterAdvance(): void;
  clear(): void;
}
const sinks = new WeakMap<object, ParticleEventSink>();
export const particleEventSink = (fx: object) => sinks.get(fx);
export function setParticleEventSink(fx: object, sink: ParticleEventSink): void { sinks.set(fx, sink); }
