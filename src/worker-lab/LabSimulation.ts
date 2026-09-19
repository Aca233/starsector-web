import { CombatEngine } from '../engine/simulation/CombatEngine';
import { CapitalShipAI } from '../engine/ai/CapitalShipAI';
import { Vector2 } from '../engine/math/Vector2';
import { applyPlayerControls } from '../engine/runtime/PlayerControls';
import { dispatchShipCommand } from '../engine/runtime/CombatCommands';

export interface LabConfig { ships: number; seed: number }
export interface LabInput {
  sequence: number;
  autopilot: boolean;
  keys: Record<string, boolean>;
  aim: [number, number];
  firing: boolean;
  pointerActive: boolean;
}
export type LabAction = 'shield' | 'hullShield' | 'vent' | 'system' | 'group1' | 'group2' | 'group3';
export const neutralInput = (): LabInput => ({ sequence: 0, autopilot: true, keys: {}, aim: [0, 0], firing: false, pointerActive: false });
export function validateConfig(config: LabConfig): void {
  if (![2, 10, 50, 100].includes(config.ships) || !Number.isSafeInteger(config.seed))
    throw new Error('Unsupported worker-lab fixture');
}

/** Identical starting state and tick code in BOTH backends. No fleet/FX/AI quality reductions. */
export class LabSimulation {
  readonly engine: CombatEngine;
  readonly playerAI: CapitalShipAI;
  tick = 0;
  simulationMs = 0;
  input = neutralInput();
  appliedInput = 0;
  private actions: LabAction[] = [];
  constructor(readonly config: LabConfig) {
    validateConfig(config);
    const e = this.engine = new CombatEngine('onslaught', 'onslaught', config.seed);
    for (let i = 2; i < config.ships; i++) e.addShip('onslaught', i % 2 === 0, new Vector2());
    const ships = e.capitalShips;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i], pair = i >> 1, side = i % 2;
      ship.pos.set(pair % 5 * 1000 + side * 500, Math.floor(pair / 5) * 650);
      ship.prevPos.copy(ship.pos);
      ship.facingRad = ship.prevFacingRad = side ? Math.PI : 0;
      ship.currentTargetShip = ships[i ^ 1];
      for (const mount of ship.weapons) {
        mount.currentAngleRad = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
      }
    }
    this.playerAI = new CapitalShipAI(e.playerShip, e.enemyShip);
  }
  action(action: LabAction): void {
    if (this.actions.length >= 128) throw new Error('Too many queued combat actions');
    this.actions.push(action);
  }
  step(): void {
    const start = performance.now(), e = this.engine, ship = e.playerShip;
    if (this.input.autopilot) e.updateShipAI(this.playerAI, 1 / 60);
    else {
      ship.fireControlMode = 'MANUAL'; ship.defenseFacingRad = undefined;
      ship.aiHoldOffensiveFire = false; ship.tacticalAI = undefined;
      applyPlayerControls(ship, this.input.keys, new Vector2(...this.input.aim), this.input.firing, undefined, this.input.pointerActive);
    }
    for (const action of this.actions.splice(0)) {
      const command = action === 'shield' || action === 'hullShield' || action === 'vent' || action === 'system'
        ? { kind: action } as const : { kind: 'group', value: Number(action.slice(-1)) - 1 } as const;
      dispatchShipCommand(ship, command, this.input.pointerActive ? new Vector2(...this.input.aim) : undefined);
    }
    e.fixedUpdate(1 / 60);
    this.tick++;
    this.appliedInput = this.input.sequence;
    this.simulationMs = performance.now() - start;
  }
}

/** One fixed tick per task; same pacing in both backends. Never grow dt or synchronously wait. */
export class LabClock {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private deadline = 0;
  droppedWallMs = 0;
  constructor(private readonly step: () => void, private readonly failed: (error: unknown) => void) {}
  start(): void {
    if (this.active) return;
    this.active = true; this.deadline = performance.now(); this.schedule();
  }
  pause(): void { this.active = false; clearTimeout(this.timer); this.timer = undefined; }
  private schedule(): void {
    this.timer = setTimeout(() => {
      if (!this.active) return;
      try { this.step(); } catch (error) { this.pause(); this.failed(error); return; }
      this.deadline += 1000 / 60;
      const now = performance.now();
      if (now > this.deadline) { this.droppedWallMs += now - this.deadline; this.deadline = now; }
      if (this.active) this.schedule();
    }, Math.max(0, this.deadline - performance.now()));
  }
}

