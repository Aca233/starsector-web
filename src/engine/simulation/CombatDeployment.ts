import type { CombatEngine } from './CombatEngine';
import type { Ship } from './Ship';
import type { ShipSpec } from '../content/ShipSpec';
import costs from '../data/generated/deployment-costs.json';
import { Vector2 } from '../math/Vector2';

export type DeploymentStatus = 'reserve' | 'deployed' | 'retreating' | 'retreated' | 'destroyed';
export interface DeploymentRow { id: string; teamId: number; cost: number; status: DeploymentStatus; }
export interface DeploymentState { limit: number; rows: DeploymentRow[]; }
/** Resolved native supplies-to-recover costs include skin inheritance/overrides; custom hulls declare their own cost. */
export function deploymentCost(spec: ShipSpec): number {
  const value = spec.deploymentPoints ?? (costs as Record<string, number>)[spec.sourceHullId ?? spec.id];
  if (!Number.isFinite(value) || !(value > 0)) throw Error('舰船缺少有效部署点：' + spec.id);
  return value;
}
export const BATTLE_HALF_EXTENT = 6000;
interface Entry { ship: Ship; cost: number; pending: boolean; }

/** Encounter-owned roster. Reserve hulls exist for identity/snapshots, never in live simulation. */
export class CombatDeployment {
  private entries = new Map<string, Entry>();
  private automaticTeams = new Set<number>();
  private angles = new Map<number, number>();
  private nextWave = 5;
  public limit = 240;
  constructor(private readonly engine: CombatEngine) {}
  public get enabled(): boolean { return this.entries.size > 0; }
  public clear(): void { this.entries.clear(); this.automaticTeams.clear(); this.angles.clear(); this.nextWave = 5; }
  public isReserve(id: string): boolean { return this.entries.get(id)?.pending ?? false; }
  public configure(ships: readonly Ship[], initialIds: ReadonlySet<string>, limit: number, automaticTeams: readonly number[] = []): void {
    if (!ships.length) throw Error('舰队名单不能为空。');
    if (this.engine.combatTime !== 0 || this.engine.battleResult) throw Error('只能在战前设置后备舰队。');
    if (!Number.isFinite(limit) || limit <= 0 || limit > 20000) throw Error('部署上限无效。');
    if (new Set(ships.map(s => s.id)).size !== ships.length || [...initialIds].some(id => !ships.some(s => s.id === id))) throw Error('首发舰船名单无效。');
    const entries = ships.map(ship => ({ship, cost: deploymentCost(ship.spec), pending: !initialIds.has(ship.id)}));
    for (const team of new Set(ships.map(s => s.teamId))) {
      if (entries.filter(e => e.ship.teamId === team && !e.pending).reduce((sum,e)=>sum+e.cost,0) > limit) throw Error('首发舰船超出本方部署上限。');
      if (!entries.some(e => e.ship.teamId === team && !e.pending)) throw Error('每个参战阵营至少需要一艘首发舰船。');
    }
    if (entries.some(e => e.cost > limit)) throw Error('后备舰船的部署点超过整队上限，请调整战前额度。');
    this.clear(); this.limit = limit; this.automaticTeams = new Set(automaticTeams);
    for (const entry of entries) this.entries.set(entry.ship.id, entry);
    for (const team of new Set(ships.map(s => s.teamId))) {
      const anchor = entries.find(e => e.ship.teamId === team && !e.pending)!.ship.pos;
      this.angles.set(team, anchor.length() > 0 ? anchor.heading() : team === 0 ? Math.PI/2 : -Math.PI/2);
    }
    // Remove decks pre-created by legacy constructors. Only active carriers may own craft.
    const active=this.engine.capitalShips;
    this.engine.fighterSystem.init(active[0]);
    for(const ship of active.slice(1))this.engine.fighterSystem.addCarrier(ship);
  }
  public status(entry: Entry): DeploymentStatus {
    if (entry.ship.isDead || entry.ship.hullHp <= 0) return 'destroyed';
    if (entry.ship.isRetreated) return 'retreated';
    if (entry.pending) return 'reserve';
    return entry.ship.retreating ? 'retreating' : 'deployed';
  }
  public snapshot(): DeploymentState {
    return {limit:this.limit, rows:[...this.entries].map(([id,e])=>({id,teamId:e.ship.teamId,cost:e.cost,status:this.status(e)}))};
  }
  /** Viewers synchronize pending membership without running deployment or spawning local fighters. */
  public applySnapshot(state: DeploymentState): void {
    if (!state || state.limit !== this.limit || state.rows.length !== this.entries.size || new Set(state.rows.map(r=>r.id)).size !== state.rows.length) throw Error('无效部署快照');
    for (const row of state.rows) {
      const e=this.entries.get(row.id);
      if (!e || row.teamId!==e.ship.teamId || row.cost!==e.cost || !['reserve','deployed','retreating','retreated','destroyed'].includes(row.status)) throw Error('部署快照名单不匹配');
    }
    for (const row of state.rows) this.entries.get(row.id)!.pending=row.status==='reserve';
  }
  public used(team: number): number {
    return [...this.entries.values()].filter(e=>e.ship.teamId===team && !e.pending && !e.ship.isDead && !e.ship.isRetreated && e.ship.hullHp>0).reduce((sum,e)=>sum+e.cost,0);
  }
  public reason(ids: readonly string[], team: number): string | undefined {
    if (!this.enabled || this.engine.battleResult) return '本场战斗不能继续部署。';
    if (!ids.length || new Set(ids).size!==ids.length) return '请选择不重复的待命舰船。';
    let cost=0;
    for (const id of ids) {
      const e=this.entries.get(id);
      if (!e || e.ship.teamId!==team) return '只能部署本队战前编成中的舰船。';
      if (this.status(e)!=='reserve') return '所选舰船已部署、撤退或损失，请更新选择。';
      cost+=e.cost;
    }
    if (this.used(team)+cost>this.limit) return '超出本队可用部署点。';
  }
  /** Used by both catalog simulation waves and persistent/online reserves. */
  public entryPosition(team: number, radius: number, occupied: readonly Ship[]): Vector2 {
    const angle=this.angles.get(team) ?? (team===this.engine.playerShip.teamId ? Math.PI/2 : -Math.PI/2);
    const normal=Vector2.fromAngle(angle), tangent=new Vector2(-normal.y,normal.x);
    const edge=BATTLE_HALF_EXTENT/Math.max(Math.abs(normal.x),Math.abs(normal.y));
    for (let i=0;i<256;i++) {
      const lane=(i%2===0?1:-1)*Math.ceil(i/2)*(radius*2+220);
      const pos=normal.clone().scale(edge+radius+200+Math.floor(Math.abs(lane)/8000)*(radius*2+220)).addScaled(tangent, lane%8000);
      if (!occupied.some(s=>!s.isDead&&!s.isRetreated&&s.pos.distanceTo(pos)<s.spec.collisionRadius+radius+180)) return pos;
    }
    throw Error('本方入场边缘拥堵，请稍后部署。');
  }
  public deploy(ids: readonly string[], team: number): Ship[] {
    const reason=this.reason(ids,team); if(reason)throw Error(reason);
    const occupied=[...this.engine.capitalShips], pending=ids.map(id=>this.entries.get(id)!);
    const positions:Vector2[]=[];
    for (const e of pending) { const pos=this.entryPosition(team,e.ship.spec.collisionRadius,occupied); positions.push(pos); occupied.push({pos,spec:e.ship.spec,isDead:false,isRetreated:false} as Ship); }
    pending.forEach((e,index)=>{
      e.ship.pos.copy(positions[index]); e.ship.prevPos.copy(e.ship.pos);
      e.ship.facingRad=e.ship.pos.clone().scale(-1).heading(); e.ship.prevFacingRad=e.ship.facingRad;
      e.pending=false; this.engine.fighterSystem.addCarrier(e.ship);
    });
    return pending.map(e=>e.ship);
  }
  public requestRetreat(ids: readonly string[], team: number, withdrawReserves = false): void {
    if (this.engine.battleResult || (!ids.length && !withdrawReserves) || new Set(ids).size!==ids.length) throw Error('不能下达撤退。');
    const entries=ids.map(id=>this.entries.get(id));
    if(entries.some(e=>!e||e.ship.teamId!==team||this.status(e)!=='deployed'))throw Error('只能撤退本队在场舰船。');
    if(withdrawReserves)for(const e of this.entries.values())if(e.ship.teamId===team&&e.pending)e.ship.isRetreated=true;
    for(const e of entries){ e!.ship.retreating=true; e!.ship.clearInput(); this.engine.orders.delete(e!.ship.id); }
  }
  public navigateRetreat(ship: Ship): void {
    if (!this.entries.has(ship.id)||!ship.retreating||ship.isRetreated||ship.isDead) return;
    const angle=this.angles.get(ship.teamId)!;
    const n=Vector2.fromAngle(angle), distance=ship.pos.x*n.x+ship.pos.y*n.y;
    if(distance>BATTLE_HALF_EXTENT/Math.max(Math.abs(n.x),Math.abs(n.y))+ship.spec.collisionRadius){
      const pos=ship.pos.clone(); ship.retreatFromCombat(); ship.pos.copy(pos); ship.prevPos.copy(pos); return;
    }
    const error=Math.atan2(Math.sin(angle-ship.facingRad),Math.cos(angle-ship.facingRad));
    ship.turnInput=Math.max(-1,Math.min(1,error*2));ship.strafeInput=0;ship.throttle=Math.abs(error)<.7?1:0;
  }
  public advance(): void {
    if (!this.enabled || this.engine.battleResult) return;
    const wave=this.engine.combatTime>=this.nextWave;
    if(wave)this.nextWave=this.engine.combatTime+5;
    const liveTeams=new Set(this.engine.capitalShips.filter(s=>!s.isDead&&!s.isRetreated&&s.hullHp>0).map(s=>s.teamId));
    const byTeam=new Map<number,Entry[]>();
    for(const entry of this.entries.values()){const rows=byTeam.get(entry.ship.teamId)??[];rows.push(entry);byTeam.set(entry.ship.teamId,rows);}
    for(const [team,entries] of byTeam){
      const alive=liveTeams.has(team);
      if(alive&&!(wave&&this.automaticTeams.has(team)))continue;
      // No indefinite reserve-only stalemate: a fleet with no active hull automatically calls its next wave.
      let room=this.limit-entries.filter(e=>!e.pending&&!e.ship.isDead&&!e.ship.isRetreated&&e.ship.hullHp>0).reduce((sum,e)=>sum+e.cost,0);const ids:string[]=[];
      for(const e of entries)if(this.status(e)==='reserve'&&e.cost<=room){ids.push(e.ship.id);room-=e.cost;}
      if(ids.length)this.deploy(ids,team);
    }
  }
}
