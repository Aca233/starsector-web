import { shieldUnfoldRate, shieldVisualAlpha, shieldRenderArc, phaseEngaged, shieldPhased, phaseCooldown, phaseSpeed } from '../../engine/render/ShieldDisplayMath';
import type { WeaponDisplayState } from '../../engine/runtime/CombatDisplayReads';
import { ProjectedRenderShip, ProjectedRenderSystem } from '../../engine/render/ProjectedRenderState';
import { Vector2 } from '../../engine/math/Vector2';
import { shipPresentationPose } from '../../engine/visual/ShipPresentation';
import type { Ship } from '../../engine/simulation/Ship';
import type { WeaponMount } from '../../engine/simulation/Weapon';
import type { HudSystem } from '../../engine/runtime/CombatHudView';
import type { ShipRenderState, RenderSystem } from '../../engine/render/ShipRenderState';
import type { shipMotionStats } from '../../engine/simulation/systems/ShipMotion';

/** Data-backed display queries only. Never extends a simulation component. */
export class DisplayArmor {
  declare cols: number; declare rows: number; declare minX: number; declare minY: number;
  declare cellWidth: number; declare cellHeight: number; declare maxCellArmor: number;
  declare cells: Float32Array; declare dirtyVersion: number;
  get cellMutationRevision(): null { return null; }
  copyCells(): Float32Array { return this.cells.slice(); }
}
export class DisplayFlux {
  declare softFlux: number; declare hardFlux: number; declare maxFlux: number;
  declare isOverloaded: boolean; declare isVenting: boolean; declare overloadTimer: number;
  declare overloadDuration: number; declare ventProgress: number; declare isEngineBoostActive: boolean;
  declare hullSize: Ship['flux']['hullSize']; declare ventTime: number;
  get totalFlux(): number { return this.softFlux + this.hardFlux; }
  get fluxPercent(): number { return Math.min(1, this.totalFlux / this.maxFlux); }
  getTimeToVent(): number { return this.ventTime; }
}
export class DisplayShield {
  declare type: Ship['shield']['type']; declare phaseState: Ship['shield']['phaseState'];
  declare radius: number; declare maxArcDeg: number; declare currentArcDeg: number;
  declare facingAngleRad: number; declare targetFacingAngleRad: number; declare hitSegmentLevels: Float32Array;
  declare isActive: boolean; declare toggleLocked: boolean; declare pendingRaise: boolean;
  declare closeTimeRemaining: number; declare unfoldRateMultiplier: number;
  declare phaseEffectLevel: number; declare phaseStageTimer: number; declare phaseCooldownDuration: number;
  declare phaseMinSpeedFluxThresholdMultiplier: number;
  get isPhased(): boolean {
    return shieldPhased(this.type,this.phaseState,this.phaseEffectLevel);
  }
  get isPhaseEngaged(): boolean {
    return phaseEngaged(this.phaseState);
  }
  get isRaiseRequested(): boolean { return this.isActive || this.pendingRaise; }
  get visualAlpha(): number {
    return shieldVisualAlpha(this.isActive,this.closeTimeRemaining,this.maxArcDeg,this.currentArcDeg,shieldUnfoldRate(this.type,this.radius,this.unfoldRateMultiplier));
  }
  get renderArcRad(): number {
    return shieldRenderArc(this.maxArcDeg,this.currentArcDeg);
  }
  get isVisuallyDeployed(): boolean { return this.type !== 'NONE' && this.type !== 'PHASE' && this.currentArcDeg > .01 && this.visualAlpha > 0; }
  get phaseCooldownLevel(): number {
    return phaseCooldown(this.phaseState,this.phaseCooldownDuration,this.phaseStageTimer);
  }
  getPhaseSpeedMultiplier(hardFluxLevel:number): number {
    return phaseSpeed(this.isPhaseEngaged,hardFluxLevel,this.phaseMinSpeedFluxThresholdMultiplier,this.phaseEffectLevel);
  }
}
export class DisplaySystem extends ProjectedRenderSystem {
  declare name: HudSystem['name'];
  declare description: HudSystem['description'];
  declare isCoolingDown: HudSystem['isCoolingDown'];
  declare cooldownTimer: HudSystem['cooldownTimer'];
  declare activationFailureReason: HudSystem['activationFailureReason'];
  declare charges: HudSystem['charges'];
  declare maxCharges: HudSystem['maxCharges'];
  declare statusText: HudSystem['statusText'];
  declare forcesAutofire: boolean;
  declare blocksWeapons: boolean;
  declare forcesForward: boolean;
  declare locksTurning: boolean;
  declare forcesBraking: boolean;
  declare blocksAcceleration: boolean;
  declare blocksStrafing: boolean;
  declare isPhased: boolean;

