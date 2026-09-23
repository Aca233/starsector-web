export type CorvusJson = null | boolean | number | string | readonly CorvusJson[] | { readonly [key: string]: CorvusJson };
export interface CorvusSourceRef { readonly id: string; readonly line?: number; readonly key?: string }
export interface CorvusSourceFile { readonly id: string; readonly root: 'core' | 'decompiled'; readonly path: string; readonly sha256: string; readonly bytes: number; readonly review: 'hash-pinned-code' | 'data-or-asset' }
export interface CorvusOrbit {
 readonly mode: 'circular' | 'point-down';
 readonly focusHandle: string;
 readonly angleDegrees: number;
 readonly radius: number;
 readonly periodDays: number;
 readonly sourceExpressions: readonly string[];
}
export interface OriginalCorvusEntity {
 /** Source variable or @operation:N. NOT a native engine entity id. */
 readonly handle: string;
 readonly kind: 'star' | 'planet' | 'custom' | 'jump-point' | 'terrain' | 'asteroid-belt' | 'ring-band';
 readonly nativeId: string | null;
 readonly nativeIdStatus: 'explicit' | 'generated-by-engine';
 readonly name: string | null;
 readonly nameStatus: 'declared' | 'system-name-derived' | 'custom-spec' | 'runtime-unimplemented';
 readonly radius: number | null;
 readonly radiusStatus: 'declared' | 'custom-spec' | 'native-JumpPoint-default' | 'runtime-unimplemented';
 readonly orbit: CorvusOrbit | null;
 readonly source: CorvusSourceRef;
 readonly creation: { readonly sequence: number; readonly arguments: readonly string[] };
 readonly properties: Readonly<Record<string, CorvusJson>>;
 readonly planetType?: string;
 readonly customType?: string;
 readonly terrainType?: string;
 readonly faction?: string;
 readonly factionArgument?: string | null;
 readonly factionStatus?: 'declared' | 'native-null-default';
 readonly nameArgument?: string | null;
 readonly marketId?: string;
 readonly marketFaction?: string;
 readonly focusHandle?: string;
 readonly localPosition?: { readonly x: number; readonly y: number; readonly status: string };
 readonly conditionMarket?: Readonly<Record<string, CorvusJson>>;
 readonly parameters?: Readonly<Record<string, CorvusJson>>;
 readonly generationStatus?: string;
 readonly destinationStatus?: string;
}
export interface OriginalCorvusMarket {
 readonly id: string;
 readonly kind: 'economy' | 'abandoned-helper';
 readonly name: string;
 readonly source: CorvusSourceRef;
 readonly primaryEntityId: string;
 readonly connectedEntityIds: readonly string[];
 readonly faction: string;
 readonly size: number;
 readonly conditions: readonly string[];
 readonly industries: readonly string[];
 readonly submarkets: readonly string[];
 readonly submarketsStatus: 'declared' | 'loader-default' | 'helper-explicit';
 readonly declared?: Readonly<Record<string, CorvusJson>>;
 readonly freePort?: boolean;
 readonly freePortStatus?: 'declared' | 'loader-default';
 readonly tariff?: { readonly status: 'runtime-unimplemented'; readonly from: string };
 readonly conditionsStatus?: string;
 readonly industriesStatus?: string;
 readonly surveyLevel?: 'FULL';
 readonly planetConditionMarketOnly?: boolean;
 readonly storagePlayerPaidToUnlock?: boolean;
 readonly economyRegistration?: string;
 readonly memoryOperations?: readonly Readonly<Record<string, CorvusJson>>[];
}
export interface CorvusRequiredStage {
 readonly id: string;
 readonly status: 'required-not-executed';
 readonly source: CorvusSourceRef;
 readonly sequence?: number;
 readonly dependsOn?: readonly string[];
 readonly requires: readonly string[];
 readonly requiredSources?: readonly string[];
 readonly kind?: string;
 readonly arguments?: Readonly<Record<string, CorvusJson>>;
 readonly knownEffects?: Readonly<Record<string, CorvusJson>>;
 readonly note?: string;
 readonly entityHandle?: string;
 readonly marketId?: string;
 readonly submarket?: string;
 readonly memberType?: string;
 readonly variantId?: string;
 readonly shipName?: string | null;
 readonly configuredInitialSteps?: number;
}
export interface OriginalCorvusBlueprint {
 readonly schemaVersion: 1;
 readonly id: 'original-corvus';
 readonly scope: 'authored-blueprint-not-complete-generated-system';
 readonly sources: readonly CorvusSourceFile[];
 readonly system: {
  readonly id: 'corvus'; readonly name: 'Corvus'; readonly entryPoint: string;
  readonly background: { readonly path: string; readonly status: string };
  readonly hyperspaceLocation: { readonly x: number; readonly y: number; readonly source: CorvusSourceRef; readonly application: string };
  readonly respawn: { readonly x: number; readonly y: number; readonly coordinateSpace: 'system'; readonly source: CorvusSourceRef; readonly note: string };
 };
 readonly constants: Readonly<Record<string, CorvusJson>>;
 readonly operations: readonly { readonly sequence: number; readonly source: CorvusSourceRef; readonly statement: string; readonly result: Readonly<Record<string, CorvusJson>> }[];
 readonly entities: readonly OriginalCorvusEntity[];
 readonly markets: readonly OriginalCorvusMarket[];
 readonly specs: Readonly<Record<string, Readonly<Record<string, CorvusJson>>>>;
 readonly stages: readonly CorvusRequiredStage[];
 readonly postprocessing: readonly CorvusRequiredStage[];
 readonly limitations: readonly string[];
}
export interface OriginalCorvusProvider {
 getBlueprint(): OriginalCorvusBlueprint;
 listEntities(): readonly OriginalCorvusEntity[];
 getEntity(handle: string): OriginalCorvusEntity | null;
 getEntityByNativeId(id: string): OriginalCorvusEntity | null;
 listMarkets(): readonly OriginalCorvusMarket[];
 getMarket(id: string): OriginalCorvusMarket | null;
 listRequiredStages(): readonly CorvusRequiredStage[];
}
/** Structural/semantic validation, not cryptographic authentication of supplied source hashes. */
export function validateOriginalCorvusData(reference: unknown): { readonly valid: boolean; readonly errors: readonly string[] };
/** Deeply frozen, isolated authored configuration. Does not generate spaceEntities or run any required stage. */
export function buildOriginalCorvusBlueprint(reference: unknown): OriginalCorvusBlueprint;
export function createOriginalCorvusProvider(reference: unknown): OriginalCorvusProvider;
