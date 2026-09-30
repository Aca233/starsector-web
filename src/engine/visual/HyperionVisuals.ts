import { HYPERION_HULL_ID, HYPERION_YAMATO_ID, HYPERION_JUMP_ID } from '../content/HyperionIds';
import type { ShipRenderState, RenderSystem } from '../render/ShipRenderState';

export interface HyperionVisualState {
  charge: number;
  jumpCharge: number;
  arrival: number;
  assault: boolean;
  jump?: RenderSystem;
}
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
/** Read-only projection: a successful origin survives exactly the authoritative assault window.
 * Never infer a successful shot/jump from OUT: cancellations also enter that state. */
export function hyperionVisualState(ship: ShipRenderState): HyperionVisualState {
  const off: HyperionVisualState = { charge: 0, jumpCharge: 0, arrival: 0, assault: false };
  if ((ship.spec.sourceHullId ?? ship.spec.id) !== HYPERION_HULL_ID || ship.isDead || ship.hullHp <= 0
    || ship.isDocked || ship.isRetreated || ship.flux.isOverloaded || ship.flux.isVenting) return off;
  const enabled = (s: RenderSystem) => s.available && !s.disabled;
  const yamato = ship.allSystems.find(s => s.type === HYPERION_YAMATO_ID && enabled(s));
  const jump = ship.allSystems.find(s => s.type === HYPERION_JUMP_ID && enabled(s));
  const validJump = jump?.teleportVisual?.serial === jump?.activationSerial && jump?.teleportVisual;
  return {
    charge: yamato?.isActive && yamato.state === 'IN' ? clamp(yamato.effectLevel) : 0,
    jumpCharge: validJump && jump?.isActive && jump.state === 'IN' ? clamp(jump.effectLevel) : 0,
    arrival: validJump && validJump.origin && jump?.isActive && jump.state !== 'IN' ? clamp(jump.effectLevel) : 0,
    assault: !!(validJump && validJump.origin && jump?.state === 'COOLDOWN'),
    jump: validJump ? jump : undefined,
  };
}
