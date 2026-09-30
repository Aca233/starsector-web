import { isArkCraft, isArkInterceptor, advanceArkFlightDefense } from '../../extensions/AdunArkFlight';
import { glorianaCraftRole } from '../../content/GlorianaAviation';
import { advanceGlorianaCraft } from './GlorianaFlightAI';
import { FlightFormation } from './FlightFormation';
import type { FireControlWorld } from '../../ai/AutofireController';
import { aimFlight, attackFlight, carrierOperational, dogfightTarget, flightHostile,
  incomingFlightThreat, payloadNeedsRearm, steerFlight, strikeMounts, wingCanReach } from './FighterTactics';
import { dispatchShipCommand } from '../../runtime/CombatCommands';
import wingRanges from '../../extensions/native-wing-ranges.json';
import { Vector2 } from '../../math/Vector2';
import { FighterAIState, BomberAIState, TacticalOrder, ContrailParticle, FlightDeckWing } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile, Beam } from '../Weapon';
import { modManager, type FighterWingSpec } from '../../modding/ModManager';
import { combatAudio as sound } from '../../audio/CombatAudioEvents';
import { SimulationRandom } from '../SimulationRandom';

export interface FighterFXCallbacks {
  spawnContrail: (c: ContrailParticle) => void;
  spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], hasShockwave?: boolean) => void;
  spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => void;
  addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => void;
  addCameraShake: (intensity: number, duration: number) => void;
  addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color: [number, number, number]) => void;
  cancelOrder: (unitId: string) => void;
  getOrder: (unitId: string) => TacticalOrder | undefined;
  findHostile?: (ship: Ship, targetId?: string) => Ship | undefined;
  getPlayerPos: () => Vector2;
  handleShipDestruction: (ship: Ship) => void;
  recordFighterRebuilt: (isPlayerCraft: boolean) => void;
  destructionSideEffectsEnabled: () => boolean;
}

/**
 * Web 舰载机联队与机库适配（未完整移植原版补充流程） (FighterSystem)
 * 深度实现:
 * 1. 航母机库甲板 (Flight Decks) 与战备重建率 (Carrier Replacement Rate - CRR)
 * 2. 战机战损进入机库队列倒计时重建，倒计时结束从母舰机库弹射出击
 * 3. 敌我双方航空中队全自主空战 AI：拦截导弹 (INTERCEPT)、咬尾缠斗 (DOGFIGHT)、掠袭战舰 (ATTACK) 与伴随护航 (ESCORT)
 * 4. 鱼雷轰炸机突击发射与返航甲板补给装填循环
 */
export class FighterSystem {
  public fighters: Ship[] = [];
  public fighterAIModes: Map<string, FighterAIState> = new Map();
  public bombers: Ship[] = [];
  public bomberAIModes: Map<string, BomberAIState> = new Map();

  public playerWings: FlightDeckWing[] = [];
  public enemyWings: FlightDeckWing[] = [];
  private carriers = new Map<string, Ship>();
  private readonly formation = new FlightFormation();
  private readonly reserveDeckUsed = new Set<Ship>();
  private readonly reserveCraft = new Map<Ship, number>();
  private readonly dockedReserve = new Set<Ship>();
  private readonly recoveredCraft = new Map<string, { timer: number; reserveRemaining?: number }[]>();

  constructor(
    private readonly random = new SimulationRandom(),
    private readonly visualRandom = new SimulationRandom(0xf17e7a11)
  ) {}

  public init(playerShip: Ship, enemyShip?: Ship, scenarioWings?: { player: FighterWingSpec[]; enemy: FighterWingSpec[] }) {
    this.fighters = [];
    this.bombers = [];
    this.fighterAIModes.clear();
    this.bomberAIModes.clear();
    this.playerWings = [];
    this.enemyWings = [];
    for (const carrier of this.carriers.values()) { carrier.deployedWingCraft.clear(); carrier.fighterRecall = false; }
    this.carriers.clear();
    this.formation.reset();
    this.reserveDeckUsed.clear();
    this.recoveredCraft.clear();
    this.reserveCraft.clear();
    this.dockedReserve.clear();
    this.addCarrier(playerShip, scenarioWings?.player);
    if (enemyShip) this.addCarrier(enemyShip, scenarioWings?.enemy);
  }

