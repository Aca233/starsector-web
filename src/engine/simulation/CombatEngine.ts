import { DEFAULT_PLAYER_HULL, DEFAULT_ENEMY_HULL, defaultOpponent } from '../data/SandboxDefaults';
import { clearEffectState } from '../extensions/EffectState';
import { Vector2 } from '../math/Vector2';
import { createShipHulk, applyHulkDisableDamage } from '../visual/HulkVisuals';
import { Ship } from './Ship';
import { Projectile, Beam, LauncherSmokeSpec, MuzzleFlashSpec } from './Weapon';
import { CapitalShipAI } from '../ai/CapitalShipAI';
import { ProjectileThreatIndex } from '../ai/ProjectileThreatIndex';
import { WeaponThreatEnvelope } from '../ai/WeaponThreatEnvelope';
import { modManager } from '../modding/ModManager';
import { sound } from '../audio/SoundManager';
import { i18n } from '../i18n/LocalizationManager';
import { createShipExplosion } from '../visual/ExplosionVisuals';

// 导出全部战斗仿真数据模型，保持 100% 向后兼容
export * from './CombatTypes';
import {
  Particle,
  ContrailParticle,
  ExplosionAnimation,
  HitGlowAnimation,
  EmpArc,
  MuzzleFlash,
  MuzzleParticle,
  FloatingText,
  DebrisParticle,
  ShieldRipple,
  SpatialMine,
  HulkFragment,
  Asteroid,
  NebulaCloud,
  RadioMessage,
  TacticalOrder,
  FighterAIState,
  BomberAIState,
  FlightDeckWing
} from './CombatTypes';

// 导入解耦后的各领域独立子系统
import { AsteroidSystem } from './systems/AsteroidSystem';
import { NebulaSystem } from './systems/NebulaSystem';
import type { ShipSpec } from '../content/ShipSpec';
import { updateElectronicWarfare } from './systems/ElectronicWarfareSystem';
import { FighterSystem } from './systems/FighterSystem';
import { CombatFXSystem } from './systems/CombatFXSystem';
import { MineSystem } from './systems/MineSystem';
import { FleetCommandSystem } from './systems/FleetCommandSystem';
import { WeaponSimulationSystem } from './systems/WeaponSimulationSystem';
import { ShipCollisionSystem } from './systems/ShipCollisionSystem';
import { CombatShipStatusSystem } from './systems/CombatShipStatusSystem';
import { CombatStatsTracker } from './systems/CombatStatsTracker';
import { BattleResult } from './CombatStatistics';
import { ContrailEngine } from './ContrailEngine';
import { SimulationRandom } from './SimulationRandom';

/**
 * 远行星号战斗仿真主调度中枢 (CombatEngine)
 * 纯粹负责顶层物理时钟步进、战舰核心对决、弹道光束精确交战与子系统调度。
 */
export class CombatEngine {
  public playerShip: Ship;
  public enemyShip: Ship;
  public enemyAI: CapitalShipAI;
  /** Network host may supply inputs for these entities instead of built-in ship AI. */
  public readonly externallyControlledShipIds = new Set<string>();
  public readonly reinforcements: Ship[] = [];
  private readonly reinforcementAI = new Map<string, CapitalShipAI>();
  public readonly environment: { backgroundUrl: string | null; starCount: number } = {
    // CombatEngine.setDefaultBackground -> settings.json backgrounds.defaultSpaceBackground.
    backgroundUrl: '/game-assets/graphics/backgrounds/background4.jpg', starCount: 0
  };
  public isSimulation = false;
  private primaryEnemyDeployed = true;
  public simulationPointLimit = 240;
  private readonly simulationCosts = new Map<string, number>();
  public get capitalShips(): Ship[] { return [this.playerShip, ...(this.primaryEnemyDeployed ? [this.enemyShip] : []), ...this.reinforcements]; }

  /** Enter an empty simulator, without destroying a ship or fabricating a kill. */
  public beginSimulationDeployment(flagshipCost: number): void {
    if (this.combatTime !== 0 || this.reinforcements.length) throw new Error('只能在新模拟战斗中初始化部署。');
    this.isSimulation = true;
    this.primaryEnemyDeployed = false;
    // Retain a non-participating target sentinel for legacy two-ship APIs. It is
    // excluded from world rosters and carrier initialization, and never explodes.
    this.enemyShip.isDead = true;
    this.enemyShip.clearInput();
    this.playerShip.currentTargetShip = null;
    this.simulationCosts.clear();
    this.simulationCosts.set(this.playerShip.id, flagshipCost);
    this.fighterSystem.init(this.playerShip);
    this.isTacticalMap = true;
  }

  public simulationDeployedPoints(isPlayer: boolean): number {
    return this.capitalShips.filter(ship => ship.isPlayer === isPlayer && !ship.isDead)
      .reduce((sum, ship) => sum + (this.simulationCosts.get(ship.id) ?? 0), 0);
  }

  public setSimulationPointLimit(limit: number): boolean {
    if (!this.isSimulation || ![120, 240, 400].includes(limit)
      || Math.max(this.simulationDeployedPoints(true), this.simulationDeployedPoints(false)) > limit) return false;
    this.simulationPointLimit = limit;
    return true;
  }

