import type { RenderSystem as ShipSystem } from '../render/ShipRenderState';
/** Private system mechanics remain at the authority. Only the measured visual offset crosses. */
const pulseOffsets = new WeakMap<ShipSystem, number>();
export const presentationPulseOffset = (system: ShipSystem): number | undefined => pulseOffsets.get(system);
export function setPresentationPulseOffset(system: ShipSystem, offset: number): void { pulseOffsets.set(system, offset); }