  public addCarrier(carrier: Ship, scenarioWings?: FighterWingSpec[]): void {
    carrier.syncModuleTree(true);
    for (const child of carrier.childModules) this.addCarrier(child);
    if (this.carriers.has(carrier.id)) return;
    const specs = scenarioWings ?? (carrier.spec.fighterWings ?? []).slice(0, carrier.hullStats.fighterBays);
    for (const spec of specs) {
      if (modManager.getShip(spec.specId)?.hullSize !== 'FIGHTER') throw new Error(`Invalid flight deck craft: ${spec.specId}`);
    }
    this.carriers.set(carrier.id, carrier);
    specs.forEach((spec, index) => {
      const wing: FlightDeckWing = {
        wingId: `${carrier.id}:wing:${index}`, carrierId: carrier.id,
        name: (glorianaCraftRole({id:spec.specId}) || isArkCraft({spec:modManager.requireShip(spec.specId)})) ? 'ship.'+spec.specId+'.name' : spec.specId, specId: spec.specId, role: spec.role, tags: spec.tags,
        rebuildSeconds: spec.rebuildSeconds, range: spec.range ?? (wingRanges as Record<string, number>)[spec.specId + '#' + spec.count], isPlayer: carrier.isPlayer, teamId: carrier.teamId,
        maxCrafts: spec.count, crr: 1, rebuildQueue: []
      };
      (carrier.isPlayer ? this.playerWings : this.enemyWings).push(wing);
      for (let i = 0; i < wing.maxCrafts; i++) this.spawnCraft(carrier, wing, i);
    });
  }

  private spawnCraft(carrier: Ship, wing: FlightDeckWing, index: number): Ship {
    const spec = modManager.getShip(wing.specId);
    if (!spec) throw new Error(`Unknown flight deck craft: ${wing.specId}`);
    const deckIndex=Number(wing.wingId.split(':').at(-1))||0;
    const offset = (glorianaCraftRole(spec)
      ? new Vector2(-carrier.spec.collisionRadius*.35-index*(spec.spriteHeight+24)-Math.floor(deckIndex/2)*60,(deckIndex%2?-1:1)*(carrier.spec.collisionRadius*.7+70+Math.floor(deckIndex/2)*100))
      : new Vector2(-100-index*45,(index%2?-1:1)*(70+index*30))).rotate(carrier.facingRad);
    const pointDefense = carrier.spec.captainSkills?.point_defense;
    const craftSpec = pointDefense ? { ...spec, captainSkills: { ...spec.captainSkills, point_defense: pointDefense } } : spec;
    const craft = new Ship(this.random.nextId(`${carrier.id}_craft`), craftSpec, carrier.isPlayer,
      carrier.pos.clone().add(offset), carrier.facingRad, this.random, this.visualRandom, carrier);
    craft.flightDeckWingId = wing.wingId;
    craft.sourceCarrier = carrier;
    carrier.deployedWingCraft.add(craft);
    if (!glorianaCraftRole(spec)) {
      craft.pos.copy(this.formation.station(craft, carrier, true));
      craft.prevPos.copy(craft.pos);
    }
    craft.vel.copy(carrier.vel);
    if (wing.role === 'BOMBER') {
      this.bombers.push(craft);
      this.bomberAIModes.set(craft.id, { state: 'ESCORT', timer: 0, hasTorpedo: true });
    } else {
      this.fighters.push(craft);
      this.fighterAIModes.set(craft.id, { state: 'ESCORT', timer: 0 });
    }
    return craft;
  }

  /** ReserveWingStats: fill to twice nominal strength once, not an endless replenishment buff. */
  public deployReserveWing(carrier: Ship): void {
    if ((carrier.isDead || carrier.isRetreated) || this.carriers.get(carrier.id) !== carrier) return;
    for (const wing of [...this.playerWings, ...this.enemyWings]) {
      if (wing.carrierId !== carrier.id || wing.tags?.includes('rd_no_extra_craft')) continue;
      const alive = [...this.fighters, ...this.bombers].filter(c => c.flightDeckWingId === wing.wingId && !c.isDead && !this.dockedReserve.has(c));
      const docked = this.recoveredCraft.get(wing.wingId)?.length ?? 0;
      const add = Math.max(0, wing.maxCrafts * 2 - alive.length - docked);
      const fillNormal = Math.max(0, wing.maxCrafts - alive.length - docked);
      // Fast normal replacements consume queued losses, so they cannot respawn twice.
      wing.rebuildQueue.splice(0, Math.min(add, fillNormal));
      for (let i = 0; i < add; i++) {
        const craft = this.spawnCraft(carrier, wing, alive.length + i);
        if (i >= fillNormal) this.reserveCraft.set(craft, 30);
      }
    }
  }

