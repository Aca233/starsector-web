import type { CombatEngine } from '../../simulation/CombatEngine';
import { Ship } from '../../simulation/Ship';
import { SimulationRandom } from '../../simulation/SimulationRandom';
import { modManager } from '../../modding/ModManager';
import { contentRegistry } from '../../content/ContentRegistry';
import { CapitalShipAI } from '../CapitalShipAI';
import { ShipDefenseController } from '../ShipDefenseController';
import { Shield } from '../../simulation/Shield';
import { FluxTracker } from '../../simulation/FluxTracker';
import { ShipSystem } from '../../simulation/ShipSystem';
import type { WeaponSpec } from '../../simulation/Weapon';
import { matchesParts, type Publisher } from './Protocol';
const originalSpec = modManager.getShip('onslaught');
const originalRevision = contentRegistry.revision;
const nativeAI = CapitalShipAI.prototype.update;
const nativeMotion = Ship.prototype.getMotionStats;
const nativeVisible = Ship.prototype.isVisibleTo;
let template: Ship | undefined;
const shipReaders = ['getMotionStats', 'isVisibleTo', 'getShieldCenter', 'clearInput', 'canUseShields', 'startVenting'] as const;
const originalShipReaders = shipReaders.map(k => Ship.prototype[k]);
const nativeSetActive = Shield.prototype.setActive;
const nativeVentTime = FluxTracker.prototype.getTimeToVent;
const nativeActivate = ShipSystem.prototype.activate;
const nativeSystemMethods = Object.entries(Object.getOwnPropertyDescriptors(ShipSystem.prototype))
    .filter(([key, descriptor]) => key !== 'constructor' && typeof descriptor.value === 'function')
    .map(([key, descriptor]) => [key, descriptor.value] as const);
const nativeDefenseUpdate = ShipDefenseController.prototype.update;
const nativeDefenseObserve = ShipDefenseController.prototype.observe;
const nativeDefenseReset = ShipDefenseController.prototype.reset;
/** Exactly the WeaponSpec inputs consumed by owner AI, threat, range and muzzle queries.
 * Other fields belong to authoritative weapon simulation and are neither read nor overwritten
 * by an owner. Nested metadata below must retain its original frozen registry identity. */