  declare definition: RenderSystem['definition'] & HudSystem['definition'];
  declare definitionData: RenderSystem['definition'] & HudSystem['definition']; // validated data-only definition, never executable hooks
  declare fluxCosts: Record<string,number>; declare fireRates: Record<string,number>; declare fireSlots: string[];
  getWeaponFluxCostMultiplier(type: string): number { return this.fluxCosts[type] ?? 1; }
  getWeaponRateOfFireMultiplier(type: string): number { return this.fireRates[type] ?? 1; }
  canFireWeapon(mount: {slotId:string}): boolean { return this.fireSlots.includes(mount.slotId); }
}
export type DisplayWeapon = WeaponDisplayState & {
 weaponSpec: WeaponMount['spec']; displayRange:number; displaySpeed:number; presentationRelativeAngle?:number;
};
export class LanDisplayShip extends ProjectedRenderShip {
  declare shipName: Ship['shipName'];
  declare isPlayer: Ship['isPlayer'];
  declare currentCR: Ship['currentCR'];
  declare maxHullHp: Ship['maxHullHp'];
  declare retreating: Ship['retreating'];
  declare sightRadius: Ship['sightRadius'];
  declare fireControlMode: Ship['fireControlMode'];
  declare isFiringMain: Ship['isFiringMain'];
  declare throttle: Ship['throttle'];
  declare brakeInput: Ship['brakeInput'];
  declare strafeInput: Ship['strafeInput'];
  declare turnInput: Ship['turnInput'];
  declare peakPerformanceRemaining: Ship['peakPerformanceRemaining'];
  declare combatWeaponRepairTimeMultiplier: Ship['combatWeaponRepairTimeMultiplier'];
  declare fighterRecall: Ship['fighterRecall'];
  declare teleportCameraOffset: Ship['teleportCameraOffset'];
  declare teleportSequence: Ship['teleportSequence'];
  declare subjectiveTimeMultiplier: Ship['subjectiveTimeMultiplier'];
  declare aimTargetWorld: Ship['aimTargetWorld'];
  declare flightDeckWingId: Ship['flightDeckWingId'];
  declare defenseFacingRad: Ship['defenseFacingRad'];
  declare aiHoldOffensiveFire: Ship['aiHoldOffensiveFire'];
  declare isSystemDrone: Ship['isSystemDrone'];

  readonly displayOnly = true;
  declare shield: DisplayShield; declare flux: DisplayFlux; declare armor: DisplayArmor;
  declare system: DisplaySystem; declare systems: DisplaySystem[]; declare allSystems: DisplaySystem[];
  declare defenseSystem: DisplaySystem | undefined; declare weapons: DisplayWeapon[];
  declare engineController: ShipRenderState['engineController'] & {isFlamedOut:boolean};
  declare motionFlags: {forcedRightTurn:number};
  get hullStats():{forcedRightTurn:number} {return this.motionFlags;}
  declare motionStats: ReturnType<typeof shipMotionStats>;
  declare flameoutRatio: number; declare significantEnemies: boolean;
  declare externalPhaseAlpha: number | undefined; declare phaseAlphaMultiplier:number; declare externalPhased:boolean;
  declare sourceCarrier: LanDisplayShip | undefined;
  declare parentShip: LanDisplayShip | undefined;
  declare childModules: LanDisplayShip[];
  declare assemblyShips: LanDisplayShip[];
  declare currentTargetShip: LanDisplayShip | null;
  declare tacticalAI: undefined;
  constructor() {
    super(); this.shield=new DisplayShield();this.flux=new DisplayFlux();this.armor=new DisplayArmor();
    this.system=new DisplaySystem();this.systems=[];this.allSystems=[];this.weapons=[];
    this.childModules=[];this.assemblyShips=[];this.currentTargetShip=null;
  }
  get hasVastBulk():boolean {return !!(this.spec.builtInHullMods?.includes('vastbulk')||this.spec.hullMods?.includes('vastbulk'));}
  get isPhased():boolean {return !!this.parentShip?.isPhased || this.isDocked || this.isRetreated || this.shield.isPhased || this.externalPhased || this.allSystems.some(system=>system.isPhased);}
  getWeaponDisplayRange(spec:WeaponMount['spec']):number {return this.weapons.find(m=>m.spec===spec)?.displayRange??0;}
  getWeaponDisplaySpeed(spec:WeaponMount['spec']):number {return this.weapons.find(m=>m.spec===spec)?.displaySpeed??0;}
  getMotionStats():ReturnType<typeof shipMotionStats> {return this.motionStats;}
  getFlameoutRatio():number {return this.flameoutRatio;}
  areSignificantEnemiesInRange(_range:number,_target?:unknown):boolean {return this.significantEnemies;}
  clearInput():void {this.throttle=0;this.brakeInput=false;this.strafeInput=0;this.turnInput=0;this.isFiringMain=false;}
  interpolatedPos(alpha:number):Vector2 {return shipPresentationPose(this)?.pos.clone() ?? super.interpolatedPos(alpha);}
  interpolatedFacing(alpha:number):number {return shipPresentationPose(this)?.facing ?? super.interpolatedFacing(alpha);}
}

// The base presentation contract exposes a data field; LAN additionally reads
// the independently replicated phase component without mutating the authority.
Object.defineProperty(LanDisplayShip.prototype,'phaseVisualAlpha',{get(this:LanDisplayShip):number {
 let alpha=this.shield.type==='PHASE'?1-.75*this.shield.phaseEffectLevel:1;
 if(this.externalPhaseAlpha!==undefined)alpha=Math.min(alpha,this.externalPhaseAlpha);
 return this.isDocked||this.isRetreated?0:alpha*this.phaseAlphaMultiplier;
}});