  /** RecallDeviceStats -> FighterLaunchBay.land, with a fast serial launch interval.
   * Docking removes the entity; it is neither a kill nor a CRR replacement loss. */
  public recoverWingCraft(carrier: Ship, craft: Ship): void {
    if ((carrier.isDead || carrier.isRetreated) || carrier.hullHp <= 0 || craft.isDead || craft.hullHp <= 0 || craft.isDocked
      || craft.sourceCarrier !== carrier || this.carriers.get(carrier.id) !== carrier) return;
    const wing = [...this.playerWings, ...this.enemyWings].find(w => w.wingId === craft.flightDeckWingId && w.carrierId === carrier.id);
    const list = wing?.role === 'BOMBER' ? this.bombers : this.fighters;
    const index = list.indexOf(craft);
    if (!wing || index < 0) return;
    craft.isDocked = true;
    craft.clearInput();
    carrier.deployedWingCraft.delete(craft);
    list.splice(index, 1);
    this.fighterAIModes.delete(craft.id);
    this.bomberAIModes.delete(craft.id);
    const reserveRemaining = this.reserveCraft.get(craft);
    this.reserveCraft.delete(craft);
    this.dockedReserve.delete(craft);
    if (reserveRemaining !== undefined && reserveRemaining <= 0) return;
    const queue = this.recoveredCraft.get(wing.wingId) ?? [];
    queue.push({ timer: .3 + this.random.next() * .3, reserveRemaining });
    this.recoveredCraft.set(wing.wingId, queue);
  }

  private returnReserve(craft: Ship, carrier: Ship, dt: number, target: Ship,
    spawnProj: (p: Projectile) => void, spawnBeam: (b: Beam) => void,
    spawnFlash: (pos: Vector2, angleRad: number, size: number, color: [number, number, number]) => void): boolean {
    const left = this.reserveCraft.get(craft);
    if (left === undefined || left > 0 || (carrier.isDead || carrier.isRetreated)) return false;
    craft.isFiringMain = false;
    craft.fireControlMode = 'MANUAL';
    for (const group of craft.weaponGroups) group.isAutofire = false;
    const delta = carrier.pos.clone().sub(craft.pos);
    let turn = delta.heading() - craft.facingRad;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    craft.turnInput = Math.max(-1, Math.min(1, turn * 3));
    craft.throttle = Math.abs(turn) < .8 ? 1 : .25;
    craft.strafeInput = 0;
    craft.brakeInput = false;
    craft.update(dt, target, spawnProj, spawnBeam, spawnFlash);
    if (delta.length() <= carrier.spec.collisionRadius + 35) {
      this.dockedReserve.add(craft);
      carrier.deployedWingCraft.delete(craft);
    }
    return true;
  }

  private wingFor(craft: Ship): FlightDeckWing | undefined {
    return [...this.playerWings, ...this.enemyWings].find(w => w.wingId === craft.flightDeckWingId);
  }
  public detachWingCraft(carrier: Ship, craft: Ship): boolean {
    if (craft.sourceCarrier !== carrier || !craft.flightDeckWingId || craft.isDead || craft.isDocked) return false;
    const collection = this.fighters.includes(craft) ? this.fighters : this.bombers;
    const index = collection.indexOf(craft);if(index<0)return false;
    collection.splice(index,1);carrier.deployedWingCraft.delete(craft);
    this.fighterAIModes.delete(craft.id);this.bomberAIModes.delete(craft.id);
    this.reserveCraft.delete(craft);this.dockedReserve.delete(craft);
    craft.flightDeckWingId=undefined;craft.clearInput();return true;
  }
  private wingRange(craft: Ship, carrier: Ship): number {
    return carrier.hullStats.fighterWingRangeMultiplier <= 0 ? 0 : (this.wingFor(craft)?.range ?? Infinity) * carrier.hullStats.fighterWingRangeMultiplier;
  }
  /** Hold a real formation station without preventing in-range defensive fire. */
  private guardCarrier(craft: Ship, carrier: Ship, target: Ship | null | undefined): void {
    steerFlight(craft, this.formation.station(craft, carrier), carrier.vel);
    if (flightHostile(craft, target)) aimFlight(craft, { kind: 'SHIP', entity: target });
    else craft.aimTargetWorld.copy(carrier.pos);
  }
  private carrierFor(craft: Ship, fallback: Ship): Ship {
    const wing = [...this.playerWings, ...this.enemyWings].find(w => w.wingId === craft.flightDeckWingId);
    return (wing?.carrierId && this.carriers.get(wing.carrierId)) || fallback;
  }

