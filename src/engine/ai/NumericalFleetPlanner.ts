import type { TacticalOrder } from '../simulation/CombatTypes';
import { coordinateLength } from '../math/Vector2';
import { fleetPolicy, type FleetAssignment, type FleetPlan, type FleetRole, type FleetTask } from './FleetTactics';

/** Native-authority planning inputs, NOT serialized permissions or permanent state.
 * This kernel has no Ship, Vector2, component reader or executable AI callback. */
export interface FleetUnit {
  row:number;id:string;x:number;y:number;radius:number;teamId:number;visible:ReadonlySet<number>;
  role:FleetRole;power:number;range:number;speed:number;hull:number;carrierRange:number;
  hullHp:number;maxHullHp:number;armor:number;flux:number;overloaded:boolean;venting:boolean;
  shieldPhased:boolean;systemPhased:boolean;collisionless:boolean;retreating:boolean;major:boolean;
  isPlayer:boolean;doNotBackOff:boolean;previousTask:FleetTask|undefined;currentTargetId:string|undefined;currentTargetRow:number|undefined;
}
export const numericFleetWork={plans:0,units:0,distanceBuilds:0,distanceRequests:0,influenceBuilds:0};
/** Allocation facts only. Rows/buffers never outlive their synchronous solve. */
export const fleetDemandStorageWork={plans:0,rowPlans:0,densePlans:0,units:0,pressureRows:0,pressureCells:0,pressureBufferBytes:0,denseEquivalentPressureBytes:0};
interface PressureRow { values:Float64Array;ready:Uint8Array }
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
const compareId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const pointDistance=(a:FleetUnit,x:number,y:number)=>coordinateLength(a.x-x,a.y-y);
function hasAttackOpportunity(ship:FleetUnit,target:FleetUnit,pressureRatio=1):boolean {
  if(ship.flux>.7||ship.hullHp/Math.max(1,ship.maxHullHp)<fleetPolicy.lowHull||pressureRatio>fleetPolicy.regroupPressure||target.collisionless)return false;
  return target.overloaded||target.venting||target.hullHp/Math.max(1,target.maxHullHp)<.3
    ||target.flux>=.75&&target.flux-ship.flux>=.2;
}
/** Batched distance/influence solve, followed by the original sequential claim
 * allocation. Do not parallelize claim updates or change tie/summation order. */
