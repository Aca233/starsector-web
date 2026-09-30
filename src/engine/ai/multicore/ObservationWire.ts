import type { NumericReader, NumericStore } from './Protocol';
import type { Fields } from './Types';

/** Fixed world-observation protocol, in its original field order. Unlike an
 * object snapshot this schema never depends on caller object keys. Keep the
 * generic paths exported for contracts; every field remains encoded, applied and
 * validated. No value is cached and no numeric tag/precision is changed. */
export const shipPaths = ["hullHp","maxHullHp","hasVastBulk","isRetreated","isDocked","isCollisionless","flux.fluxPercent","pos.x","pos.y","vel.x","vel.y","facingRad","isDead","isPlayer","teamId","visibilityMask","visibilityOverflow","visibleToPlayer","visibleToEnemy","isPhased","shield.type","shield.isActive","shield.radius","shield.currentArcDeg","shield.phaseChargeDownDuration","flux.isOverloaded","flux.overloadTimer","flux.isVenting","system.blocksWeapons","system.chargeDownDuration"].map(key => key.split('.'));
export const shipObservationWidth = shipPaths.length;

export function encodeShipObservation(store: NumericStore, node: Fields, offset: number): void {
    store.set(offset + 0, node.hullHp);
    store.set(offset + 1, node.maxHullHp);
    store.set(offset + 2, node.hasVastBulk);
    store.set(offset + 3, node.isRetreated);
    store.set(offset + 4, node.isDocked);
    store.set(offset + 5, node.isCollisionless);
    store.set(offset + 6, node.flux?.fluxPercent);
    store.set(offset + 7, node.pos?.x);
    store.set(offset + 8, node.pos?.y);
    store.set(offset + 9, node.vel?.x);
    store.set(offset + 10, node.vel?.y);
    store.set(offset + 11, node.facingRad);
    store.set(offset + 12, node.isDead);
    store.set(offset + 13, node.isPlayer);
    store.set(offset + 14, node.teamId);
    store.set(offset + 15, node.visibilityMask);
    store.set(offset + 16, node.visibilityOverflow);
    store.set(offset + 17, node.visibleToPlayer);
    store.set(offset + 18, node.visibleToEnemy);
    store.set(offset + 19, node.isPhased);
    store.set(offset + 20, node.shield?.type);
    store.set(offset + 21, node.shield?.isActive);
    store.set(offset + 22, node.shield?.radius);
    store.set(offset + 23, node.shield?.currentArcDeg);
    store.set(offset + 24, node.shield?.phaseChargeDownDuration);
    store.set(offset + 25, node.flux?.isOverloaded);
    store.set(offset + 26, node.flux?.overloadTimer);
    store.set(offset + 27, node.flux?.isVenting);
    store.set(offset + 28, node.system?.blocksWeapons);
    store.set(offset + 29, node.system?.chargeDownDuration);
}
export function matchesShipObservation(store: NumericStore, node: Fields, offset: number): boolean {
    return store.equals(offset + 0, node.hullHp)
        && store.equals(offset + 1, node.maxHullHp)
        && store.equals(offset + 2, node.hasVastBulk)
        && store.equals(offset + 3, node.isRetreated)
        && store.equals(offset + 4, node.isDocked)
        && store.equals(offset + 5, node.isCollisionless)
        && store.equals(offset + 6, node.flux?.fluxPercent)
        && store.equals(offset + 7, node.pos?.x)
        && store.equals(offset + 8, node.pos?.y)
        && store.equals(offset + 9, node.vel?.x)
        && store.equals(offset + 10, node.vel?.y)
        && store.equals(offset + 11, node.facingRad)
        && store.equals(offset + 12, node.isDead)
        && store.equals(offset + 13, node.isPlayer)
        && store.equals(offset + 14, node.teamId)
        && store.equals(offset + 15, node.visibilityMask)
        && store.equals(offset + 16, node.visibilityOverflow)
        && store.equals(offset + 17, node.visibleToPlayer)
        && store.equals(offset + 18, node.visibleToEnemy)
        && store.equals(offset + 19, node.isPhased)
        && store.equals(offset + 20, node.shield?.type)
        && store.equals(offset + 21, node.shield?.isActive)
        && store.equals(offset + 22, node.shield?.radius)
        && store.equals(offset + 23, node.shield?.currentArcDeg)
        && store.equals(offset + 24, node.shield?.phaseChargeDownDuration)
        && store.equals(offset + 25, node.flux?.isOverloaded)
        && store.equals(offset + 26, node.flux?.overloadTimer)
        && store.equals(offset + 27, node.flux?.isVenting)
        && store.equals(offset + 28, node.system?.blocksWeapons)
        && store.equals(offset + 29, node.system?.chargeDownDuration);
}
export function applyShipObservation(reader: NumericReader, node: Fields, offset: number): void {
    node.hullHp = reader.get(offset + 0);
    node.maxHullHp = reader.get(offset + 1);
    node.hasVastBulk = reader.get(offset + 2);
    node.isRetreated = reader.get(offset + 3);
    node.isDocked = reader.get(offset + 4);
    node.isCollisionless = reader.get(offset + 5);
    { const value = reader.get(offset + 6); (node.flux ??= {}).fluxPercent = value; }
    { const value = reader.get(offset + 7); (node.pos ??= {}).x = value; }
    { const value = reader.get(offset + 8); (node.pos ??= {}).y = value; }
    { const value = reader.get(offset + 9); (node.vel ??= {}).x = value; }
    { const value = reader.get(offset + 10); (node.vel ??= {}).y = value; }
    node.facingRad = reader.get(offset + 11);
    node.isDead = reader.get(offset + 12);
    node.isPlayer = reader.get(offset + 13);
    node.teamId = reader.get(offset + 14);
    node.visibilityMask = reader.get(offset + 15);
    node.visibilityOverflow = reader.get(offset + 16);
    node.visibleToPlayer = reader.get(offset + 17);
    node.visibleToEnemy = reader.get(offset + 18);
    node.isPhased = reader.get(offset + 19);
    { const value = reader.get(offset + 20); (node.shield ??= {}).type = value; }
    { const value = reader.get(offset + 21); (node.shield ??= {}).isActive = value; }
    { const value = reader.get(offset + 22); (node.shield ??= {}).radius = value; }
    { const value = reader.get(offset + 23); (node.shield ??= {}).currentArcDeg = value; }
    { const value = reader.get(offset + 24); (node.shield ??= {}).phaseChargeDownDuration = value; }
    { const value = reader.get(offset + 25); (node.flux ??= {}).isOverloaded = value; }
    { const value = reader.get(offset + 26); (node.flux ??= {}).overloadTimer = value; }
    { const value = reader.get(offset + 27); (node.flux ??= {}).isVenting = value; }
    { const value = reader.get(offset + 28); (node.system ??= {}).blocksWeapons = value; }
    { const value = reader.get(offset + 29); (node.system ??= {}).chargeDownDuration = value; }
}

