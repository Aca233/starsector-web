import { CapitalShipAI } from '../CapitalShipAI';
import { ShipDefenseController } from '../ShipDefenseController';
import { Ship } from '../../simulation/Ship';
import { Shield } from '../../simulation/Shield';
import { FluxTracker } from '../../simulation/FluxTracker';
import { ShipSystem } from '../../simulation/ShipSystem';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { contentRegistry } from '../../content/ContentRegistry';
import { installedHullMods, hullModDefinitions } from '../../extensions/HullMods';
import { shipSystemDefinitions } from '../../extensions/ship-systems/Registry';
import { matchesParts, type Publisher } from './Protocol';
import type { WeaponMount } from '../../simulation/Weapon';
import type { ShipSpec } from '../../content/ShipSpec';
import type { CombatEngine } from '../../simulation/CombatEngine';

// Separate opt-in tier. The standalone Onslaught gate remains deliberately unchanged.
// These systems' AI only requests activation; all event dispatch stays on the host.
const systemIds = new Set(['NONE', 'BURN_DRIVE', 'AMMO_FEED']);
const nativeSystems = new Map(shipSystemDefinitions.all().map(d => [d, { ...d }]));
const nativeMods = new Map(hullModDefinitions.all().map(d => [d, { ...d }]));
const prototypes = new Map<object, { descriptors: [string, PropertyDescriptor][]; hooks: Set<string> }>([Ship, Shield, FluxTracker, ShipSystem, CapitalShipAI, ShipDefenseController]
    .map(c => {
        const descriptors = Object.entries(Object.getOwnPropertyDescriptors(c.prototype));
        const hooks = new Set(descriptors.filter(([, d]) => d.get || d.set || typeof d.value === 'function').map(([key]) => key));
        return [c.prototype, { descriptors, hooks }] as const;
    }));
