import { baseHull, createDesign, evaluate } from '../../studio/DesignModel';
import { modManager } from '../modding/ModManager';
import { immutableCopy } from '../extensions/Immutable';
import type { ShipSpec } from './ShipSpec';

/** Bare catalogue hull IDs enter combat with the first fit. Explicit specs retain their equipment. */
export function defaultShipFit(id: string): ShipSpec {
  const hull = modManager.requireShip(id);
  if (!baseHull(id) || hull.isModuleHull) return hull;
  const { spec, errors } = evaluate(createDesign(id));
  if (errors.length) throw new Error(errors.join('；'));
  // Evaluation remains mutable for the studio. This factory owns the completed
  // combat fit; certify a recursive COPY just like prepareDeployment does.
  // Do not freeze a caller's explicit ShipSpec or cache live combat statistics.
  return immutableCopy(spec);
}
