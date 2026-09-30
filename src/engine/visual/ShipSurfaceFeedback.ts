/** Read-only authority sample, never a timer or combat modifier. One surface owner per hull. */
export interface ShipSurfaceFeedback {
 readonly mode: 'ORDER' | 'SEALED' | 'WAITING';
 readonly level: number;
 /** ORDER: stage strength, SEALED: elapsed fraction, WAITING: zero. */
 readonly progress: number;
}
export function validSurfaceFeedback(value: unknown): value is ShipSurfaceFeedback | undefined {
 if (value === undefined) return true;
 if (!value || typeof value !== 'object') return false;
 const v = value as ShipSurfaceFeedback;
 return ['ORDER', 'SEALED', 'WAITING'].includes(v.mode)
  && [v.level, v.progress].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
}
