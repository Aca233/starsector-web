import { packageHullTemplate } from '../modding/ShipPackCatalog';
import type { ShipSpec } from './ShipSpec';
/** One package catalogue owns templates. Return a copy, never mutate authored defaults. */
export function bundledHullTemplate(id: string): ShipSpec | undefined {
  const spec = packageHullTemplate(id);
  return spec ? structuredClone(spec) : undefined;
}
