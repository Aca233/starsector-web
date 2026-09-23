/** Shared persisted contracts, not a substitute for runtime validation. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ReadonlyJsonValue = null | boolean | number | string | ReadonlyJsonArray | ReadonlyJsonObject;
export interface ReadonlyJsonArray extends ReadonlyArray<ReadonlyJsonValue> {}
export interface ReadonlyJsonObject { readonly [key: string]: ReadonlyJsonValue }
type DeepReadonlyObject<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
/** Stop reopening the recursive JSON dictionary at every property access; preserve specific typed intersections. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends object ? string extends keyof T ? T extends JsonObject
    ? { readonly [K in keyof T]: string extends K ? JsonValue extends T[K] ? ReadonlyJsonValue : DeepReadonly<T[K]> : DeepReadonly<T[K]> }
    : DeepReadonlyObject<T> : DeepReadonlyObject<T> : T;
export interface CampaignClock { tick: number; ticksPerSecond: number; gameSeconds: number }
export interface Entity { id: string; version: number }
export type Owner = { kind: 'player' | 'faction'; id: string };
export type Principal = { kind: 'player' | 'system'; id: string };
export interface Player extends Entity { name: string; factionId: string | null }
export interface Faction extends Entity { name: string; playerRoles: Record<string, 'leader' | 'manager' | 'member'> }
export interface Location extends Entity { name: string; presentation?: JsonObject; navigation?: { space: 'normal' | 'hyperspace'; terrain: string[]; jumpTopology?: 'complete' | 'unavailable' }; tags?: string[] }
export interface SpaceEntity extends Entity {
  /** Descriptor is validated by the selected space-motion provider, not the generic kernel. */
  orbit?: JsonObject; facingDegrees?: number;
  presentation?: JsonObject; surfacePhase?: number; cloudPhase?: number; lightSourceId?: string;
  name: string; locationId: string; position: [number, number]; radius: number; tags: string[];
  jump?: { anchor: 'star' | 'gas-giant' | null; destinations: { targetId: string; minDistance: number; maxDistance: number }[] };
}
export interface JumpTransition {
  schemaVersion: 1; sourceId: string; targetId: string; sourceLocationId: string; targetLocationId: string; minDistance: number; maxDistance: number;
  phase: 'start' | 'approach' | 'warp-out' | 'fade-out' | 'fade-in' | 'warp-in';
  startedTick: number; phaseTick: number; moveTicks: number; shipIds: string[]; warpedCount: number;
  jitterUntilTick: number; intervalProgress: number; nextInterval: number; warpRate: number; paidFuel: number;
}
export type FleetControl = { kind: 'player' | 'faction'; id: string } | { kind: 'npc' };
export interface Fleet extends Entity {
  name?: string; owner: Owner; control: FleetControl; locationId: string; position: [number, number];
  navigation?: { interaction?: { targetId: string; orderId: string; arrived: boolean }; velocity: [number, number]; destination: [number, number] | null; rngState?: number; transition?: JumpTransition; accelerationUntilTick?: number; noEngageUntilTick?: number };
  memberIds: string[]; partyId: string | null; encounterId: string | null; cargo: Record<string, number>;
}
export interface MemberCondition {
  status: 'ready' | 'destroyed'; hullFraction: number;
  /** Persistent BASE CR. Battle effective CR additionally applies native crew modifiers. */
  combatReadiness: number;
  /** Null means pristine armor; non-null grid is row-major (y * cols + x). */
  armor: null | { cols: number; rows: number; fractions: number[] };
  ammunition: Record<string, number | null>;
}
export interface MemberLoadout extends JsonObject { hullId: string }
/** Full content/loadout validation belongs to the pending combat content adapter. */
export interface Member extends Entity {
  logistics?: { mothballed: boolean; suspendRepairs: boolean; crPriorToMothballing?: number };
  fleetId: string; owner: Owner; loadout: MemberLoadout; condition: MemberCondition;
}
export interface Account extends Entity { owner: Owner; currency: string; balance: number }
export interface Party extends Entity { leaderFleetId: string; fleetIds: string[] }
export interface Invitation extends Entity {
  fromFleetId: string; toFleetId: string; createdBy: string; partyId: string | null; expiresAt: number;
}
export type EncounterStatus = 'forming' | 'preparing' | 'running' | 'settling' | 'committed' | 'cancelled' | 'recovery-required';
export interface Encounter extends Entity { fleetIds: string[]; battleAttempt: number; status: EncounterStatus }
export interface Market extends Entity { owner: Owner; locationId: string }
export interface Colony extends Entity { owner: Owner; locationId: string; marketId: string }
export interface ExtensionState extends Entity { schemaVersion: number; data: JsonObject }
export interface CampaignCollections {
  players: Player; factions: Faction; locations: Location; spaceEntities: SpaceEntity; fleets: Fleet; members: Member; accounts: Account;
  parties: Party; invitations: Invitation; encounters: Encounter; markets: Market; colonies: Colony; extensions: ExtensionState;
}
export type Collection = keyof CampaignCollections;
export interface ExtensionWriteGrant { service: string; capabilities: readonly string[]; commands: readonly string[] }
export interface ProviderMetadata {
  extensionWriteGrants?: readonly ExtensionWriteGrant[];
  id: string; version: string; service: string; apiVersion: 1;
  capabilities: readonly string[]; requires: Readonly<Record<string, readonly string[]>>; evidence: readonly JsonObject[];
}
export interface RulesLock {
  apiVersion: 1; id: string; version: string; originalReference: string | null;
  providers: Record<string, ProviderMetadata>; settings: JsonObject;
}
export type CampaignWorld = { [C in Collection]: Record<string, CampaignCollections[C]> } & {
  schemaVersion: 1; id: string; revision: number; clock: CampaignClock;
  rules: RulesLock; contentFingerprint: string;
};
export type ReadonlyWorld = DeepReadonly<CampaignWorld>;
export interface EntityExpectation { collection: Collection; id: string; version: number }
export interface CampaignCommand {
  worldId: string; epoch: string; requestId: string; type: string; payload: JsonObject; expected: EntityExpectation[];
}
export type EntityChange = { [C in Collection]: {
  collection: C; id: string; expectedVersion: number | null; value: CampaignCollections[C] | null;
} }[Collection];
export interface CampaignEvent { type: string; data: JsonObject }
export interface CampaignEffectPlan { clock?: { expected: CampaignClock; value: CampaignClock }; changes: EntityChange[]; events: CampaignEvent[]; result?: JsonObject }
// Service-specific signatures are refined by individual provider declarations.
export type RuleMethods = Readonly<Record<string, (...args: any[]) => any>>;
export interface CampaignRuleContext {
  world: ReadonlyWorld; actor: DeepReadonly<Principal>; settings: DeepReadonly<JsonObject>;
  services: Readonly<Record<string, RuleMethods>>;
  requireVersion<C extends Collection>(collection: C, id: string): DeepReadonly<CampaignCollections[C]>;
}
export type CampaignRuleHandler = (ctx: CampaignRuleContext, payload: DeepReadonly<JsonObject>, requestId: string) => CampaignEffectPlan;
export interface CampaignRuleProvider {
  extensionWriteGrants?: readonly ExtensionWriteGrant[];
  id: string; version: string; service: string; apiVersion: 1; capabilities: readonly string[];
  requires?: Readonly<Record<string, readonly string[]>>; evidence?: readonly JsonObject[];
  methods?: RuleMethods; commands?: Readonly<Record<string, CampaignRuleHandler>>;
}
export interface RulesetProfile {
  id: string; version: string; originalReference?: string | null; providers: Record<string, string>; settings?: JsonObject;
}
export interface CompiledRuleset {
  readonly lock: DeepReadonly<RulesLock>; readonly services: Readonly<Record<string, RuleMethods>>;
  acceptsLock(other: unknown): boolean;
  canWriteExtension(type: string, extensionId: string, actorKind: Principal['kind']): boolean;
  /** Selected providers validate their own persisted rules-specific contracts. */
  validateWorld(world: ReadonlyWorld): void;
  handler(type: string): CampaignRuleHandler | undefined;
  providerForCommand(type: string): DeepReadonly<ProviderMetadata> | undefined;
}
export interface CommandReceipt { worldId: string; requestId: string; revision: number; result: JsonObject }
export interface EventBatch { revision: number; events: CampaignEvent[] }
export interface PlannedCommand { world: ReadonlyWorld; events: DeepReadonly<CampaignEvent[]>; result: DeepReadonly<JsonObject> }
