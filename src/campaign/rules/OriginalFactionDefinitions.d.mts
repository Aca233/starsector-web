/** Native definition subset; all data returned by the query factories is deeply immutable. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };
export interface SourceRecord {
  readonly id: string;
  readonly root: 'core' | 'decompiled';
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}
export interface ResolvedFactionField {
  readonly status: 'resolved';
  readonly origin: 'declared' | 'default';
  readonly sourceId: string;
  readonly evidence: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly value: Json;
}
export interface UnimplementedFactionField {
  readonly status: 'unimplemented';
  readonly presence: 'present' | 'absent';
  readonly sourceId: string;
  readonly reason: string;
  readonly evidence?: readonly string[];
  readonly raw?: Json;
}
export interface MissingFactionField {
  readonly status: 'missing';
  readonly reason: string;
}
export type FactionFieldResult = ResolvedFactionField | UnimplementedFactionField | MissingFactionField;
export interface OriginalFactionDefinition {
  readonly id: string;
  readonly sourceId: string;
  /** Exactly Faction.isPlayerFaction(): spec.id === 'player'. Not political/player ownership. */
  readonly nativeKind: 'player' | 'non-player';
  readonly classificationEvidence: 'faction';
  readonly raw: JsonObject;
  readonly fields: Readonly<Record<string, ResolvedFactionField | UnimplementedFactionField>>;
  readonly unsupportedFields: readonly string[];
}
export interface OriginalFactionDefaults {
  /** Optional only for pre-audit snapshots, which retain an unresolved default brightUIColor. */
  readonly brightUIColorTarget?: {
    readonly settingKey: 'tooltipTitleAndLightHighlightColor'; readonly sourceId: 'settings';
    readonly constantOwner: 'com.fs.starfarer.O0OO'; readonly constantField: 'void.super';
    readonly rgba: readonly [number, number, number, number]; readonly alphaOverride: 255; readonly blendWeight: number;
  };
  readonly tariffFraction: number;
  readonly tariffOrigin: string;
  readonly fleetTypeNames: Readonly<Record<string, string>>;
  readonly ranks: {
    readonly ranks?: Readonly<Record<string, { readonly name: string }>>;
    readonly posts?: Readonly<Record<string, { readonly name: string }>>;
  };
  readonly shipRoles: JsonObject;
}
export interface RelationshipSourceAssignment {
  readonly from: string;
  readonly to: string;
  readonly line: number;
  /** Source expressions, deliberately NOT an initialized relation value. */
  readonly expression: { readonly kind: 'number'; readonly value: number } | { readonly kind: 'rep-level'; readonly name: string };
}
export interface OriginalFactionData {
  readonly schemaVersion: 1;
  readonly profile: 'installed-core-faction-definitions/v1';
  readonly scope: Readonly<Record<string, string>>;
  readonly sources: readonly SourceRecord[];
  readonly defaults: OriginalFactionDefaults;
  readonly definitions: readonly OriginalFactionDefinition[];
  readonly unlistedDefinitions: readonly string[];
  readonly relationships: {
    readonly status: 'not-initialized';
    readonly completeInitialState: false;
    readonly sourceId: 'sectorGen';
    readonly method: string;
    readonly sectorGenAssignments: readonly RelationshipSourceAssignment[];
    readonly engineLazyFallback: { readonly self: 1; readonly other: 0; readonly applied: false; readonly evidence: 'manager'; readonly note: string };
    readonly additionalStages: readonly { readonly sourceId: string; readonly method: string; readonly status: 'not-executed'; readonly note: string }[];
    readonly completeness: string;
  };
}
export type FactionNameKind = 'fleetType' | 'rank' | 'post';
export type FactionNameResult = MissingFactionField | {
  readonly status: 'resolved'; readonly origin: 'declared' | 'default'; readonly sourceId: string; readonly value: string;
};
export interface OriginalFactionDefinitions {
  readonly data: OriginalFactionData;
  list(): readonly OriginalFactionDefinition[];
  find(id: string): OriginalFactionDefinition | undefined;
  /** Throws RangeError for an unknown ID, never falls back to 'neutral'. */
  get(id: string): OriginalFactionDefinition;
  field(id: string, field: string): FactionFieldResult;
  name(id: string, kind: FactionNameKind, key: string): FactionNameResult;
}
export interface FactionRelationshipSnapshot {
  readonly factionIds: readonly string[];
  readonly entries: readonly { readonly from: string; readonly to: string; readonly value: number; readonly source?: string }[];
}
export interface FactionRelationshipView {
  readonly data: FactionRelationshipSnapshot;
  get(from: string, to: string): { readonly status: 'uninitialized' } | {
    readonly status: 'known'; readonly value: number; readonly entry: FactionRelationshipSnapshot['entries'][number];
  };
}
export const ORIGINAL_FACTION_FIELDS: readonly string[];
/** Importer-facing normalization; query consumers should use createOriginalFactionDefinitions. */
export function resolveOriginalFactionDefinition(raw: JsonObject, sourceId: string, defaults: OriginalFactionDefaults): OriginalFactionDefinition;
export function validateOriginalFactionData(data: unknown): OriginalFactionData;
export function createOriginalFactionDefinitions(data: unknown): OriginalFactionDefinitions;
/** Snapshot reader with native symmetric pair identity; does not create, adjust or clamp relations. */
export function createFactionRelationshipView(snapshot: FactionRelationshipSnapshot): FactionRelationshipView;
