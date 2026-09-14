import { Vector2 } from '../math/Vector2';
import { Ship } from './Ship';
import { Projectile, Beam, LauncherSmokeSpec, MuzzleFlashSpec } from './Weapon';
import { CapitalShipAI } from '../ai/CapitalShipAI';
import { modManager } from '../modding/ModManager';
import { sound } from '../audio/SoundManager';
import { i18n } from '../i18n/LocalizationManager';

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

  public combatTime = 0;
  public cameraShakeIntensity = 0;
  public countermeasureCooldownTimer = 0;
  public countermeasureMaxCooldown = 9.0;
  public enemyCountermeasureCooldownTimer = 0;

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
  public get maxCommandPoints(): number { return this.commandSystem.maxCommandPoints; }
  public get selectedUnitId(): string | null { return this.commandSystem.selectedUnitId; }
  public set selectedUnitId(v: string | null) { this.commandSystem.selectedUnitId = v; }
  public get orders(): Map<string, TacticalOrder> { return this.commandSystem.orders; }
  public get radioMessages(): RadioMessage[] { return this.commandSystem.radioMessages; }
  public set radioMessages(v: RadioMessage[]) { this.commandSystem.radioMessages = v; }
  public get isTacticalMap(): boolean { return this.commandSystem.isTacticalMap; }
  public set isTacticalMap(v: boolean) { this.commandSystem.isTacticalMap = v; }

  constructor(playerShipId = 'onslaught', enemyShipId = 'paragon', seed = 0x51a7e5ed) {
    this.random = new SimulationRandom(seed);
    this.visualRandom = new SimulationRandom((seed ^ 0x9e3779b9) >>> 0);
    this.fxSystem = new CombatFXSystem(this.visualRandom);
    this.asteroidSystem = new AsteroidSystem(this.random, this.visualRandom);
    this.nebulaSystem = new NebulaSystem(this.visualRandom);
    this.fighterSystem = new FighterSystem(this.random, this.visualRandom);
    this.mineSystem = new MineSystem(this.random, this.visualRandom);
    this.commandSystem = new FleetCommandSystem(this.visualRandom);
    const playerSpec = modManager.getShip(playerShipId) || modManager.getShip('onslaught')!;
    const enemySpec = modManager.getShip(enemyShipId) || modManager.getShip('paragon')!;

    // 攻势从左侧进入，典范从右侧进入
    this.playerShip = new Ship('player_ship', playerSpec, true, new Vector2(-600, 0), 0, this.random);
    this.enemyShip = new Ship('enemy_ship', enemySpec, false, new Vector2(600, 0), Math.PI, this.random);
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

  public switchPlayerShip(newPlayerShipId: string) {
    this.random.reset();
    this.visualRandom.reset();
    this.battleResult = null;
    this.statsTracker.reset();
    this.combatTime = 0;
    this.countermeasureCooldownTimer = 0;
    this.enemyCountermeasureCooldownTimer = 0;
    const playerSpec = modManager.getShip(newPlayerShipId) || modManager.getShip('onslaught')!;
    let enemyShipId = 'paragon';
    if (newPlayerShipId === 'paragon') {
      enemyShipId = 'onslaught';
    } else if (newPlayerShipId === 'doom') {
      enemyShipId = 'paragon';
    }
    const enemySpec = modManager.getShip(enemyShipId) || modManager.getShip('onslaught')!;

    this.playerShip = new Ship('player_ship', playerSpec, true, new Vector2(-600, 0), 0, this.random);
    this.enemyShip = new Ship('enemy_ship', enemySpec, false, new Vector2(600, 0), Math.PI, this.random);
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
    this.countermeasureCooldownTimer = 0;
    this.enemyCountermeasureCooldownTimer = 0;
    this.switchPlayerShip(playerShipId);
  }

  public setSeed(seed: number): void {
    this.random.reset(seed);
    this.visualRandom.reset((seed ^ 0x9e3779b9) >>> 0);
  }

  public endBattle(isVictory: boolean) {
    if (this.battleResult) return;
    const playerHullRatio = Math.max(0, this.playerShip.hullHp / this.playerShip.spec.hitpoints);
    this.battleResult = this.statsTracker.finalizeBattle(
      isVictory,
      this.combatTime,
      this.playerShip.spec.id,
      this.enemyShip.spec.id,
      playerHullRatio
    );
  }

  public selectUnit(unitId: string | null) {
    this.commandSystem.selectUnit(unitId, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    });
  }

  public issueOrder(unitId: string, order: TacticalOrder): boolean {
    return this.commandSystem.issueOrder(unitId, order, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    }, this.combatTime);
  }

  public cancelOrder(unitId: string) {
    this.commandSystem.cancelOrder(unitId, {
      addFloatingText: (pos, text, color, size, duration) => this.fxSystem.addFloatingText(pos, text, color, size, duration),
      getPlayerPos: () => this.playerShip.pos,
      getPlayerShipId: () => this.playerShip.id
    }, this.combatTime);
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

  public deployMine(targetPos: Vector2, sourceShip: Ship) {
    this.mineSystem.deployMine(targetPos, sourceShip, this.getMineFXCallbacks());
  }

  public launchCountermeasures(ship: Ship = this.playerShip): boolean {
    if (ship.isDead) return false;
    const isPlayer = (ship === this.playerShip);
    if (isPlayer && this.countermeasureCooldownTimer > 0) return false;
    if (!isPlayer && this.enemyCountermeasureCooldownTimer > 0) return false;

    if (isPlayer) {
      this.countermeasureCooldownTimer = this.countermeasureMaxCooldown;
    } else {
      this.enemyCountermeasureCooldownTimer = 8.5;
    }

    // 沿舰船尾部/两侧矢量喷管高压弹射 3 枚强烈燃烧的镁粉诱饵热焰弹
    const baseAngles = [
      ship.facingRad + Math.PI - 0.45,
      ship.facingRad + Math.PI,
      ship.facingRad + Math.PI + 0.45
    ];

    const aftOffset = Vector2.fromAngle(ship.facingRad + Math.PI, ship.spec.collisionRadius * 0.7);
    const launchOrigin = ship.pos.clone().add(aftOffset);

    for (let i = 0; i < baseAngles.length; i++) {
      const angle = baseAngles[i] + (this.random.next() - 0.5) * 0.2;
      const speed = 190 + this.random.next() * 80;
      const flareVel = Vector2.fromAngle(angle, speed).add(ship.vel.clone().scale(0.4));
      const flarePos = launchOrigin.clone().add(Vector2.fromAngle(angle, 10 + i * 5));

      this.projectiles.push({
        id: this.random.next(),
        sourceShipId: ship.id,
        specId: 'flare',
        pos: flarePos,
        prevPos: flarePos.clone(),
        vel: flareVel,
        damage: 0,
        damageType: 'FRAGMENTATION',
        radius: 8,
        rangeRemaining: 420,
        totalRange: 420,
        elapsedTime: 0,
        color: [255, 220, 140],
        isFlare: true,
        flareLife: 3.6,
        flareMaxLife: 3.6,
        hitpoints: 40,
        maxHitpoints: 40
      });
    }

    // 音效与视觉反馈
    sound.playAtPos('flare_launch', ship.pos, this.playerShip.pos, 0.85);
    this.spawnSparks(launchOrigin, 16, [255, 210, 100]);
    this.addFloatingText(ship.pos, 'FLARES DEPLOYED', [255, 200, 80], 14, 1.8);

    if (isPlayer) {
      this.addRadioMessage('火控战术官', 'PLAYER', '发射热焰诱饵弹！已释放高热红外/雷达干扰幕！', [255, 200, 80]);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // FX 视觉代理方法
  // --------------------------------------------------------------------------
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
  public fixedUpdate(dt: number) {
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
      // One mount owns one beam entity. ACTIVE/CHARGEDOWN states refresh that entity rather than stacking damage rays.
      const existing = b.slotId
        ? this.beams.find(e => e.sourceShipId === b.sourceShipId && e.slotId === b.slotId)
        : null;
      if (existing) {
        const isNewCycle = b.firingCycleId !== undefined && existing.firingCycleId !== b.firingCycleId;
        existing.startPos.copy(b.startPos);
        existing.endPos.copy(b.endPos);
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
        existing.isEmpPiercing = b.isEmpPiercing;
        existing.empPerSec = b.empPerSec;
        existing.damageActive = b.damageActive;
        existing.firingCycleId = b.firingCycleId;
        if (isNewCycle) existing.hasRecordedHit = false;
        if (isNewCycle && b.damageActive !== false) this.statsTracker.recordShotFired(b.isPlayer ?? false);
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

    // 1. 更新 AI
    this.enemyAI.update(dt);

    // 1.1 诱饵热焰冷却倒计时与战术 AI 防御反制
    if (this.countermeasureCooldownTimer > 0) {
      this.countermeasureCooldownTimer = Math.max(0, this.countermeasureCooldownTimer - dt);
    }
    if (this.enemyCountermeasureCooldownTimer > 0) {
      this.enemyCountermeasureCooldownTimer = Math.max(0, this.enemyCountermeasureCooldownTimer - dt);
    }
    if (this.enemyCountermeasureCooldownTimer <= 0 && !this.enemyShip.isDead && !this.enemyShip.isPhased) {
      const incomingMissile = this.projectiles.find(
        p => p.sourceShipId === this.playerShip.id &&
             (p.isRocket || p.isGuided || p.specId === 'typhoon' || p.specId === 'atropos_single' || p.specId === 'sabot') &&
             p.pos.distanceTo(this.enemyShip.pos) < 520
      );
      if (incomingMissile) {
        this.launchCountermeasures(this.enemyShip);
      }
    }

    // 2. 更新舰船逻辑
    this.playerShip.update(dt, this.enemyShip, spawnProj, spawnBeam, spawnFlash);
    this.enemyShip.update(dt, this.playerShip, spawnProj, spawnBeam, spawnFlash);

    // 2.2 更新战机与轰炸机中队
    const fighterFX = this.getFighterFXCallbacks();
    this.fighterSystem.updateDecks(dt, this.playerShip, this.enemyShip, fighterFX);
    this.fighterSystem.updateFighters(dt, this.playerShip, this.enemyShip, this.projectiles, spawnProj, spawnBeam, spawnFlash, fighterFX);
    this.fighterSystem.updateBombers(dt, this.playerShip, this.enemyShip, spawnProj, spawnBeam, spawnFlash, fighterFX);

    // 2.3 更新小行星带
    const asteroidFX = this.getAsteroidFXCallbacks();
    this.asteroidSystem.update(dt);
    const allShips = [this.playerShip, this.enemyShip, ...this.fighterSystem.fighters, ...this.fighterSystem.bombers];
    this.asteroidSystem.resolveShipCollisions(allShips, asteroidFX);
    this.asteroidSystem.resolveProjectileCollisions(this.projectiles, asteroidFX);

    // 2.4 更新星云流体 (Nebulae)
    this.nebulaSystem.update(dt, allShips, this.projectiles, (pos, color) => {
      this.fxSystem.particles.push({
        pos,
        vel: new Vector2((this.visualRandom.next() - 0.5) * 20, (this.visualRandom.next() - 0.5) * 20),
        life: 0.35,
        maxLife: 0.35,
        size: 4,
        color,
        alpha: 0.35
      });
    });

    // 2.5 舰船状态视觉特效与自动抢修汇报
    this.statusSystem.update(dt, {
      fx: this.fxSystem,
      combatRandom: this.random,
      visualRandom: this.visualRandom,
      statsTracker: this.statsTracker,
      playerShip: this.playerShip,
      enemyShip: this.enemyShip,
      addRadioMessage: (sender, faction, text, color) => this.addRadioMessage(sender, faction, text, color),
      deployMine: (targetPos, sourceShip) => this.deployMine(targetPos, sourceShip)
    });

    // 3. 舰体物理碰撞与冲撞挤压 (如攻势级 Burn Drive 冲撞)
    this.collisionSystem.resolveShipToShipCollision(
      this.playerShip,
      this.enemyShip,
      {
        addFloatingDamage: (pos, amount, color) => this.addFloatingDamage(pos, amount, color),
        spawnSparks: (pos, count, color) => this.spawnSparks(pos, count, color),
        spawnDebris: (pos, count, color, baseSpeed) => this.spawnDebris(pos, count, color, baseSpeed),
        addCameraShake: (intensity, duration) => this.addCameraShake(intensity, duration),
        getPlayerPos: () => this.playerShip.pos
      },
      dt
    );

    // 4. 更新投射物并进行空间多边形精确碰撞检测、高射炮近炸破片与高能死光扫射
    this.weaponSystem.update(dt, this.getWeaponSimContext());

    // 4.1 更新连续烟雾尾迹带 (1:1 原版 ContrailEngine)
    this.contrailEngine.update(dt);

    // 6. 更新折跃空间水雷
    this.mineSystem.update(dt, [this.playerShip, this.enemyShip], this.getMineFXCallbacks());

    // 7. 更新所有粒子特效生命周期
    this.fxSystem.update(dt);

    // 8. 旗舰与敌方主力舰毁损击沉判定
    if (!this.playerShip.isDead && this.playerShip.hullHp <= 0) {
      this.handleShipDestruction(this.playerShip);
    }
    if (!this.enemyShip.isDead && this.enemyShip.hullHp <= 0) {
      this.handleShipDestruction(this.enemyShip);
    }
  }


  private getWeaponSimContext() {
    return {
      playerShip: this.playerShip,
      enemyShip: this.enemyShip,
      fighters: [...this.fighterSystem.fighters, ...this.fighterSystem.bombers],
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
      }
    };
  }

  private handleShipDestruction(ship: Ship) {
    if (ship.isDead) return;
    ship.isDead = true;
    sound.playAtPos('explosion', ship.pos, this.playerShip.pos, 0.95);
    if (ship.spec.collisionRadius > 80) {
      sound.playAtPos('disabled_large', ship.pos, this.playerShip.pos, 1.0);
    }
    this.spawnExplosion(ship.pos, 120);
    this.spawnAuthenticExplosion(
      ship.pos,
      Math.max(110, ship.spec.collisionRadius * 1.3),
      [255, 150, 55],
      true,
      'ship',
      ship.spec.id
    );

    if (ship === this.playerShip) {
      this.addRadioMessage('损管中控', 'HQ', '警告！旗舰核心动力炉发生灾难性熔毁！全员弃舰！', [255, 50, 50]);
      this.addFloatingText(ship.pos.clone(), 'HULL DESTROYED', [255, 45, 45], 22, 3.0);
      this.endBattle(false);
    } else if (ship === this.enemyShip) {
      this.addRadioMessage('战术火控', 'PLAYER', '目标敌对主力舰已遭毁灭性击沉！正在发生解体殉爆！', [100, 255, 140]);
      this.addFloatingText(ship.pos.clone(), 'TARGET DESTROYED', [120, 255, 160], 20, 2.5);
      this.endBattle(true);
    } else {
      // 战机/轰炸机击毁统计
      this.statsTracker.recordFighterKill(!ship.isPlayer);
    }

    const debrisColor: [number, number, number] = ship.spec.id === 'onslaught' ? [125, 110, 95] : [100, 130, 160];
    this.spawnDebris(ship.pos, 45, debrisColor, 220);

    // 连环大爆炸与次生殉爆音效
    for (let k = 0; k < 9; k++) {
      const off = new Vector2(
        (this.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.3,
        (this.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.3
      );
      const detPos = ship.pos.clone().add(off);
      this.spawnAuthenticExplosion(detPos, 70 + this.visualRandom.next() * 70, [255, 140, 30], true);
      sound.playAtPos('explosion_secondary', detPos, this.playerShip.pos, 0.65);
    }
    this.addCameraShake(25, 0.8);

    // 仅大型战舰断裂为残骸断件
    if (ship.spec.collisionRadius > 80) {
      const shouldBreak = this.random.next() < 0.5;
      if (shouldBreak) {
        this.fxSystem.hulkFragments.push({
          id: this.random.next(),
          pos: ship.pos.clone().add(Vector2.fromAngle(ship.facingRad, ship.spec.collisionRadius * 0.25)),
          vel: Vector2.fromAngle(ship.facingRad, 30).add(ship.vel),
          facingRad: ship.facingRad,
          angularVel: (this.random.next() - 0.5) * 0.12,
          life: 180,
          maxLife: 180,
          spriteUrl: ship.spec.spriteUrl,
          spriteWidth: ship.spec.spriteWidth,
          spriteHeight: ship.spec.spriteHeight,
          pivotX: ship.spec.pivotX,
          pivotY: ship.spec.pivotY,
          clipPart: 'FRONT',
          collisionRadius: ship.spec.collisionRadius * 0.55
        });
        this.fxSystem.hulkFragments.push({
          id: this.random.next(),
          pos: ship.pos.clone().add(Vector2.fromAngle(ship.facingRad + Math.PI, ship.spec.collisionRadius * 0.3)),
          vel: Vector2.fromAngle(ship.facingRad + Math.PI, 25).add(ship.vel),
          facingRad: ship.facingRad,
          angularVel: (this.random.next() - 0.5) * 0.12,
          life: 180,
          maxLife: 180,
          spriteUrl: ship.spec.spriteUrl,
          spriteWidth: ship.spec.spriteWidth,
          spriteHeight: ship.spec.spriteHeight,
          pivotX: ship.spec.pivotX,
          pivotY: ship.spec.pivotY,
          clipPart: 'REAR',
          collisionRadius: ship.spec.collisionRadius * 0.5
        });
      } else {
        this.fxSystem.hulkFragments.push({
          id: this.random.next(),
          pos: ship.pos.clone(),
          vel: ship.vel.clone().scale(0.8),
          facingRad: ship.facingRad,
          angularVel: (this.random.next() - 0.5) * 0.06,
          life: 180,
          maxLife: 180,
          spriteUrl: ship.spec.spriteUrl,
          spriteWidth: ship.spec.spriteWidth,
          spriteHeight: ship.spec.spriteHeight,
          pivotX: ship.spec.pivotX,
          pivotY: ship.spec.pivotY,
          clipPart: 'FULL',
          collisionRadius: ship.spec.collisionRadius * 0.85
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 子系统回调辅助工厂
  // --------------------------------------------------------------------------
  private getMineFXCallbacks() {
    return {
      spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => this.spawnShieldRipple(pos, maxRadius, color),
      spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => this.spawnSparks(pos, count, color),
      spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], shockwave?: boolean) => this.spawnAuthenticExplosion(pos, radius, color, shockwave),
      spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => this.spawnDebris(pos, count, color, speed),
      spawnExplosion: (pos: Vector2, count: number) => this.spawnExplosion(pos, count),
      spawnEmpArc: (from: Vector2, to: Vector2) => this.spawnEmpArc(from, to),
      addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => this.addFloatingDamage(pos, amount, color),
      addCameraShake: (intensity: number, duration: number) => this.addCameraShake(intensity, duration),
      getPlayerPos: () => this.playerShip.pos
    };
  }

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
      getPlayerPos: () => this.playerShip.pos
    };
  }

  private getAsteroidFXCallbacks() {
    return {
      spawnShieldRipple: (pos: Vector2, maxRadius: number, color: [number, number, number]) => this.spawnShieldRipple(pos, maxRadius, color),
      addFloatingDamage: (pos: Vector2, amount: number, color: [number, number, number]) => this.addFloatingDamage(pos, amount, color),
      addFloatingText: (pos: Vector2, text: string, color: [number, number, number], size: number, duration: number) => this.addFloatingText(pos, text, color, size, duration),
      spawnSparks: (pos: Vector2, count: number, color: [number, number, number]) => this.spawnSparks(pos, count, color),
      spawnDebris: (pos: Vector2, count: number, color: [number, number, number], speed: number) => this.spawnDebris(pos, count, color, speed),
      spawnAuthenticExplosion: (pos: Vector2, radius: number, color: [number, number, number], shockwave?: boolean) => this.spawnAuthenticExplosion(pos, radius, color, shockwave),
      getPlayerPos: () => this.playerShip.pos
    };
  }
}