  /** Validate and construct the entire wave before it joins the live world. No CP cost. */
  public deploySimulationShips(entries: { specId: string; cost: number }[], isPlayer: boolean): Ship[] {
    if (!this.isSimulation || this.battleResult) throw new Error('当前战斗不能继续部署。');
    if (!entries.length) throw new Error('请先选择舰船。');
    if (entries.some(entry => !Number.isFinite(entry.cost) || entry.cost <= 0)) throw new Error('舰船部署点无效。');
    if (this.simulationDeployedPoints(isPlayer) + entries.reduce((sum, entry) => sum + entry.cost, 0) > this.simulationPointLimit)
      throw new Error('超出本方部署上限，请减少所选舰船。');
    const specs = entries.map(entry => modManager.requireShip(entry.specId));
    const pending: Ship[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i], columns = Math.min(specs.length, 6);
      const pos = new Vector2(this.playerShip.pos.x + ((i % columns) - (columns - 1) / 2) * 1000,
        this.playerShip.pos.y + (isPlayer ? 1500 : -2600) + (isPlayer ? 1 : -1) * Math.floor(i / columns) * 1200);
      const occupied = [...this.capitalShips.filter(ship => !ship.isDead), ...pending];
      while (occupied.some(ship => ship.pos.distanceTo(pos) < ship.spec.collisionRadius + spec.collisionRadius + 180)) pos.y += isPlayer ? 1200 : -1200;
      const id = !isPlayer && !this.primaryEnemyDeployed && i === 0 ? 'enemy_ship' : this.random.nextId('ship');
      pending.push(new Ship(id, spec, isPlayer, pos, isPlayer ? -Math.PI / 2 : Math.PI / 2, this.random, this.visualRandom));
    }
    pending.forEach((ship, index) => {
      if (!isPlayer && !this.primaryEnemyDeployed) {
        this.enemyShip = ship;
        this.enemyAI = new CapitalShipAI(ship, this.playerShip);
        this.primaryEnemyDeployed = true;
      } else {
        this.reinforcements.push(ship);
        this.reinforcementAI.set(ship.id, new CapitalShipAI(ship, isPlayer ? this.enemyShip : this.playerShip));
      }
      this.fighterSystem.addCarrier(ship);
      this.simulationCosts.set(ship.id, entries[index].cost);
    });
    return pending;
  }
  public get ships(): Ship[] { return [...this.capitalShips, ...this.fighters, ...this.bombers]; }

  public addShip(specId: string | ShipSpec, isPlayer: boolean, pos: Vector2, facingRad = 0): Ship {
    const spec = typeof specId === 'string' ? modManager.getShip(specId) : specId;
    if (!spec) throw new Error(`Unknown ship: ${specId}`);
    const ship = new Ship(this.random.nextId('ship'), spec, isPlayer, pos, facingRad, this.random, this.visualRandom);
    this.fighterSystem.addCarrier(ship);
    this.reinforcements.push(ship);
    this.reinforcementAI.set(ship.id, new CapitalShipAI(ship, isPlayer ? this.enemyShip : this.playerShip));
    return ship;
  }

  public findHostile(ship: Ship, targetId?: string): Ship | undefined {
    const hostiles = this.ships.filter(candidate => !candidate.isDead && candidate.isPlayer !== ship.isPlayer);
    const ordered = targetId && hostiles.find(candidate => candidate.id === targetId);
    if (ordered) return ordered;
    if (ship.currentTargetShip && hostiles.includes(ship.currentTargetShip)) return ship.currentTargetShip;
    const mainShips = hostiles.filter(candidate => candidate.spec.hullSize !== 'FIGHTER');
    return (mainShips.length ? mainShips : hostiles)
      .reduce<Ship | undefined>((closest, candidate) => !closest || ship.pos.distanceTo(candidate.pos) < ship.pos.distanceTo(closest.pos) ? candidate : closest, undefined);
  }

  public updateShipAI(ai: CapitalShipAI, dt: number, projectileThreatIndex?: ProjectileThreatIndex, weaponThreatEnvelope?: WeaponThreatEnvelope): void {
    const order = this.orders.get(ai.ship.id) ?? (ai.ship.isPlayer ? this.orders.get('fleet') : undefined);
    const target = this.findHostile(ai.ship, order?.type === 'ENGAGE' || order?.type === 'AVOID' ? order.targetShipId : undefined);
    if (target) ai.targetShip = target;
    ai.update(dt, order ?? null, { ships: this.ships, projectiles: this.projectiles, beams: this.beams, asteroids: this.asteroids, projectileThreatIndex, weaponThreatEnvelope });
  }
  public readonly random: SimulationRandom;
  /** Cosmetic/visual stream. Never use this for authoritative combat decisions. */
  public readonly visualRandom: SimulationRandom;

  // 独立的领域子系统
  public readonly fxSystem: CombatFXSystem;
  public readonly asteroidSystem: AsteroidSystem;
  public readonly nebulaSystem: NebulaSystem;
  public readonly fighterSystem: FighterSystem;
  public readonly mineSystem: MineSystem;
  public readonly commandSystem: FleetCommandSystem;
  public readonly weaponSystem: WeaponSimulationSystem = new WeaponSimulationSystem();
  public readonly contrailEngine: ContrailEngine = new ContrailEngine();
  public readonly collisionSystem: ShipCollisionSystem = new ShipCollisionSystem();
  public readonly statusSystem: CombatShipStatusSystem = new CombatShipStatusSystem();
  public readonly statsTracker: CombatStatsTracker = new CombatStatsTracker();
  public battleResult: BattleResult | null = null;

  public get isBattleResultReady(): boolean {
    return this.battleResult !== null && !this.explosions.some(explosion => explosion.visualKind === 'ship');
  }
  private suppressDestructionSideEffects = false;

  public combatTime = 0;
  public cameraShakeIntensity = 0;

  // --------------------------------------------------------------------------
  // 向后兼容 Getters / Setters (保证 UI、Renderer 和 Hooks 零修改平滑过渡)
  // --------------------------------------------------------------------------
  public get projectiles(): Projectile[] { return this.weaponSystem.projectiles; }
  public set projectiles(val: Projectile[]) { this.weaponSystem.projectiles = val; }
  public get beams(): Beam[] { return this.weaponSystem.beams; }
  public set beams(val: Beam[]) { this.weaponSystem.beams = val; }

  // --------------------------------------------------------------------------
  // 向后兼容 Getters / Setters (保证 UI、Renderer 和 Hooks 零修改平滑过渡)
  // --------------------------------------------------------------------------
  public get particles(): Particle[] { return this.fxSystem.particles; }
  public get contrails(): ContrailParticle[] { return this.fxSystem.contrails; }
  public get explosions(): ExplosionAnimation[] { return this.fxSystem.explosions; }
  public get hitGlows(): HitGlowAnimation[] { return this.fxSystem.hitGlows; }
  public get empArcs(): EmpArc[] { return this.fxSystem.empArcs; }
  public get muzzleFlashes(): MuzzleFlash[] { return this.fxSystem.muzzleFlashes; }
  public get muzzleParticles(): MuzzleParticle[] { return this.fxSystem.muzzleParticles; }
  public get floatingTexts(): FloatingText[] { return this.fxSystem.floatingTexts; }
  public get debris(): DebrisParticle[] { return this.fxSystem.debris; }
  public get shieldRipples(): ShieldRipple[] { return this.fxSystem.shieldRipples; }
  public get hulkFragments(): HulkFragment[] { return this.fxSystem.hulkFragments; }
  public get mines(): SpatialMine[] { return this.mineSystem.mines; }
  public get asteroids(): Asteroid[] { return this.asteroidSystem.asteroids; }
  public get nebulae(): NebulaCloud[] { return this.nebulaSystem.nebulae; }
  public get fighters(): Ship[] { return this.fighterSystem.fighters; }
  public get fighterAIModes(): Map<string, FighterAIState> { return this.fighterSystem.fighterAIModes; }
  public get bombers(): Ship[] { return this.fighterSystem.bombers; }
  public get bomberAIModes(): Map<string, BomberAIState> { return this.fighterSystem.bomberAIModes; }
  public get isFighterRecall(): boolean { return this.fighterSystem.isFighterRecall; }
  public set isFighterRecall(v: boolean) { this.fighterSystem.isFighterRecall = v; }
  public get playerWings(): FlightDeckWing[] { return this.fighterSystem.playerWings; }
  public get enemyWings(): FlightDeckWing[] { return this.fighterSystem.enemyWings; }
  public get commandPoints(): number { return this.commandSystem.commandPoints; }
  public set commandPoints(v: number) { this.commandSystem.commandPoints = v; }
  public get selectedUnitId(): string | null { return this.commandSystem.selectedUnitId; }
  public set selectedUnitId(v: string | null) { this.commandSystem.selectedUnitId = v; }
  public get orders(): Map<string, TacticalOrder> { return this.commandSystem.orders; }
  public get radioMessages(): RadioMessage[] { return this.commandSystem.radioMessages; }
  public set radioMessages(v: RadioMessage[]) { this.commandSystem.radioMessages = v; }
  public get isTacticalMap(): boolean { return this.commandSystem.isTacticalMap; }
  public set isTacticalMap(v: boolean) { this.commandSystem.isTacticalMap = v; }

  constructor(playerShipId = DEFAULT_PLAYER_HULL, enemyShipId = DEFAULT_ENEMY_HULL, seed = 0x51a7e5ed) {
    this.random = new SimulationRandom(seed);
    this.visualRandom = new SimulationRandom((seed ^ 0x9e3779b9) >>> 0);
    this.fxSystem = new CombatFXSystem(this.visualRandom);
    this.asteroidSystem = new AsteroidSystem(this.random, this.visualRandom);
    this.nebulaSystem = new NebulaSystem(this.visualRandom);
    this.fighterSystem = new FighterSystem(this.random, this.visualRandom);
    this.mineSystem = new MineSystem(this.random, this.visualRandom);
    this.commandSystem = new FleetCommandSystem(this.visualRandom);
    const playerSpec = modManager.requireShip(playerShipId);
    const enemySpec = modManager.requireShip(enemyShipId);

    // 我方从下方朝上接敌，敌方从上方朝下接敌（世界坐标 +Y 向下）。
    this.playerShip = new Ship('player_ship', playerSpec, true, new Vector2(0, 600), -Math.PI / 2, this.random, this.visualRandom);
    this.enemyShip = new Ship('enemy_ship', enemySpec, false, new Vector2(0, -600), Math.PI / 2, this.random, this.visualRandom);
    this.enemyAI = new CapitalShipAI(this.enemyShip, this.playerShip);

    this.initFighters();
    this.initAsteroids();
    this.initNebulae();

    // 初始战场通告
    this.addRadioMessage('战区指挥部', 'HQ', '全舰注意，进入交战空域！准备迎击敌方主力！', [100, 220, 255]);
  }

  public addCameraShake(intensity: number, _duration = 0.2) {
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
  }

  public addRadioMessage(
    sender: string,
    senderFaction: 'PLAYER' | 'ENEMY' | 'HQ',
    text: string,
    color: [number, number, number] = [100, 200, 255]
  ) {
    this.commandSystem.addRadioMessage(sender, senderFaction, text, color, this.combatTime);
  }

  public switchPlayerShip(newPlayerShipId: string | ShipSpec, opponentId?: string | ShipSpec) {
    // Resolve before any reset: a missing content ID must not destroy the live battle.
    const playerSpec = typeof newPlayerShipId === 'string' ? modManager.requireShip(newPlayerShipId) : newPlayerShipId;
    const enemySpec = typeof opponentId === 'object' ? opponentId
      : modManager.requireShip(opponentId ?? defaultOpponent(playerSpec.id));
    this.random.reset();
    this.visualRandom.reset();
    this.battleResult = null;
    this.statsTracker.reset();
    this.combatTime = 0;

    this.isSimulation = false;
    this.primaryEnemyDeployed = true;
    this.simulationCosts.clear();
    this.reinforcements.length = 0;
    this.reinforcementAI.clear();
    this.playerShip = new Ship('player_ship', playerSpec, true, new Vector2(0, 600), -Math.PI / 2, this.random, this.visualRandom);
    this.enemyShip = new Ship('enemy_ship', enemySpec, false, new Vector2(0, -600), Math.PI / 2, this.random, this.visualRandom);
    this.enemyAI = new CapitalShipAI(this.enemyShip, this.playerShip);

    this.weaponSystem.clear();
    this.fxSystem.clear();
    this.mineSystem.clear();
    this.commandSystem.clear();
    this.contrailEngine.clear();
    this.cameraShakeIntensity = 0;

    this.initFighters();
    this.initAsteroids();
    this.initNebulae();
    this.addRadioMessage('战区指挥部', 'HQ', `战术旗舰重配置完成：${i18n.t(playerSpec.nameKey)} 已入轨接敌！`, [100, 220, 255]);
  }

  public toggleTacticalMap() {
    this.commandSystem.toggleTacticalMap();
  }

  public initFighters() {
    this.fighterSystem.init(this.playerShip, this.enemyShip);
  }

  public initAsteroids() {
    this.asteroidSystem.init();
  }

  public initNebulae() {
    this.nebulaSystem.init();
  }

  public resetBattle(playerShipId = this.playerShip.spec.id) {
    this.battleResult = null;
    this.statsTracker.reset();
    this.combatTime = 0;
    this.switchPlayerShip(playerShipId, this.enemyShip.spec.id);
  }

  public setSeed(seed: number): void {
    this.random.reset(seed);
    this.visualRandom.reset((seed ^ 0x9e3779b9) >>> 0);
  }

  public endBattle(isVictory: boolean) {
    if (this.battleResult) return;
    const playerHullRatio = Math.max(0, this.playerShip.hullHp / this.playerShip.maxHullHp);
    const enemyHullRatio = Math.max(0, this.enemyShip.hullHp / this.enemyShip.maxHullHp);
    this.battleResult = this.statsTracker.finalizeBattle(
      isVictory,
      this.combatTime,
      this.playerShip.spec.id,
      this.enemyShip.spec.id,
      playerHullRatio,
      enemyHullRatio
    );
  }

  public selectUnit(unitId: string | null) {
    this.commandSystem.selectUnit(unitId, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    });
  }

  public setPlayerTarget(targetId: string): boolean {
    const target = this.ships.find(ship => ship.id === targetId && !ship.isPlayer && !ship.isDead);
    if (!target || this.playerShip.isDead) return false;
    this.playerShip.currentTargetShip = target;
    this.playerShip.aimTargetWorld.copy(target.pos);
    return true;
  }

  public issueOrder(unitId: string, order: TacticalOrder): boolean {
    // UI input can race destruction while the simulation is running. Reject stale
    // contacts before spending CP; fleet assignments supersede individual tasks.
    const friendly = this.ships.filter(ship => ship.isPlayer && !ship.isDead);
    if (unitId === 'fleet' ? friendly.length === 0 : !friendly.some(ship => ship.id === unitId)) return false;
    if ((order.type === 'ENGAGE' || order.type === 'AVOID') && !this.ships.some(ship => ship.id === order.targetShipId && !ship.isPlayer && !ship.isDead)) return false;
    if ((order.type === 'WAYPOINT' || order.type === 'DEFEND') && (!order.targetPos || !Number.isFinite(order.targetPos.x) || !Number.isFinite(order.targetPos.y))) return false;
    if (order.type === 'ESCORT' && (!friendly.some(ship => ship.id === order.targetShipId) || unitId === order.targetShipId || unitId === 'fleet')) return false;
    const accepted = this.commandSystem.issueOrder(unitId, order, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    }, this.combatTime);
    if (accepted && unitId === 'fleet') for (const ship of friendly) this.orders.delete(ship.id);
    return accepted;
  }

  /** One escort assignment may dispatch multiple main ships for one command point. */
  public issueEscortGroup(unitIds: string[], order: TacticalOrder): boolean {
    const ids = [...new Set(unitIds)];
    if (order.type !== 'ESCORT' || !ids.length || ids.some(id => id === order.targetShipId || !this.capitalShips.some(ship => ship.id === id && ship.isPlayer && !ship.isDead))) return false;
    if (!this.issueOrder(ids[0], order)) return false;
    for (const id of ids.slice(1)) this.orders.set(id, { ...order });
    return true;
  }

  public cancelOrder(unitId: string) {
    this.commandSystem.cancelOrder(unitId, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    }, this.combatTime);
  }

  /**
   * 战术航路点到达判定 (原版导航指令抵达即完成)。
   * 缺少这步时旗舰/敌舰会被永久钉在航点上：油门归零、主炮停火，再也无法恢复交战。
   * 战机与轰炸机由 FighterSystem 自行处理各自的航点指令。
   */
  private updateOrderCompletion() {
    if (this.orders.size === 0) return;
    const livingIds = new Set(this.ships.filter(ship => !ship.isDead).map(ship => ship.id));
    for (const [id, order] of this.orders) {
      if ((id !== 'fleet' && !livingIds.has(id))
        || ((order.type === 'ENGAGE' || order.type === 'ESCORT' || order.type === 'AVOID') && (!order.targetShipId || !livingIds.has(order.targetShipId)))) this.orders.delete(id);
    }
    for (const ship of this.capitalShips) {
      const order = this.orders.get(ship.id);
      if (!order || order.type !== 'WAYPOINT' || !order.targetPos) continue;
      if (ship.isDead || ship.pos.distanceTo(order.targetPos) <= 90) {
        this.cancelOrder(ship.id);
      }
    }
    const fleetOrder = this.orders.get('fleet');
    if (fleetOrder?.type === 'WAYPOINT' && fleetOrder.targetPos) {
      const destination = fleetOrder.targetPos;
      if (this.ships.filter(ship => ship.isPlayer && !ship.isDead && !this.orders.has(ship.id))
        .every(ship => ship.pos.distanceTo(destination) <= 90)) this.cancelOrder('fleet');
    }
  }

  public toggleFighterRecall() {
    this.fighterSystem.toggleRecall((sender, faction, text, color) => {
      this.addRadioMessage(sender, faction, text, color);
    });
    if (this.fighterSystem.isFighterRecall) {
      this.addFloatingText(this.playerShip.pos, 'ALL WINGS RECALLED (DEFEND)', [255, 200, 80], 16, 2.0);
    } else {
      this.addFloatingText(this.playerShip.pos, 'ALL WINGS FREE ENGAGE', [100, 220, 255], 16, 2.0);
    }
  }

  public deployMine(targetPos: Vector2, sourceShip: Ship, range = 1000) {
    this.mineSystem.deployMine(targetPos, sourceShip, this.getWeaponSimContext(), range);
  }

  public spawnSparks(pos: Vector2, count = 15, color: [number, number, number] = [255, 200, 100]) {
    this.fxSystem.spawnSparks(pos, count, color);
  }

  public spawnExplosion(pos: Vector2, count = 60) {
    this.fxSystem.spawnExplosion(pos, count);
  }

  public spawnAuthenticExplosion(
    pos: Vector2,
    radius = 50,
    color: [number, number, number] = [255, 160, 50],
    hasShockwave = true,
    visualKind: 'impact' | 'missile' | 'ship' = 'impact',
    sourceShipId?: string
  ) {
    this.fxSystem.spawnAuthenticExplosion(pos, radius, color, hasShockwave, visualKind, sourceShipId);
  }

  public spawnEmpArc(
    from: Vector2,
    to: Vector2,
    options?: {
      coreColor?: [number, number, number];
      glowColor?: [number, number, number];
      thickness?: number;
      life?: number;
      branchCount?: number;
    }
  ) {
    this.fxSystem.spawnEmpArc(from, to, options);
  }

  public addFloatingDamage(pos: Vector2, amount: number, color: [number, number, number]) {
    this.fxSystem.addFloatingDamage(pos, amount, color);
  }

  public addFloatingText(
    pos: Vector2,
    text: string,
    color: [number, number, number],
    size = 14,
    maxLife = 1.5
  ) {
    this.fxSystem.addFloatingText(pos, text, color, size, maxLife);
  }

  public spawnDebris(
    pos: Vector2,
    count = 5,
    color: [number, number, number] = [120, 110, 100],
    baseSpeed = 90
  ) {
    this.fxSystem.spawnDebris(pos, count, color, baseSpeed);
  }

  public spawnShieldRipple(pos: Vector2, maxRadius = 55, color: [number, number, number] = [100, 210, 255]) {
    this.fxSystem.spawnShieldRipple(pos, maxRadius, color);
  }

  // --------------------------------------------------------------------------
  // 60Hz 固定步长确定性逻辑 Tick
  // --------------------------------------------------------------------------
  public fixedUpdate(dt: number, options: { suppressDestructionSideEffects?: boolean } = {}) {
    this.suppressDestructionSideEffects = options.suppressDestructionSideEffects === true;
    if (this.battleResult) {
      // Web settlement tail: finish visual effects without changing the finalized battle.
      this.fxSystem.update(dt);
      this.contrailEngine.update(dt);
      this.cameraShakeIntensity *= Math.pow(0.02, dt);
      return;
    }
    // TemporalShellStats offsets the player's local clock with inverse world time.
    if (!this.playerShip.isDead) dt /= this.playerShip.system.getTimeMultiplier();
    this.combatTime += dt;

    // 屏幕震颤衰减
    if (this.cameraShakeIntensity > 0.01) {
      this.cameraShakeIntensity *= Math.pow(0.02, dt);
    } else {
      this.cameraShakeIntensity = 0;
    }

    const spawnProj = (p: Projectile) => {
      this.projectiles.push(p);
      this.statsTracker.recordShotFired(p.isPlayer ?? false);
    };
    const spawnBeam = (b: Beam) => {
      // One ray per mount/cycle, including real charging and chargedown damage.
      const existing = b.slotId
        ? this.beams.find(e => e.sourceShipId === b.sourceShipId && e.slotId === b.slotId)
        : null;
      if (existing) {
        const isNewCycle = b.firingCycleId !== undefined && existing.firingCycleId !== b.firingCycleId;
        const beganDamageCycle = b.damageActive !== false && (isNewCycle || existing.damageActive === false);
        existing.damagePerSec = b.damagePerSec;
        existing.baseDamagePerSec = b.baseDamagePerSec;
        if (isNewCycle) {
          existing.elapsedTime = 0;
          clearEffectState(existing);
          existing.elapsedSinceDamage = undefined;
          existing.accumulatedBrightness = 0;
          existing.dpsDuration = 0;
          existing.damageMultiplier = 0;
          existing.rayEndPrevFrame = undefined;
          existing.startPos.copy(b.startPos);
          existing.endPos.copy(b.endPos);
          existing.hitGlowBrightness = 0;
          existing.hitGlowSizeMult = 1;
          existing.scaleGlowBasedOnDamageEffectiveness = b.scaleGlowBasedOnDamageEffectiveness ?? true;
          existing.wasShortened = false;
          existing.contactSurface = undefined;
          existing.contactFxCooldown = 0;
          existing.contactSoundCooldown = 0;
        }
        // Same-cycle phase refreshes must retain the previous shortened length.
        existing.duration = b.duration;
        existing.maxDuration = b.maxDuration;
        existing.barrelOffset = b.barrelOffset;
        existing.color = b.color;
        existing.fringeColor = b.fringeColor;
        existing.coreColor = b.coreColor;
        existing.glowColor = b.glowColor;
        existing.width = b.width;
        existing.visualMode = b.visualMode;
        existing.textureType = b.textureType;
        existing.textureScrollSpeed = b.textureScrollSpeed;
        existing.pixelsPerTexel = b.pixelsPerTexel;
        existing.hitGlowRadius = b.hitGlowRadius;
        existing.hitGlowBrightenDuration = b.hitGlowBrightenDuration;
        existing.useGlowColorForHitGlow = b.useGlowColorForHitGlow;
        existing.fringeScrollSpeedMult = b.fringeScrollSpeedMult;
        existing.coreWidthMult = b.coreWidthMult;
        existing.darkCore = b.darkCore;
        existing.darkFringeIter = b.darkFringeIter;
        existing.darkCoreIter = b.darkCoreIter;
        existing.beamEffect = b.beamEffect;
        existing.empPerSec = b.empPerSec;
        existing.baseEmpPerSec = b.baseEmpPerSec;
        existing.damageActive = b.damageActive;
        existing.firingCycleId = b.firingCycleId;
        if (isNewCycle) existing.hasRecordedHit = false;
        if (beganDamageCycle) this.statsTracker.recordShotFired(b.isPlayer ?? false);
        return;
      }
      if (b.damageActive !== false) this.statsTracker.recordShotFired(b.isPlayer ?? false);
      this.beams.push(b);
    };
    const spawnFlash = (
      pos: Vector2,
      angleRad: number,
      size: number,
      color: [number, number, number],
      spec?: MuzzleFlashSpec,
      shipVel?: Vector2,
      launcherSmokeSpec?: LauncherSmokeSpec
    ) => {
      if (launcherSmokeSpec) {
        this.fxSystem.spawnLauncherSmoke(launcherSmokeSpec, pos, angleRad, shipVel || new Vector2(0, 0));
      } else if (spec) {
        this.fxSystem.spawnAuthenticMuzzleFlash(spec, pos, angleRad, shipVel || new Vector2(0, 0));
      } else {
        this.fxSystem.muzzleFlashes.push({
          id: this.visualRandom.next(),
          pos: pos.clone(),
          angleRad,
          size,
          color,
          life: 0.1,
          maxLife: 0.1
        });
      }
    };

    updateElectronicWarfare(this.ships);

    // 1. 更新 AI
    const ais = [this.enemyAI, ...this.reinforcementAI.values()];
    const nativeThreatPhase = ais.length >= 4
      && this.updateShipAI === nativeUpdateShipAI
      && ais.every(ai => ai.update === nativeCapitalAIUpdate && ai.ship.hasNativeThreatPhaseHooks)
      && this.ships.every(ship => ship.hasNativeThreatPhaseHooks);
    const projectileThreatIndex = nativeThreatPhase && this.projectiles.length >= 128
      ? new ProjectileThreatIndex(this.projectiles) : undefined;
    const weaponThreatEnvelope = nativeThreatPhase ? new WeaponThreatEnvelope() : undefined;
    try {
      for (const ai of ais) {
        if (!this.externallyControlledShipIds.has(ai.ship.id)) {
          this.updateShipAI(ai, dt, projectileThreatIndex, weaponThreatEnvelope);
          weaponThreatEnvelope?.invalidate(ai.ship);
        }
      }
    } finally {
      projectileThreatIndex?.close();
      weaponThreatEnvelope?.close();
    }

    this.commandSystem.advance(dt);

    // Capture one target roster before weapon emission; newly fired missiles enter next step.
    const fireControlWorld = { ships: this.ships, missiles: this.projectiles.filter(p => p.isRocket || p.spawnType === 'MISSILE' || p.isMine || p.isFlare), asteroids: this.asteroids };

    // 2. 更新舰船逻辑
    for (const ship of this.capitalShips) {
      const target = ship.currentTargetShip && !ship.currentTargetShip.isDead
        ? ship.currentTargetShip : this.findHostile(ship);
      ship.update(dt, target ?? (ship.isPlayer ? this.enemyShip : this.playerShip), spawnProj, spawnBeam, spawnFlash, fireControlWorld);
    }

    // 2.1 战术航路点抵达判定 (抵达即完成，避免指挥舰被永久钉在航点上)
    this.updateOrderCompletion();

    // 2.2 更新战机与轰炸机中队
    const fighterFX = this.getFighterFXCallbacks();
    this.fighterSystem.updateDecks(dt, this.playerShip, this.enemyShip, fighterFX);
    this.fighterSystem.updateFighters(dt, this.playerShip, this.enemyShip, this.projectiles, spawnProj, spawnBeam, spawnFlash, fighterFX);
    this.fighterSystem.updateBombers(dt, this.playerShip, this.enemyShip, spawnProj, spawnBeam, spawnFlash, fighterFX);

    // 2.3 更新小行星带
    const asteroidFX = this.getAsteroidFXCallbacks();
    this.asteroidSystem.update(dt);
    const allShips = this.ships;
    this.asteroidSystem.resolveShipCollisions(allShips, asteroidFX);
    // 弹丸与小行星的结算改由武器仿真在位移之后、舰船碰撞之前按交点顺序处理
    // (见 WeaponSimulationSystem.updateProjectiles 步骤 4.5)，此处的旧调用会和
    // 尚未移动的弹丸重复结算。

    // 2.4 原版默认 smallClouds 为静态地形，当前配置不降低航速。
    this.nebulaSystem.update(allShips);

    // 2.5 舰船状态视觉特效与自动抢修汇报
    this.statusSystem.update(dt, {
      fx: this.fxSystem,
      combatRandom: this.random,
      visualRandom: this.visualRandom,
      statsTracker: this.statsTracker,
      playerShip: this.playerShip,
      enemyShip: this.enemyShip,
      ships: this.capitalShips,
      componentShips: allShips,
      projectiles: this.projectiles,
      asteroids: this.asteroids,
      addRadioMessage: (sender, faction, text, color) => this.addRadioMessage(sender, faction, text, color),
      deployReserveWing: carrier => this.fighterSystem.deployReserveWing(carrier),
      deployMine: (targetPos, sourceShip, range) => this.deployMine(targetPos, sourceShip, range)
    });

    // 3. 舰体物理碰撞与冲撞挤压 (如攻势级 Burn Drive 冲撞)
    const capitals = this.capitalShips;
    for (let i = 0; i < capitals.length; i++) for (let j = i + 1; j < capitals.length; j++) {
      this.collisionSystem.resolveShipToShipCollision(
      capitals[i],
      capitals[j],
      {
        addFloatingDamage: (pos, amount, color) => this.addFloatingDamage(pos, amount, color),
        spawnArmorDamageSparks: (ship, local, damage) => this.fxSystem.spawnArmorDamageSparks(ship, local, damage),
        spawnDebris: (pos, count, color, baseSpeed) => this.spawnDebris(pos, count, color, baseSpeed),
        addCameraShake: (intensity, duration) => this.addCameraShake(intensity, duration),
        getPlayerPos: () => this.playerShip.pos
      },
      dt
    );
    }

    // 4. 更新投射物并进行空间多边形精确碰撞检测、高射炮近炸破片与高能死光扫射
    this.weaponSystem.update(dt, this.getWeaponSimContext());

    // 4.1 更新连续烟雾尾迹带 (1:1 原版 ContrailEngine)
    this.contrailEngine.update(dt);

    // 6. 更新折跃空间水雷（主力舰与舰载机共享同一引信/爆炸目标集合）
    this.mineSystem.update(dt, this.getWeaponSimContext());

    // 7. 更新所有粒子特效生命周期
    this.fxSystem.update(dt);

    // 8. 旗舰与敌方主力舰毁损击沉判定
    for (const ship of this.capitalShips) {
      if (!ship.isDead && ship.hullHp <= 0) this.handleShipDestruction(ship);
    }
  }


  private getWeaponSimContext() {
    return {
      playerShip: this.playerShip,
      enemyShip: this.enemyShip,
      fighters: [...this.fighterSystem.fighters, ...this.fighterSystem.bombers],
      ships: this.ships,
      capitalShips: this.capitalShips,
      hulkFragments: this.fxSystem.hulkFragments,
      fx: this.fxSystem,
      statsTracker: this.statsTracker,
      contrailEngine: this.contrailEngine,
      random: this.random,
      visualRandom: this.visualRandom,
      addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color?: [number, number, number]) => {
        this.addRadioMessage(sender, faction, text, color);
      },
      addCameraShake: (intensity: number, duration: number) => {
        this.addCameraShake(intensity, duration);
      },
      handleShipDestruction: (ship: Ship) => {
        this.handleShipDestruction(ship);
      },
      projectiles: this.weaponSystem.projectiles,
      asteroids: this.asteroidSystem.asteroids,
      queryAsteroidImpact: (p) => this.asteroidSystem.queryProjectileImpact(p),
      commitAsteroidImpact: (p, impact) =>
        this.asteroidSystem.commitProjectileImpact(p, impact, this.getAsteroidFXCallbacks())
    };
  }

  private handleShipDestruction(ship: Ship) {
    if (ship.isDead) return;
    if (this.suppressDestructionSideEffects) return;
    ship.isDead = true;
    ship.clearInput();
    if (ship.flux.isVenting) ship.flux.cancelVenting();
    ship.shield.setActive(false);
    ship.system.deactivate();
    ship.system.disabled = true;
    ship.defenseSystem.deactivate();
    ship.defenseSystem.disabled = true;
    const fighter = ship.spec.hullSize === 'FIGHTER';
    sound.playAtPos('explosion', ship.pos, this.playerShip.pos, fighter ? 0.45 : 0.95);
    if (ship.spec.collisionRadius > 80) {
      sound.playAtPos('disabled_large', ship.pos, this.playerShip.pos, 1.0);
    }
    this.fxSystem.explosions.push(createShipExplosion(ship.spec, ship.getShieldCenter(), ship.vel, this.visualRandom));

    if (ship === this.playerShip) {
      this.addRadioMessage('损管中控', 'HQ', '警告！旗舰核心动力炉发生灾难性熔毁！全员弃舰！', [255, 50, 50]);
      this.addFloatingText(ship.pos.clone(), 'HULL DESTROYED', [255, 45, 45], 22, 3.0);
    } else if (ship === this.enemyShip) {
      this.addRadioMessage('战术火控', 'PLAYER', '目标敌对主力舰已遭毁灭性击沉！正在发生解体殉爆！', [100, 255, 140]);
      this.addFloatingText(ship.pos.clone(), 'TARGET DESTROYED', [120, 255, 160], 20, 2.5);
    } else if (ship.spec.hullSize === 'FIGHTER') {
      // 战机/轰炸机击毁统计
      this.statsTracker.recordFighterKill(!ship.isPlayer);
    }
    if (!this.capitalShips.some(s => !s.isDead && s.isPlayer)) this.endBattle(false);
    else if ((!this.isSimulation || this.primaryEnemyDeployed) && !this.capitalShips.some(s => !s.isDead && !s.isPlayer)) this.endBattle(true);

    const debrisColor: [number, number, number] = ship.spec.debrisColor ?? [100, 130, 160];
    // Debris count and shake remain Web presentation policies, not a native port.
    this.spawnDebris(ship.pos, fighter ? 8 : 45, debrisColor, fighter ? 100 : 220);
    if (!fighter) this.addCameraShake(25, 0.8);

    const hulk = createShipHulk(ship, this.visualRandom);
    if (hulk) {
      this.fxSystem.hulkFragments.push(hulk);
      applyHulkDisableDamage(ship, this.visualRandom,
        (source, local, damage) => this.fxSystem.spawnArmorDamageSparks(source, local, damage));
    }
  }

  // --------------------------------------------------------------------------
  // 子系统回调辅助工厂
  // --------------------------------------------------------------------------
  private getFighterFXCallbacks() {
    return {
      spawnContrail: (c: ContrailParticle) => this.fxSystem.contrails.push(c),
      spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], shockwave?: boolean) => this.spawnAuthenticExplosion(pos, radius, color, shockwave),
      spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => this.spawnDebris(pos, count, color, speed),
      addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => this.addFloatingText(pos, text, color, size, duration),
      addCameraShake: (intensity: number, duration: number) => this.addCameraShake(intensity, duration),
      addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color: [number, number, number]) => this.addRadioMessage(sender, faction, text, color),
      cancelOrder: (unitId: string) => this.cancelOrder(unitId),
      getOrder: (unitId: string) => this.commandSystem.orders.get(unitId),
      findHostile: (ship: Ship, targetId?: string) => this.findHostile(ship, targetId),
      getPlayerPos: () => this.playerShip.pos,
      handleShipDestruction: (ship: Ship) => this.handleShipDestruction(ship),
      recordFighterRebuilt: (isPlayerCraft: boolean) => this.statsTracker.recordFighterRebuilt(isPlayerCraft),
      destructionSideEffectsEnabled: () => !this.suppressDestructionSideEffects
    };
  }

  private getAsteroidFXCallbacks() {
    return {
      spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => this.spawnShieldRipple(pos, maxRadius, color),
      addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => this.addFloatingDamage(pos, amount, color),
      addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => this.addFloatingText(pos, text, color, size, duration),
      spawnArmorDamageSparks: (ship: Ship, local: Vector2, damage: number) => this.fxSystem.spawnArmorDamageSparks(ship, local, damage),
      spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => this.spawnSparks(pos, count, color),
      spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => this.spawnDebris(pos, count, color, speed),
      spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], shockwave?: boolean) => this.spawnAuthenticExplosion(pos, radius, color, shockwave),
      getPlayerPos: () => this.playerShip.pos,
      detachContrail: (projectileId: number) => this.contrailEngine.detach(projectileId)
    };
  }
}

// Capture identities once: overriding either entry point cannot certify a native phase.
const nativeCapitalAIUpdate = CapitalShipAI.prototype.update;
const nativeUpdateShipAI = CombatEngine.prototype.updateShipAI;
