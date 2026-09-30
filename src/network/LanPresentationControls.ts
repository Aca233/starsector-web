import { Vector2 } from '../engine/math/Vector2';
import { CameraController } from '../engine/runtime/CameraController';
import { clientToCombatWorldInViewport, zoomCombatView } from '../engine/runtime/PlayerControls';
import type { CombatViewport } from '../engine/runtime/CombatViewport';
import { sameTeam } from '../engine/simulation/CombatTeams';
import type { LanDisplayWorld } from './LanDisplayWorld';
import type { PlayerInput, Action } from './protocol';

/** Receive-realm presentation controls. Transport sequence/budget/action ownership
 * stay with the sender; only accepted input is recorded by the pipeline. No DOM,
 * implicit wall clock, message queue, or stale projected player pose here. */
export class LanPresentationControls {
  readonly controller = new CameraController();
  private readonly pointer = new Vector2();
  pointerActive = false;
  zoom = .65;
  constructor(readonly camera = new Vector2()) {}

  samplePointer(x: number, y: number): void {
    this.pointer.set(x, y); this.pointerActive = true;
    this.controller.samplePointer(x, y);
  }
  pointerAim(viewport: CombatViewport): Vector2 {
    return clientToCombatWorldInViewport(this.pointer, viewport, this.camera, this.zoom);
  }
  readInput(world: LanDisplayWorld, viewport: CombatViewport | undefined, seq: number, keys: number,
    firing: boolean, actions: Action[]): PlayerInput {
    if (this.pointerActive && !viewport) throw Error('Active pointer requires a current viewport');
    const aim = this.pointerActive ? this.pointerAim(viewport!) : world.playerShip.aimTargetWorld;
    return { seq, keys, aim: [aim.x, aim.y], firing, pointerActive: this.pointerActive, actions };
  }
  wheel(delta: number): void { this.zoom = zoomCombatView(this.zoom, delta); }
  hudZoom(viewport: CombatViewport): number { return this.zoom / (viewport.width / Math.max(1, viewport.rect.width)); }
  follow(world: LanDisplayWorld, alpha: number, viewport: CombatViewport, dt: number, active: boolean): void {
    const player = world.playerShip;
    const focusShip = player.isDead
      ? (world.capitalShips.find(ship => !ship.isDead && sameTeam(ship, player)) ?? player) : player;
    this.controller.followViewport(this.camera, focusShip.interpolatedPos(alpha), viewport, this.zoom, dt,
      active && !world.isTacticalMap, focusShip);
  }
}
