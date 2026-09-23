/** Shared read/control-prediction contract. It lists presentation data explicitly;
 * neither a display graph nor its consumers require a simulation object. */
import type { Ship } from '../simulation/Ship';
import type { ShipSystem } from '../simulation/ShipSystem';
import type { WeaponMount, WeaponSpec } from '../simulation/Weapon';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { ShipRenderState, RenderSystem, RenderHulk } from '../render/ShipRenderState';
import type { HudSystem } from './CombatHudView';
import type { ArmorReadSource } from './ArmorReadView';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type WeaponDisplayState = Pick<WeaponMount,
 'slotId'|'spec'|'relativePos'|'mountType'|'arcDeg'|'baseAngleDeg'|'currentAngleRad'|'currentSpreadDeg'|'glowAlpha'|'recoil'
 |'ammo'|'barrelIndex'|'burstRemaining'|'cooldownTimer'|'firingState'|'isDisabled'|'isPermanentlyDisabled'|'reloadDelayRemaining'|'disabledTimer'
 |'isAutofire'|'triggerHeld'|'ammoRechargeProgress'|'health'|'maxHealth'|'disabledDuration'|'burstTimer'|'firingStateTimer'|'firingCycleId'>;
export type SystemDisplayReads = Mutable<HudSystem & RenderSystem> & Pick<ShipSystem,
 'forcesAutofire'|'blocksWeapons'|'forcesForward'|'locksTurning'|'forcesBraking'|'blocksAcceleration'|'blocksStrafing'|'isPhased'
 |'getWeaponFluxCostMultiplier'|'getWeaponRateOfFireMultiplier'|'canFireWeapon'>;
export interface CombatDisplayShip extends Mutable<Omit<ShipRenderState,'shield'|'flux'|'armor'|'system'|'allSystems'|'sourceCarrier'|'weapons'|'engineController'>>,
 Pick<Ship,'shipName'|'isPlayer'|'currentCR'|'maxHullHp'|'retreating'|'sightRadius'|'fireControlMode'|'isFiringMain'
 |'throttle'|'brakeInput'|'strafeInput'|'turnInput'|'peakPerformanceRemaining'|'combatWeaponRepairTimeMultiplier'|'fighterRecall'
 |'teleportCameraOffset'|'teleportSequence'|'subjectiveTimeMultiplier'|'aimTargetWorld'|'flightDeckWingId'|'defenseFacingRad'|'aiHoldOffensiveFire'
 |'isPhased'|'isSystemDrone'|'hasVastBulk'|'getMotionStats'|'getFlameoutRatio'|'clearInput'> {
 shield: Mutable<ShipRenderState['shield']> & Pick<Ship['shield'],'isActive'|'isRaiseRequested'|'getPhaseSpeedMultiplier'>;
 flux: Mutable<ShipRenderState['flux']> & Pick<Ship['flux'],'totalFlux'|'softFlux'|'getTimeToVent'>;
 armor: ArmorReadSource;
 system:SystemDisplayReads; systems:SystemDisplayReads[]; allSystems:SystemDisplayReads[]; defenseSystem:SystemDisplayReads|undefined;
 weapons:WeaponDisplayState[];
 engineController:ShipRenderState['engineController'] & {isFlamedOut:boolean};
 hullStats:{forcedRightTurn:number};
 tacticalAI?:Ship['tacticalAI'];
 sourceCarrier?:CombatDisplayShip;
 areSignificantEnemiesInRange(range?:number,enemy?:CombatDisplayShip|null):boolean;
 getWeaponDisplayRange(spec:WeaponSpec):number;
 getWeaponDisplaySpeed(spec:WeaponSpec):number;
}
export interface CombatDisplayReads extends Pick<CombatEngine,
 'playerWings'|'enemyWings'|'isTacticalMap'|'isSimulation'|'openBattlefield'|'multiTeamBattle'|'battleResult'|'isBattleResultReady'
 |'combatTime'|'shipLossNotifications'|'notificationTime'|'orders'|'selectedUnitId'|'commandPoints'|'simulationDeployedPoints'
 |'environment'|'nebulae'|'asteroids'|'simulationPointLimit'|'toggleTacticalMap'|'selectUnit'|'projectiles'> {
 playerShip:CombatDisplayShip; enemyShip:CombatDisplayShip;
 ships:CombatDisplayShip[]; allCapitalShips:CombatDisplayShip[]; capitalShips:CombatDisplayShip[];
 fighters:CombatDisplayShip[]; bombers:CombatDisplayShip[];
 hulkFragments:readonly RenderHulk[];
 findHostile(ship:CombatDisplayShip,targetId?:string):CombatDisplayShip|undefined;
}
