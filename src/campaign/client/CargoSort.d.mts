export interface CommodityCargoRow {
  readonly id: string;
  readonly quantity: number;
  readonly commodity?: { readonly order?: number };
}
/** Returns a stable sorted copy, preserving each row and quantity unchanged. */
export function sortCommodityCargo<T extends CommodityCargoRow>(stacks: readonly T[]): T[];
