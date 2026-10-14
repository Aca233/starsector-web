import { assertStageReadable, type StageReadView } from './StageProtocol';
import type { AIStageReadData } from './StageAIData';
export type { AIStageData, AIStageReadData } from './StageAIData';
import { coordinateLength } from '../../math/Vector2';

/** AI query contract for the shared stage capture/refresh lease. Object
 * publication stays in StageAIProducer; ordered effects use AIBatch.bridge.
 * Source and verification limits: foundation-stage-boundaries-source-notes-2026-10-08.md. */
export type AIStageView = StageReadView & { readonly ai: AIStageReadData };
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
export function aiStageAdmission(view:StageReadView|undefined):{admitted:boolean;reason:string} {
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
export function aiStage<T extends StageReadView>(view: T | undefined): (T & AIStageView) | undefined {
  return aiStageAdmission(view).admitted ? view as T & AIStageView : undefined;
}
/** Check once at public solve boundaries, never per numeric column access. */
export function assertAIStage(view: AIStageView): void {
  assertStageReadable(view);
  if (view.kind !== 'AI_PLAN' && view.kind !== 'AI_EFFECT_READ')
    throw new Error('AI query requires an AI stage');
}
export function visible(v: StageReadView, row: number, observer: number): boolean {
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
  if(r>=0&&((sx<cx-r&&ex<cx-r)||(sx>cx+r&&ex>cx+r)||(sy<cy-r&&ey<cy-r)||(sy>cy+r&&ey>cy+r)))return null;
  const dx=ex-sx,dy=ey-sy,fx=sx-cx,fy=sy-cy,c=fx*fx+fy*fy-r*r;
  if(c<=0)return 0;
  const fDotD=fx*dx+fy*dy;if(fDotD>=0)return null;
  const a=dx*dx+dy*dy;if(a<=1e-12)return null;
  const b=2*fDotD,d=b*b-4*a*c;if(d<0)return null;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:null;
}

