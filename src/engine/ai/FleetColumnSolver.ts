import type { TacticalOrder } from '../simulation/CombatTypes';
import { coordinateLength } from '../math/Vector2';
import { fleetPolicy, type FleetAssignment, type FleetPlan, type FleetRole, type FleetTask } from './FleetTactics';

export const fleetColumnWork={epochs:0,resizes:0,units:0,solves:0,distances:0,influences:0,distanceRequests:0,reentrantFallbacks:0};
/** Sole writer during input publication; read-only input during numerical solve.
 * Owns fleet observation/scratch, NOT Ship/world physics. No Ship/component
 * references, wrappers, getters, wire encoding or reconstructed unit objects. */
export class FleetColumns {
  x=new Float64Array(0);
  y=new Float64Array(0);
  radius=new Float64Array(0);
  teamId=new Float64Array(0);
  power=new Float64Array(0);
  range=new Float64Array(0);
  speed=new Float64Array(0);
  hull=new Float64Array(0);
  carrierRange=new Float64Array(0);
  hullHp=new Float64Array(0);
  maxHullHp=new Float64Array(0);
  armor=new Float64Array(0);
  flux=new Float64Array(0);
  overloaded=new Uint8Array(0);
  venting=new Uint8Array(0);
  shieldPhased=new Uint8Array(0);
  systemPhased=new Uint8Array(0);
  collisionless=new Uint8Array(0);
  retreating=new Uint8Array(0);
  major=new Uint8Array(0);
  isPlayer=new Uint8Array(0);
  doNotBackOff=new Uint8Array(0);
  currentTargetRow=new Int32Array(0);
  id:string[]=[];
  role:FleetRole[]=[];
  previousTask:(FleetTask|undefined)[]=[];
  currentTargetId:(string|undefined)[]=[];
  visible=new Uint8Array(0);
  visibleTeams:number[]=[];
  distances=new Float64Array(0);
  distanceEpoch=new Uint32Array(0);
  pressures=new Float64Array(0);
  pressureEpoch=new Uint32Array(0);
  count=0;
  epoch=0;
  private capacity=0;
  private busy=false;
  begin(count:number):boolean {
    if(this.busy){fleetColumnWork.reentrantFallbacks++;return false;}
    this.busy=true;
    if(count>this.capacity){
      const capacity=Math.max(32,count,this.capacity*2);
      this.x=new Float64Array(capacity);
      this.y=new Float64Array(capacity);
      this.radius=new Float64Array(capacity);
      this.teamId=new Float64Array(capacity);
      this.power=new Float64Array(capacity);
      this.range=new Float64Array(capacity);
      this.speed=new Float64Array(capacity);
      this.hull=new Float64Array(capacity);
      this.carrierRange=new Float64Array(capacity);
      this.hullHp=new Float64Array(capacity);
      this.maxHullHp=new Float64Array(capacity);
      this.armor=new Float64Array(capacity);
      this.flux=new Float64Array(capacity);
      this.overloaded=new Uint8Array(capacity);
      this.venting=new Uint8Array(capacity);
      this.shieldPhased=new Uint8Array(capacity);
      this.systemPhased=new Uint8Array(capacity);
      this.collisionless=new Uint8Array(capacity);
      this.retreating=new Uint8Array(capacity);
      this.major=new Uint8Array(capacity);
      this.isPlayer=new Uint8Array(capacity);
      this.doNotBackOff=new Uint8Array(capacity);
      this.currentTargetRow=new Int32Array(capacity);
      this.id.length=capacity;this.role.length=capacity;this.previousTask.length=capacity;this.currentTargetId.length=capacity;
      this.visible=new Uint8Array(capacity*capacity);
      this.distances=new Float64Array(capacity*capacity);
      this.distanceEpoch=new Uint32Array(capacity*capacity);
      this.pressures=new Float64Array(capacity*capacity);
      this.pressureEpoch=new Uint32Array(capacity*capacity);
      this.capacity=capacity;fleetColumnWork.resizes++;
    }
    this.count=count;
    this.epoch=(this.epoch+1)>>>0;
    if(this.epoch===0){this.distanceEpoch.fill(0);this.pressureEpoch.fill(0);this.epoch=1;}
    this.visibleTeams.length=0;
    fleetColumnWork.epochs++;fleetColumnWork.units+=count;
    return true;
  }
  end():void {this.busy=false;this.count=0;this.visibleTeams.length=0;}
  get bytes():number {return (this.x.byteLength+this.y.byteLength+this.radius.byteLength+this.teamId.byteLength+this.power.byteLength+this.range.byteLength+this.speed.byteLength+this.hull.byteLength+this.carrierRange.byteLength+this.hullHp.byteLength+this.maxHullHp.byteLength+this.armor.byteLength+this.flux.byteLength+this.overloaded.byteLength+this.venting.byteLength+this.shieldPhased.byteLength+this.systemPhased.byteLength+this.collisionless.byteLength+this.retreating.byteLength+this.major.byteLength+this.isPlayer.byteLength+this.doNotBackOff.byteLength)+this.currentTargetRow.byteLength+this.visible.byteLength+this.distances.byteLength+this.distanceEpoch.byteLength+this.pressures.byteLength+this.pressureEpoch.byteLength;}
}
const ownerColumns=new WeakMap<object,FleetColumns>();
/** Private authority supplies the owner key; no permission/certificate cache. */
export function fleetColumnsFor(owner:object):FleetColumns {
  let columns=ownerColumns.get(owner);
  if(!columns){columns=new FleetColumns();ownerColumns.set(owner,columns);}
  return columns;
}
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
const compareId=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Direct row-index solve over one published epoch. Sequential claims, all
 * contributor order and output materialization remain at their original boundary. */
