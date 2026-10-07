import { DecisionReadPlane } from './DecisionReadPlane';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { Ship } from '../simulation/Ship';
import { FireControlQueryRoster } from './FireControlQueryBatch';

export const decisionSceneWork={scenes:0,plans:0,modulePlans:0,hostileQueries:0,sourceLookups:0,spatialQueries:0,spatialFullRows:0,spatialCandidates:0};
interface Body { ship:Ship;order:number;x:number;y:number;radius:number;speed:number }
interface Node {minX:number;maxX:number;minY:number;maxY:number;radius:number;speed:number;left:number;right:number;first:number;end:number}
/** Conservative per-body tree: aircraft never enter this navigation policy, and
 * one huge hull / fast aircraft must not enlarge every unrelated query node. */
class DecisionSpatialTree {
  private active=true;
  private readonly bodies:Body[]=[];
  private readonly nodes:Node[]=[];
  private readonly length:number;
  private readonly identities:readonly Ship[];
  private magnitude=1;
  private valid=true;
  constructor(private readonly ships:readonly Ship[]) {
    this.length=ships.length;this.identities=ships.slice();
    ships.forEach((ship,order)=> {
      if(ship.spec.hullSize==='FIGHTER')return;
      const x=ship.pos.x,y=ship.pos.y,radius=Math.max(0,ship.spec.collisionRadius,ship.shield.radius),speed=Math.abs(ship.vel.x)+Math.abs(ship.vel.y);
      if(![x,y,radius,speed].every(Number.isFinite)){this.valid=false;return;}
      this.magnitude=Math.max(this.magnitude,Math.abs(x),Math.abs(y));
      this.bodies.push({ship,order,x,y,radius,speed});
    });
    if(this.valid&&this.bodies.length)this.build(0,this.bodies.length);
  }
  private build(first:number,end:number):number {
    const index=this.nodes.length,node:Node={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,radius:0,speed:0,left:-1,right:-1,first,end};
    for(let i=first;i<end;i++){const b=this.bodies[i];node.minX=Math.min(node.minX,b.x);node.maxX=Math.max(node.maxX,b.x);node.minY=Math.min(node.minY,b.y);node.maxY=Math.max(node.maxY,b.y);node.radius=Math.max(node.radius,b.radius);node.speed=Math.max(node.speed,b.speed);}
    this.nodes.push(node);
    if(end-first>8){const axis=node.maxX-node.minX>=node.maxY-node.minY?'x':'y';
      const sorted=this.bodies.slice(first,end).sort((a,b)=>a[axis]-b[axis]||a.order-b.order);
      for(let i=0;i<sorted.length;i++)this.bodies[first+i]=sorted[i];
      const middle=(first+end)>>>1;node.left=this.build(first,middle);node.right=this.build(middle,end);
    }
    return index;
  }
  select(ships:readonly Ship[],x:number,y:number,radius:number,maxSpeed:number,speed:number,horizon:number):readonly Ship[]|undefined {
    if(!this.active||!this.valid||ships!==this.ships||ships.length!==this.length||!ships.every((s,i)=>s===this.identities[i])||horizon<0||![x,y,radius,maxSpeed,speed,horizon].every(Number.isFinite))return;
    decisionSceneWork.spatialQueries++;decisionSceneWork.spatialFullRows+=ships.length;
    const orders:number[]=[],stack=this.nodes.length?[0]:[];
    while(stack.length){const n=this.nodes[stack.pop()!],reach=radius+n.radius+(maxSpeed+speed+n.speed)*horizon;
      if(!(reach>=0)||!Number.isFinite(reach))return;
      const pad=1e-9*Math.max(1,this.magnitude,Math.abs(x),Math.abs(y),reach),r=reach+pad;
      if(x+r<n.minX||x-r>n.maxX||y+r<n.minY||y-r>n.maxY)continue;
      if(n.left>=0){stack.push(n.left,n.right);continue;}
      for(let i=n.first;i<n.end;i++){const b=this.bodies[i],reach=radius+b.radius+(maxSpeed+speed+b.speed)*horizon;
        if(!Number.isFinite(reach))return;
        const padding=1e-9*Math.max(1,this.magnitude,Math.abs(x),Math.abs(y),reach);
        if(Math.max(Math.abs(x-b.x),Math.abs(y-b.y))<=reach+padding)orders.push(b.order);
      }
    }
    orders.sort((a,b)=>a-b);decisionSceneWork.spatialCandidates+=orders.length;
    return orders.map(order=>ships[order]);
  }
  close():void {this.active=false;this.bodies.length=0;this.nodes.length=0;}
}

