import { zhuYuanShips } from './ZhuYuanPack';
import { hyperionShips } from './HyperionPack';
import { glorianaShips } from './GlorianaPack';
import { arkShips } from './AdunArkPack';
import { rocinanteShips } from './RocinantePack';
import { zhefengShips } from './ZhefengPack';
import { gravityShips } from './GravityPack';
import type { ShipSpec } from './ShipSpec';

let templates: Map<string, ShipSpec> | undefined;
/** Historical authored fit, used only by opt-in presets and legacy implicit saves.
 * Never use as the new-hull default or mutate the cached source. */
export function bundledHullTemplate(id: string): ShipSpec | undefined {
  templates ??= new Map([...zhuYuanShips(), ...hyperionShips(), ...glorianaShips(), ...arkShips(), ...rocinanteShips(), ...zhefengShips(), ...gravityShips()]
    .map(spec => [spec.id, spec]));
  const spec = templates.get(id);
  return spec ? structuredClone(spec) : undefined;
}
