import { AnchoredProjectileReceiver } from './AnchoredProjectileVisual.mjs';
import { Vector2 } from '../engine/math/Vector2';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { setProjectileVisualLayer } from '../engine/render/ProjectileVisualLayer';

type Projectile = CombatEngine['projectiles'][number];
type Pose = { row: Projectile; display: Projectile; previous: Projectile };
function materialize(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (value.$undefined === 1 && Object.keys(value).length === 1) return undefined;
  if (Array.isArray(value.$vector) && Object.keys(value).length === 1) return new Vector2(value.$vector[0],value.$vector[1]);
  if (Array.isArray(value)) return value.map(materialize);
  return Object.fromEntries(Object.entries(value).map(([key,v]) => [key,materialize(v)]));
}
/** A display-only, bounded two-endpoint view. It never simulates guidance,
 * collisions, hits, removals or authority ticks. Interpolates received states,
 * then holds (no indefinite dead reckoning on a stalled authority). */
export class ProjectileVisualReplica {
  private readonly receiver: AnchoredProjectileReceiver;
  private poses: Pose[] = [];
  private projectiles: Projectile[] = [];
  private tick = -1;
  private time = 0;
  private previousTime = 0;
  private receivedAt = 0;
  private interval = 50;
  private engine: DisplaySource | null = null;
  private count = 0;
  constructor(private readonly epoch: string) { this.receiver = new AnchoredProjectileReceiver(epoch); }
  clear(): void {
    if (this.engine) setProjectileVisualLayer(this.engine,null);
    this.receiver.reset(this.epoch); this.poses = []; this.projectiles = []; this.tick = -1; this.time = this.previousTime = this.receivedAt = 0; this.count = 0;
  }
  receive(key: number, kind: 'baseline'|'update', bytes: Uint8Array, now: number, minTick: number): boolean {
    if (!Number.isFinite(now)) throw Error('Invalid presentation clock');
    const frame = kind === 'baseline' ? this.receiver.baseline(key,bytes) : this.receiver.update(key,bytes);
    if (!frame || frame.tick < minTick) return false;
    const old = new Map(this.poses.map(p => [p.row.id,p.row]));
    const poses = frame.rows.map(raw => {
      const row = materialize(raw) as Projectile;
      const display = {...row,pos:row.pos.clone()} as Projectile;
      if (row.ballisticTail) display.ballisticTail = row.ballisticTail.clone();
      display.prevPos = display.pos.clone();
      if (display.ballisticTail) display.prevBallisticTail = display.ballisticTail.clone();
      display.prevFadeProgress = display.fadeProgress;
      return {row,display,previous:old.get(row.id) ?? row};
    });
    this.interval = this.tick < 0 ? 0 : Math.max(16,Math.min(150,now-this.receivedAt));
    this.previousTime = this.tick < 0 ? frame.time : this.time;
    this.tick = frame.tick; this.time = frame.time; this.receivedAt = now; this.poses = poses; this.projectiles = poses.map(p=>p.display); this.count++;
    return true;
  }
  render(engine: DisplaySource, now: number, bulkTick: number): void {
    this.engine = engine;
    if (this.tick < 0 || bulkTick > this.tick) { setProjectileVisualLayer(engine,null); return; }
    // Stale visuals never resurrect removed entities from an older bulk world.
    // Hide after 500ms until a newer visual or a caught-up full snapshot exists.
    if (now-this.receivedAt > 500) {
      setProjectileVisualLayer(engine,bulkTick >= this.tick ? null : {projectiles:[],time:this.time,tick:this.tick,stale:true}); return;
    }
    const alpha = this.interval ? Math.max(0,Math.min(1,(now-this.receivedAt)/this.interval)) : 1;
    for (const p of this.poses) {
      const {row,display,previous} = p;
      const maxStep = Math.max(250,row.vel.length()*this.interval/1000*4);
      const blend = row.pos.distanceTo(previous.pos) > maxStep || row.isMine || row.didDamage ? 1 : alpha;
      display.pos.set(previous.pos.x+(row.pos.x-previous.pos.x)*blend,previous.pos.y+(row.pos.y-previous.pos.y)*blend);
      display.prevPos.copy(display.pos);
      if (display.ballisticTail && row.ballisticTail && previous.ballisticTail) {
        display.ballisticTail.set(previous.ballisticTail.x+(row.ballisticTail.x-previous.ballisticTail.x)*blend,previous.ballisticTail.y+(row.ballisticTail.y-previous.ballisticTail.y)*blend);
        display.prevBallisticTail?.copy(display.ballisticTail);
      }
      if (row.facingRad !== undefined && previous.facingRad !== undefined) display.facingRad = previous.facingRad+Math.atan2(Math.sin(row.facingRad-previous.facingRad),Math.cos(row.facingRad-previous.facingRad))*blend;
      if (row.fadeProgress !== undefined && previous.fadeProgress !== undefined) display.fadeProgress = previous.fadeProgress+(row.fadeProgress-previous.fadeProgress)*blend;
      display.prevFadeProgress = display.fadeProgress;
      if (row.elapsedTime !== undefined && previous.elapsedTime !== undefined) display.elapsedTime = previous.elapsedTime+(row.elapsedTime-previous.elapsedTime)*blend;
    }
    setProjectileVisualLayer(engine,{projectiles:this.projectiles,time:this.previousTime+(this.time-this.previousTime)*alpha,tick:this.tick});
  }
  stats(): {tick:number;received:number;entities:number} { return {tick:this.tick,received:this.count,entities:this.poses.length}; }
}

/** Minimal display capabilities; never an authority-world requirement. */
type DisplaySource = object;
