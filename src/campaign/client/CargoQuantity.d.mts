export type CargoQuantityDrag = {
  steps: number[]; width: number; left: number; top: number; startedAt: number;
  index: number; entered: boolean; firstIndex: number | null; changed: boolean;
};
export const CARGO_QUANTITY_STEPS: readonly number[];
export function cargoQuantitySteps(total: number): number[];
export function createCargoQuantityDrag(total: number, x: number, y: number, viewportWidth: number, viewportHeight: number, startedAt: number): CargoQuantityDrag;
export function moveCargoQuantityDrag(drag: CargoQuantityDrag, x: number): CargoQuantityDrag;
export function cargoQuantityDragValue(drag: CargoQuantityDrag, now: number): number;
export function cargoQuantityLabels(drag: CargoQuantityDrag): {value: number; left: number}[];
