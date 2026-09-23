/** Authority-side read projection. This is the only LAN ship module that reads
 * simulation components; the receiver never reconstructs their classes. */
import type { Ship } from '../../engine/simulation/Ship';
import type { SystemWeaponType } from '../../engine/extensions/ship-systems/Types';
import type { ShipSystem } from '../../engine/simulation/ShipSystem';
import { RenderShipProjection, renderShipFields, renderEngineStatusFields } from '../../engine/runtime/local/RenderShipProjection';
import { shipPresentationPose } from '../../engine/visual/ShipPresentation';
import { combatWeaponRange, combatProjectileSpeed } from '../../engine/simulation/WeaponRange';
import { pulsePusherOffset } from '../../engine/extensions/ship-systems/PulseDrive';
import { WEAPON_FLAGS, WEAPON_NUMBERS } from '../WeaponPresentationState.mjs';
import { weaponPresentationAngle } from '../../engine/visual/WeaponPresentation';

const shipKeys = ['shipName','isPlayer','currentCR','maxHullHp','retreating','sightRadius','fireControlMode','isFiringMain',
 'throttle','brakeInput','strafeInput','turnInput','peakPerformanceRemaining','combatWeaponRepairTimeMultiplier','fighterRecall',
 'teleportCameraOffset','teleportSequence','subjectiveTimeMultiplier','aimTargetWorld','flightDeckWingId','defenseFacingRad','aiHoldOffensiveFire','isSystemDrone'] as const;
const systemKeys = ['name','type','description','state','available','disabled','isActive','isCoolingDown','cooldownTimer',
 'activationFailureReason','charges','maxCharges','statusText','activationSerial','effectLevel','fortressVisualLevel','teleportVisual',
 'forcesAutofire','blocksWeapons','forcesForward','locksTurning','forcesBraking','blocksAcceleration','blocksStrafing','isPhased'] as const;
const shieldKeys = ['type','phaseState','radius','maxArcDeg','currentArcDeg','facingAngleRad','targetFacingAngleRad','isActive',
 'toggleLocked','pendingRaise','closeTimeRemaining','unfoldRateMultiplier','phaseEffectLevel','phaseStageTimer','phaseCooldownDuration','phaseMinSpeedFluxThresholdMultiplier'];
const fluxKeys = ['softFlux','hardFlux','maxFlux','isOverloaded','isVenting','overloadTimer','overloadDuration','ventProgress','isEngineBoostActive','hullSize'] as const;
const armorKeys = ['cols','rows','minX','minY','cellWidth','cellHeight','maxCellArmor','dirtyVersion'] as const;
const mountKeys = [...new Set(['slotId','relativePos','mountType','arcDeg','baseAngleDeg','currentAngleRad','currentSpreadDeg','glowAlpha','recoil',
 'ammo','barrelIndex','burstRemaining','cooldownTimer','firingState','isDisabled','isPermanentlyDisabled','reloadDelayRemaining','disabledTimer',...WEAPON_FLAGS,...WEAPON_NUMBERS])];