/** One existing deferred ROOT+MODULE planning span. Not permanent world state,
 * an ownership proxy, or a lease extending into effects/flight/physics/fire. */
export class CombatDecisionScene {
  private active=true;
  private readonly length:number;
  private readonly members:Set<Ship>;
  private readonly identities:readonly Ship[];
  private readonly ids=new Map<string,Ship>();
  private readonly teams=new Map<number,{all:Ship[];main:Ship[];members:Set<Ship>}>();
  readonly navigation:DecisionSpatialTree;
  readonly readPlane?:DecisionReadPlane;
  private constructor(private readonly ships:readonly Ship[]) {
    this.length=ships.length;this.identities=ships.slice();this.members=new Set(ships);this.navigation=new DecisionSpatialTree(ships);
    if(import.meta.env?.VITE_COMBAT_STAGE_KERNEL!=='false'&&import.meta.env?.VITE_COMBAT_QUERY_READS!=='false')this.readPlane=new DecisionReadPlane();
    for(const ship of ships)if(!this.ids.has(ship.id))this.ids.set(ship.id,ship);
    for(const team of new Set(ships.map(ship=>ship.teamId))) {
      const all=ships.filter(s=>!s.hasVastBulk&&!s.isDead&&s.isVisibleTo(team)&&s.teamId!==team);
      this.teams.set(team,{all,main:all.filter(s=>s.spec.hullSize!=='FIGHTER'),members:new Set(all)});
    }
    decisionSceneWork.scenes++;
  }
  static create(owner:CombatEngine,ships:readonly Ship[]):CombatDecisionScene|undefined {
    if(import.meta.env?.VITE_COMBAT_DECISION_PIPELINE==='false'||!FireControlQueryRoster.isWorkerOwned(owner))return;
    const actual=new Set(owner.ships);
    if(!ships.length||ships.some(ship=>!actual.has(ship)||!ship.hasExactThreatPhaseHooks))return;
    return new CombatDecisionScene(ships);
  }
  matches(ships:readonly Ship[]):boolean {return this.active&&ships===this.ships&&ships.length===this.length&&ships.every((s,i)=>s===this.identities[i]);}
  includes(ship:Ship):boolean {return this.active&&this.members.has(ship);}
  source(id:string):Ship|undefined {if(!this.active)return;decisionSceneWork.sourceLookups++;return this.ids.get(id);}
  hostile(ship:Ship,targetId?:string):Ship|undefined {
    if(!this.includes(ship))return;
    const team=this.teams.get(ship.teamId);if(!team)return;
    decisionSceneWork.hostileQueries++;
    const ordered=targetId&&team.all.find(s=>s.id===targetId);if(ordered)return ordered;
    if(ship.currentTargetShip&&team.members.has(ship.currentTargetShip))return ship.currentTargetShip;
    // Exact original reduction/ties/NaN/Infinity. Positions stay native inputs;
    // this stage stores relationships, never a held target or a future decision.
    return (team.main.length?team.main:team.all).reduce<Ship|undefined>((closest,s)=>!closest||ship.pos.distanceTo(s.pos)<ship.pos.distanceTo(closest.pos)?s:closest,undefined);
  }
  notePlan(ship:Ship):void {decisionSceneWork.plans++;if(ship.isAttachedModule)decisionSceneWork.modulePlans++;}
  close():void {this.active=false;this.members.clear();this.ids.clear();this.teams.clear();this.navigation.close();this.readPlane?.close();}
}

export const nativeDecisionSceneMatches=CombatDecisionScene.prototype.matches;
