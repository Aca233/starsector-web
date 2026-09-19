export interface FlowSample { windowMs: number | null; rates: Record<string, number | null> }
export interface PublicAuthorityPerformance {
  tick: number; simulationMs: number; captureMs: number; encodeMs: number;
  callbackGapMs: number; backlogMs: number; flow?: FlowSample;
}
export class FlowCounters {
  constructor(keys: readonly string[], now?: number);
  reset(now?: number): void;
  count(key: string, amount?: number): void;
  sample(now?: number): FlowSample;
}
export function publicAuthorityPerformance(value: unknown): PublicAuthorityPerformance | null;
