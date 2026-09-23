import type {OriginalConstructionQueueMarket, OriginalConstructionQueueRow} from './OriginalConstructionQueue.mjs';

/** Actual installed CSV metadata, NOT live getBuildCost/availability. Source insertion order is explicit. */
export interface OriginalColonyConstructionDirectoryEntry extends OriginalColonyConstructionSpec {
    name: string;
    imageName: string | null;
    pluginClass: string;
    description: string | null;
    data: string | null;
    order: number;
    costMult: number;
    /** Loaded float spec cost: f32(f32(costMult * creditsPerCostUnit) * industryBuildCostMult). */
    cost: number;
    buildTime: number;
}
export const ORIGINAL_COLONY_CONSTRUCTION: {
    readonly schemaVersion: 1;
    readonly originalReference: string;
    readonly scope: 'native-industry-directory-not-live-build-availability';
    readonly sources: Readonly<Record<string, {readonly sha256: string}>>;
    readonly settings: {readonly creditsPerCostUnit: number; readonly industryBuildCostMult: number; readonly industryRefundFraction: number};
    readonly costFormula: string;
    readonly industryIds: readonly string[];
    readonly industries: Readonly<Record<string, Readonly<OriginalColonyConstructionDirectoryEntry>>>;
};
/** settings.json:281; not an invented discount or progress-proportional refund. */
export const ORIGINAL_COLONY_INDUSTRY_REFUND_FRACTION: number;
/** Native IndustryListPanel visible-slot literal; independent of maxIndustries. */
export const ORIGINAL_COLONY_CONSTRUCTION_DISPLAY_LIMIT: 12;
export interface OriginalColonyConstructionCredits {
    /** The actual authorized player's fleet credit MutableValue; preserve this object reference. */
    objectRef: string;
    value: number;
}
export interface OriginalColonyConstructionSpec {
    industryId: string;
    tags: readonly string[];
    /** Native missing links are null, never guessed from names or omitted. */
    upgradeId: string | null;
    downgradeId: string | null;
}
export interface OriginalColonyConstructionIndustryTarget {objectRef: string; industryId: string}
export interface OriginalColonyConstructionQueueTarget extends OriginalColonyConstructionIndustryTarget {
    /** Exact saved Java int cost belonging to the selected slot payload. */
    cost: number;
}
export type OriginalColonyConstructionRequest =
    | {type: 'build'; industryId: string}
    | {type: 'cancel-queued'; target: OriginalColonyConstructionQueueTarget}
    | {type: 'swap-queued'; target: OriginalColonyConstructionQueueTarget; other: OriginalColonyConstructionQueueTarget}
    | {type: 'cancel-construction'; target: OriginalColonyConstructionIndustryTarget; interactionMode: 'LOCAL' | 'REMOTE'}
    | {type: 'cancel-upgrade'; target: OriginalColonyConstructionIndustryTarget};
export type OriginalColonyConstructionCommand =
    | (Extract<OriginalColonyConstructionRequest, {type: 'build'}> & {confirmed: true; expectedCost: number})
    | Extract<OriginalColonyConstructionRequest, {type: 'cancel-queued' | 'swap-queued'}>
    | (Extract<OriginalColonyConstructionRequest, {type: 'cancel-construction' | 'cancel-upgrade'}> & {confirmed: true; expectedRefund: number});
