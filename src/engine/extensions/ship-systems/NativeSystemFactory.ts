import type { ShipSystemDefinition } from './Types';
/** Native timing/weapon data is deliberately unavailable in custom-only builds. */
export function nativeSystem(sourceId: string, _behavior: Partial<ShipSystemDefinition>): ShipSystemDefinition { throw new Error('Native system removed: '+sourceId); }
