/**
 * CargoData.sort()'s resource comparison, restricted to commodity display rows.
 * SpecStore imports order as float32. Equal orders remain stable; names, IDs and
 * CSV positions are NOT tie breakers. This never consolidates or mutates stacks.
 */
export function sortCommodityCargo(stacks) {
  return [...stacks].sort((a, b) => {
    const aOrder = a.commodity?.order, bOrder = b.commodity?.order;
    const aKnown = Number.isFinite(aOrder), bKnown = Number.isFinite(bOrder);
    // Web-only fallback for missing metadata: keep all unknown rows, stable, last.
    if (!aKnown || !bKnown) return Number(bKnown) - Number(aKnown);
    if (a.id === b.id) return Math.sign(b.quantity - a.quantity);
    // Float.compareTo distinguishes signed zero: -0 precedes +0. Subtraction does not.
    if (aOrder === 0 && bOrder === 0) return Number(Object.is(bOrder, -0)) - Number(Object.is(aOrder, -0));
    return Math.sign(aOrder - bOrder);
  });
}