  public toggleRecall(carrier: Ship): boolean {
    if (carrier.isDead || carrier.isRetreated || ![...this.playerWings, ...this.enemyWings].some(w => w.carrierId === carrier.id)) return false;
    return dispatchShipCommand(carrier, { kind: 'recall' }).accepted;
  }

  private applyReserveDecks(): void {
    for (const carrier of this.carriers.values()) {
      if ((carrier.isDead || carrier.isRetreated) || !carrier.hullStats.reserveDeck || this.reserveDeckUsed.has(carrier)) continue;
      const wings = [...this.playerWings, ...this.enemyWings].filter(w => w.carrierId === carrier.id);
      if (!wings.length || wings.reduce((n,w) => n + w.crr,0) / wings.length > .4) continue;
      this.reserveDeckUsed.add(carrier);
      for (const wing of wings) {
        wing.crr = 1;
        const alive = [...carrier.deployedWingCraft].filter(c => !c.isDead && c.flightDeckWingId === wing.wingId).length;
        const queue = this.recoveredCraft.get(wing.wingId) ?? [];
        wing.rebuildQueue.length = 0;
        for (let n = alive + queue.length; n < wing.maxCrafts; n++) queue.push({timer:.3 + this.random.next()*.3});
        this.recoveredCraft.set(wing.wingId, queue);
      }
    }
  }

  /**
   * 航母机库甲板战备重构 (Carrier Replacement Rate & Flight Decks Rebuild Loop)
   */
  public updateDecks(
    dt: number,
    playerShip: Ship,
    enemyShip: Ship,
    fx: FighterFXCallbacks
  ) {
    for (const [craft, remaining] of this.reserveCraft) {
      if (craft.isDead || this.dockedReserve.has(craft)) this.reserveCraft.delete(craft);
      else this.reserveCraft.set(craft, remaining - dt);
    }
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      if (!this.fighters[i].isDead && !this.dockedReserve.has(this.fighters[i])) continue;
      this.fighters[i].sourceCarrier?.deployedWingCraft.delete(this.fighters[i]);
      this.dockedReserve.delete(this.fighters[i]);
      this.fighterAIModes.delete(this.fighters[i].id);
      this.fighters.splice(i, 1);
    }
    for (let i = this.bombers.length - 1; i >= 0; i--) {
      if (!this.bombers[i].isDead && !this.dockedReserve.has(this.bombers[i])) continue;
      this.bombers[i].sourceCarrier?.deployedWingCraft.delete(this.bombers[i]);
      this.dockedReserve.delete(this.bombers[i]);
      this.bomberAIModes.delete(this.bombers[i].id);
      this.bombers.splice(i, 1);
    }