function sameAIWeaponSpec(a: WeaponSpec, b: WeaponSpec): boolean {
    return Object.is(a.id, b.id)
        && Object.is(a.range, b.range)
        && Object.is(a.weaponType, b.weaponType)
        && Object.is(a.mountSize, b.mountSize)
        && Object.is(a.mountTypeOverride, b.mountTypeOverride)
        && Object.is(a.isPointDefense, b.isPointDefense)
        && Object.is(a.isRocket, b.isRocket)
        && Object.is(a.spawnType, b.spawnType)
        && Object.is(a.isBeam, b.isBeam)
        && Object.is(a.aiHints, b.aiHints)
        && Object.is(a.hardpointOffsets, b.hardpointOffsets)
        && Object.is(a.turretOffsets, b.turretOffsets)
        && Object.is(a.damagePerSecond, b.damagePerSecond)
        && Object.is(a.damagePerShot, b.damagePerShot)
        && Object.is(a.burstSize, b.burstSize)
        && Object.is(a.burstDelay, b.burstDelay)
        && Object.is(a.chargeTime, b.chargeTime)
        && Object.is(a.refireDelay, b.refireDelay)
        && Object.is(a.turnRateDegPerSec, b.turnRateDegPerSec)
        && Object.is(a.beamVisualMode, b.beamVisualMode)
        && Object.is(a.alwaysFire, b.alwaysFire)
        && Object.is(a.isGuided, b.isGuided)
        && Object.is(a.beamDuration, b.beamDuration)
        && Object.is(a.beamSourceChargeupTime, b.beamSourceChargeupTime)
        && Object.is(a.maxSpeed, b.maxSpeed)
        && Object.is(a.projSpeed, b.projSpeed)
        && Object.is(a.type, b.type);
}
/** Fail closed. This is a native default-Onslaught codec, not a generic mod serializer. */
export function supportsOwnership(engine: CombatEngine, ais: CapitalShipAI[], publisher?: Publisher, checkWeapons = true): boolean {
    if (!originalSpec || contentRegistry.revision !== originalRevision || !engine.canPreviewNativeAI
        || engine.ships.length < 50 || engine.ships.length > 200 || engine.orders.size
        || engine.externallyControlledShipIds.size || engine.isTacticalMap)
        return false;
    if (!template) {
        template = new Ship('ownership-template', originalSpec, false, undefined, 0, new SimulationRandom(1));
    }
    const ships = engine.ships;
    if (ais.length !== ships.length || new Set(ais.map(ai => ai.ship)).size !== ships.length)
        return false;
    if (publisher && (ships.length !== publisher.ships.length || ships.some((s, i) => s !== publisher.ships[i])))
        return false;
    for (const ai of ais) {
        const s = ai.ship;
        if (s.systems.length > 1) return false;
        if (!ships.includes(s) || ai.update !== nativeAI || Object.getPrototypeOf(ai) !== CapitalShipAI.prototype
            || s.spec !== originalSpec || Object.getPrototypeOf(s) !== Ship.prototype
            || s.getMotionStats !== nativeMotion || s.isVisibleTo !== nativeVisible
            || shipReaders.some((k, i) => s[k] !== originalShipReaders[i])
            || s.shield.setActive !== nativeSetActive || s.flux.getTimeToVent !== nativeVentTime
            || s.system.activate !== nativeActivate
            || nativeSystemMethods.some(([key, method]) => s.system[key] !== method || s.defenseSystem[key] !== method)
            || ai['defense'].update !== nativeDefenseUpdate
            || ai['defense'].observe !== nativeDefenseObserve || ai['defense'].reset !== nativeDefenseReset
            || !s.hasNativeThreatPhaseHooks || s.shield.type !== 'FRONT' || s.system.type !== 'BURN_DRIVE'
            || s.system.definition !== template.system.definition || s.defenseSystem.type !== 'NONE'
            || s.system.owner !== s || s.defenseSystem.owner !== s
            || s.system.auxiliary !== s.defenseSystem || s.defenseSystem.auxiliary !== undefined
            || s.shield.damageTakenModifiers.size !== template.shield.damageTakenModifiers.size
            || [...s.shield.damageTakenModifiers].some(([key, value]) => !Object.is(value, template.shield.damageTakenModifiers.get(key)))
            || s.defenseSystem.definition !== template.defenseSystem.definition
            || !s.runtimeModifiers.empty || s.statusEffects.size || s.damageTakenModifiers.size
            || s.externalPhaseEffects.size || s.hullDamageInterceptors.size || s.sourceCarrier
            || s.isSystemDrone || s.isDocked || s.isRetreated || s.retreating
            || s.weapons.length !== template.weapons.length)
            return false;
        for (let i = 0; i < s.weapons.length; i++) {
            const m = s.weapons[i], t = template.weapons[i];
            if (checkWeapons && !sameAIWeaponSpec(m.spec, t.spec) || m.slotId !== t.slotId || m.mountType !== t.mountType
                || m.baseAngleDeg !== t.baseAngleDeg || m.arcDeg !== t.arcDeg
                || m.relativePos.x !== t.relativePos.x || m.relativePos.y !== t.relativePos.y)
                return false;
        }
        // The scalar slots point into original subobjects; replacements must never receive an old result.
        if (publisher) {
            const index = publisher.indices.get(s);
            if (index === undefined || publisher.aiByShip.get(s) !== ai)
                return false;
            if (!matchesParts(s, ai, publisher.nodes[index]))
                return false;
        }
    }
    return true;
}
