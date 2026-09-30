import { HYPERION_JUMP_ID } from '../content/HyperionIds';
import { hyperionJumpPointFailure, jumpTargetingEntryFailure, type JumpObstacleWorld } from '../content/HyperionJumpTarget';
import type { CombatHudView } from './CombatHudView';
import { Vector2 } from '../math/Vector2';

export interface JumpTargetPreview {
  readonly shipId: string; readonly position: Vector2; readonly facing: number;
  readonly phase: 'position' | 'facing'; readonly origin: Vector2; readonly range: number; readonly valid: boolean; readonly reason?: string;
}
interface Selection { shipId: string; epoch: number; slot: number; range: number }
/** Local-only interaction. No simulation objects or mutations; only the final confirmed pose crosses the control boundary. */
export class JumpTargeting {
  public selection: Readonly<Selection> | undefined;
  public preview: JumpTargetPreview | undefined;
  public message = '';
  private lockedPosition: Vector2 | undefined;
  private lockedFacing = 0;
  public get choosingFacing(): boolean { return !!this.lockedPosition; }
  public lockPosition(): boolean {
    if (!this.preview?.valid || this.lockedPosition) return false;
    this.lockedPosition = this.preview.position.clone(); this.lockedFacing = this.preview.facing;
    this.preview = {...this.preview,phase:'facing'};
    this.notify('战术跃迁 · 位置已锁定，移动鼠标调整朝向 · 再次左键确认 / 右键、Esc取消');
    return true;
  }
  private listeners = new Set<() => void>();
  public get active(): boolean { return !!this.selection; }
  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(message: string): void {
    if (message === this.message) return;
    this.message = message; for (const listener of this.listeners) listener();
  }
  public begin(shipId: string, epoch: number, slot: number, range: number): void {
    this.selection = {shipId,epoch,slot,range}; this.preview = undefined; this.lockedPosition = undefined;
    this.notify('战术跃迁 · 将鼠标移入战场选择落点 · 左键锁定位置 / 右键、Esc或跃迁键取消');
  }
  public cancel(): void { this.lockedPosition = undefined; this.selection = undefined; this.preview = undefined; this.notify(''); }
  public update(read: CombatHudView, epoch: number, point: Vector2 | undefined, world: JumpObstacleWorld): void {
    const selection = this.selection; if (!selection) return;
    const ship = read.playerShip, system = ship.systems[selection.slot];
    if (epoch !== selection.epoch || ship.id !== selection.shipId || read.battleResult || read.isTacticalMap
      || ship.fireControlMode !== 'MANUAL' || ship.isDead || ship.hullHp <= 0 || ship.isRetreated || ship.isDocked || ship.retreating
      || !system || system.type !== HYPERION_JUMP_ID || system.isActive || system.isCoolingDown || system.disabled
      || ship.flux.isOverloaded || ship.flux.isVenting || jumpTargetingEntryFailure(system)) { this.cancel(); return; }
    if (!point) { this.preview = undefined; this.notify(this.lockedPosition ? '战术跃迁 · 位置已锁定，移入战场调整方向 · 右键 / Esc取消' : '战术跃迁 · 将鼠标移入战场选择落点 · 右键 / Esc取消'); return; }
    const position = this.lockedPosition ?? point;
    if (this.lockedPosition && point.distanceTo(this.lockedPosition) > 8) this.lockedFacing = Math.atan2(point.y-position.y,point.x-position.x);
    const facing = this.lockedPosition ? this.lockedFacing : ship.facingRad;
    const reason = hyperionJumpPointFailure(ship, position, selection.range, world);
    this.preview = {shipId:ship.id,position:position.clone(),facing,phase:this.lockedPosition ? 'facing' : 'position',origin:ship.pos.clone(),range:selection.range,valid:!reason,reason};
    this.notify('战术跃迁 · '+(reason ?? (this.lockedPosition ? '位置已锁定 · 移动鼠标调整方向，再次左键确认跃迁' : '左键锁定落点'))+' · 右键 / Esc / 跃迁键取消');
  }
}
