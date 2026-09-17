import { shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { ShipSystem } from '../simulation/ShipSystem';
import { sound } from './SoundManager';
const previous = new WeakMap<ShipSystem, boolean>();
export function stopSystemAudio(): void {
  for (const definition of shipSystemDefinitions.all()) if (definition.audio?.loop) sound.stopLoop(definition.audio.loop);
}
export function syncSystemAudio(system: ShipSystem, ready: boolean): void {
  const engaged = system.isActive && system.state !== 'OUT';
  const was = previous.get(system) ?? false;
  previous.set(system, engaged);
  const audio = system.definition.audio;
  for (const definition of shipSystemDefinitions.all()) {
    const key = definition.audio?.loop;
    if (!key) continue;
    if (ready && engaged && key === audio?.loop) sound.startLoop(key, audio.loopVolume ?? .7);
    else sound.stopLoop(key);
  }
  if (!ready) return;
  if (engaged && !was && audio?.activate) sound.play(audio.activate, .9);
  if (!engaged && was && audio?.deactivate) sound.play(audio.deactivate, .8);
}
