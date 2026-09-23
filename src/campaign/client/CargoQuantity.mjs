/** Native trade/G.java QUANTITIES and F.java's 5000-item picker ceiling.
 * Presentation policy only; the transfer model enforces conservation separately. */
export const CARGO_QUANTITY_STEPS = Object.freeze([0,1,2,3,4,5,10,15,20,25,30,40,50,60,70,80,90,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500,600,700,800,900,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]);
const LABELS = new Set([0,10,50,100,300,500,1000,5000]);
export function cargoQuantitySteps(total) {
  if (!Number.isFinite(total) || total < 1) return [0];
  const max = Math.min(5000, Math.floor(total)), steps = [];
  for (const value of CARGO_QUANTITY_STEPS) {
    steps.push(Math.min(value, max));
    if (value >= max) break;
  }
  return steps;
}
export function createCargoQuantityDrag(total, x, y, viewportWidth, viewportHeight, startedAt) {
  const steps = cargoQuantitySteps(total), width = (steps.length - 1) * 10 + 8;
  // Native is anchored at down.x-13, down.y-28. Keep bar/ticks visible at Web edges.
  return { steps, width, left: Math.max(4, Math.min(x - 13, viewportWidth - width - 4)),
    top: Math.max(4, Math.min(y - 28, viewportHeight - 58)), startedAt, index: 1,
    entered: false, firstIndex: null, changed: false };
}
export function moveCargoQuantityDrag(drag, x) {
  if (!Number.isFinite(x)) return drag;
  const offset = x - drag.left, entered = drag.entered || offset > 0 && offset < drag.width;
  const index = entered ? Math.round(Math.max(0, Math.min(1, offset / drag.width)) * (drag.steps.length - 1)) : drag.index;
  return { ...drag, entered, index, firstIndex: drag.firstIndex ?? index,
    changed: drag.changed || drag.firstIndex !== null && drag.firstIndex !== index };
}
export function cargoQuantityDragValue(drag, now) {
  // Native protects a quick Shift-click from selecting more than one just because
  // the mouse moved slightly while pressing it; dragging across two pips bypasses it.
  return now - drag.startedAt < 250 && !drag.changed ? 1 : (drag.steps[drag.index] ?? 0);
}
export function cargoQuantityLabels(drag) {
  return drag.steps.flatMap((value, index) => LABELS.has(value) && index < drag.steps.length - 1 ? [{ value, left: 5 + index * 10 }] : []);
}