const weaponTypes:readonly SystemWeaponType[]=['BALLISTIC','ENERGY','MISSILE'];
// Keep v1 wire field order exactly, without constructing renderer components
// which the LAN projection immediately replaces. Shared lists keep base pose
// and engine presentation fields aligned with the local renderer.
const baseKeys=renderShipFields.filter(key=>key!=='phaseVisualAlpha');
const visualKeys=['shield','flux','armor','engineController','engineStatuses','weapons','weaponGroups','system','allSystems','sourceCarrier','presentationPose'];
export class LanShipProjection {
 private readonly render=new RenderShipProjection();
 // These are scratch read models, never wire snapshots. Stable identities let
 // native capture reuse its field plans, while every retained field is sampled
 // on every projection (including undefined and in-place metadata edits).
 private readonly fields=new WeakMap<object,Record<string,any>>();
 private readonly ships=new WeakMap<Ship,Record<string,any>>();
 private pick(source:object,keys:readonly string[],extras:readonly string[]=[]):Record<string,any> {
  let row=this.fields.get(source);
  if(!row){
   // Define the complete shape at construction. Incrementally adding dozens of
   // keys makes V8 dictionary-mode rows, slowing Object.values() in capture.
   row=Object.fromEntries([...keys.map(key=>[key,Reflect.get(source,key)]),...extras.map(key=>[key,undefined])]);
   this.fields.set(source,row);return row;
  }
  for(const key of keys)row[key]=Reflect.get(source,key);
  return row;
 }
 begin():void {this.render.begin();}
 finish():void {this.render.finish();}
 project(ship:Ship):object {
  if(!this.render.supports([ship]))throw Error('LAN display projection requires an authority-side adapter for custom ship readers');
  // system/systems/allSystems often name the same native component. Sample
  // its pure display reads once per ship, not once per alias in the wire tree.
  const systems=new Map<ShipSystem,object>();
  const system=(value:ShipSystem)=>{
   const prior=systems.get(value);if(prior)return prior;
   const row=this.pick(value,systemKeys,['definitionData','pulseOffset','fluxCosts','fireRates','fireSlots']);
   Object.assign(row,{definitionData:this.pick(value.definition,['visuals','audio','charges']),
    pulseOffset:pulsePusherOffset(value),
    fluxCosts:Object.fromEntries(weaponTypes.map(type=>[type,value.getWeaponFluxCostMultiplier(type)])),
    fireRates:Object.fromEntries(weaponTypes.map(type=>[type,value.getWeaponRateOfFireMultiplier(type)])),
    fireSlots:ship.weapons.filter(mount=>value.canFireWeapon(mount)).map(mount=>mount.slotId)});
   systems.set(value,row);return row;
  };
  const phases=[...ship.externalPhaseEffects.values()].map(read=>read()).filter((value):value is number=>value!==undefined);
  const values={
   engineStatuses:ship.engineStatuses.map(status=>this.pick(status,renderEngineStatusFields)),
   weaponGroups:ship.weaponGroups,presentationPose:shipPresentationPose(ship),
   shield:Object.assign(this.pick(ship.shield,shieldKeys,['hitSegmentLevels']),{hitSegmentLevels:ship.shield.presentationHitSegmentLevels()}),
   flux:Object.assign(this.pick(ship.flux,fluxKeys,['ventTime']),{ventTime:ship.flux.getTimeToVent()}),
   armor:Object.assign(this.pick(ship.armor,armorKeys,['cells']),{cells:ship.armor.copyCells()}),
   engineController:{flameAccelerating:ship.engineController.flameAccelerating,isFlamedOut:ship.engineController.isFlamedOut},
   motionFlags:{forcedRightTurn:ship.hullStats.forcedRightTurn},motionStats:ship.getMotionStats(),
   flameoutRatio:ship.getFlameoutRatio(),significantEnemies:ship.areSignificantEnemiesInRange(2500,ship.currentTargetShip??undefined),
   externalPhased:phases.length>0,externalPhaseAlpha:phases.length?Math.min(...phases.map(alpha=>Math.max(0,Math.min(1,alpha)))):undefined,
   phaseAlphaMultiplier:ship.runtimeModifiers.value.visualAlphaMultiplier??1,
   system:system(ship.system),systems:ship.systems.map(system),allSystems:ship.allSystems.map(system),defenseSystem:ship.defenseSystem?system(ship.defenseSystem):undefined,
   weapons:ship.weapons.map(mount=>Object.assign(this.pick(mount,mountKeys,['weaponSpec','displayRange','displaySpeed','presentationRelativeAngle']),{weaponSpec:mount.spec,displayRange:combatWeaponRange(ship,mount.spec),
    displaySpeed:combatProjectileSpeed(ship,mount.spec),presentationRelativeAngle:weaponPresentationAngle(mount,0)})),
   sourceCarrier:ship.sourceCarrier,parentShip:ship.parentShip,childModules:ship.childModules,assemblyShips:ship.assemblyShips,
  };
  let row=this.ships.get(ship);
  if(!row){
   row=Object.fromEntries([...baseKeys,...visualKeys,...shipKeys,...Object.keys(values)].map(key=>[key,undefined]));
   this.ships.set(ship,row);
  }
  for(const key of baseKeys)row[key]=ship[key];
  for(const key of shipKeys)row[key]=ship[key];
  Object.assign(row,values);
  return row;
 }
}
