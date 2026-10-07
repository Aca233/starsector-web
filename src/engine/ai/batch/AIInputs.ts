import type { StageView } from './StageProtocol';
import type { FleetTask } from '../FleetTactics';
import { coordinateLength } from '../../math/Vector2';

/** Producer-owned AI extension to StageView. C captures these alongside the
 * shared columns; A never rereads Ship/mount to manufacture a second world.
 * Evidence: Web CapitalShipAI/ThreatAssessment/TacticalNavigation/FleetTactics
 * on 2026-10-04. ../starsector-core and ../decompiled absent: NOT native parity.
 * Expected: identical policy/order/cadence, replace object query producers and
 * consumers. Verify default engine admission and ordered effects, not kernels alone. */
export interface AIStageData {
  ids: string[];
  currentTargetId: (string | undefined)[];
  previousTask: (FleetTask | undefined)[];
  systemMode: (string | undefined)[];
  engineState: string[];
  /** JSON of [parentShip?.id,moduleMount?.slotId,x,y,angleDeg]; not only root ID.
   * Reattachment/reposition edges must invalidate primitive multirate intent. */
  attachmentKey: string[];
  strafeMultiplier: Float64Array;
  specSpeed: Float64Array;
  specArmor: Float64Array;
  /** Raw shield.isActive (contact shieldActive also requires unfolded arc >5). */
  rawShieldActive: Float64Array;
  /** maxArcDeg * PI / 360, not (maxArcDeg * PI / 180) / 2. */
  shieldThreatHalfArc: Float64Array;
  wingPower: Float64Array;
  carrierRange: Float64Array;
  vastBulk: Float64Array;
  systemDrone: Float64Array;
  player: Float64Array;
  retreating: Float64Array;
  doNotBackOff: Float64Array;
  systemActive: Float64Array;
  systemLocksTurning: Float64Array;
  forcesAutofire: Float64Array;
  shieldPhased: Float64Array;
  /** ship.system.isPhased, matching existing fleet kernel; not allSystems.some. */
  systemPhased: Float64Array;
  tacticalPresent: Float64Array;
  /** Preserve compact forecast admission; exact authored AI stays full horizon. */
  nativeForecast: Float64Array;
  attachedMotion: Float64Array;
  /** Existing training override; -1 means use the bundled numeric policy. */
  trainingAction: Float64Array;
  blockedLaneTarget: Float64Array;
  slotIds: string[];
  /** Aim/profile delay differs from speculative weapon readiness charge delay. */
  profileDelay: Float64Array;
  /** Original positioning uses missing turnRate=0, forecasting uses =30. */
  positionTurnRate: Float64Array;
  /** Capture original expressions, never reconstruct via (facing+base)-facing
   * or arc/2; those reorderings change physics/state differential ties. */
  localBaseAngle: Float64Array;
  authoredHalfArc: Float64Array;
  fixedMount: Float64Array;
  projectileFuse: Float64Array;
  projectileTurnRate: Float64Array;
  projectileMaxSpeed: Float64Array;
  projectileDidDamage: Float64Array;
  projectileSourceId: string[];
  /** Asteroids followed by gravityManaged/gravityFixed hulk fragments. */
  obstacleCount: number;
  asteroidCount: number;
  obstacleX: Float64Array;
  obstacleY: Float64Array;
  obstacleVx: Float64Array;
  obstacleVy: Float64Array;
  obstacleRadius: Float64Array;
}
export type AIStageView = StageView & { ai: AIStageData };
/** Frozen capture contract for C and D; admission checks capacity, never
 * truncates entity counts or silently supplies fictitious default mechanics. */
export const AI_BODY_INPUTS = Object.freeze([
  'strafeMultiplier','specSpeed','specArmor','rawShieldActive','shieldThreatHalfArc','wingPower','carrierRange','vastBulk',
  'systemDrone','player','retreating','doNotBackOff','systemActive','systemLocksTurning','forcesAutofire',
  'shieldPhased','systemPhased','tacticalPresent','nativeForecast','attachedMotion','trainingAction'
] as const);
export const AI_MOUNT_INPUTS = Object.freeze([
  'blockedLaneTarget','profileDelay','positionTurnRate','localBaseAngle','authoredHalfArc','fixedMount'
] as const);
export const AI_PROJECTILE_INPUTS = Object.freeze(['projectileFuse','projectileTurnRate','projectileMaxSpeed','projectileDidDamage'] as const);
export const AI_OBSTACLE_INPUTS = Object.freeze(['obstacleX','obstacleY','obstacleVx','obstacleVy','obstacleRadius'] as const);
export function aiStageAdmission(view:StageView|undefined):{admitted:boolean;reason:string} {
  if(!view?.active)return {admitted:false,reason:'no-active-stage'};
  if(!view.valid)return {admitted:false,reason:'invalidated-stage'};
  if(view.kind!=='AI_PLAN'&&view.kind!=='AI_EFFECT_READ')return {admitted:false,reason:'not-ai-stage'};
  const a=view.ai;if(!a)return {admitted:false,reason:'no-ai-extension'};
  for(const [keys,count] of [[AI_BODY_INPUTS,view.bodyCount],[AI_MOUNT_INPUTS,view.weaponCount],
    [AI_PROJECTILE_INPUTS,view.projectileCount],[AI_OBSTACLE_INPUTS,a.obstacleCount]] as const){
    for(const key of keys)if(!(a[key] instanceof Float64Array)||a[key].length<count)return {admitted:false,reason:`missing-column:${key}`};
  }
  if(a.ids.length<view.bodyCount||a.slotIds.length<view.weaponCount||a.projectileSourceId.length<view.projectileCount)
    return {admitted:false,reason:'incomplete-semantic-ids'};
  return {admitted:true,reason:'shared-numeric-ai'};
}
export function aiStage(view: StageView | undefined): AIStageView | undefined {
  return aiStageAdmission(view).admitted?view as AIStageView:undefined;
}
export function visible(v: StageView, row: number, observer: number): boolean {
  const team = v.teams.indexOf(v.bodies.team[observer]);
  return team >= 0 && v.visibility[row * v.teams.length + team] !== 0;
}
export const length = coordinateLength;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export interface AIVelocity { x: number; y: number }
export function limit(v: AIVelocity, max: number): AIVelocity {
  const n = length(v.x, v.y); if (n > max) { v.x *= max/n; v.y *= max/n; } return v;
}
/** Same quadratic/order as segmentCircleEntry, without Vector2/Ship reads. */
export function circleEntry(sx:number,sy:number,ex:number,ey:number,cx:number,cy:number,r:number):number|null {
  const dx=ex-sx,dy=ey-sy,fx=sx-cx,fy=sy-cy,c=fx*fx+fy*fy-r*r;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<=1e-12)return null;
  const b=2*(fx*dx+fy*dy),d=b*b-4*a*c;if(d<0)return null;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:null;
}
