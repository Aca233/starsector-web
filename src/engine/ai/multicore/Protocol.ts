import { scalarWireCodec, type ScalarWireCodec } from './ScalarWire';
import { Vector2 } from '../../math/Vector2';
import { weaponDps, weaponRange } from '../ShipCombatProfile';
import { weaponMuzzle, weaponMuzzleExtent } from '../FireControlGeometry';
import type { Ship } from '../../simulation/Ship';
import type { CapitalShipAI } from '../CapitalShipAI';
import type { CombatEngine } from '../../simulation/CombatEngine';
import type { Fields, Part, Model, NumericPacket, Frame, Row } from './Types';
export const controls = ['fireControlMode', 'isFiringMain', 'defenseFacingRad', 'aiHoldOffensiveFire', 'throttle', 'brakeInput', 'strafeInput', 'turnInput'];
export const primitive = (v: unknown) => v === null || typeof v !== 'object' && typeof v !== 'function';
export function parts(s: Ship, ai: CapitalShipAI): Part[] {
    const out: Part[] = [['ship', s]];
    for (const k of ['flux', 'shield', 'system', 'defenseSystem', 'engineController', 'hullStats', 'pos', 'prevPos', 'vel', 'aimTargetWorld'])
        out.push([k, s[k]]);
    for (const m of s.weapons)
        out.push(['mount', m], ['relativePos', m.relativePos], ['health', m.healthTracker]);
    for (const e of s.engineController.engines)
        out.push(['engine', e], ['engineHealth', e.healthTracker]);
    out.push(['ai', ai], ['defense', ai['defense']]);
    return out;
}
/** Check retained codec node identities without rebuilding thousands of tuple arrays per step. */
export function matchesParts(s: Ship, ai: CapitalShipAI, expected: Part[]): boolean {
    let index = 0;
    const same = (node: Fields) => expected[index++]?.[1] === node;
    if (!same(s)) return false;
    for (const key of ['flux', 'shield', 'system', 'defenseSystem', 'engineController', 'hullStats', 'pos', 'prevPos', 'vel', 'aimTargetWorld'])
        if (!same(s[key])) return false;
    for (const mount of s.weapons)
        if (!same(mount) || !same(mount.relativePos) || !same(mount.healthTracker)) return false;
    for (const engine of s.engineController.engines)
        if (!same(engine) || !same(engine.healthTracker)) return false;
    return same(ai) && same(ai['defense']) && index === expected.length;
}
export const motionKeys = ['maxSpeed', 'acceleration', 'deceleration', 'maxTurnRate', 'turnAcceleration', 'turnDeceleration', 'driftAcceleration', 'strafeMultiplier'];
const shipFields = ['pos.x', 'pos.y', 'vel.x', 'vel.y', 'facingRad', 'isDead', 'isPlayer', 'teamId', 'visibilityMask', 'visibilityOverflow', 'visibleToPlayer', 'visibleToEnemy', 'isPhased', 'shield.isActive', 'shield.radius', 'shield.currentArcDeg', 'shield.phaseChargeDownDuration', 'flux.isOverloaded', 'flux.overloadTimer', 'flux.isVenting', 'system.blocksWeapons', 'system.chargeDownDuration'];
const mountFields = ['currentAngleRad', 'ammo', 'isDisabled', 'firingState', 'firingStateTimer', 'burstRemaining', 'burstTimer', 'cooldownTimer', 'barrelIndex', 'fireControlTargetShipId', 'fireControl.reason', 'fireControl.targetKind'];
const projectileFields = ['sourceShipId', 'isPlayer', 'isFlare', 'didDamage', 'damage', 'damageType', 'flightTimeRemaining', 'rangeRemaining', 'sourceMoveSpeed', 'fadeTime', 'fadeProgress', 'pos.x', 'pos.y', 'vel.x', 'vel.y', 'radius', 'proximityFuse.range', 'isGuided', 'targetShipId', 'facingRad', 'maxTurnRate', 'maxSpeed', 'teamId'] as const;
export const shipPaths = shipFields.map(s => s.split('.'));
export const mountPaths = mountFields.map(s => s.split('.'));
export const projectilePaths = projectileFields.map(s => s.split('.'));
export function readPath(o: Fields, p: string[]) { return p.length === 1 ? o[p[0]] : o[p[0]]?.[p[1]]; }
export function writePath(o: Fields, p: string[], v: unknown) {
    if (p.length === 1)
        o[p[0]] = v;
    else
        (o[p[0]] ??= {})[p[1]] = v;
}
export class NumericStore {
    readonly values: Float64Array<SharedArrayBuffer>;
    readonly tags: Uint8Array<SharedArrayBuffer>;
    readonly dictionary: string[] = [];
    private readonly ids = new Map<string, number>();
    private readonly original: unknown[] = [];
    constructor(capacity: number) {
        this.values = new Float64Array(new SharedArrayBuffer(capacity * 8));
        this.tags = new Uint8Array(new SharedArrayBuffer(capacity));
    }
    set(i: number, v: unknown): void {
        if (i >= this.values.length)
            throw new Error('AI wire capacity exceeded');
        this.original[i] = v;
        let t = 0, n = 0;
        if (v === undefined)
            t = 0;
        else if (typeof v === 'number') {
            t = 1;
            n = v;
        }
        else if (typeof v === 'boolean') {
            t = 2;
            n = v ? 1 : 0;
        }
        else if (v === null)
            t = 3;
        else if (typeof v === 'string') {
            t = 4;
            let id = this.ids.get(v);
            if (id === undefined) {
                id = this.dictionary.length;
                this.ids.set(v, id);
                this.dictionary.push(v);
            }
            n = id;
        }
        else
            t = 5;
        this.tags[i] = t;
        this.values[i] = n;
    }
    equals(i: number, value: unknown): boolean { return Object.is(this.original[i], value); }
    packet(count: number): NumericPacket {
        if (count > this.values.length)
            throw new Error('AI wire capacity exceeded');
        return { values: this.values.buffer, tags: this.tags.buffer, dictionary: this.dictionary, count };
    }
}
export class NumericReader {
    private readonly v: Float64Array;
    private readonly t: Uint8Array;
    private readonly dictionary: string[];
    static readonly object = Symbol('object field: not part of scalar protocol');
    constructor(p: NumericPacket) { this.v = new Float64Array(p.values); this.t = new Uint8Array(p.tags); this.dictionary = p.dictionary; }
    get(i: number) {
        switch (this.t[i]) {
            case 0: return undefined;
            case 1: return this.v[i];
            case 2: return this.v[i] === 1;
            case 3: return null;
            case 4: return this.dictionary[this.v[i]];
            case 5: return NumericReader.object;
            default: throw new Error('Invalid AI wire tag');
        }
    }
}

