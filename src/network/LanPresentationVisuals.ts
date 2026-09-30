/** Completed network assembly, not a decoded projectile graph. The transport
 * owns fragment ACKs; only this delivery's receipt can grant baseline-ready. */
export interface LanVisualDelivery {
  readonly owner: string; readonly epoch: number; readonly matchId: string; readonly syncId: string;
  readonly key: number; readonly tick: number; readonly kind: 'baseline' | 'update';
  readonly data: ArrayBuffer;
}
export interface LanVisualResult { readonly status: 'consumed' | 'discarded'; readonly advanced: boolean }
