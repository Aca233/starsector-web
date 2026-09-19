import { shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { ShipSystem } from '../simulation/ShipSystem';
import { sound } from './SoundManager';
const previous = new WeakMap<ShipSystem, boolean>();
export function stopSystemAudio(): void {
  for (const definition of shipSystemDefinitions.all()) if (definition.audio?.loop) sound.stopLoop(definition.audio.loop);
}
export function syncSystemAudio(input: ShipSystem | readonly ShipSystem[], ready: boolean): void {
  const systems = Array.isArray(input) ? input : [input as ShipSystem];
  const loops = new Map<string, number>();
  for (const system of systems) {
    const engaged = system.isActive && system.state !== 'OUT';
    const was = previous.get(system) ?? false;
    previous.set(system, engaged);
    const audio = system.definition.audio;
    if (ready && engaged && audio?.loop) loops.set(audio.loop, Math.max(loops.get(audio.loop) ?? 0, audio.loopVolume ?? .7));
    if (!ready) continue;
    if (engaged && !was && audio?.activate) sound.play(audio.activate, .9);
    if (!engaged && was && audio?.deactivate) sound.play(audio.deactivate, .8);
  }
  for (const definition of shipSystemDefinitions.all()) {
    const key = definition.audio?.loop;
    if (!key) continue;
    if (loops.has(key)) sound.startLoop(key, loops.get(key)!); else sound.stopLoop(key);
  }
}