/** Explicit version of projectilePaths, in exactly the same wire order. Avoid
 * a polymorphic string-path lookup for every field of every live projectile.
 * NumericStore/Reader still preserve undefined, null, strings and special numbers. */
export const projectileWireWidth: (typeof projectileFields)['length'] = 23;
function encodeProjectile(store: NumericStore, p: Fields, offset: number): void {
    store.set(offset + 0, p.sourceShipId);
    store.set(offset + 1, p.isPlayer);
    store.set(offset + 2, p.isFlare);
    store.set(offset + 3, p.didDamage);
    store.set(offset + 4, p.damage);
    store.set(offset + 5, p.damageType);
    store.set(offset + 6, p.flightTimeRemaining);
    store.set(offset + 7, p.rangeRemaining);
    store.set(offset + 8, p.sourceMoveSpeed);
    store.set(offset + 9, p.fadeTime);
    store.set(offset + 10, p.fadeProgress);
    store.set(offset + 11, p.pos?.x);
    store.set(offset + 12, p.pos?.y);
    store.set(offset + 13, p.vel?.x);
    store.set(offset + 14, p.vel?.y);
    store.set(offset + 15, p.radius);
    store.set(offset + 16, p.proximityFuse?.range);
    store.set(offset + 17, p.isGuided);
    store.set(offset + 18, p.targetShipId);
    store.set(offset + 19, p.facingRad);
    store.set(offset + 20, p.maxTurnRate);
    store.set(offset + 21, p.maxSpeed);
    store.set(offset + 22, p.teamId);
}
function matchesProjectile(store: NumericStore, p: Fields, offset: number): boolean {
    return store.equals(offset + 0, p.sourceShipId)
        && store.equals(offset + 1, p.isPlayer)
        && store.equals(offset + 2, p.isFlare)
        && store.equals(offset + 3, p.didDamage)
        && store.equals(offset + 4, p.damage)
        && store.equals(offset + 5, p.damageType)
        && store.equals(offset + 6, p.flightTimeRemaining)
        && store.equals(offset + 7, p.rangeRemaining)
        && store.equals(offset + 8, p.sourceMoveSpeed)
        && store.equals(offset + 9, p.fadeTime)
        && store.equals(offset + 10, p.fadeProgress)
        && store.equals(offset + 11, p.pos?.x)
        && store.equals(offset + 12, p.pos?.y)
        && store.equals(offset + 13, p.vel?.x)
        && store.equals(offset + 14, p.vel?.y)
        && store.equals(offset + 15, p.radius)
        && store.equals(offset + 16, p.proximityFuse?.range)
        && store.equals(offset + 17, p.isGuided)
        && store.equals(offset + 18, p.targetShipId)
        && store.equals(offset + 19, p.facingRad)
        && store.equals(offset + 20, p.maxTurnRate)
        && store.equals(offset + 21, p.maxSpeed)
        && store.equals(offset + 22, p.teamId);
}
export function readProjectile(reader: NumericReader, p: Fields, offset: number): void {
    p.sourceShipId = reader.get(offset + 0);
    p.isPlayer = reader.get(offset + 1);
    p.isFlare = reader.get(offset + 2);
    p.didDamage = reader.get(offset + 3);
    p.damage = reader.get(offset + 4);
    p.damageType = reader.get(offset + 5);
    p.flightTimeRemaining = reader.get(offset + 6);
    p.rangeRemaining = reader.get(offset + 7);
    p.sourceMoveSpeed = reader.get(offset + 8);
    p.fadeTime = reader.get(offset + 9);
    p.fadeProgress = reader.get(offset + 10);
    (p.pos ??= {}).x = reader.get(offset + 11);
    (p.pos ??= {}).y = reader.get(offset + 12);
    (p.vel ??= {}).x = reader.get(offset + 13);
    (p.vel ??= {}).y = reader.get(offset + 14);
    p.radius = reader.get(offset + 15);
    (p.proximityFuse ??= {}).range = reader.get(offset + 16);
    p.isGuided = reader.get(offset + 17);
    p.targetShipId = reader.get(offset + 18);
    p.facingRad = reader.get(offset + 19);
    p.maxTurnRate = reader.get(offset + 20);
    p.maxSpeed = reader.get(offset + 21);
    p.teamId = reader.get(offset + 22);
}

