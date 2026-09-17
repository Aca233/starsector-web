import { scalarWireCodec, type ScalarWireCodec } from './ScalarWire';
import { Ship } from '../../simulation/Ship.ts';
import { CapitalShipAI } from '../../ai/CapitalShipAI.ts';
import { ProjectileThreatIndex } from '../../ai/ProjectileThreatIndex.ts';
import { Vector2 } from '../../math/Vector2.ts';
import { SimulationRandom } from '../../simulation/SimulationRandom.ts';
import { modManager } from '../../modding/ModManager.ts';
import { sound } from '../../audio/SoundManager.ts';
import { parts, controls, primitive, NumericReader, shipPaths, mountPaths, projectileWireWidth, readProjectile, motionKeys, writePath } from './Protocol.ts';
import type { Model, Frame, OwnerResult, Fields, Part, Row, Scalar } from './Types';
import type { TacticalWorld } from '../TacticalWorld';
import type { WeaponThreatEnvelope } from '../WeaponThreatEnvelope';
import type { Projectile, Beam } from '../../simulation/Weapon';
import type { Asteroid } from '../../simulation/CombatTypes';
sound.setMuted(true);
const writable = new Set(['ship', 'flux', 'shield', 'system', 'defenseSystem', 'aimTargetWorld', 'ai', 'defense']);
export class Owner {
    private readonly ownSync: { node: Fields; offset: number; codec: ScalarWireCodec }[] = [];
    private readonly owned: Map<number, {
        ship: Ship;
        ai: CapitalShipAI;
        nodes: Part[];
    }>;
    private readonly views: Fields[];
    private readonly projectilePool: Fields[];
    private projectiles: Projectile[] = [];
    private beams: Beam[] = [];
    private asteroids: Asteroid[] = [];
    private lastSequence: number;
    private readonly indexById: Map<string, number>;
    constructor(private readonly models: Model[], private readonly indices: number[]) {
        this.owned = new Map();
        this.views = [];
        this.projectilePool = [];
        this.lastSequence = 0;
        // Only construct full Ship and CapitalShipAI instances for this owner's partition.
        for (const i of indices) {
            const m = models[i], s = new Ship(m.id, modManager.getShip(m.specId), m.isPlayer, new Vector2(), 0, new SimulationRandom(0x51180));
            const ai = new CapitalShipAI(s, s);
            this.owned.set(i, { ship: s, ai, nodes: parts(s, ai) });
        }
        for (const m of models) {
            const v: Fields = { id: m.id, index: m.index, spec: modManager.getShip(m.specId), pos: new Vector2(), vel: new Vector2(), facingRad: 0, shield: { type: 'FRONT' }, flux: {}, system: { hasNativeStats: true }, weapons: [], motion: {}, hasNativeThreatPhaseHooks: true, isVisibleTo(side) { const team = typeof side === "boolean" ? (side ? 0 : 1) : side; return this.teamId === team || (team < 31 ? !!(this.visibilityMask & (1 << team)) : this.visibilityOverflow === "*" || this.visibilityOverflow?.includes("|" + team + "|")); }, getMotionStats() { return this.motion; } };
            v.flux.getTimeToVent = () => v.ventTime;
            for (const t of m.mounts)
                v.weapons.push({ spec: t.spec, slotId: t.slotId, mountType: t.mountType, relativePos: new Vector2(t.x,t.y), baseAngleDeg: t.baseAngleDeg, arcDeg: t.arcDeg, fireControl: {} });
            v.envelope = { maxRangeAndMuzzle: -Infinity, maxSpeed: 0, motion: v.motion, mounts: [], ranges: [], dps: [], muzzleExtents: [], muzzleX: [], muzzleY: [] };
            this.views.push(v);
        }
        this.indexById = new Map(models.map(m => [m.id, m.index]));
        for (const [i, own] of this.owned) {
            own.ship.getMotionStats = () => this.views[i].motion;
            if (own.nodes.length !== models[i].schema.length)
                throw Error('owned ship schema mismatch');
            let offset = models[i].offset;
            for (let part = 0; part < own.nodes.length; part++) {
                const keys = models[i].schema[part].keys;
                if (keys.length) this.ownSync.push({ node: own.nodes[part][1], offset, codec: scalarWireCodec(keys) });
                offset += keys.length;
            }
        }
    }
    apply(frame: Frame) {
        if (frame.sequence !== this.lastSequence + 1 || Atomics.load(new Int32Array(frame.control), 0) !== frame.sequence)
            throw Error('stale shared frame');
        this.lastSequence = frame.sequence;
        const ownReader = new NumericReader(frame.own), reader = new NumericReader(frame.world);
        let q = 0;
        for (const v of this.views) {
            for (const p of shipPaths)
                writePath(v, p, reader.get(q++));
            v.ventTime = reader.get(q++);
            for (const k of motionKeys)
                v.motion[k] = reader.get(q++);
            const e = v.envelope;
            for (const k of ['mounts', 'ranges', 'dps', 'muzzleExtents', 'muzzleX', 'muzzleY'])
                e[k].length = 0;
            e.maxRangeAndMuzzle = -Infinity;
            e.maxSpeed = v.motion.maxSpeed;
            for (const mount of v.weapons) {
                for (const p of mountPaths)
                    writePath(mount, p, reader.get(q++));
                const range = (reader.get(q++) as number), dps = (reader.get(q++) as number), extent = (reader.get(q++) as number), mx = (reader.get(q++) as number), my = (reader.get(q++) as number);
                if (mount.isDisabled || mount.ammo < 1 || dps <= 0)
                    continue;
                e.mounts.push(mount);
                e.ranges.push(range);
                e.dps.push(dps);
                e.muzzleExtents.push(extent);
                e.muzzleX.push(mx);
                e.muzzleY.push(my);
                e.maxRangeAndMuzzle = Math.max(e.maxRangeAndMuzzle, range + extent);
            }
        }
        for (const group of this.ownSync) group.codec.apply(ownReader, group.node, group.offset, NumericReader.object);
        for (const [i, o] of this.owned) {
            o.ship.currentTargetShip = (this.views[frame.currentTargets[i]] as Ship) ?? null;
            o.ship.tacticalAI = frame.tactical[i];
            o.ai.targetShip = this.views[frame.targets[i]] as Ship;
        }
        const pReader = new NumericReader(frame.projectiles);
        q = 0;
        this.projectiles = [];
        for (let i = 0; i < frame.projectileCount; i++) {
            const p = this.projectilePool[i] ??= { pos: new Vector2(), vel: new Vector2(), proximityFuse: {} };
            readProjectile(pReader, p, q);
            q += projectileWireWidth;
            this.projectiles.push(p as Projectile);
        }
        this.beams = frame.beams.map(b => ({ ...b, startPos: new Vector2(b.startPos.x, b.startPos.y), endPos: new Vector2(b.endPos.x, b.endPos.y) } as Beam));
        this.asteroids = frame.asteroids.map(a => ({ ...a, pos: new Vector2(a.pos.x, a.pos.y), vel: new Vector2(a.vel.x, a.vel.y) } as Asteroid));
    }
    plan(frame: Frame): OwnerResult {
        const start = performance.now();
        this.apply(frame);
        const syncMs = performance.now() - start, begin = performance.now(), rows: Row[] = [];
        const ships = [...this.views], wanted = new Set(frame.jobs);
        let navigationDeps: Set<number>;
        const projectileThreatIndex = this.projectiles.length >= 128 ? new ProjectileThreatIndex(this.projectiles) : undefined;
        const world: TacticalWorld = { fleetPlan: new Map(frame.fleetPlan), ships: ships as Ship[], projectiles: this.projectiles, beams: this.beams, asteroids: this.asteroids, projectileThreatIndex, weaponThreatEnvelope: { get: (s: Ship) => this.views[this.indexById.get(s.id)].envelope } as WeaponThreatEnvelope,
            noteNavigationObstacle: (ship, other, horizon) => { const own = Math.max(ship.spec.collisionRadius, ship.shield.isActive ? ship.shield.radius : 0), radius = Math.max(other.spec.collisionRadius, other.shield.radius); const reach = own + radius + 8 + (ship.getMotionStats().maxSpeed + ship.vel.length() + other.vel.length()) * horizon; const distance = ship.pos.distanceTo(other.pos), pad = 1e-6 * Math.max(1, Math.abs(ship.pos.x), Math.abs(ship.pos.y), Math.abs(other.pos.x), Math.abs(other.pos.y), Math.abs(reach)); if (!Number.isFinite(distance + reach) || distance <= reach + pad)
                navigationDeps.add(this.indexById.get(other.id)); } };
        try {
            for (const i of this.indices) {
                if (!wanted.has(i))
                    continue;
                const own = this.owned.get(i), { ship, ai } = own, model = this.models[i];
                navigationDeps = new Set();
                ships[i] = ship;
                ship.combatShips = ships as Ship[];
                const before: [
                    number,
                    unknown[]
                ][] = [];
                for (let p = 0; p < own.nodes.length; p++)
                    if (writable.has(model.schema[p].kind))
                        before.push([p, model.schema[p].keys.map(k => own.nodes[p][1][k])]);
                ai.update(frame.dt, null, world);
                const changes: Row["changes"] = [];
                let needsAuthority = false;
                for (const [part, values] of before) {
                    const schema = model.schema[part], node = own.nodes[part][1], fields: Record<string, Scalar> = {};
                    let changed = false;
                    for (let k = 0; k < schema.keys.length; k++) {
                        const key = schema.keys[k], v = node[key];
                        if (!Object.is(v, values[k])) {
                            if (!primitive(v)) {
                                needsAuthority = true;
                                continue;
                            }
                            fields[key] = v;
                            changed = true;
                            if (['system', 'defenseSystem', 'flux'].includes(schema.kind) || schema.kind === 'ship' && !controls.includes(key))
                                needsAuthority = true;
                        }
                    }
                    if (changed)
                        changes.push([part, fields]);
                }
                rows.push({ index: i, changes, tactical: ship.tacticalAI, target: this.indexById.get(ai.targetShip.id), currentTarget: ship.currentTargetShip ? this.indexById.get(ship.currentTargetShip.id) : -1, navigationDeps: [...navigationDeps], needsAuthority });
                // Leave owned AI state resident. All other ships in world remain read-only views.
                ships[i] = this.views[i];
            }
        }
        finally {
            projectileThreatIndex?.close();
        }
        return { rows, syncMs, kernelMs: performance.now() - begin, totalMs: performance.now() - start, ownedShips: this.owned.size, readOnlyViews: this.views.length };
    }
}