export function planNumericalFleet(units:readonly FleetUnit[],orders:ReadonlyMap<string,TacticalOrder>,manualIds:ReadonlySet<string>):FleetPlan {
  const n=units.length,distances=new Float64Array(n*n);
  const demand=import.meta.env?.VITE_COMBAT_STAGE_KERNEL!=='false';
  const rowStorage=demand&&import.meta.env?.VITE_COMBAT_FLEET_DEMAND_STORAGE!=='false';
  const pressure=rowStorage?undefined:new Float64Array(n*n);
  const distanceReady=demand?new Uint8Array(n*n):undefined,pressureReady=demand&&!rowStorage?new Uint8Array(n*n):undefined;
  const pressureRows=rowStorage?new Array<PressureRow|undefined>(n):undefined;
  let pressureRowsBuilt=0,pressureBufferBytes=(pressure?.byteLength??0)+(pressureReady?.byteLength??0);
  let distanceBuilds=0,influenceBuilds=0,distanceRequests=0;
  // Only requested pressure rows allocate storage. All original contributor
  // columns, formula evaluation, and floating-point sum order remain intact.
  const matrixDistance=(a:FleetUnit,b:FleetUnit)=>{
    const at=a.row*n+b.row;
    if(!distanceReady || distanceReady[at])return distances[at];
    if(a.row===b.row){distanceReady[at]=1;return 0;}
    // Retain the original triangular operand direction (important for -0).
    const high=a.row>b.row?a:b,low=a.row>b.row?b:a;
    const value=coordinateLength(high.x-low.x,high.y-low.y);
    distances[at]=value;distances[b.row*n+a.row]=value;
    distanceReady[at]=1;distanceReady[b.row*n+a.row]=1;distanceBuilds++;return value;
  };
  const pressureAt=(at:FleetUnit,u:FleetUnit)=>{
    const atRow=at.row,column=u.row,index=atRow*n+column;
    let values:Float64Array|undefined=pressure,ready:Uint8Array|undefined=pressureReady,offset=index;
    if(pressureRows){
      let row=pressureRows[atRow];
      if(!row){
        row={values:new Float64Array(n),ready:new Uint8Array(n)};
        pressureRows[atRow]=row;pressureRowsBuilt++;
        pressureBufferBytes+=row.values.byteLength+row.ready.byteLength;
      }
      values=row.values;ready=row.ready;offset=column;
    }
    if(!ready || ready[offset])return values![offset];
    const reach=Math.max(200,u.range)+u.radius+at.radius;
    const gap=Math.max(0,matrixDistance(at,u)-reach);
    const value=u.power/(1+gap/Math.max(100,u.speed*4));
    values![offset]=value;ready[offset]=1;influenceBuilds++;return value;
  };
  if(!demand){
    for(let i=0;i<n;i++)for(let j=0;j<i;j++){
      const d=coordinateLength(units[i].x-units[j].x,units[i].y-units[j].y);
      distances[i*n+j]=d;distances[j*n+i]=d;distanceBuilds++;
    }
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const at=units[i],u=units[j],reach=Math.max(200,u.range)+u.radius+at.radius;
      const gap=Math.max(0,distances[i*n+j]-reach);
      pressure![i*n+j]=u.power/(1+gap/Math.max(100,u.speed*4));influenceBuilds++;
    }
  }
  const distance=(a:FleetUnit,b:FleetUnit)=>{distanceRequests++;return matrixDistance(a,b);};
  const byId = new Map(units.map(u => [u.id, u]));
  const actors = units.filter(u => u.major && !u.retreating);
  const orderFor = (s: FleetUnit) => orders.get(s.id) ?? (s.isPlayer ? orders.get('fleet') : undefined);
  const plans = new Map<string, FleetAssignment>();
  for (const team of new Set(actors.map(u => u.teamId))) {
    const friends = actors.filter(u => u.teamId === team);
    const enemies = units.filter(u => u.teamId !== team && u.visible.has(team));
    const major = enemies.filter(u => u.major);
    const candidates = major.length ? major : enemies;
    // Influence around each contact, not knowledge of hidden enemy reinforcements.
    const influence = (at:FleetUnit,group:FleetUnit[]) => {
      let sum=0;
      // Preserve source group order and original floating-point sum order.
      for(const u of group)sum+=pressureAt(at,u);
      return sum;
    };
    const danger = new Map<string,number>();
    if(!demand)for(const u of units.filter(u=>u.teamId===team||u.visible.has(team)))
      danger.set(u.id,influence(u,enemies)/Math.max(1,influence(u,friends)));
    const dangerAt=(id:string):number|undefined=>{
      const cached=danger.get(id);if(cached!==undefined)return cached;
      const u=byId.get(id);if(!u||(u.teamId!==team&&!u.visible.has(team)))return;
      const value=influence(u,enemies)/Math.max(1,influence(u,friends));danger.set(id,value);return value;
    };
    const claims = new Map<string, number>();
    const previous = new Map<string, string>();
    const claim = (id: string, power: number) => claims.set(id, Math.max(0, (claims.get(id) ?? 0) + power));
    const canContribute = (u: FleetUnit, target: FleetUnit) => distance(u, target)
      <= u.range + target.radius + u.radius + u.speed * fleetPolicy.commitmentSeconds;
    // Reserve explicit/manual engagements before allocating free ships. Seed previous commitments
    // then remove each ship's own claim before scoring, avoiding all-ships-switch-target oscillation.
    for (const u of friends) {
      const order = orderFor(u);
      const id = order?.type === 'ENGAGE' ? order.targetShipId : u.currentTargetId;
      const target = id ? byId.get(id) : undefined;
      if (target && target.teamId !== team && target.visible.has(team) && canContribute(u, target)) {
        claim(target.id, u.power); previous.set(u.id, target.id);
      }
    }
    const autonomous = friends.filter(u => !manualIds.has(u.id)).sort((a, b) => {
      const priority = (s: FleetUnit) => orderFor(s)?.type === 'ENGAGE' ? 0 : 1;
      return priority(a) - priority(b) || compareId(a.id, b.id);
    });
    for (const u of autonomous) {
      const ship = u, order = orderFor(ship);
      const old = previous.get(ship.id); if (old) claim(old, -u.power);
      const ordered = (order?.type === 'ENGAGE' || order?.type === 'AVOID') && order.targetShipId
        ? enemies.find(e => e.id === order.targetShipId) : undefined;
      let selected: FleetUnit | undefined, best = -Infinity;
      for (const e of ordered ? [ordered] : candidates) {
        const target = e;
        const gap = Math.max(0, distance(ship, target) - u.range - target.radius - ship.radius);
        const travel = gap / Math.max(20, u.speed);
        const demand = Math.max(100, target.hullHp / fleetPolicy.commitmentSeconds + target.armor * .5 + e.power * .75);
        let score = 7 / (1 + travel / fleetPolicy.travelSeconds);
        score += (1 - e.hull) * 2 + clamp(target.flux, 0, 1) * 1.5;
        if (target.overloaded || target.venting) score += 2;
        if (target.shieldPhased || target.systemPhased) score -= 3;
        score -= Math.min(5, Math.max(0, (dangerAt(target.id) ?? 1) - 1) * 1.6);
        score -= Math.min(6, ((claims.get(target.id) ?? 0) + u.power * .25) / demand * 2);
        if (ship.currentTargetRow === target.row) score += fleetPolicy.targetStickiness;
        if (u.role === 'SKIRMISHER') score += e.role === 'CARRIER' || e.hull < .4 ? 1 : 0;
        if (order?.type === 'DEFEND' && order.targetPos) score -= pointDistance(target,order.targetPos.x,order.targetPos.y) / Math.max(300, u.range);
        const escort = order?.type === 'ESCORT' ? byId.get(order.targetShipId ?? '') : undefined;
        if (escort) score -= distance(target, escort) / Math.max(300, u.range);
        if (score > best + 1e-6 || Math.abs(score - best) <= 1e-6 && selected && compareId(target.id, selected.id) < 0) {
          selected = e; best = score;
        }
      }
      const target = selected;
      const covers = friends.filter(a => a !== u && a.role !== 'UNARMED' && a.role !== 'CARRIER'
        && a.hull > .4 && !a.venting && !a.overloaded && a.flux < .8
        // An equal, equally exposed neighbor is not cover: do not assign mutual retreat loops.
        && (u.role === 'UNARMED' || a.hull > u.hull + .15 || a.power > u.power * 1.5
          || target && distance(a, target) > distance(ship, target) + ship.radius + a.radius));
      const anchor = covers.reduce<FleetUnit | undefined>((best, a) => !best || distance(ship, a) < distance(ship, best)
        || distance(ship, a) === distance(ship, best) && compareId(a.id, best.id) < 0 ? a : best, undefined);
      const pressure = dangerAt(ship.id) ?? 0;
      const wasBackingOff = ship.previousTask === 'REGROUP' || ship.previousTask === 'DISENGAGE';
      const nearFight = target && distance(ship, target) < Math.max(u.range, selected!.range) + ship.radius + target.radius + 400
        + (wasBackingOff ? fleetPolicy.disengageDistanceHysteresis : 0);
      const opportunity = !!target && hasAttackOpportunity(ship, target, pressure);
      // Estimated enemy DPS alone is not a retreat order. Healthy gunships must
      // commit before their own guns can reach, even against a stronger contact.
      // Carriers retain stand-off safety; recovered gunships rejoin without waiting
      // for the enemy's paper firepower to disappear.
      const reservesThreatened = u.role === 'CARRIER' || u.hull < fleetPolicy.pressureRetreatHull
        || ship.overloaded || ship.venting
        || ship.flux >= (wasBackingOff ? fleetPolicy.pressureResumeFlux : fleetPolicy.pressureRetreatFlux);
      // Retreat intent must not depend on finding cover. A supporting ally crossing
      // 80% flux cannot make an outmatched ship charge back into the same danger.
      // REGROUP and its no-cover fallback share pressure and distance hysteresis.
      const backingOff = !order && !ship.doNotBackOff && (u.role === 'UNARMED' && (!!anchor || !!target)
        || nearFight && (u.hull < fleetPolicy.lowHull && (!!anchor || wasBackingOff) || !opportunity && reservesThreatened && pressure > (wasBackingOff ? fleetPolicy.resumePressure : fleetPolicy.regroupPressure)));
      const regroup = backingOff && !!anchor;
      const disengage = backingOff && !anchor && !!target;
      const task: FleetTask = regroup ? 'REGROUP' : disengage ? 'DISENGAGE' : !target ? 'SEARCH' : u.role === 'CARRIER' ? 'SUPPORT'
        : opportunity ? 'FINISH'
        : u.role === 'SKIRMISHER' ? 'SCREEN' : 'PRESSURE';
      const committed = target && canContribute(u, target) && !backingOff ? u.power : 0;
      if (target && committed) claim(target.id, committed);
      plans.set(ship.id, { targetId: target?.id ?? null, role: u.role, task, score: Number.isFinite(best) ? best : 0,
        pressureRatio: pressure, assignedPower: committed, carrierRange: u.carrierRange,
        anchorId: regroup ? anchor!.id : null, approachBearing: null });
    }
    // Distinct approach lanes for autonomous attackers of the SAME team/target. Stable spatial
    // ordering avoids crossing each other simply because deployment IDs have a different order.
    for (const target of candidates) {
      const group = autonomous.filter(u => {
        const p = plans.get(u.id)!;
        return p.targetId === target.id && !orderFor(u) && p.task !== 'REGROUP' && p.task !== 'DISENGAGE'
          && p.role !== 'CARRIER' && p.role !== 'UNARMED';
      });
      if (group.length < 2) continue;
      const x = group.reduce((sum, u) => sum + u.x - target.x, 0);
      const y = group.reduce((sum, u) => sum + u.y - target.y, 0);
      const bearing = Math.atan2(y, x), nx = -Math.sin(bearing), ny = Math.cos(bearing);
      group.sort((a, b) => (a.x - b.x) * nx + (a.y - b.y) * ny || compareId(a.id, b.id));
      group.forEach((u, i) => {
        const spread = fleetPolicy.maximumLaneAngle * (u.role === 'SKIRMISHER' ? 1.25 : 1);
        plans.get(u.id)!.approachBearing = bearing + (i / (group.length - 1) * 2 - 1) * spread;
      });
    }
  }
  numericFleetWork.plans++;numericFleetWork.units+=n;numericFleetWork.distanceBuilds+=distanceBuilds;
  numericFleetWork.distanceRequests+=distanceRequests;numericFleetWork.influenceBuilds+=influenceBuilds;
  fleetDemandStorageWork.plans++;fleetDemandStorageWork.units+=n;
  if(rowStorage)fleetDemandStorageWork.rowPlans++;else fleetDemandStorageWork.densePlans++;
  fleetDemandStorageWork.pressureRows+=pressureRowsBuilt;fleetDemandStorageWork.pressureCells+=influenceBuilds;
  fleetDemandStorageWork.pressureBufferBytes+=pressureBufferBytes;
  fleetDemandStorageWork.denseEquivalentPressureBytes+=(demand?9:8)*n*n;
  return plans;
}
