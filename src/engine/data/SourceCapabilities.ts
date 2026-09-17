import sourceCapabilities from './generated/source-hull-capabilities.json';
import systemSlots from './generated/source-system-slots.json';
import nativeDecorations from './native-pusher-decorations.json';
import nativeOverloadColors from './native-overload-colors.json';
import { hullModDefinitions } from '../extensions/HullMods';
import { resolveSystemId, shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { ShipSpec } from '../content/ShipSpec';
const capabilities = sourceCapabilities as Record<string, { builtInHullMods: string[]; hints?: string[]; defenseSourceId?: string }>;
/** Reconcile capabilities, not derived stats. Saves remain raw and modifiers never compound. */
export function normalizeSourceCapabilities(spec: ShipSpec): ShipSpec {
  const source = capabilities[spec.id];
  const defense = spec.defenseSystemType ?? (source?.defenseSourceId ? 'UNADAPTED_SOURCE_' + source.defenseSourceId : undefined);
  return { ...spec, systemType: resolveSystemId(spec.systemType),
    overloadColor: spec.overloadColor ?? (nativeOverloadColors as unknown as Record<string, [number, number, number]>)[spec.id],
    systemWeaponSlots: spec.systemWeaponSlots ?? structuredClone((systemSlots as Record<string, NonNullable<ShipSpec['systemWeaponSlots']>>)[spec.id] ?? []),
    decorativeWeapons: spec.decorativeWeapons ?? structuredClone((nativeDecorations as Record<string, NonNullable<ShipSpec['decorativeWeapons']>>)[spec.id] ?? []),
    ...(defense ? { defenseSystemType: resolveSystemId(defense) } : {}),
    sourceHullTraits: [...new Set([...(spec.sourceHullTraits ?? []), ...(source?.builtInHullMods ?? []), ...(source?.hints ?? []), ...(spec.builtInHullMods ?? [])])],
    builtInHullMods: [...new Set([...(spec.builtInHullMods ?? []), ...(source?.builtInHullMods ?? []).filter(id => hullModDefinitions.get(id)?.status === 'implemented')])],
  };
}
/** Import reports are historical evidence, not the authority on today's implementation readiness. */
export function currentImportReasons(reasons: readonly string[]): string[] {
  return reasons.filter(reason => {
    const system = /^(?:Unimplemented ship system|Secondary defense) ([\w-]+)/.exec(reason)?.[1];
    if (system && shipSystemDefinitions.all().some(d => !d.unavailable && d.sourceIds.includes(system))) return false;
    const mod = /^(?:Unimplemented built-in hullmod|Source built-in hullmod) ([\w-]+)/.exec(reason)?.[1];
    if (!mod) return true;
    const definition = hullModDefinitions.get(mod);
    return definition?.status !== 'implemented' && definition?.support?.scope !== 'campaign-only';
  });
}
