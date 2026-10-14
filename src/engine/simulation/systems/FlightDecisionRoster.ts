import { publishNativeFireMembership } from '../PublishedFireMembership';
import type { CombatEngine } from '../CombatEngine';
import { nativeGetMotionStats, type Ship } from '../Ship';
import { FireControlQueryRoster } from '../../ai/FireControlQueryBatch';
import { coordinateLength } from '../../math/Vector2';
const numericCrafts=new WeakMap<Ship,FlightDecisionRoster>();
export const flightRewriteWork={rosters:0,hostileQueries:0,permissionLists:0,steering:0,missileQueries:0,missileRows:0,permissionBuilds:0,permissionReuses:0};
export function usesNumericFlight(ship:Ship):boolean {return numericCrafts.get(ship)?.active===true;}
/** Flight is NOT a read-only position/status span: docking and retreat mutate
 * earlier craft. Share only fixed relationships; death/retreat/positions/targets
 * remain live on every query. Never extend this into deck or ship-state updates. */
export class FlightDecisionRoster {
  active=true;
  private readonly teams=new Map<number,{hostiles:Ship[];allies:Ship[]}>();
  private readonly permissionGroups=new Map<number,Map<Ship|null,readonly Ship[]>>();
  private readonly members:Set<Ship>;
  private readonly orders=new Map<Ship,number>();
  private constructor(private readonly ships:readonly Ship[]) {
    this.members=new Set(ships);ships.forEach((ship,i)=>{if(!this.orders.has(ship))this.orders.set(ship,i);numericCrafts.set(ship,this);});
    for(const team of new Set(ships.map(s=>s.teamId)))this.teams.set(team,{
      hostiles:ships.filter(s=>s.teamId!==team&&!s.hasVastBulk&&s.isVisibleTo(team)),
      allies:[...new Set(ships.filter(s=>s.teamId===team))]});flightRewriteWork.rosters++;
  }
  static create(owner:CombatEngine,ships:readonly Ship[]):FlightDecisionRoster|undefined {
    if(import.meta.env?.VITE_COMBAT_FIRE_FLIGHT_REWRITE==='false'||!FireControlQueryRoster.isWorkerOwned(owner))return;
    const actual=new Set(owner.ships);
    if(ships.some(s=>!actual.has(s)||!s.hasExactThreatPhaseHooks||s.getMotionStats!==nativeGetMotionStats))return;
    return new FlightDecisionRoster(ships);
  }
  hostile(ship:Ship,targetId?:string):Ship|undefined {
    if(!this.active||!this.members.has(ship))return;flightRewriteWork.hostileQueries++;
    const hostiles=this.teams.get(ship.teamId)?.hostiles;
    if(!hostiles||!hostiles.length)return undefined;
    const current=ship.currentTargetShip;
    let currentValid=false;
    let bestMain:Ship|undefined,bestMainDist=Infinity;
    let bestAny:Ship|undefined,bestAnyDist=Infinity;
    const sx=ship.pos.x,sy=ship.pos.y;
    for(let i=0;i<hostiles.length;i++){
      const s=hostiles[i];
      if(s.isDead||s.isRetreated)continue;
      if(targetId&&s.id===targetId)return s;
      if(s===current)currentValid=true;
      const dist=coordinateLength(sx-s.pos.x,sy-s.pos.y);
      if(s.spec.hullSize!=='FIGHTER'){
        if(!bestMain||dist<bestMainDist){bestMain=s;bestMainDist=dist;}
      } else if(!bestMain&&(!bestAny||dist<bestAnyDist)){
        bestAny=s;bestAnyDist=dist;
      }
    }
    if(currentValid)return current!;
    return bestMain??bestAny;
  }
  fireShips(ship:Ship,target:Ship|null,source:readonly Ship[]):readonly Ship[]|undefined {
    if(!this.active||source!==this.ships||!this.members.has(ship))return;
    const allies=this.teams.get(ship.teamId)?.allies;if(!allies)return;
    // Team/target are the actual producer key; no consumer scans/hashes masks.
    // A craft moved to another team after capture keeps the original local path.
    const share=import.meta.env?.VITE_COMBAT_PLANNING_PRODUCERS!=='false' && allies.includes(ship);
    const key=target&& !allies.includes(target)?target:null;
    let groups=this.permissionGroups.get(ship.teamId);
    if(share){
      if(!groups){groups=new Map();this.permissionGroups.set(ship.teamId,groups);}
      const known=groups.get(key);
      if(known){flightRewriteWork.permissionLists++;flightRewriteWork.permissionReuses++;return known;}
    }
    const result=allies.slice();
    if(target&&!result.includes(target)){const order=this.orders.get(target)??Infinity,at=result.findIndex(s=>this.orders.get(s)!>order);result.splice(at<0?result.length:at,0,target);}
    if(!result.includes(ship))result.push(ship);
    if(share){groups!.set(key,result);publishNativeFireMembership(result);flightRewriteWork.permissionBuilds++;}
    flightRewriteWork.permissionLists++;return result;
  }
  close():void {this.active=false;for(const ship of this.members)if(numericCrafts.get(ship)===this)numericCrafts.delete(ship);this.members.clear();this.teams.clear();this.orders.clear();this.permissionGroups.clear();}
}
