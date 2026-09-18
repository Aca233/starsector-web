import { nativeModulesToRuntime } from '../data/NativeShipCoordinates';
import variants from '../data/generated/modular-variants.json';
import type { ShipModuleSpec } from './ShipSpec';
const assemblies = variants as unknown as Record<string, {hullId: string; modules?: ShipModuleSpec[]; error?: string}>;
/** Only complete native assemblies are accepted; never replace a failed fit with another. */
export function nativeModules(hullId: string, variantId: string): ShipModuleSpec[] {
  const assembly = assemblies[variantId];
  if (!assembly || assembly.hullId !== hullId || !assembly.modules) {
    throw new Error('模块方案不可用：' + variantId + (assembly?.error ? ' · ' + assembly.error : ''));
  }
  return nativeModulesToRuntime(assembly.modules);
}