export function solveFleetColumns(f:FleetColumns,orders:ReadonlyMap<string,TacticalOrder>,manualIds:ReadonlySet<string>):FleetPlan {
  const n=f.count,epoch=f.epoch;
  const {x:xColumn,y:yColumn,radius:radiusColumn,teamId:teamIdColumn,power:powerColumn,range:rangeColumn,speed:speedColumn,hull:hullColumn,carrierRange:carrierRangeColumn,hullHp:hullHpColumn,maxHullHp:maxHullHpColumn,armor:armorColumn,flux:fluxColumn,overloaded:overloadedColumn,venting:ventingColumn,shieldPhased:shieldPhasedColumn,systemPhased:systemPhasedColumn,collisionless:collisionlessColumn,retreating:retreatingColumn,major:majorColumn,isPlayer:isPlayerColumn,doNotBackOff:doNotBackOffColumn,id:idColumn,role:roleColumn,previousTask:previousTaskColumn,currentTargetId:currentTargetIdColumn,currentTargetRow:currentTargetRowColumn,visible,distances,distanceEpoch,pressures,pressureEpoch}=f;
  const units=Array.from({length:n},(_,i)=>i);
  let distanceBuilds=0,influenceBuilds=0,distanceRequests=0;
  const pointDistance=(row:number,x:number,y:number)=>coordinateLength(xColumn[row]-x,yColumn[row]-y);
  const hasAttackOpportunity=(ship:number,target:number,pressureRatio=1)=>{
    if(fluxColumn[ship]>.7||hullHpColumn[ship]/Math.max(1,maxHullHpColumn[ship])<fleetPolicy.lowHull||pressureRatio>fleetPolicy.regroupPressure||collisionlessColumn[target])return false;
    return !!(overloadedColumn[target]||ventingColumn[target]||hullHpColumn[target]/Math.max(1,maxHullHpColumn[target])<.3
      ||fluxColumn[target]>=.75&&fluxColumn[target]-fluxColumn[ship]>=.2);
  };
  const matrixDistance=(a:number,b:number)=>{
    const at=a*n+b;
    if(distanceEpoch[at]===epoch)return distances[at];
    if(a===b){distances[at]=0;distanceEpoch[at]=epoch;return 0;}
    const high=a>b?a:b,low=a>b?b:a;
    const value=coordinateLength(xColumn[high]-xColumn[low],yColumn[high]-yColumn[low]);
    distances[at]=value;distances[b*n+a]=value;
    distanceEpoch[at]=epoch;distanceEpoch[b*n+a]=epoch;distanceBuilds++;return value;
  };
  const pressureAt=(at:number,u:number)=>{
    const index=at*n+u;
    if(pressureEpoch[index]===epoch)return pressures[index];
    const reach=Math.max(200,rangeColumn[u])+radiusColumn[u]+radiusColumn[at];
    const gap=Math.max(0,matrixDistance(at,u)-reach);
    const value=powerColumn[u]/(1+gap/Math.max(100,speedColumn[u]*4));
    pressures[index]=value;pressureEpoch[index]=epoch;influenceBuilds++;return value;
  };
  const distance=(a:number,b:number)=>{distanceRequests++;return matrixDistance(a,b);};
  const byId = new Map(units.map(u => [idColumn[u], u]));
  const actors = units.filter(u => majorColumn[u] && !retreatingColumn[u]);
  const orderFor = (s: number) => orders.get(idColumn[s]) ?? (isPlayerColumn[s] ? orders.get('fleet') : undefined);
  const plans = new Map<string, FleetAssignment>();
  for (const team of new Set(actors.map(u => teamIdColumn[u]))) {
    const visibleTeamIndex=f.visibleTeams.indexOf(team);
    const friends = actors.filter(u => teamIdColumn[u] === team);
    const enemies = units.filter(u => teamIdColumn[u] !== team && (visibleTeamIndex>=0&&visible[visibleTeamIndex*n+u]!==0));
    const major = enemies.filter(u => majorColumn[u]);
    const candidates = major.length ? major : enemies;
    // Influence around each contact, not knowledge of hidden enemy reinforcements.
    const influence = (at:number,group:number[]) => {
      let sum=0;
      // Preserve source group order and original floating-point sum order.
      for(const u of group)sum+=pressureAt(at,u);
      return sum;
    };
    const danger = new Map<string,number>();
    const dangerAt=(id:string):number|undefined=>{
      const cached=danger.get(id);if(cached!==undefined)return cached;
      const u=byId.get(id);if(u===undefined||(teamIdColumn[u]!==team&&(visibleTeamIndex<0||visible[visibleTeamIndex*n+u]===0)))return;
      const value=influence(u,enemies)/Math.max(1,influence(u,friends));danger.set(id,value);return value;
    };
    const claims = new Map<string, number>();
    const previous = new Map<string, string>();
    const claim = (id: string, power: number) => claims.set(id, Math.max(0, (claims.get(id) ?? 0) + power));
    const canContribute = (u: number, target: number) => distance(u, target)
      <= rangeColumn[u] + radiusColumn[target] + radiusColumn[u] + speedColumn[u] * fleetPolicy.commitmentSeconds;
    // Reserve explicit/manual engagements before allocating free ships. Seed previous commitments
    // then remove each ship's own claim before scoring, avoiding all-ships-switch-target oscillation.
    for (const u of friends) {
      const order = orderFor(u);
      const id = order?.type === 'ENGAGE' ? order.targetShipId : currentTargetIdColumn[u];
      const target = id ? byId.get(id) : undefined;
      if (target!==undefined && teamIdColumn[target] !== team && (visibleTeamIndex>=0&&visible[visibleTeamIndex*n+target]!==0) && canContribute(u, target)) {
        claim(idColumn[target], powerColumn[u]); previous.set(idColumn[u], idColumn[target]);
      }
    }
    const autonomous = friends.filter(u => !manualIds.has(idColumn[u])).sort((a, b) => {
      const priority = (s: number) => orderFor(s)?.type === 'ENGAGE' ? 0 : 1;
      return priority(a) - priority(b) || compareId(idColumn[a], idColumn[b]);
    });
    for (const u of autonomous) {
      const ship = u, order = orderFor(ship);
      const old = previous.get(idColumn[ship]); if (old) claim(old, -powerColumn[u]);
      const ordered = (order?.type === 'ENGAGE' || order?.type === 'AVOID') && order.targetShipId
        ? enemies.find(e => idColumn[e] === order.targetShipId) : undefined;
      let selected: number | undefined, best = -Infinity;
      for (const e of ordered!==undefined ? [ordered] : candidates) {
        const target = e;
        const gap = Math.max(0, distance(ship, target) - rangeColumn[u] - radiusColumn[target] - radiusColumn[ship]);
        const travel = gap / Math.max(20, speedColumn[u]);
        const demand = Math.max(100, hullHpColumn[target] / fleetPolicy.commitmentSeconds + armorColumn[target] * .5 + powerColumn[e] * .75);
        let score = 7 / (1 + travel / fleetPolicy.travelSeconds);
        score += (1 - hullColumn[e]) * 2 + clamp(fluxColumn[target], 0, 1) * 1.5;
        if (overloadedColumn[target] || ventingColumn[target]) score += 2;
        if (shieldPhasedColumn[target] || systemPhasedColumn[target]) score -= 3;
        score -= Math.min(5, Math.max(0, (dangerAt(idColumn[target]) ?? 1) - 1) * 1.6);
        score -= Math.min(6, ((claims.get(idColumn[target]) ?? 0) + powerColumn[u] * .25) / demand * 2);
        if (currentTargetRowColumn[ship] === target) score += fleetPolicy.targetStickiness;
        if (roleColumn[u] === 'SKIRMISHER') score += roleColumn[e] === 'CARRIER' || hullColumn[e] < .4 ? 1 : 0;
        if (order?.type === 'DEFEND' && order.targetPos) score -= pointDistance(target,order.targetPos.x,order.targetPos.y) / Math.max(300, rangeColumn[u]);
        const escort = order?.type === 'ESCORT' ? byId.get(order.targetShipId ?? '') : undefined;
        if (escort!==undefined) score -= distance(target, escort) / Math.max(300, rangeColumn[u]);
        if (score > best + 1e-6 || Math.abs(score - best) <= 1e-6 && selected!==undefined && compareId(idColumn[target], idColumn[selected]) < 0) {
          selected = e; best = score;
        }
      }
      const target = selected;
      const covers = friends.filter(a => a !== u && roleColumn[a] !== 'UNARMED' && roleColumn[a] !== 'CARRIER'
        && hullColumn[a] > .4 && !ventingColumn[a] && !overloadedColumn[a] && fluxColumn[a] < .8
        // An equal, equally exposed neighbor is not cover: do not assign mutual retreat loops.
        && (roleColumn[u] === 'UNARMED' || hullColumn[a] > hullColumn[u] + .15 || powerColumn[a] > powerColumn[u] * 1.5
          || target!==undefined && distance(a, target) > distance(ship, target) + radiusColumn[ship] + radiusColumn[a]));
      const anchor = covers.reduce<number | undefined>((best, a) => best===undefined || distance(ship, a) < distance(ship, best)
        || distance(ship, a) === distance(ship, best) && compareId(idColumn[a], idColumn[best]) < 0 ? a : best, undefined);
      const pressure = dangerAt(idColumn[ship]) ?? 0;
      const wasBackingOff = previousTaskColumn[ship] === 'REGROUP' || previousTaskColumn[ship] === 'DISENGAGE';
      const nearFight = target!==undefined && distance(ship, target) < Math.max(rangeColumn[u], rangeColumn[selected!]) + radiusColumn[ship] + radiusColumn[target] + 400
        + (wasBackingOff ? fleetPolicy.disengageDistanceHysteresis : 0);
      const opportunity = target!==undefined && hasAttackOpportunity(ship, target, pressure);
      // Estimated enemy DPS alone is not a retreat order. Healthy gunships must
      // commit before their own guns can reach, even against a stronger contact.
      // Carriers retain stand-off safety; recovered gunships rejoin without waiting
      // for the enemy's paper firepower to disappear.
      const reservesThreatened = roleColumn[u] === 'CARRIER' || hullColumn[u] < fleetPolicy.pressureRetreatHull
        || overloadedColumn[ship] || ventingColumn[ship]
        || fluxColumn[ship] >= (wasBackingOff ? fleetPolicy.pressureResumeFlux : fleetPolicy.pressureRetreatFlux);
      // Retreat intent must not depend on finding cover. A supporting ally crossing
      // 80% flux cannot make an outmatched ship charge back into the same danger.
      // REGROUP and its no-cover fallback share pressure and distance hysteresis.
      const backingOff = !order && !doNotBackOffColumn[ship] && (roleColumn[u] === 'UNARMED' && (anchor!==undefined || target!==undefined)
        || nearFight && (hullColumn[u] < fleetPolicy.lowHull && (anchor!==undefined || wasBackingOff) || !opportunity && reservesThreatened && pressure > (wasBackingOff ? fleetPolicy.resumePressure : fleetPolicy.regroupPressure)));
      const regroup = backingOff && anchor!==undefined;
      const disengage = backingOff && anchor===undefined && target!==undefined;
      const task: FleetTask = regroup ? 'REGROUP' : disengage ? 'DISENGAGE' : target===undefined ? 'SEARCH' : roleColumn[u] === 'CARRIER' ? 'SUPPORT'
        : opportunity ? 'FINISH'
        : roleColumn[u] === 'SKIRMISHER' ? 'SCREEN' : 'PRESSURE';
      const committed = target!==undefined && canContribute(u, target) && !backingOff ? powerColumn[u] : 0;
      if (target!==undefined && committed) claim(idColumn[target], committed);
      plans.set(idColumn[ship], { targetId: target===undefined?null:idColumn[target], role: roleColumn[u], task, score: Number.isFinite(best) ? best : 0,
        pressureRatio: pressure, assignedPower: committed, carrierRange: carrierRangeColumn[u],
        anchorId: regroup ? idColumn[anchor!] : null, approachBearing: null });
    }
    // Distinct approach lanes for autonomous attackers of the SAME team/target. Stable spatial
    // ordering avoids crossing each other simply because deployment IDs have a different order.
    for (const target of candidates) {
      const group = autonomous.filter(u => {
        const p = plans.get(idColumn[u])!;
        return p.targetId === idColumn[target] && !orderFor(u) && p.task !== 'REGROUP' && p.task !== 'DISENGAGE'
          && p.role !== 'CARRIER' && p.role !== 'UNARMED';
      });
      if (group.length < 2) continue;
      const x = group.reduce((sum, u) => sum + xColumn[u] - xColumn[target], 0);
      const y = group.reduce((sum, u) => sum + yColumn[u] - yColumn[target], 0);
      const bearing = Math.atan2(y, x), nx = -Math.sin(bearing), ny = Math.cos(bearing);
      group.sort((a, b) => (xColumn[a] - xColumn[b]) * nx + (yColumn[a] - yColumn[b]) * ny || compareId(idColumn[a], idColumn[b]));
      group.forEach((u, i) => {
        const spread = fleetPolicy.maximumLaneAngle * (roleColumn[u] === 'SKIRMISHER' ? 1.25 : 1);
        plans.get(idColumn[u])!.approachBearing = bearing + (i / (group.length - 1) * 2 - 1) * spread;
      });
    }
  }
  fleetColumnWork.solves++;fleetColumnWork.distances+=distanceBuilds;fleetColumnWork.influences+=influenceBuilds;fleetColumnWork.distanceRequests+=distanceRequests;
  return plans;
}
