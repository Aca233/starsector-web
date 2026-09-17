/** Trusted application code only; JSON content never executes source Java/JavaScript. */
export { shipSystemDefinitions, systemFromSource } from './ship-systems/Registry';
export type { ShipSystemDefinition, SystemWorld, SystemAIContext } from './ship-systems/Types';
export { weaponEffects } from './weapon-effects/Registry';
export type { WeaponEffectDefinition } from './weapon-effects/Types';
export { hullModDefinitions } from './HullMods';
export type { HullModDefinition } from './HullMods';
export { registerSoundBank } from '../audio/SoundBank';
export type { SoundSample } from '../audio/SoundBank';
export { effectState, clearEffectState } from './EffectState';
export { modManager } from '../modding/ModManager';
export type { ModPackage } from '../modding/ModManager';
export { installContentPack } from './ContentAPI';