    // Observe the threshold before natural recovery can move exactly 40% above it.
    this.applyReserveDecks();
    for (const wing of [...this.playerWings, ...this.enemyWings]) {
      const carrier = (wing.carrierId && this.carriers.get(wing.carrierId)) || (wing.isPlayer ? playerShip : enemyShip);
      const recovered = this.recoveredCraft.get(wing.wingId) ?? [];
      if ((carrier.isDead || carrier.isRetreated)) { recovered.length = 0; this.recoveredCraft.delete(wing.wingId); }
      let elapsed = dt;
      while (recovered.length && elapsed > 0) {
        const item = recovered[0], used = Math.min(elapsed, item.timer);
        elapsed -= used; item.timer -= used;
        if (item.timer > 1e-9) break;
        recovered.shift();
        const craft = this.spawnCraft(carrier, wing, 0);
        if (item.reserveRemaining !== undefined) this.reserveCraft.set(craft, item.reserveRemaining);
      }
      const aliveList = [...this.fighters, ...this.bombers].filter(c => c.flightDeckWingId === wing.wingId && !c.isDead);
      const totalCrafts = aliveList.length + wing.rebuildQueue.length + recovered.length;
      let missing = wing.maxCrafts - totalCrafts;

      while (missing > 0 && !(carrier.isDead || carrier.isRetreated)) {
        const baseTime = wing.rebuildSeconds ?? 12;
        const rebuildTime = baseTime * carrier.hullStats.fighterRefitTimeMultiplier / Math.max(0.3, wing.crr);
        wing.rebuildQueue.push({
          craftId: this.random.nextId('p_rebuild'),
          timer: rebuildTime,
          maxTimer: rebuildTime
        });
        // 损失战机导致 CRR 战备率轻微衰减
        wing.crr = Math.max(0.3, wing.crr - 0.04 * carrier.hullStats.replacementRateDecreaseMultiplier);
        missing--;
      }

      // 甲板空闲或满编时，战备率缓慢自然回升
      if (wing.rebuildQueue.length === 0) {
        wing.crr = Math.min(1.0, wing.crr + 0.015 * dt * (1 + carrier.hullStats.replacementRateIncreasePercent / 100) * carrier.hullStats.replacementRateIncreaseMultiplier);
      }

      // 更新机库重建倒计时
      for (let i = wing.rebuildQueue.length - 1; i >= 0; i--) {
        const item = wing.rebuildQueue[i];
        item.timer -= dt;
        if (item.timer <= 0 && !(carrier.isDead || carrier.isRetreated)) {
          wing.rebuildQueue.splice(i, 1);
          this.spawnCraft(carrier, wing, aliveList.length);
          fx.recordFighterRebuilt(wing.isPlayer);
          sound.playAtPos('fighter_deploy', carrier.pos, fx.getPlayerPos(), 0.6);
        }
      }
    }
    this.applyReserveDecks();
  }

  /**
   * 双方战斗机全态空战 AI (Dogfight, Intercept, Attack Run, Escort)
   */
  public updateFighters(
    dt: number,
    playerShip: Ship,
    enemyShip: Ship,
    projectiles: Projectile[],
    spawnProj: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnFlash: (pos: Vector2, angleRad: number, size: number, color: [number, number, number]) => void,
    fx: FighterFXCallbacks,
    world?: FireControlWorld
  ) {
    const crafts = [...this.fighters, ...this.bombers];
    const stations = new Map<Ship, number>();
    for (let i = 0; i < this.fighters.length; i++) {
      const ftr = this.fighters[i];
      if (ftr.isDead || ftr.isRetreated || ftr.isDocked) continue;
      if (ftr.hullHp <= 0) {
        if (fx.destructionSideEffectsEnabled()) fx.handleShipDestruction(ftr);
        continue;
      }
      const isPlayer = ftr.isPlayer;
      const friendlyCapital = this.carrierFor(ftr, isPlayer ? playerShip : enemyShip);
      const index = stations.get(friendlyCapital) ?? 0;
      stations.set(friendlyCapital, index + 1);
      if (this.returnReserve(ftr, friendlyCapital, dt, isPlayer ? enemyShip : playerShip, spawnProj, spawnBeam, spawnFlash)) continue;
      let modeData = this.fighterAIModes.get(ftr.id);
      if (!modeData) {
        modeData = { state: 'ESCORT', timer: 0 };
        this.fighterAIModes.set(ftr.id, modeData);
      }
      if (glorianaCraftRole(ftr.spec) && advanceGlorianaCraft({craft:ftr,carrier:friendlyCapital,fallback:isPlayer?enemyShip:playerShip,crafts,projectiles,
        mode:modeData,dt,index:i,range:this.wingRange(ftr,friendlyCapital),fx,world,spawnProj,spawnBeam,spawnFlash})) continue;
      advanceArkFlightDefense(ftr);
      ftr.clearInput(); ftr.fireControlMode = 'AI'; ftr.aiHoldOffensiveFire = false;
      modeData.timer = Math.max(0, modeData.timer - dt);
      const specificOrder = fx.getOrder(ftr.id);
      const activeOrder = specificOrder ?? (isPlayer ? fx.getOrder('fleet') : undefined);
      const candidate = fx.findHostile ? fx.findHostile(ftr, activeOrder?.targetShipId ?? friendlyCapital.playerTargetId ?? undefined)
        : isPlayer ? enemyShip : playerShip;
      const hostile = flightHostile(ftr, candidate) ? candidate : null;
      const carrierAlive = carrierOperational(friendlyCapital), range = this.wingRange(ftr, friendlyCapital);
      const inRange = (target: Ship) => !carrierAlive || wingCanReach(friendlyCapital, range, target.pos, target.spec.collisionRadius);
      let fireTarget: Ship | null = hostile;
      const guard = () => { modeData.state = 'ESCORT'; this.guardCarrier(ftr, friendlyCapital, hostile); };
      const forced = hostile && inRange(hostile) && (activeOrder?.type === 'ENGAGE' || activeOrder?.type === 'ASSAULT')
        && (!activeOrder.targetShipId || activeOrder.targetShipId === hostile.id);

      // Commands and the carrier leash precede opportunistic interception.
      if (carrierAlive && (friendlyCapital.fighterRecall || range <= 0 || !wingCanReach(friendlyCapital, range, ftr.pos, ftr.spec.collisionRadius))) {
        guard(); ftr.aiHoldOffensiveFire = friendlyCapital.fighterRecall;
      } else if (activeOrder?.type === 'WAYPOINT' && activeOrder.targetPos) {
        modeData.state = 'ESCORT'; ftr.aiHoldOffensiveFire = true; fireTarget = null;
        if (carrierAlive && !wingCanReach(friendlyCapital, range, activeOrder.targetPos)) guard();
        else if (ftr.pos.distanceTo(activeOrder.targetPos) < 90) {
          if (specificOrder) fx.cancelOrder(ftr.id);
          ftr.brakeInput = true;
        } else steerFlight(ftr, activeOrder.targetPos);
      } else if (activeOrder && ['AVOID', 'DEFEND', 'ESCORT'].includes(activeOrder.type)) {
        guard();
        if (activeOrder.type === 'AVOID' && hostile) {
          const away = ftr.pos.clone().sub(hostile.pos);
          if (away.length() < 1) away.set(1, 0);
          const point = ftr.pos.clone().add(away.normalize().scale(600));
          if (!carrierAlive || wingCanReach(friendlyCapital, range, point)) steerFlight(ftr, point);
          ftr.aiHoldOffensiveFire = true;
        }
      } else {
        const missile = !forced ? incomingFlightThreat(ftr, friendlyCapital, range, projectiles) : undefined;
        const opponent = !forced && !missile ? dogfightTarget(ftr, friendlyCapital, range, crafts, modeData.targetUnitId) : undefined;
        if (missile) {
          modeData.state = 'INTERCEPT'; fireTarget = null;
          aimFlight(ftr, { kind: 'MISSILE', entity: missile });
          steerFlight(ftr, ftr.aimTargetWorld, missile.vel, 100);
        } else if (opponent) {
          modeData.state = 'DOGFIGHT'; fireTarget = opponent;
          attackFlight(ftr, opponent, index);
        } else if (hostile && inRange(hostile) && (!isArkInterceptor(ftr) || forced)) {
          modeData.state = 'ATTACK'; attackFlight(ftr, hostile, index);
        } else if (hostile && inRange(hostile) && carrierAlive && isArkInterceptor(ftr)) {
          // No local threat yet: meet the battle at a forward screen, not the hangar.
          const screen = this.formation.station(ftr, friendlyCapital, false, hostile);
          if (wingCanReach(friendlyCapital, range, screen, ftr.spec.collisionRadius)) {
            modeData.state = 'ESCORT';
            steerFlight(ftr, screen, friendlyCapital.assemblyRoot.vel);
            aimFlight(ftr, { kind: 'SHIP', entity: hostile });
          } else guard();
        } else guard();
      }
      modeData.targetUnitId = modeData.state === 'DOGFIGHT' || modeData.state === 'ATTACK' ? fireTarget?.id : undefined;
      ftr.currentTargetShip = fireTarget;
      ftr.update(dt, fireTarget, spawnProj, spawnBeam, spawnFlash, world ?? {
        ships: [friendlyCapital, ...crafts, ...(fireTarget ? [fireTarget] : [])], missiles: projectiles, asteroids: []
      });

      // 战机尾气推进火焰粒子
      if (!isArkCraft(ftr) && Math.abs(ftr.throttle) > 0.1 && this.visualRandom.next() < 0.6) {
        for (const slot of ftr.spec.engineSlots) {
          const nozzlePos = ftr.pos.clone().add(new Vector2(slot.x, slot.y).rotate(ftr.facingRad));
          fx.spawnContrail({
            pos: nozzlePos,
            vel: Vector2.fromAngle(ftr.facingRad + Math.PI + (this.visualRandom.next() - 0.5) * 0.3, 30).addScaled(ftr.vel, 0.4),
            life: 0.3 + this.visualRandom.next() * 0.2,
            maxLife: 0.5,
            size: 4 + this.visualRandom.next() * 3,
            maxSize: 12 + this.visualRandom.next() * 5,
            alpha: 0.45,
            rotation: this.visualRandom.next() * Math.PI * 2,
            color: [255, 125, 25]
          });
        }
      }

      if (ftr.hullHp <= 0 && !ftr.isDead && fx.destructionSideEffectsEnabled()) {
        fx.handleShipDestruction(ftr);
        if (isPlayer) {
          fx.addRadioMessage('编队损管', 'PLAYER', '注意！友方阔剑战机被凌空击坠！机库准备重构！', [255, 120, 80]);
        } else {
          fx.addRadioMessage('点防火控', 'PLAYER', '敌方拦截机已被击坠！目标已消灭！', [120, 255, 160]);
        }
      }
    }
  }

  /**
   * 普通轰炸机突击与返航装填循环（荣耀女王机型保留专用逻辑）
   */
  public updateBombers(
    dt: number,
    playerShip: Ship,
    enemyShip: Ship,
    spawnProj: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnFlash: (pos: Vector2, angleRad: number, size: number, color: [number, number, number]) => void,
    fx: FighterFXCallbacks,
    world?: FireControlWorld
  ) {
    const crafts = [...this.fighters, ...this.bombers];
    const stations = new Map<Ship, number>();
    for (let i = 0; i < this.bombers.length; i++) {
      const bmr = this.bombers[i];
      if (bmr.isDead || bmr.isRetreated) continue;
      if (bmr.hullHp <= 0) {
        if (fx.destructionSideEffectsEnabled()) fx.handleShipDestruction(bmr);
        continue;
      }
      const friendlyCapital = this.carrierFor(bmr, bmr.isPlayer ? playerShip : enemyShip);
      const index = stations.get(friendlyCapital) ?? 0;
      stations.set(friendlyCapital, index + 1);
      if (!bmr.isDocked && this.returnReserve(bmr, friendlyCapital, dt, bmr.isPlayer ? enemyShip : playerShip, spawnProj, spawnBeam, spawnFlash)) continue;
      let mode = this.bomberAIModes.get(bmr.id);
      if (!mode) {
        mode = { state: 'ESCORT', timer: 0, hasTorpedo: true };
        this.bomberAIModes.set(bmr.id, mode);
      }
      if (glorianaCraftRole(bmr.spec) && advanceGlorianaCraft({craft:bmr,carrier:friendlyCapital,fallback:bmr.isPlayer?enemyShip:playerShip,crafts,projectiles:world?.missiles ?? [],
        mode,dt,index:i,range:this.wingRange(bmr,friendlyCapital),fx,world,spawnProj,spawnBeam,spawnFlash})) continue;
      advanceArkFlightDefense(bmr);
      bmr.clearInput(); bmr.fireControlMode = 'AI'; bmr.aiHoldOffensiveFire = true;
      mode.timer = Math.max(0, mode.timer - dt);
      const carrierAlive = carrierOperational(friendlyCapital), recalled = carrierAlive && friendlyCapital.fighterRecall;
      const payload = strikeMounts(bmr);
      const specificOrder = fx.getOrder(bmr.id);
      const activeOrder = specificOrder ?? (bmr.isPlayer ? fx.getOrder('fleet') : undefined);
      const candidate = fx.findHostile ? fx.findHostile(bmr, activeOrder?.targetShipId ?? friendlyCapital.playerTargetId ?? undefined)
        : bmr.isPlayer ? enemyShip : playerShip;
      const hostile = flightHostile(bmr, candidate) ? candidate : null;
      bmr.currentTargetShip = hostile;
      const range = this.wingRange(bmr, friendlyCapital);

      if (mode.state === 'DOCKED') {
        bmr.isDocked = true;
        bmr.pos.copy(friendlyCapital.pos); bmr.prevPos.copy(bmr.pos); bmr.vel.copy(friendlyCapital.vel);
        if (!carrierAlive) {
          bmr.isDocked = false;
          if (friendlyCapital.isRetreated || friendlyCapital.assemblyRoot.isRetreated) bmr.isRetreated = true;
          else { bmr.hullHp = 0; bmr.isDead = true; }
          friendlyCapital.deployedWingCraft.delete(bmr);
          continue;
        }
        // Preserve the existing Web repair/rearm clock; do not reload until it actually expires.
        bmr.hullHp = Math.min(bmr.maxHullHp, bmr.hullHp + 60 * dt);
        if (mode.timer > 0) continue;
        for (const mount of bmr.weapons) {
          if (!Number.isFinite(mount.ammo) || mount.spec.maxAmmo === undefined) continue;
          mount.ammo = mount.spec.maxAmmo; mount.ammoRechargeProgress = 0;
        }
        mode.hasTorpedo = !payloadNeedsRearm(payload);
        if (recalled) continue;
        bmr.isDocked = false; mode.state = 'ESCORT';
        bmr.pos.copy(this.formation.station(bmr, friendlyCapital, true)); bmr.prevPos.copy(bmr.pos);
        fx.addFloatingText(bmr.pos, 'REARMED & LAUNCHING', [100, 220, 255], 13, 1.8);
        sound.playAtPos('fighter_deploy', bmr.pos, fx.getPlayerPos(), 0.6);
      }
      // All strike mounts must be low, and no committed burst may still be in flight from the rack.
      mode.hasTorpedo = !payloadNeedsRearm(payload);
      const guard = () => { mode.state = 'ESCORT'; this.guardCarrier(bmr, friendlyCapital, hostile); };
      if (!mode.hasTorpedo && carrierAlive) {
        mode.state = 'RETURN_TO_REARM';
        const dockPoint = friendlyCapital.pos.clone().add(new Vector2(-friendlyCapital.spec.collisionRadius * .6, 0).rotate(friendlyCapital.facingRad));
        steerFlight(bmr, dockPoint, friendlyCapital.vel, 15);
        if (bmr.pos.distanceTo(dockPoint) < 70 && bmr.vel.clone().sub(friendlyCapital.vel).length() < 100) {
          mode.state = 'DOCKED'; bmr.isDocked = true; bmr.clearInput();
          mode.timer = 3.2 + (this.wingFor(bmr)?.rebuildSeconds ?? 0) * friendlyCapital.hullStats.fighterRearmTimeFraction;
          bmr.pos.copy(friendlyCapital.pos); bmr.prevPos.copy(bmr.pos); bmr.vel.copy(friendlyCapital.vel);
          continue;
        }
      } else if (recalled || (carrierAlive && (range <= 0 || !wingCanReach(friendlyCapital, range, bmr.pos, bmr.spec.collisionRadius)))) guard();
      else if (activeOrder?.type === 'WAYPOINT' && activeOrder.targetPos) {
        mode.state = 'ESCORT';
        if (carrierAlive && !wingCanReach(friendlyCapital, range, activeOrder.targetPos)) guard();
        else if (bmr.pos.distanceTo(activeOrder.targetPos) < 90) {
          if (specificOrder) fx.cancelOrder(bmr.id);
          bmr.brakeInput = true;
        } else steerFlight(bmr, activeOrder.targetPos);
      } else if (activeOrder && ['AVOID', 'DEFEND', 'ESCORT'].includes(activeOrder.type)) guard();
      else if (hostile && mode.hasTorpedo && (!carrierAlive || wingCanReach(friendlyCapital, range, hostile.pos, hostile.spec.collisionRadius))) {
        mode.state = 'ATTACK_RUN'; bmr.aiHoldOffensiveFire = false;
        attackFlight(bmr, hostile, index, true);
      } else guard(); // An orphan cannot replenish ammo at a wreck or a retreated carrier.

      const before = payload.map(mount => ({ mount, ammo: mount.ammo, cycle: mount.firingCycleId }));
      bmr.update(dt, hostile, spawnProj, spawnBeam, spawnFlash, world);
      const launched = before.some(({ mount, ammo, cycle }) => mount.ammo < ammo || mount.firingCycleId > cycle);
      if (payloadNeedsRearm(payload)) {
        mode.hasTorpedo = false;
        if (carrierAlive) mode.state = 'RETURN_TO_REARM';
        if (launched) fx.addFloatingText(bmr.pos, 'PAYLOAD AWAY - RETURNING', [255, 140, 40], 14, 2);
      }

      // 高技术蓝紫推进器尾焰
      if (!isArkCraft(bmr) && Math.abs(bmr.throttle) > 0.1 && this.visualRandom.next() < 0.65) {
        for (const slot of bmr.spec.engineSlots) {
          const nozzlePos = bmr.pos.clone().add(new Vector2(slot.x, slot.y).rotate(bmr.facingRad));
          fx.spawnContrail({
            pos: nozzlePos,
            vel: Vector2.fromAngle(bmr.facingRad + Math.PI + (this.visualRandom.next() - 0.5) * 0.2, 35).addScaled(bmr.vel, 0.4),
            life: 0.35 + this.visualRandom.next() * 0.2,
            maxLife: 0.55,
            size: 5 + this.visualRandom.next() * 3,
            maxSize: 15 + this.visualRandom.next() * 5,
            alpha: 0.5,
            rotation: this.visualRandom.next() * Math.PI * 2,
            color: [100, 180, 255]
          });
        }
      }

      if (bmr.hullHp <= 0 && !bmr.isDead && fx.destructionSideEffectsEnabled()) {
        fx.handleShipDestruction(bmr);
      }
    }
  }
}