export interface OriginalColonyConstructionQuote {
    type: OriginalColonyConstructionRequest['type'];
    industryIds: string[];
    queueItemRefs: string[];
    industryRef: string | null;
    /** Original Java int; credits apply its float conversion. */
    cost: number;
    refund: number;
    requiresConfirmation: boolean;
    /** Actual tripleStep refresh, only when the native UI path does so. No fake game-time advance. */
    economyRefresh: boolean;
}
export interface OriginalColonyConstructionReceipt extends OriginalColonyConstructionQuote {
    creditsBefore: number;
    creditsAfter: number;
}
export interface OriginalColonyConstructionReadServices<R extends OriginalConstructionQueueRow> {
    /** All services are synchronous and bound to this exact market/authorized player. */
    getSpec(industryId: string): OriginalColonyConstructionSpec;
    /** Construct a real fresh candidate with native construction side effects, not a manufactured DTO. */
    instantiate(industryId: string): R;
    /** Return the live row whose entry is exactly the market.industries entry. */
    getIndustry(industryId: string): R | null;
    isAvailable(row: R): boolean;
    isHidden(row: R): boolean;
    /** Actual getBuildCost, including override; no caller-authored price or discount. */
    readBuildCost(row: R): number;
    /** Actual getter (disruption may yield zero); do not pass raw progress. Native NaN is allowed. */
    readBuildOrUpgradeProgress(row: R): number;
    /** Actual Misc count, including queue tags and real instantiated qualifying upgrade candidates. */
    readIndustryCount(): number;
}
export interface OriginalColonyConstructionServices<R extends OriginalConstructionQueueRow> extends OriginalColonyConstructionReadServices<R> {
    /** Allocate a unique identity, without inserting anything in the queue. */
    allocateQueueItemRef(): string;
    /** Full actual removal/unapply/core/item return. LOCAL binds this player's fleet cargo; REMOTE market storage. */
    removeIndustry(row: R, interactionMode: 'LOCAL' | 'REMOTE', forUpgrade: false): void;
    /** Actual cancelUpgrade lifecycle mutation, not removal/recreation or changing a string ID. */
    cancelUpgrade(row: R): void;
    /** Original economy tripleStep/reapplication, synchronous inside the caller's revision transaction. */
    refreshEconomy(): void;
}
export interface OriginalColonyConstructionStartServices<R extends OriginalConstructionQueueRow> {
    getSpec(industryId: string): OriginalColonyConstructionSpec;
    getIndustry(industryId: string): R | null;
    instantiate(industryId: string): R;
    isAvailable(row: R): boolean;
    /** Native Market.addIndustry including actual apply semantics; may instantiate another row. */
    add(industryId: string): R;
    startBuilding(row: R): void;
    /** Stage notification in the host transaction. Do not publish until commit. */
    message(row: R, kind: 'started' | 'cancelled', cost: number | null): void;
}
/** Runs real candidate/getter services, but does not mutate the credit/queue ledger. Use at the host revision. */
export function quoteOriginalColonyConstructionCommand<R extends OriginalConstructionQueueRow>(
    market: OriginalConstructionQueueMarket, credits: OriginalColonyConstructionCredits,
    request: OriginalColonyConstructionRequest, runtime: OriginalColonyConstructionReadServices<R>,
): OriginalColonyConstructionQuote;
/**
 * Real shared-state transaction. Build queues then charges; no eager queue start.
 * All admission/confirmation failures leave its ledger unchanged. Throws abort the ENTIRE host revision
 * transaction: local queue/credits rollback does not undo service side effects on cargo/economy/lifecycle.
 * Host must bind ownership and credits explicitly and reject stale revisions before entry.
 */
export function executeOriginalColonyConstructionCommand<R extends OriginalConstructionQueueRow>(
    market: OriginalConstructionQueueMarket, credits: OriginalColonyConstructionCredits,
    command: OriginalColonyConstructionCommand, runtime: OriginalColonyConstructionServices<R>,
): OriginalColonyConstructionReceipt;
/** Native Market.advance idle-queue phase; refunds are bound to the supplied actual credits, never a global fleet. */
export function startOriginalColonyConstructionIfIdle<R extends OriginalConstructionQueueRow>(
    market: OriginalConstructionQueueMarket, credits: OriginalColonyConstructionCredits,
    runtime: OriginalColonyConstructionStartServices<R>,
): string | null;

export interface OriginalColonyConstructionInspectServices<R extends OriginalConstructionQueueRow> extends OriginalColonyConstructionReadServices<R> {
    /** Explicit implementation gate. False is not fabricated original unavailability; reported separately. */
    supportsIndustry(industryId: string): boolean;
    showWhenUnavailable(row: R): boolean;
    readCurrentName(row: R): string;
    readCurrentImage(row: R): string | null;
}
export interface OriginalColonyConstructionBuildOption {
    industryId: string;
    name: string;
    imageName: string | null;
    tags: string[];
    /** Installed directory baseline only. Do not charge this instead of cost. */
    specCost: number;
    /** Actual candidate getBuildCost narrowed to int, suitable for confirmed expectedCost. */
    cost: number;
    available: boolean;
    withinIndustryLimit: boolean;
    canAfford: boolean;
    enabled: boolean;
    reasons: ('unavailable' | 'industry-limit' | 'insufficient-credits')[];
}
export interface OriginalColonyConstructionBuildInspection {
    canOpenBuildDialog: boolean;
    visibleIndustryCount: number;
    queuedCount: number;
    /** Native enumeration order, not the complete presentation comparator. */
    options: OriginalColonyConstructionBuildOption[];
    unsupportedChoices: {industryId: string; reason: 'grouped-choice' | 'unimplemented-plugin'}[];
}
/**
 * MUST run as an explicit mutation transaction, not GET: evaluates real candidate constructors in
 * original two-pass order. Quotes/receipts are projections, never substitutes for actual live state.
 */
export function inspectOriginalColonyConstructionBuildOptions<R extends OriginalConstructionQueueRow>(
    market: OriginalConstructionQueueMarket, credits: OriginalColonyConstructionCredits,
    runtime: OriginalColonyConstructionInspectServices<R>,
): OriginalColonyConstructionBuildInspection;