function nativePrototypes(): boolean {
    // Prototype completeness is realm-wide, not per ship/component.
    for (const [prototype, { descriptors }] of prototypes) {
        const now = Object.getOwnPropertyDescriptors(prototype);
        if (Object.keys(now).length !== descriptors.length) return false;
        for (const [key, d] of descriptors) {
            const current = now[key];
            if (!current || current.value !== d.value || current.get !== d.get || current.set !== d.set) return false;
        }
    }
    return true;
}
function nativeObject(value: object, prototype: object): boolean {
    if (Object.getPrototypeOf(value) !== prototype) return false;
    const hooks = prototypes.get(prototype)!.hooks;
    for (const key of Object.getOwnPropertyNames(value)) if (hooks.has(key)) return false;
    return true;
}
interface PhaseAudit { native: boolean; definitions: Map<object, boolean>; mods: Map<ShipSpec, boolean> }
function phaseAudit(): PhaseAudit { return { native: nativePrototypes(), definitions: new Map(), mods: new Map() }; }
function auditedDefinition(value: object, expected: object | undefined, audit: PhaseAudit): boolean {
    let valid = audit.definitions.get(value);
    if (valid === undefined) {
        valid = !!expected && (isImmutableMetadata(value) || sameDefinition(value, expected));
        audit.definitions.set(value, valid);
    }
    return valid;
}
function sameDefinition(value: object, expected: object | undefined): boolean {
    return !!expected && Object.keys(value).length === Object.keys(expected).length
        && Object.keys(expected).every(k => Object.is(value[k], expected[k]));
}
/** Exact metadata comparison, retaining undefined, nonfinite numbers and signed zero. */
export function lanMetadata(value: unknown): string {
    return JSON.stringify(value, (_k, v) => v === undefined ? ['undefined']
        : typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0)) ? ['number', String(v), Object.is(v, -0)] : v);
}
export function lanPhaseAIs(engine: CombatEngine, ais: CapitalShipAI[]): CapitalShipAI[] {
    return ais.filter(ai => !engine.externallyControlledShipIds.has(ai.ship.id));
}
/** Reasons are intentionally narrower than "all native ships supported". */
export function lanSerialReason(engine: CombatEngine, ai: CapitalShipAI, audit = phaseAudit()): string | null {
    const s = ai.ship;
    if (engine.orders.has(s.id) || s.isPlayer && engine.orders.has('fleet')) return 'ordered-ai';
    if (!audit.native || !nativeObject(ai, CapitalShipAI.prototype) || !nativeObject(ai['defense'], ShipDefenseController.prototype)
        || !nativeObject(s, Ship.prototype) || !nativeObject(s.shield, Shield.prototype)
        || !nativeObject(s.flux, FluxTracker.prototype)) return 'custom-ai-or-hooks';
    if (!s.hasNativeThreatPhaseHooks || !s.runtimeModifiers.empty || s.statusEffects.size
        || s.damageTakenModifiers.size || s.externalPhaseEffects.size || s.hullDamageInterceptors.size)
        return 'dynamic-hooks-or-modifiers';
    if (s.sourceCarrier || s.spec.hullSize === 'FIGHTER' || s.parentShip || s.childModules.length
        || s.spec.modules?.length || s.isSystemDrone || s.isDocked || s.isRetreated || s.retreating)
        return 'fighter-module-or-transient';
    // Phase activation has non-scalar transitions; leave that small tier serial for now.
    if (!['FRONT', 'OMNI', 'NONE'].includes(s.shield.type)) return 'phase-shield';
    if (s.shield.damageTakenModifiers.size !== 1
        || !Object.is(s.shield.damageTakenModifiers.get('hullmods'), s.hullStats.shieldDamageMultiplier))
        return 'shield-modifiers';
    if (s.systems.length > 1) return 'multi-system-loadout';
    for (const system of [s.system, s.defenseSystem]) {
        if (!nativeObject(system, ShipSystem.prototype) || !systemIds.has(system.type)
            || !auditedDefinition(system.definition, nativeSystems.get(system.definition), audit) || system.owner !== s)
            return 'unaudited-system';
    }
    if (s.defenseSystem.type !== 'NONE' || s.system.auxiliary !== s.defenseSystem
        || s.defenseSystem.auxiliary !== undefined) return 'auxiliary-system';
    let mods = audit.mods.get(s.spec);
    if (mods === undefined) {
        mods = installedHullMods(s.spec).every(mod => auditedDefinition(mod, nativeMods.get(mod), audit)
            && !mod.apply && !mod.advance && !mod.advanceCombat);
        audit.mods.set(s.spec, mods);
    }
    if (!mods) return 'dynamic-hullmod';
    return null;
}
type Fit = { spec: ShipSpec; mounts: Array<Pick<WeaponMount, 'spec' | 'slotId' | 'mountType' | 'baseAngleDeg' | 'arcDeg'> & { x: number; y: number }> };
/** Roster/fit lifetime and per-frame eligibility are distinct: unsupported jobs stay serial. */
export class LanOwnershipGate {
    private readonly revision = contentRegistry.revision;
    private readonly ships: Ship[];
    private readonly fits: Fit[];
    private readonly metadata = new Map<object, string>();
    private readonly ais: CapitalShipAI[];
    readonly indices: number[];
    private readonly ownedShips: Set<Ship>;
    constructor(private readonly engine: CombatEngine, ais: CapitalShipAI[]) {
        this.ships = [...engine.ships];
        this.ais = [...ais];
        const remember = (value: object) => {
            if (!isImmutableMetadata(value) && !this.metadata.has(value)) this.metadata.set(value, lanMetadata(value));
        };
        this.fits = this.ships.map(s => {
            remember(s.spec);
            return { spec: s.spec, mounts: s.weapons.map(m => {
                remember(m.spec);
                return { spec: m.spec, slotId: m.slotId, mountType: m.mountType,
                    baseAngleDeg: m.baseAngleDeg, arcDeg: m.arcDeg, x: m.relativePos.x, y: m.relativePos.y };
            }) };
        });
        const audit = phaseAudit();
        this.indices = ais.filter(ai => !lanSerialReason(engine, ai, audit)).map(ai => this.ships.indexOf(ai.ship));
        this.ownedShips = new Set(this.indices.map(i => this.ships[i]));
    }
    supports(publisher?: Publisher): boolean {
        const engine = this.engine, ships = engine.ships, ais = engine.getNativeAIs();
        if (!engine.canPreviewNativeAI || engine.isTacticalMap || contentRegistry.revision !== this.revision
            || ships.length > 200 || new Set(ships.map(s => s.id)).size !== ships.length
            || ships.length !== this.ships.length || ships.some((s, i) => s !== this.ships[i])
            || ais.length !== this.ais.length || ais.some((ai, i) => ai !== this.ais[i])) return false;
        // Shared fits/weapons are common in large fleets: visit each unique metadata
        // mutable object once per validation, including nested fields. Only registry-proven
        // recursively immutable metadata can skip traversal (not merely Object.isFrozen).
        for (const [value, saved] of this.metadata) if (lanMetadata(value) !== saved) return false;
        for (let i = 0; i < ships.length; i++) {
            const s = ships[i];
            const saved = this.fits[i];
            if (s.spec !== saved.spec || s.weapons.length !== saved.mounts.length) return false;
            for (let j = 0; j < s.weapons.length; j++) {
                const m = s.weapons[j], old = saved.mounts[j];
                if (m.spec !== old.spec || m.slotId !== old.slotId || m.mountType !== old.mountType
                    || !Object.is(m.baseAngleDeg, old.baseAngleDeg) || !Object.is(m.arcDeg, old.arcDeg)
                    || !Object.is(m.relativePos.x, old.x) || !Object.is(m.relativePos.y, old.y)) return false;
            }
            // Read-only views cannot reproduce arbitrary visibility callbacks. All other
            // native world values (including motion) are evaluated on the host and encoded.
            if (s.isVisibleTo !== Ship.prototype.isVisibleTo) return false;
            if (publisher && !matchesParts(s, publisher.aiByShip.get(s)!, publisher.nodes[i])) return false;
        }
        return true;
    }
    jobs(ais: CapitalShipAI[]): CapitalShipAI[] {
        const audit = phaseAudit();
        return lanPhaseAIs(this.engine, ais).filter(ai => this.ownedShips.has(ai.ship) && !lanSerialReason(this.engine, ai, audit));
    }
    /** Captures control, orders and prephase flags even if they produce the same fleet plan. */
    context(): string {
        return lanMetadata([[...this.engine.externallyControlledShipIds].sort(), [...this.engine.orders],
            this.engine.openBattlefield, this.engine.isTacticalMap]);
    }
}
