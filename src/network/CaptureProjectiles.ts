import {captureProjectileProjection} from './CombatSnapshot';
import {expandSnapshotProjectiles} from './ProjectileProjection';
import type {ProjectileStreamFrame,ProjectileRecord} from './ProjectileEventStream.mjs';
import type {CombatEngine} from '../engine/simulation/CombatEngine';
/** Exact independent authority capture; no collision, damage, AI or renderer
 * mutation. Unsupported entity projections keep the complete-snapshot path. */
export function captureProjectileState(engine:CombatEngine,tick:number):ProjectileStreamFrame|null {
 if(engine.projectiles.length>4096)return null;
 try{return {tick,time:engine.combatTime,rows:expandSnapshotProjectiles(captureProjectileProjection(engine)) as ProjectileRecord[]};}
 catch{return null;}
}