export class Publisher {
    private readonly ownGroups: { node: Fields; offset: number; codec: ScalarWireCodec }[] = [];
    private readonly localGroups: { node: Fields; offset: number; codec: ScalarWireCodec }[] = [];
    private readonly localValidationSlots: [Fields, string][] = [];
    private localValidationValues: unknown[] = [];
    private mountValidationValues: unknown[] = [];
    readonly ships: Ship[];
    readonly indices: Map<Ship, number>;
    readonly aiByShip: Map<Ship, CapitalShipAI>;
    readonly nodes: Part[][];
    readonly models: Model[];
    private readonly ownSlots: [
        Fields,
        string
    ][] = [];
    private readonly own: NumericStore;
    private readonly world: NumericStore;
    private readonly projectiles = new NumericStore(2000000);
    private readonly generation = new Int32Array(new SharedArrayBuffer(4));
    private sequence = 0;
    private lastFrame: Frame | null = null;
    private lastMetadata = '';
    constructor(ships: Ship[], ais: CapitalShipAI[]) {
        this.ships = [...ships];
        this.indices = new Map(ships.map((s, i) => [s, i]));
        this.aiByShip = new Map(ais.map(a => [a.ship, a]));
        this.nodes = ships.map(s => parts(s, this.aiByShip.get(s)!));
        this.models = ships.map((s, index) => {
            const offset = this.ownSlots.length;
            const schema = this.nodes[index].map(([kind, node]) => {
                let keys = [...new Set([...Object.keys(node).filter(k => primitive(node[k]) && !['tacticalAI', 'currentTargetShip', 'combatShips', 'activationTarget'].includes(k)), ...(kind === 'ship' ? controls : []), ...(kind === 'mount' ? ['fireControlTargetShipId'] : [])])];
                if (['engineController', 'engine', 'engineHealth', 'health'].includes(kind)) {
                    // Motion is published, not reimplemented by owners. Keep its original component
                    // inputs locally so validation need not recompute all derived motion/range/muzzles.
                    if (keys.length) this.localGroups.push({ node, offset: this.localValidationSlots.length, codec: scalarWireCodec(keys) });
                    for (const key of keys) this.localValidationSlots.push([node, key]);
                    keys = [];
                }
                if (kind === 'mount')
                    keys = ['ammo', 'isDisabled', 'currentAngleRad', 'burstRemaining', 'burstTimer', 'firingState', 'firingStateTimer', 'cooldownTimer', 'barrelIndex'];
                if (keys.length) this.ownGroups.push({ node, offset: this.ownSlots.length, codec: scalarWireCodec(keys) });
                for (const key of keys)
                    this.ownSlots.push([node, key]);
                return { kind, keys };
            });
            return { index, id: s.id, specId: s.spec.id, isPlayer: s.isPlayer, offset, schema, mountCount: s.weapons.length, mounts: s.weapons.map(m=>({spec:m.spec,slotId:m.slotId,mountType:m.mountType,baseAngleDeg:m.baseAngleDeg,arcDeg:m.arcDeg,x:m.relativePos.x,y:m.relativePos.y})) };
        });
        this.own = new NumericStore(this.ownSlots.length);
        this.world = new NumericStore(ships.reduce((n, s) => n + shipPaths.length + 1 + motionKeys.length + s.weapons.length * (mountPaths.length + 5), 0));
    }
    private encode(engine: CombatEngine, ais: CapitalShipAI[], dt: number): Frame {
        for (const group of this.ownGroups) group.codec.encode(this.own, group.node, group.offset);
        let q = 0;
        const muzzle = new Vector2();
        for (const s of this.ships) {
            for (const p of shipPaths)
                this.world.set(q++, readPath(s, p));
            this.world.set(q++, s.flux.getTimeToVent());
            const motion = s.getMotionStats();
            for (const k of motionKeys)
                this.world.set(q++, motion[k]);
            for (const m of s.weapons) {
                for (const p of mountPaths)
                    this.world.set(q++, readPath(m, p));
                this.world.set(q++, weaponRange(s, m));
                this.world.set(q++, weaponDps(m));
                this.world.set(q++, weaponMuzzleExtent(m));
                weaponMuzzle(s, m, muzzle);
                this.world.set(q++, muzzle.x);
                this.world.set(q++, muzzle.y);
            }
        }
        const worldCount = q;
        q = 0;
        for (const p of engine.projectiles) {
            encodeProjectile(this.projectiles, p, q);
            q += projectileWireWidth;
        }
        return {
            sequence: this.sequence, dt, control: this.generation.buffer,
            own: this.own.packet(this.ownSlots.length), world: this.world.packet(worldCount), projectiles: this.projectiles.packet(q), projectileCount: engine.projectiles.length,
            beams: engine.beams.map(b => ({ ...b, startPos: { x: b.startPos.x, y: b.startPos.y }, endPos: { x: b.endPos.x, y: b.endPos.y } })),
            asteroids: engine.asteroids.map(a => ({ hp: a.hp, radius: a.radius, pos: { x: a.pos.x, y: a.pos.y }, vel: { x: a.vel.x, y: a.vel.y } })),
            jobs: ais.map(ai => this.indices.get(ai.ship)!),
            targets: this.ships.map(s => this.indices.get(engine.findHostile(s) ?? this.aiByShip.get(s)!.targetShip)!),
            currentTargets: this.ships.map(s => this.indices.get(s.currentTargetShip) ?? -1),
            tactical: this.ships.map(s => s.tacticalAI),
            fleetPlan: [...engine.planFleetAI()]
        };
    }
    private metadata(f: Frame): string {
        return JSON.stringify([f.dt, f.own.count, f.world.count, f.projectiles.count, f.beams, f.asteroids, f.jobs, f.targets, f.currentTargets, f.tactical], (_key, value) => typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)) ? ['number', String(value), Object.is(value, -0)] : value);
    }
    publish(engine: CombatEngine, ais: CapitalShipAI[], dt: number): Frame {
        this.sequence++;
        const f = this.encode(engine, ais, dt);
        this.lastFrame = f;
        for (const group of this.localGroups) group.codec.capture(this.localValidationValues, group.node, group.offset);
        let q = 0;
        for (const ship of this.ships) for (const mount of ship.weapons) {
            this.mountValidationValues[q++] = mount.fireControlTargetShipId;
            this.mountValidationValues[q++] = mount.fireControl?.reason;
            this.mountValidationValues[q++] = mount.fireControl?.targetKind;
        }
        this.mountValidationValues.length = q;
        this.lastMetadata = this.metadata(f);
        Atomics.store(this.generation, 0, this.sequence);
        return f;
    }
    /** Read/compare only: never overwrite a shared frame while an owner might read it. */
    matches(engine: CombatEngine, ais: CapitalShipAI[], dt: number): boolean {
        if (!this.lastFrame)
            return false;
        const old = this.lastFrame;
        if (dt !== old.dt || engine.projectiles.length !== old.projectileCount || ais.length !== old.jobs.length) return false;
        for (const group of this.ownGroups)
            if (!group.codec.matches(this.own, group.node, group.offset)) return false;
        for (const group of this.localGroups)
            if (!group.codec.matchesLocal(this.localValidationValues, group.node, group.offset)) return false;
        let i = 0;
        for (const ship of this.ships) for (const m of ship.weapons) {
            if (!Object.is(m.fireControlTargetShipId, this.mountValidationValues[i++])
                || !Object.is(m.fireControl?.reason, this.mountValidationValues[i++])
                || !Object.is(m.fireControl?.targetKind, this.mountValidationValues[i++])) return false;
        }
        i = 0;
        for (const projectile of engine.projectiles) {
            if (!matchesProjectile(this.projectiles, projectile, i)) return false;
            i += projectileWireWidth;
        }
        // Native definitions/specs/functions are checked by Eligibility both at publish and commit.
        // Every source scalar of the derived world fields has now matched, including engine damage.
        // Only small non-scalar scene metadata remains; no SAB writes or duplicated geometry queries.
        const current: Frame = {
            ...old, dt, jobs: ais.map(ai => this.indices.get(ai.ship)!),
            targets: this.ships.map(s => this.indices.get(engine.findHostile(s) ?? this.aiByShip.get(s)!.targetShip)!),
            currentTargets: this.ships.map(s => this.indices.get(s.currentTargetShip) ?? -1),
            tactical: this.ships.map(s => s.tacticalAI),
            beams: engine.beams.map(b => ({ ...b, startPos: { x: b.startPos.x, y: b.startPos.y }, endPos: { x: b.endPos.x, y: b.endPos.y } })),
            asteroids: engine.asteroids.map(a => ({ hp: a.hp, radius: a.radius, pos: { x: a.pos.x, y: a.pos.y }, vel: { x: a.vel.x, y: a.vel.y } }))
        };
        return this.metadata(current) === this.lastMetadata;
    }

    commit(index: number, r: Row): void {
        const s = this.ships[index], ai = this.aiByShip.get(s)!;
        for (const [part, fields] of r.changes)
            Object.assign(this.nodes[index][part][1], fields);
        ai.targetShip = this.ships[r.target];
        s.currentTargetShip = this.ships[r.currentTarget] ?? null;
        s.combatShips = this.ships;
        s.tacticalAI = r.tactical;
    }
}
