import { sameTeam } from "../CombatTeams";
import { dispatchShipCommand } from '../../runtime/CombatCommands';
import wingRanges from '../../extensions/native-wing-ranges.json';
import { combatWeaponRange } from '../WeaponRange';
import { Vector2 } from '../../math/Vector2';
import { FighterAIState, BomberAIState, TacticalOrder, ContrailParticle, FlightDeckWing } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile, Beam, WeaponMount } from '../Weapon';
import { modManager, type FighterWingSpec } from '../../modding/ModManager';
import { sound } from '../../audio/SoundManager';
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
    this.reserveDeckUsed.clear();
    this.recoveredCraft.clear();
    this.reserveCraft.clear();
    this.dockedReserve.clear();
    this.addCarrier(playerShip, scenarioWings?.player);
    if (enemyShip) this.addCarrier(enemyShip, scenarioWings?.enemy);
  }

  public addCarrier(carrier: Ship, scenarioWings?: FighterWingSpec[]): void {
    if (this.carriers.has(carrier.id)) return;
    const specs = scenarioWings ?? (carrier.spec.fighterWings ?? []).slice(0, carrier.hullStats.fighterBays);
    for (const spec of specs) {
      if (modManager.getShip(spec.specId)?.hullSize !== 'FIGHTER') throw new Error(`Invalid flight deck craft: ${spec.specId}`);
    }
    this.carriers.set(carrier.id, carrier);
    specs.forEach((spec, index) => {
      const wing: FlightDeckWing = {
        wingId: `${carrier.id}:wing:${index}`, carrierId: carrier.id,
        name: spec.specId, specId: spec.specId, role: spec.role, tags: spec.tags,
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
    const offset = new Vector2(-100 - index * 45, (index % 2 ? -1 : 1) * (70 + index * 30)).rotate(carrier.facingRad);
    const pointDefense = carrier.spec.captainSkills?.point_defense;
    const craftSpec = pointDefense ? { ...spec, captainSkills: { ...spec.captainSkills, point_defense: pointDefense } } : spec;
    const craft = new Ship(this.random.nextId(`${carrier.id}_craft`), craftSpec, carrier.isPlayer,
      carrier.pos.clone().add(offset), carrier.facingRad, this.random, this.visualRandom, carrier);
    craft.flightDeckWingId = wing.wingId;
    craft.sourceCarrier = carrier;
    carrier.deployedWingCraft.add(craft);
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
  private guardCarrier(craft: Ship, carrier: Ship, target: Ship, index: number): void {
    const station = carrier.pos.clone().add(new Vector2(carrier.spec.collisionRadius + 120, (index % 3 - 1) * 80).rotate(carrier.facingRad));
    const targetKnown = !target.isDead && target.isVisibleTo(craft.teamId);
    const delta = station.sub(craft.pos), desired = delta.length() > 100 ? delta.heading() : targetKnown ? target.pos.clone().sub(craft.pos).heading() : carrier.facingRad;
    const angle = Math.atan2(Math.sin(desired - craft.facingRad), Math.cos(desired - craft.facingRad));
    craft.turnInput = Math.max(-1, Math.min(1, angle * 3));
    craft.throttle = Math.abs(angle) < .7 ? Math.min(1, delta.length()/200) : 0;
    craft.brakeInput = delta.length() < 50; craft.strafeInput = 0;
    craft.aimTargetWorld.copy(targetKnown ? target.pos : carrier.pos);
    const range = Math.max(0, ...craft.weapons.map(w => combatWeaponRange(craft,w.spec)));
    craft.isFiringMain = targetKnown && craft.pos.distanceTo(target.pos) <= range + target.spec.collisionRadius;
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
    fx: FighterFXCallbacks
  ) {
    const formationOffsets = [
      new Vector2(-110, 85),
      new Vector2(-155, 140),
      new Vector2(-155, -140)
    ];

    for (let i = 0; i < this.fighters.length; i++) {
      const ftr = this.fighters[i];
      if (ftr.isDead) continue;

      ftr.brakeInput = false; ftr.strafeInput = 0;
      const isPlayer = ftr.isPlayer;
      const teamId = ftr.teamId;
      const friendlyCapital = this.carrierFor(ftr, isPlayer ? playerShip : enemyShip);
      if (this.returnReserve(ftr, friendlyCapital, dt, isPlayer ? enemyShip : playerShip, spawnProj, spawnBeam, spawnFlash)) continue;

      let modeData = this.fighterAIModes.get(ftr.id);
      if (!modeData) {
        modeData = { state: 'ESCORT', timer: 0 };
        this.fighterAIModes.set(ftr.id, modeData);
      }
      modeData.timer -= dt;

      // 检查战术地图对战斗机的特定指令 (Tactical Orders)
      // 舰队级指令只属于玩家编队，敌机不得执行玩家标定的航路点
      const specificOrder = fx.getOrder(ftr.id);
      const fleetOrder = isPlayer ? fx.getOrder('fleet') : undefined;
      const activeOrder = specificOrder || fleetOrder;
      const hostileCapital = fx.findHostile?.(ftr, activeOrder?.targetShipId) ?? (isPlayer ? enemyShip : playerShip);
      const hostileKnown = !hostileCapital.isDead && hostileCapital.isVisibleTo(ftr.teamId);
      ftr.currentTargetShip = hostileKnown ? hostileCapital : null;

      // 敌方来袭重型导弹检测 (点防近程威胁)
      const nearbyHostileMissile = projectiles.find(
        (p) => p.isRocket && !sameTeam(p, ftr) && p.pos.distanceTo(ftr.pos) < 680
      );

      // 敌方航空中队检测 (空战咬尾目标)
      const opposingCrafts = [...this.fighters, ...this.bombers].filter(f => f.teamId !== teamId && !f.isDead && f.isVisibleTo(teamId));

      let closestOpposingCraft: Ship | null = null;
      let minOpposingDist = 950;
      for (const op of opposingCrafts) {
        const d = ftr.pos.distanceTo(op.pos);
        if (d < minOpposingDist) {
          minOpposingDist = d;
          closestOpposingCraft = op;
        }
      }

      // 1. 点防威胁最高优先：拦截威胁母舰与战机编队的导弹
      const range = this.wingRange(ftr, friendlyCapital);
      const mustGuard = !friendlyCapital.isDead && (range <= 0 || ftr.pos.distanceTo(friendlyCapital.pos) > range
        || (hostileCapital.pos.distanceTo(friendlyCapital.pos) > range && !nearbyHostileMissile && !closestOpposingCraft));
      if (mustGuard || (!hostileKnown && !nearbyHostileMissile && !closestOpposingCraft && !activeOrder)) {
        modeData.state = 'ESCORT';
        this.guardCarrier(ftr, friendlyCapital, closestOpposingCraft ?? hostileCapital, i);
        if (nearbyHostileMissile) { ftr.aimTargetWorld.copy(nearbyHostileMissile.pos); ftr.isFiringMain = true; }
      } else if (nearbyHostileMissile) {
        modeData.state = 'INTERCEPT';
        const toM = nearbyHostileMissile.pos.clone().sub(ftr.pos);
        ftr.aimTargetWorld = nearbyHostileMissile.pos.clone();
        ftr.isFiringMain = toM.length() < 480;

        const targetAngle = toM.heading();
        let angleDiff = targetAngle - ftr.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        ftr.turnInput = Math.sign(angleDiff);
        ftr.throttle = toM.length() > 200 ? 1.0 : 0.4;
      }
      // 2. 玩家召回令：强制返航母舰护卫
      else if (friendlyCapital.fighterRecall) {
        modeData.state = 'ESCORT';
        const escortSlot = formationOffsets[i % formationOffsets.length];
        const targetWorldPos = friendlyCapital.pos.clone().add(escortSlot.clone().rotate(friendlyCapital.facingRad));
        const toSlot = targetWorldPos.sub(ftr.pos);
        const dist = toSlot.length();
        ftr.aimTargetWorld = hostileCapital.pos.clone();
        ftr.isFiringMain = false;

        const targetAngle = toSlot.heading();
        let angleDiff = targetAngle - ftr.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        ftr.turnInput = Math.sign(angleDiff);
        ftr.throttle = Math.min(1.0, dist / 180);
      }
      // 3. 战术航路点指令：直接指令优先于自主追击逻辑，全速转场并在抵达后消耗指令
      else if (activeOrder && activeOrder.type === 'WAYPOINT' && activeOrder.targetPos) {
        modeData.state = 'ESCORT';
        const toWp = activeOrder.targetPos.clone().sub(ftr.pos);
        const dist = toWp.length();
        if (dist < 90) {
          // 抵达航路点：消耗指令（舰队级指令按存储键注销，避免残留指令把战机钉在航路点上）
          if (specificOrder) fx.cancelOrder(ftr.id);
          ftr.clearInput();
        } else {
          // 转场期间不主动追击敌人：仅当原瞄准点仍处于有效射界内时才保留开火状态
          const prevAim = ftr.aimTargetWorld.clone().sub(ftr.pos);
          let prevAimDiff = prevAim.heading() - ftr.facingRad;
          while (prevAimDiff >= Math.PI) prevAimDiff -= Math.PI * 2;
          while (prevAimDiff < -Math.PI) prevAimDiff += Math.PI * 2;
          ftr.isFiringMain = ftr.isFiringMain && prevAim.length() > 1 && Math.abs(prevAimDiff) < 0.35;

          ftr.aimTargetWorld = activeOrder.targetPos.clone();
          // 方位偏差归一化到 [-π, π)：正后方时统一向左破转，保证航路点机动方向确定
          let angleDiff = toWp.heading() - ftr.facingRad;
          while (angleDiff >= Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(angleDiff);
          ftr.throttle = 1.0;
        }
      }
      // 4. 空空格斗咬尾 (Dogfight): 发现敌方战机/轰炸机，进入高速咬尾火神扫射
      else if (closestOpposingCraft) {
        modeData.state = 'DOGFIGHT';
        const toOpp = closestOpposingCraft.pos.clone().sub(ftr.pos);
        const dist = toOpp.length();

        // 提前量射击预判
        const relVel = closestOpposingCraft.vel.clone().sub(ftr.vel);
        const flightTime = dist / 900;
        const leadPos = closestOpposingCraft.pos.clone().addScaled(relVel, flightTime);
        ftr.aimTargetWorld = leadPos;

        const targetAngle = leadPos.clone().sub(ftr.pos).heading();
        let angleDiff = targetAngle - ftr.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        ftr.turnInput = Math.sign(angleDiff);
        ftr.throttle = dist > 260 ? 1.0 : 0.55;
        ftr.isFiringMain = dist < 500 && Math.abs(angleDiff) < 0.4;

        if (dist <= 220) {
          // 破空大仰角滚转脱离，防止相撞
          const breakAngle = targetAngle + (Math.PI * 0.55);
          let breakDiff = breakAngle - ftr.facingRad;
          while (breakDiff > Math.PI) breakDiff -= Math.PI * 2;
          while (breakDiff < -Math.PI) breakDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(breakDiff);
        }
      }
      // 5. 敌舰在攻击范围内：发起俯冲扫射突击 (Attack Run)
      else if (hostileKnown && ftr.pos.distanceTo(hostileCapital.pos) < 1800) {
        modeData.state = 'ATTACK';
        const toHostile = hostileCapital.pos.clone().sub(ftr.pos);
        const dist = toHostile.length();
        ftr.aimTargetWorld = hostileCapital.pos.clone();

        if (dist > 350) {
          const targetAngle = toHostile.heading();
          let angleDiff = targetAngle - ftr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(angleDiff);
          ftr.throttle = 1.0;
          ftr.isFiringMain = dist < 480 && Math.abs(angleDiff) < 0.35;
        } else {
          // 破空侧转脱离
          const breakAngle = toHostile.heading() + Math.PI * 0.65;
          let angleDiff = breakAngle - ftr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(angleDiff);
          ftr.throttle = 1.0;
          ftr.isFiringMain = true;
        }
      }
      // 6. 巡弋编队护卫母舰 (Escort Formation)
      else {
        modeData.state = 'ESCORT';
        const escortSlot = formationOffsets[i % formationOffsets.length];
        const targetWorldPos = friendlyCapital.pos.clone().add(escortSlot.clone().rotate(friendlyCapital.facingRad));
        const toSlot = targetWorldPos.sub(ftr.pos);
        const dist = toSlot.length();
        ftr.aimTargetWorld = hostileCapital.pos.clone();
        ftr.isFiringMain = false;

        if (dist > 60) {
          const targetAngle = toSlot.heading();
          let angleDiff = targetAngle - ftr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(angleDiff);
          ftr.throttle = Math.min(1.0, dist / 200);
        } else {
          let angleDiff = friendlyCapital.facingRad - ftr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          ftr.turnInput = Math.sign(angleDiff) * 0.5;
          ftr.throttle = friendlyCapital.throttle * 0.8;
        }
      }

      ftr.update(dt, hostileKnown ? hostileCapital : null, spawnProj, spawnBeam, spawnFlash);

      // 战机尾气推进火焰粒子
      if (Math.abs(ftr.throttle) > 0.1 && this.visualRandom.next() < 0.6) {
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
   * 匕首鱼雷轰炸机突击与返航装填循环
   */
  public updateBombers(
    dt: number,
    playerShip: Ship,
    enemyShip: Ship,
    spawnProj: (p: Projectile) => void,
    spawnBeam: (b: Beam) => void,
    spawnFlash: (pos: Vector2, angleRad: number, size: number, color: [number, number, number]) => void,
    fx: FighterFXCallbacks
  ) {
    const escortSlots = [
      new Vector2(-190, 70),
      new Vector2(-190, -70)
    ];

    for (let i = 0; i < this.bombers.length; i++) {
      const bmr = this.bombers[i];
      if (bmr.isDead) continue;
      const friendlyCapital = this.carrierFor(bmr, bmr.isPlayer ? playerShip : enemyShip);
      if (this.returnReserve(bmr, friendlyCapital, dt, bmr.isPlayer ? enemyShip : playerShip, spawnProj, spawnBeam, spawnFlash)) continue;
      bmr.brakeInput = false; bmr.strafeInput = 0;
      const recalled = friendlyCapital.fighterRecall;

      let mode = this.bomberAIModes.get(bmr.id);
      if (!mode) {
        mode = { state: 'ESCORT', timer: 0, hasTorpedo: true };
        this.bomberAIModes.set(bmr.id, mode);
      }
      mode.timer -= dt;

      // 发射确认：请求开火前记录鱼雷挂点状态，只有真正离管才承认发射成功
      // (挂点瘫痪/弹药耗尽/未完成开火循环时不得清空挂载并返航)
      let launchRequested = false;
      let launcherStateBefore: {
        mount: WeaponMount;
        ammo: number;
        cooldownTimer: number;
        burstRemaining: number;
        firingCycleId: number;
      }[] = [];

      // 检查战术地图对轰炸机的特定指令 (Tactical Orders)
      const specificOrder = fx.getOrder(bmr.id);
      const fleetOrder = bmr.isPlayer ? fx.getOrder('fleet') : undefined;
      const activeOrder = specificOrder || fleetOrder;
      const hostileCapital = fx.findHostile?.(bmr, activeOrder?.targetShipId) ?? (bmr.isPlayer ? enemyShip : playerShip);
      const hostileKnown = !hostileCapital.isDead && hostileCapital.isVisibleTo(bmr.teamId);
      bmr.currentTargetShip = hostileKnown ? hostileCapital : null;
      bmr.isFiringMain = false;
      if (mode.state === 'DOCKED' && friendlyCapital.isDead) mode.state = 'RETURN_TO_REARM';

      // 1. 召回模式或正在重载修理
      if (mode.state === 'DOCKED') {
        bmr.hullHp = Math.min(bmr.maxHullHp, bmr.hullHp + 60 * dt);
        bmr.throttle = 0;
        bmr.turnInput = 0;
        bmr.vel.scale(0.8);
        if (mode.timer <= 0) {
          mode.hasTorpedo = true;
          for (const mount of bmr.weapons) {
            if (!Number.isFinite(mount.ammo) || mount.spec.maxAmmo === undefined) continue;
            mount.ammo = mount.spec.maxAmmo;
            mount.ammoRechargeProgress = 0;
          }
          mode.state = recalled ? 'ESCORT' : 'ATTACK_RUN';
          mode.timer = 12.0;
          fx.addFloatingText(bmr.pos, 'DAGGER ARMED & LAUNCHING', [100, 220, 255], 13, 1.8);
          sound.playAtPos('fighter_deploy', bmr.pos, fx.getPlayerPos(), 0.6);
          fx.addRadioMessage('匕首轰炸分队', bmr.isPlayer ? 'PLAYER' : 'ENEMY', '重型鱼雷补充完毕，重新出击！', [100, 220, 255]);
        }
      } else if (recalled || mode.state === 'RETURN_TO_REARM' || !mode.hasTorpedo) {
        // 返航母舰甲板
        const dockPoint = friendlyCapital.pos.clone().add(new Vector2(-120, 0).rotate(friendlyCapital.facingRad));
        const toDock = dockPoint.sub(bmr.pos);
        const dist = toDock.length();

        if (dist < 70 && !mode.hasTorpedo && !friendlyCapital.isDead) {
          mode.state = 'DOCKED';
          mode.timer = 3.2 + (this.wingFor(bmr)?.rebuildSeconds ?? 0) * friendlyCapital.hullStats.fighterRearmTimeFraction;
          fx.addFloatingText(bmr.pos, 'DOCKING & REARMING...', [120, 210, 255], 12, 1.5);
        } else {
          const targetAngle = toDock.heading();
          let angleDiff = targetAngle - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff);
          bmr.throttle = Math.min(1.0, dist / 180);
          bmr.isFiringMain = false;
        }
      } else if (!friendlyCapital.isDead && (this.wingRange(bmr, friendlyCapital) <= 0 || hostileCapital.pos.distanceTo(friendlyCapital.pos) > this.wingRange(bmr, friendlyCapital))) {
        mode.state = 'ESCORT';
        this.guardCarrier(bmr, friendlyCapital, hostileCapital, i);
      } else if (activeOrder && activeOrder.type === 'WAYPOINT' && activeOrder.targetPos) {
        // 执行战术航路点机动
        const toWp = activeOrder.targetPos.clone().sub(bmr.pos);
        const dist = toWp.length();
        if (dist < 90) {
          // 抵达航路点：注销真正持有该指令的键 (舰队级指令挂在 'fleet' 上)，
          // 否则注销单位 id 不会移除舰队指令，轰炸机会被永久钉在航点上。
          if (specificOrder) fx.cancelOrder(bmr.id);
          bmr.clearInput();
        } else {
          const targetAngle = toWp.heading();
          let angleDiff = targetAngle - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff);
          bmr.throttle = 1.0;
        }
      } else if (hostileKnown && mode.hasTorpedo) {
        // 发起鱼雷突袭攻击循环 (Torpedo Attack Run)
        mode.state = 'ATTACK_RUN';
        const targetShip = hostileCapital;
        const toEnemy = targetShip.pos.clone().sub(bmr.pos);
        const dist = toEnemy.length();
        bmr.aimTargetWorld = targetShip.pos.clone();

        const targetAngle = toEnemy.heading();
        let angleDiff = targetAngle - bmr.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        bmr.turnInput = Math.sign(angleDiff);
        bmr.throttle = 1.0;

        // 进入 650 SU 鱼雷射界并迎头对准 (角度差 < 20度): 请求发射阿特罗波斯高爆鱼雷！
        if (dist < 650 && Math.abs(angleDiff) < 0.35 && mode.hasTorpedo) {
          bmr.isFiringMain = true;
          // 只登记发射请求；是否真的打出鱼雷要等本帧 update 之后校验挂点证据
          launchRequested = true;
          launcherStateBefore = bmr.weapons.map(mount => ({
            mount,
            ammo: mount.ammo,
            cooldownTimer: mount.cooldownTimer,
            burstRemaining: mount.burstRemaining,
            firingCycleId: mount.firingCycleId
          }));
        } else {
          bmr.isFiringMain = false;
        }
      } else {
        // 巡航编队护卫
        mode.state = 'ESCORT';
        const slot = escortSlots[i % escortSlots.length];
        const targetWorld = friendlyCapital.pos.clone().add(slot.clone().rotate(friendlyCapital.facingRad));
        const toSlot = targetWorld.sub(bmr.pos);
        const dist = toSlot.length();
        if (dist > 70) {
          const targetAngle = toSlot.heading();
          let angleDiff = targetAngle - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff);
          bmr.throttle = Math.min(1.0, dist / 180);
        } else {
          let angleDiff = friendlyCapital.facingRad - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff) * 0.4;
          bmr.throttle = friendlyCapital.throttle * 0.8;
        }
      }

      bmr.update(dt, hostileKnown ? hostileCapital : null, spawnProj, spawnBeam, spawnFlash);
      const finiteLaunchers = bmr.weapons.filter(w => w.spec.weaponType === 'MISSILE' && Number.isFinite(w.ammo));
      if (mode.state !== 'DOCKED' && finiteLaunchers.length && finiteLaunchers.every(w => w.ammo <= 0 && w.burstRemaining <= 0)) { mode.hasTorpedo = false; mode.state = 'RETURN_TO_REARM'; }

      // 校验鱼雷是否真的离管：有限弹药挂点看弹药消耗，无限弹药挂点看冷却/连发/开火周期推进
      if (launchRequested) {
        const torpedoLaunched = launcherStateBefore.some(before => {
          const mount = before.mount;
          if (Number.isFinite(mount.ammo) && mount.spec.maxAmmo !== undefined) {
            return mount.ammo < before.ammo;
          }
          return mount.cooldownTimer > before.cooldownTimer
            || mount.burstRemaining > before.burstRemaining
            || mount.firingCycleId > before.firingCycleId;
        });
        if (torpedoLaunched) {
          // 仅在确认鱼雷离管后才宣告发射成功并脱离攻击航线（每次实际发射只宣告一次）
          mode.hasTorpedo = false;
          mode.state = 'RETURN_TO_REARM';
          fx.addFloatingText(bmr.pos, 'ATROPOS TORPEDO LAUNCHED!', [255, 140, 40], 14, 2.0);
          fx.addCameraShake(3, 0.2);
          fx.addRadioMessage('匕首轰炸分队', bmr.isPlayer ? 'PLAYER' : 'ENEMY', '阿特罗波斯重型鱼雷已齐射！脱离攻击航线！', [255, 180, 60]);
        }
      }

      // 高技术蓝紫推进器尾焰
      if (Math.abs(bmr.throttle) > 0.1 && this.visualRandom.next() < 0.65) {
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
