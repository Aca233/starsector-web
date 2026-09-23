export function hudInteger(n?: number | null, round?: boolean): string;
export function hudSupplies(n?: number): string;
export function hudRoundedValue(n?: number | null): string;
export function hudSupplyRate(n?: number | null, count?: number): string;
export function hudCapacity(value?: number | null, capacity?: number | null): { text: string; known: boolean; fill: number; excess: number; overloaded: boolean };
export function hudCargoQuantity(cargo: Record<string, number> | undefined, id: string): number | undefined;

export interface HudBurnHistory {samples:number[];level:number}
export function hudBurnSample(state:HudBurnHistory,level:number):HudBurnHistory;