export const mountPaths = ["currentAngleRad","ammo","isDisabled","firingState","firingStateTimer","burstRemaining","burstTimer","cooldownTimer","barrelIndex","fireControlTargetShipId","fireControl.reason","fireControl.targetKind"].map(key => key.split('.'));
export const mountObservationWidth = mountPaths.length;

export function encodeMountObservation(store: NumericStore, node: Fields, offset: number): void {
    store.set(offset + 0, node.currentAngleRad);
    store.set(offset + 1, node.ammo);
    store.set(offset + 2, node.isDisabled);
    store.set(offset + 3, node.firingState);
    store.set(offset + 4, node.firingStateTimer);
    store.set(offset + 5, node.burstRemaining);
    store.set(offset + 6, node.burstTimer);
    store.set(offset + 7, node.cooldownTimer);
    store.set(offset + 8, node.barrelIndex);
    store.set(offset + 9, node.fireControlTargetShipId);
    store.set(offset + 10, node.fireControl?.reason);
    store.set(offset + 11, node.fireControl?.targetKind);
}
export function matchesMountObservation(store: NumericStore, node: Fields, offset: number): boolean {
    return store.equals(offset + 0, node.currentAngleRad)
        && store.equals(offset + 1, node.ammo)
        && store.equals(offset + 2, node.isDisabled)
        && store.equals(offset + 3, node.firingState)
        && store.equals(offset + 4, node.firingStateTimer)
        && store.equals(offset + 5, node.burstRemaining)
        && store.equals(offset + 6, node.burstTimer)
        && store.equals(offset + 7, node.cooldownTimer)
        && store.equals(offset + 8, node.barrelIndex)
        && store.equals(offset + 9, node.fireControlTargetShipId)
        && store.equals(offset + 10, node.fireControl?.reason)
        && store.equals(offset + 11, node.fireControl?.targetKind);
}
export function applyMountObservation(reader: NumericReader, node: Fields, offset: number): void {
    node.currentAngleRad = reader.get(offset + 0);
    node.ammo = reader.get(offset + 1);
    node.isDisabled = reader.get(offset + 2);
    node.firingState = reader.get(offset + 3);
    node.firingStateTimer = reader.get(offset + 4);
    node.burstRemaining = reader.get(offset + 5);
    node.burstTimer = reader.get(offset + 6);
    node.cooldownTimer = reader.get(offset + 7);
    node.barrelIndex = reader.get(offset + 8);
    node.fireControlTargetShipId = reader.get(offset + 9);
    { const value = reader.get(offset + 10); (node.fireControl ??= {}).reason = value; }
    { const value = reader.get(offset + 11); (node.fireControl ??= {}).targetKind = value; }
}

