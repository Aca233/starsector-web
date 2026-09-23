/** Public protocol entry. Runtime viewers import the decoder directly so the
 * authority capture graph cannot enter their dependency closure. */
export { CombatPresentationEncoder } from './CombatPresentationEncoder';
export { CombatPresentationDecoder } from './CombatPresentationDecoder';
export type { CombatPresentationMode, CombatPresentationPacket, DetachedCombatPresentation } from './CombatPresentationWire';
