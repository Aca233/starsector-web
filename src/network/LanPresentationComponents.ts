import { MOTION_MAX_BYTES } from './MotionFrame.mjs';
import { COMBAT_STATE_MAX_BYTES } from './CriticalCombatState.mjs';
import type { PresentationReceiptStatus } from './PresentationReceipts';

export type LanComponentKind = 'motion' | 'combat';
export interface LanComponentSession { readonly syncId: string; readonly motion: boolean; readonly combat: boolean }
export interface LanComponentDelivery {
  readonly owner: string; readonly epoch: number; readonly matchId: string; readonly syncId: string;
  readonly kind: LanComponentKind; readonly tick: number; readonly data: string;
}
export interface LanComponentResult { status: PresentationReceiptStatus; advanced: boolean; acknowledged?: number }
export const LAN_COMPONENT_LIMITS = {
  motion: { count: 16, units: 16 * Math.ceil(MOTION_MAX_BYTES / 3) * 4 },
  combat: { count: 6, units: 6 * Math.ceil(COMBAT_STATE_MAX_BYTES / 3) * 4 },
} as const;

/** Admission/ACK identity only: read twelve header bytes, not the component
 * graph. The actual presentation owner MUST still run the full codec. Budgets
 * count encoded code units, not UTF-16 heap bytes or decoded objects. */
export function inspectLanComponent(kind: LanComponentKind, data: unknown): number {
  const max = kind === 'motion' ? MOTION_MAX_BYTES : COMBAT_STATE_MAX_BYTES;
  if (typeof data !== 'string' || data.length < 32 || data.length > Math.ceil(max / 3) * 4 || data.length % 4)
    throw Error('Invalid presentation component size');
  const head = data.slice(0, 16);
  if (!/^[A-Za-z0-9+/]{16}$/.test(head)) throw Error('Invalid presentation component header');
  const view = new DataView(Uint8Array.from(atob(head), c => c.charCodeAt(0)).buffer);
  const magic = view.getUint32(0), tick = view.getFloat64(4);
  if ((kind === 'motion' ? magic !== 0x53574d31 : magic !== 0x53434331 && magic !== 0x53434332)
    || !Number.isSafeInteger(tick) || tick < 0) throw Error('Invalid presentation component identity');
  return tick;
}
