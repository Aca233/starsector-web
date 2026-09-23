import type { DeepReadonly, ReadonlyWorld, SpaceEntity, Market } from '../../src/campaign/Types.js';
import type { OriginalCorvusMarket, CorvusOrbit, CorvusSourceRef, CorvusJson } from '../../src/campaign/content/OriginalCorvus.mjs';
export const CORVUS_DEVELOPMENT_WORLD_ID: 'development-corvus-authored';
export const CORVUS_DEVELOPMENT_SEED: 'web-corvus-authored-v1';
export const CORVUS_DEVELOPMENT_EXTENSION_ID: 'cooperative.simulation:corvus-development';
export interface CorvusDevelopmentOptions { id?: string; seed?: string }
export type CorvusDevelopmentSpaceEntity = Omit<SpaceEntity, 'presentation'> & {
 presentation?: { kind: 'star' | 'planet' | 'custom'; nativeType: string; sourceHandle: string };
 factionId: string | null;
 marketId?: string;
 source: {
  blueprintId: string; blueprintSha256: string; id: string; nativeId: string | null;
  policy: 'preserved-native-id' | 'web-stable-sha256-v1-not-native-genUID';
  sourceHandle: string; source: CorvusSourceRef; initialOrbit: CorvusOrbit | null;
  definitionFactionId: string | null; factionStatus: string;
  conditionMarket: Readonly<Record<string, CorvusJson>> | null;
  properties: Readonly<Record<string, CorvusJson>>;
  phasePolicy?: { surface: 'web-development-fixed-zero-not-native-random'; cloud: 'native-initial-zero' };
 };
};
export type CorvusDevelopmentMarket = Market & { metadata: {
 status: 'authored-definition-only-not-economic-snapshot';
 definition: OriginalCorvusMarket;
 tradeState: 'unavailable'; industrySimulation: 'not-executed';
 economyRegistration: 'native-definition-not-simulated' | 'native-helper-not-economy-registered';
} };
// Preserve the selected provider's generic presentation JsonObject exactly: narrowing that
// recursive index signature through DeepReadonly causes TypeScript instantiation overflow.
export type ReadonlyCorvusDevelopmentSpaceEntity = ReadonlyWorld['spaceEntities'][string] &
 DeepReadonly<Pick<CorvusDevelopmentSpaceEntity, 'factionId' | 'marketId' | 'source'>>;
export type ReadonlyCorvusDevelopmentMarket = ReadonlyWorld['markets'][string] & DeepReadonly<Pick<CorvusDevelopmentMarket, 'metadata'>>;
export type ReadonlyCorvusDevelopmentWorld = ReadonlyWorld & {
 readonly spaceEntities: Readonly<Record<string, ReadonlyCorvusDevelopmentSpaceEntity>>;
 readonly markets: Readonly<Record<string, ReadonlyCorvusDevelopmentMarket>>;
};
/** Frozen inspection scenario, not a playable native new game. Seed affects Web fallback ids only. */
export function createCorvusDevelopmentCampaign(options?: CorvusDevelopmentOptions): ReadonlyCorvusDevelopmentWorld;
