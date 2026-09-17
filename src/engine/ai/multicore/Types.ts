import type { FleetPlan, FleetAssignment } from '../FleetTactics';
import type { CapitalShipAI } from '../CapitalShipAI';
import type { ProjectileThreatIndex } from '../ProjectileThreatIndex';
import type { WeaponThreatEnvelope } from '../WeaponThreatEnvelope';
import type { WeaponMount } from "../../simulation/Weapon";
import type { Ship } from '../../simulation/Ship';
import type { CombatEngine } from '../../simulation/CombatEngine';
export type Scalar = undefined | null | number | boolean | string;
/** Reflection is confined to the audited codec. These are not arbitrary serialized Ships. */
export type Fields = Record<string, any>;
export type Part = [
    kind: string,
    node: Fields
];
export interface Model {
    index: number;
    id: string;
    specId: string;
    isPlayer: boolean;
    offset: number;
    schema: {
        kind: string;
        keys: string[];
    }[];
    mountCount: number;
    mounts: Array<Pick<WeaponMount, "spec" | "slotId" | "mountType" | "baseAngleDeg" | "arcDeg"> & {x:number;y:number}>;
}
export interface NumericPacket {
    values: SharedArrayBuffer;
    tags: SharedArrayBuffer;
    dictionary: string[];
    count: number;
}
export interface Frame {
    fleetPlan: [string, FleetAssignment][];
    sequence: number;
    dt: number;
    control: SharedArrayBuffer;
    own: NumericPacket;
    world: NumericPacket;
    projectiles: NumericPacket;
    projectileCount: number;
    beams: Fields[];
    asteroids: Fields[];
    jobs: number[];
    targets: number[];
    currentTargets: number[];
    tactical: Ship['tacticalAI'][];
}
export interface Row {
    index: number;
    changes: [
        part: number,
        fields: Record<string, Scalar>
    ][];
    tactical: Ship['tacticalAI'];
    target: number;
    currentTarget: number;
    navigationDeps: number[];
    needsAuthority: boolean;
}
export interface OwnerResult {
    rows: Row[];
    syncMs: number;
    kernelMs: number;
    totalMs: number;
    ownedShips: number;
    readOnlyViews: number;
}
export interface AIPhaseBatch {
    /** Validates the complete published input again at the real synchronous AI phase. */
    matches(engine: CombatEngine, ais: CapitalShipAI[], dt: number, fleetPlan?: FleetPlan): boolean;
    commit(ai: CapitalShipAI, projectileIndex?: ProjectileThreatIndex, envelope?: WeaponThreatEnvelope, fleetPlan?: FleetPlan): void;
    finish(): void;
}
export interface MulticoreMetrics {
    packMs: number;
    waitMs: number;
    validateMs: number;
    mergeMs: number;
    recomputeMs: number;
    commits: number;
    fallbacks: number;
    authority: number;
    invalidated: boolean;
    kernelMaxMs: number;
    syncMaxMs: number;
}
export type OwnerRequest = {
    id: number;
} & ({
    type: 'init';
    models: Model[];
    indices: number[];
} | {
    type: 'plan';
    frame: Frame;
});
export interface OwnerReply {
    id: number;
    ready?: boolean;
    result?: OwnerResult;
    error?: string;
}
