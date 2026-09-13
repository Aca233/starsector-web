import { contentRegistry } from '../engine/content/ContentRegistry';
import { Vector2 } from '../engine/math/Vector2';
import type { CombatSession } from '../engine/runtime/CombatSession';
import type { ExplosionAnimation, MuzzleFlash } from '../engine/simulation/CombatTypes';
import type { Beam, Projectile, WeaponSpec } from '../engine/simulation/Weapon';

export interface VisualScenarioDefinition {
  id: string;
  title: string;
  description: string;
  duration: number;
  shipId: string;
}

/** The acceptance-scene catalog from the M2 plan. */
export const VISUAL_SCENARIOS: VisualScenarioDefinition[] = [
  { id: 'VIS-01', title: '攻势静止，四个朝向', description: '固定镜头依次检查 0° / 90° / 180° / 270° 舰体与挂点。', duration: 4, shipId: 'onslaught' },
  { id: 'VIS-02', title: '怠速、推进、松键、侧移、冲刺', description: '同一艘攻势按固定时间轴展示发动机状态。', duration: 6, shipId: 'onslaught' },
  { id: 'VIS-03', title: '护盾开关与单次受击', description: '固定展开/保持/关闭，并在固定时刻注入一次护盾命中。', duration: 4.5, shipId: 'onslaught' },
  { id: 'VIS-04', title: '多次连续护盾命中', description: '固定方位与节奏连续产生护盾受击涟漪。', duration: 4.5, shipId: 'onslaught' },
  { id: 'VIS-05', title: 'TPC 单发', description: '单次 TPC 枪口闪光、弹体、尾迹时间轴。', duration: 3.2, shipId: 'onslaught' },
  { id: 'VIS-06', title: '实弹炮连续开火', description: 'Mark IX 连续发射，固定发射间隔与弹道。', duration: 4.2, shipId: 'onslaught' },
  { id: 'VIS-07', title: '光束充能、照射、停止', description: '典范主炮固定充能、持续照射和停止消退。', duration: 4.6, shipId: 'paragon' },
  { id: 'VIS-08', title: '导弹直飞、转弯、命中', description: '固定导弹轨迹，包含直飞、转向与命中爆光。', duration: 4.6, shipId: 'onslaught' },
  { id: 'VIS-09', title: '排散完整过程', description: '固定初始幅能，从排散启动到烟雾完全消退。', duration: 5.2, shipId: 'onslaught' },
  { id: 'VIS-10', title: '小命中与舰船爆炸', description: '先展示局部小命中，再展示完整舰船毁灭爆炸层。', duration: 4.8, shipId: 'onslaught' },
  { id: 'VIS-11', title: '固定状态 HUD', description: '冻结战斗状态，用于 HUD 布局与多分辨率截图。', duration: 10, shipId: 'onslaught' },
  { id: 'VIS-12', title: '双舰加舰载机实战', description: '受控双舰、战机和轰炸机综合图层场景。', duration: 8, shipId: 'onslaught' }
];

const EPSILON = 1e-9;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function setPose(ship: { pos: Vector2; prevPos: Vector2; facingRad: number; prevFacingRad: number; vel: Vector2 }, x: number, y: number, facing: number): void {
  ship.pos.set(x, y);
  ship.prevPos.set(x, y);
  ship.vel.set(0, 0);
  ship.facingRad = facing;
  ship.prevFacingRad = facing;
}

function projectileFromSpec(spec: WeaponSpec, sourceShipId: string, origin: Vector2, facing: number, age: number, id: number): Projectile {
  const speed = Math.max(1, spec.projSpeed || 500);
  const distance = speed * Math.max(0, age);
  const pos = origin.clone().add(Vector2.fromAngle(facing, distance));
  const prevPos = origin.clone().add(Vector2.fromAngle(facing, Math.max(0, distance - speed / 60)));
  return {
    id,
    sourceShipId,
    isPlayer: true,
    specId: spec.id,
    pos,
    prevPos,
    vel: Vector2.fromAngle(facing, speed),
    damage: spec.damagePerShot,
    damageType: spec.type,
    radius: spec.projRadius,
    rangeRemaining: Math.max(0, spec.range - distance),
    totalRange: spec.range,
    elapsedTime: Math.max(0, age),
    color: [...spec.color],
    spawnType: spec.spawnType,
    textureType: spec.textureType,
    textureScrollSpeed: spec.textureScrollSpeed,
    fringeColor: spec.fringeColor,
    coreColor: spec.coreColor,
    glowColor: spec.glowColor,
    hitGlowRadius: spec.hitGlowRadius,
    glowRadius: spec.glowRadius,
    coreWidthMult: spec.coreWidthMult,
    projSpriteUrl: spec.projSpriteUrl,
    projLength: spec.projLength,
    projWidth: spec.projWidth,
    isRocket: spec.isRocket,
    isGuided: spec.isGuided,
    facingRad: facing,
    engineAcceleration: spec.engineAcceleration,
    maxSpeed: spec.maxSpeed,
    maxTurnRate: spec.maxTurnRate,
    engineFlameColor: spec.engineFlameColor,
    isTwoStage: spec.isTwoStage,
    hitpoints: spec.missileHp,
    maxHitpoints: spec.missileHp
  };
}

export class VisualScenarioController {
  private active: VisualScenarioDefinition | null = null;
  private timeSeconds = 0;
  private seed = 1337;

  constructor(public readonly session: CombatSession) {}

  public get scene(): VisualScenarioDefinition | null { return this.active; }
  public get time(): number { return this.timeSeconds; }
  public get currentSeed(): number { return this.seed; }

  public select(sceneId: string, seed = this.seed): void {
    this.active = VISUAL_SCENARIOS.find((scene) => scene.id === sceneId) ?? VISUAL_SCENARIOS[0];
    this.seed = seed >>> 0;
    this.rebuild(0);
    this.session.pause();
  }

  public play(): void {
    if (!this.active) this.select(VISUAL_SCENARIOS[0].id, this.seed);
    this.session.start();
  }

  public pause(): void { this.session.pause(); }

  public replay(): void {
    this.rebuild(0);
    this.session.pause();
  }

  public setSeed(seed: number): void {
    const targetTime = this.timeSeconds;
    this.seed = seed >>> 0;
    this.rebuild(targetTime);
  }

  public seek(seconds: number): void {
    if (!this.active) this.active = VISUAL_SCENARIOS[0];
    const duration = this.active.duration;
    this.rebuild(Math.max(0, Math.min(duration, seconds)));
    this.session.pause();
  }

  public step(dt = this.session.scheduler.fixedDeltaTime): void {
    if (!this.active) this.select(VISUAL_SCENARIOS[0].id, this.seed);
    this.session.pause();
    this.advance(Math.min(Math.max(0, dt), this.active!.duration - this.timeSeconds));
  }

  /** Returns true while Visual Lab owns the fixed tick and normal combat simulation must be skipped. */
  public tick(dt: number): boolean {
    if (!this.active) return false;
    if (this.session.state !== 'running') return true;
    const remaining = this.active.duration - this.timeSeconds;
    if (remaining <= EPSILON) {
      this.session.pause();
      return true;
    }
    this.advance(Math.min(dt, remaining));
    if (this.timeSeconds >= this.active.duration - EPSILON) this.session.pause();
    return true;
  }

  private rebuild(targetTime: number): void {
    if (!this.active) return;
    this.session.switchPlayerShip(this.active.shipId);
    this.session.setSeed(this.seed);
    this.session.pause();
    this.timeSeconds = 0;
    this.session.visualClock.seek(0);
    this.resetBaseState();
    this.applySceneState(0);

    const fixed = this.session.scheduler.fixedDeltaTime;
    while (this.timeSeconds + fixed <= targetTime + EPSILON) this.advance(fixed);
    const remainder = targetTime - this.timeSeconds;
    if (remainder > EPSILON) this.advance(remainder);
  }

  private advance(dt: number): void {
    if (!this.active || dt <= 0) return;
    this.timeSeconds = Math.min(this.active.duration, this.timeSeconds + dt);
    this.session.visualClock.seek(this.timeSeconds);
    this.applySceneState(this.timeSeconds);
    this.session.updateVisualOnly(dt);
  }

  private resetBaseState(): void {
    const engine = this.session.engine;
    const player = engine.playerShip;
    const enemy = engine.enemyShip;

    engine.combatTime = 0;
    engine.cameraShakeIntensity = 0;
    engine.weaponSystem.clear();
    engine.fxSystem.clear();
    engine.mineSystem.clear();
    engine.contrailEngine.clear();

    setPose(player, -260, 0, 0);
    setPose(enemy, 360, 0, Math.PI);
    player.hullHp = player.spec.hitpoints;
    enemy.hullHp = enemy.spec.hitpoints;
    player.isDead = false;
    enemy.isDead = false;
    player.throttle = 0;
    player.strafeInput = 0;
    player.turnInput = 0;
    player.shield.setActive(false);
    player.shield.currentArcDeg = 0;
    player.shield.ripples = [];
    enemy.shield.setActive(false);
    enemy.shield.currentArcDeg = 0;
    enemy.shield.ripples = [];
    player.flux.softFlux = 0;
    player.flux.hardFlux = 0;
    player.flux.isVenting = false;
    player.flux.isOverloaded = false;
    player.system.isActive = false;
    player.system.isCoolingDown = false;
    player.system.cooldownTimer = 0;
    player.system.activeTimer = 0;
    for (const status of player.engineStatuses) {
      status.currentThrust = 0;
      status.prevThrust = 0;
      status.isFlameout = false;
      status.flameoutTimer = 0;
    }
    for (const mount of player.weapons) {
      mount.cooldownTimer = 0;
      mount.recoil = 0;
      mount.glowAlpha = 0;
    }
    for (const craft of [...engine.fighters, ...engine.bombers]) craft.isDead = true;
  }

  private clearScriptedFrame(): void {
    const engine = this.session.engine;
    engine.weaponSystem.clear();
    engine.fxSystem.clear();
    engine.contrailEngine.clear();
    engine.cameraShakeIntensity = 0;
    const player = engine.playerShip;
    const enemy = engine.enemyShip;
    player.shield.ripples = [];
    enemy.shield.ripples = [];
    player.throttle = 0;
    player.strafeInput = 0;
    player.turnInput = 0;
    player.system.isActive = false;
    for (const status of player.engineStatuses) {
      status.prevThrust = status.currentThrust;
      status.currentThrust = 0;
    }
    for (const mount of player.weapons) {
      mount.recoil = 0;
      mount.glowAlpha = 0;
    }
  }

  private applySceneState(t: number): void {
    const scene = this.active;
    if (!scene) return;
    const engine = this.session.engine;
    const player = engine.playerShip;
    const enemy = engine.enemyShip;
    this.clearScriptedFrame();
    engine.combatTime = t;

    if (scene.id !== 'VIS-09') {
      player.flux.isVenting = false;
      player.flux.ventProgress = 0;
    }
    if (!['VIS-03', 'VIS-04', 'VIS-11'].includes(scene.id)) {
      player.shield.setActive(false);
      player.shield.currentArcDeg = 0;
    }

    switch (scene.id) {
      case 'VIS-01': {
        const quarter = Math.min(3, Math.floor(t));
        const facings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        setPose(player, 0, 0, facings[quarter]);
        setPose(enemy, 1200, 0, Math.PI);
        break;
      }
      case 'VIS-02': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 1200, 0, Math.PI);
        let thrust = 0.18;
        if (t >= 1 && t < 2.4) { player.throttle = 1; thrust = 1; }
        else if (t >= 2.4 && t < 3.1) { thrust = Math.max(0.18, 1 - (t - 2.4) / 0.7 * 0.82); }
        else if (t >= 3.1 && t < 4.2) { player.strafeInput = 1; thrust = 0.72; }
        else if (t >= 4.2 && t < 5.25) { player.throttle = 1; player.system.isActive = true; thrust = 2.2; }
        else if (t >= 5.25) { thrust = Math.max(0, 0.9 - (t - 5.25) * 1.2); }
        for (const status of player.engineStatuses) status.currentThrust = thrust;
        break;
      }
      case 'VIS-03': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 650, 0, Math.PI);
        const deployStart = 0.45;
        const closeStart = 3.45;
        player.shield.setActive(t >= deployStart && t < closeStart);
        if (t < deployStart) player.shield.currentArcDeg = 0;
        else if (t < deployStart + 0.5) player.shield.currentArcDeg = player.shield.maxArcDeg * clamp01((t - deployStart) / 0.5);
        else if (t < closeStart) player.shield.currentArcDeg = player.shield.maxArcDeg;
        else player.shield.currentArcDeg = player.shield.maxArcDeg * (1 - clamp01((t - closeStart) / 0.35));
        this.addShieldHit(player, t, 1.75, 0.12, [255, 170, 70]);
        break;
      }
      case 'VIS-04': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 650, 0, Math.PI);
        player.shield.setActive(true);
        player.shield.currentArcDeg = player.shield.maxArcDeg;
        const hits: Array<[number, number, [number, number, number]]> = [
          [0.9, -0.38, [80, 200, 255]],
          [1.25, -0.12, [255, 150, 70]],
          [1.6, 0.15, [200, 100, 255]],
          [1.95, 0.4, [80, 200, 255]],
          [2.3, 0.05, [255, 150, 70]]
        ];
        for (const [at, angle, color] of hits) this.addShieldHit(player, t, at, angle, color);
        break;
      }
      case 'VIS-05': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 520, 0, Math.PI);
        const fireAt = 0.9;
        const spec = contentRegistry.getWeapon('tpc');
        if (spec) {
          const origin = new Vector2(-30, 0);
          const age = t - fireAt;
          if (age >= 0 && age <= 1.65) engine.projectiles.push(projectileFromSpec(spec, player.id, origin, 0, age, 5001));
          this.addMuzzle(engine.fxSystem.muzzleFlashes, origin, 0, spec, age, 5001);
          for (const mount of player.weapons.filter((w) => w.spec.id === 'tpc')) {
            mount.recoil = age >= 0 && age < 0.3 ? Math.max(0, 1 - age / 0.3) : 0;
            mount.glowAlpha = age < 0 ? clamp01((age + 0.6) / 0.6) : Math.max(0, 1 - age / 0.25);
          }
        }
        break;
      }
      case 'VIS-06': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 620, 0, Math.PI);
        const spec = contentRegistry.getWeapon('mark9');
        if (spec) {
          const origin = new Vector2(-80, 0);
          for (let i = 0; i < 9; i++) {
            const fireAt = 0.65 + i * 0.34;
            const age = t - fireAt;
            if (age >= 0 && age <= 1.35) engine.projectiles.push(projectileFromSpec(spec, player.id, origin, 0, age, 6000 + i));
            this.addMuzzle(engine.fxSystem.muzzleFlashes, origin, 0, spec, age, 6000 + i);
          }
          const lastAge = ((t - 0.65) % 0.34 + 0.34) % 0.34;
          for (const mount of player.weapons.filter((w) => w.spec.id === 'mark9')) mount.recoil = Math.max(0, 1 - lastAge / 0.18);
        }
        break;
      }
      case 'VIS-07': {
        setPose(player, -250, 0, 0);
        setPose(enemy, 520, 0, Math.PI);
        const spec = contentRegistry.getWeapon('tachyonlance');
        if (spec) {
          const origin = new Vector2(-40, 0);
          const charge = clamp01((t - 0.55) / 0.7);
          for (const mount of player.weapons.filter((w) => w.spec.id === 'tachyonlance')) mount.glowAlpha = t < 1.25 ? charge : Math.max(0, 1 - (t - 3.35) / 0.35);
          if (t >= 1.25 && t < 3.35) {
            const beam: Beam = {
              id: 7001,
              sourceShipId: player.id,
              isPlayer: true,
              specId: spec.id,
              startPos: origin,
              endPos: new Vector2(430, 0),
              damagePerSec: spec.damagePerSecond,
              damageType: spec.type,
              color: [...spec.color],
              duration: Math.min(0.2, t - 1.25 + 0.02),
              maxDuration: 0.2,
              width: spec.projWidth || 28,
              elapsedTime: t - 1.25,
              textureType: spec.textureType,
              textureScrollSpeed: spec.textureScrollSpeed,
              fringeColor: spec.fringeColor,
              coreColor: spec.coreColor,
              glowColor: spec.glowColor,
              hitGlowRadius: spec.hitGlowRadius,
              isHitting: true
            };
            engine.beams.push(beam);
          }
        }
        break;
      }
      case 'VIS-08': {
        setPose(player, -300, -80, 0);
        setPose(enemy, 480, 100, Math.PI);
        const spec = contentRegistry.getWeapon('typhoon') ?? contentRegistry.getWeapon('annihilatorpod');
        if (spec) {
          const fireAt = 0.6;
          const age = t - fireAt;
          const hitAt = 3.45;
          if (age >= 0 && t < hitAt) {
            const straight = Math.min(age, 1.1);
            const turnAge = Math.max(0, age - 1.1);
            const x = -210 + straight * 250 + turnAge * 210;
            const y = -80 + turnAge * turnAge * 37;
            const facing = turnAge <= 0 ? 0 : Math.atan2(turnAge * 74, 210);
            const p = projectileFromSpec(spec, player.id, new Vector2(x, y), facing, 0, 8001);
            p.pos.set(x, y);
            p.prevPos.set(x - Math.cos(facing) * 4, y - Math.sin(facing) * 4);
            p.vel = Vector2.fromAngle(facing, 320);
            p.facingRad = facing;
            p.elapsedTime = age;
            p.isRocket = true;
            engine.projectiles.push(p);
            for (let s = 0; s <= 14; s++) {
              const sampleAge = age * s / 14;
              const ss = Math.min(sampleAge, 1.1);
              const ta = Math.max(0, sampleAge - 1.1);
              const px = -210 + ss * 250 + ta * 210;
              const py = -80 + ta * ta * 37;
              engine.contrailEngine.addPoint(8001, new Vector2(px, py), 2, 9, 1.8, 1);
            }
          }
          if (t >= hitAt && t < hitAt + 0.36) this.addExplosion(engine.fxSystem.explosions, new Vector2(480, 100), 70, t - hitAt, 8002);
        }
        break;
      }
      case 'VIS-09': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 1200, 0, Math.PI);
        const ventStart = 0.55;
        const ventEnd = 3.55;
        const initialFlux = player.spec.maxFlux * 0.82;
        player.flux.initialVentFlux = initialFlux;
        if (t < ventStart) {
          player.flux.softFlux = initialFlux * 0.55;
          player.flux.hardFlux = initialFlux * 0.45;
          player.flux.isVenting = false;
          player.flux.ventProgress = 0;
        } else if (t < ventEnd) {
          const progress = clamp01((t - ventStart) / (ventEnd - ventStart));
          const remaining = initialFlux * (1 - progress);
          player.flux.softFlux = remaining * 0.55;
          player.flux.hardFlux = remaining * 0.45;
          player.flux.isVenting = true;
          player.flux.ventProgress = progress;
        } else {
          player.flux.softFlux = 0;
          player.flux.hardFlux = 0;
          player.flux.isVenting = false;
          player.flux.ventProgress = 0;
        }
        break;
      }
      case 'VIS-10': {
        setPose(player, -280, 0, 0);
        setPose(enemy, 280, 0, Math.PI);
        const smallHit = 0.85;
        const hitAge = t - smallHit;
        if (hitAge >= 0 && hitAge < 0.55) {
          const pos = new Vector2(210, -35);
          const fade = 1 - hitAge / 0.55;
          engine.fxSystem.particles.push({ pos, vel: new Vector2(), life: fade, maxLife: 1, size: 12, color: [255, 190, 80], alpha: fade });
        }
        const destroyAt = 2.35;
        const destroyAge = t - destroyAt;
        if (destroyAge >= 0 && destroyAge < 1.0) {
          this.addExplosion(engine.fxSystem.explosions, enemy.pos.clone(), 190, destroyAge, 10001);
          engine.cameraShakeIntensity = Math.max(0, 18 * (1 - destroyAge));
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI * 2 / 8;
            const distance = destroyAge * (70 + i * 5);
            engine.fxSystem.debris.push({
              pos: enemy.pos.clone().add(Vector2.fromAngle(angle, distance)),
              vel: Vector2.fromAngle(angle, 70 + i * 5),
              rotation: angle + destroyAge * (i % 2 ? -2 : 2),
              angularVel: i % 2 ? -2 : 2,
              size: 9 + (i % 3) * 3,
              life: Math.max(0.05, 1 - destroyAge),
              maxLife: 1,
              color: [180, 120, 80],
              points: [],
              spriteUrl: `graphics/debris/debris_sml${i % 4}.png`,
              isGlowing: i % 2 === 0
            });
          }
        }
        break;
      }
      case 'VIS-11': {
        setPose(player, -150, 30, 0.12);
        setPose(enemy, 360, -60, Math.PI - 0.18);
        player.flux.softFlux = player.spec.maxFlux * 0.28;
        player.flux.hardFlux = player.spec.maxFlux * 0.31;
        player.hullHp = player.spec.hitpoints * 0.72;
        player.shield.setActive(true);
        player.shield.currentArcDeg = player.shield.maxArcDeg;
        player.currentCR = 0.63;
        player.peakPerformanceRemaining = 182;
        break;
      }
      case 'VIS-12': {
        const cycle = t / scene.duration;
        setPose(player, -300 + Math.sin(t * 0.45) * 35, 80 * Math.sin(t * 0.3), 0.08 * Math.sin(t * 0.5));
        setPose(enemy, 320 + Math.cos(t * 0.4) * 35, 100 * Math.cos(t * 0.28), Math.PI + 0.07 * Math.cos(t * 0.55));
        const craft = [...engine.fighters, ...engine.bombers];
        for (let i = 0; i < craft.length; i++) {
          const unit = craft[i];
          unit.isDead = false;
          const side = unit.isPlayer ? -1 : 1;
          const center = unit.isPlayer ? player.pos : enemy.pos;
          const angle = t * (0.7 + i * 0.04) + i * 1.7;
          const radius = 120 + (i % 3) * 45;
          setPose(unit, center.x + Math.cos(angle) * radius * side, center.y + Math.sin(angle) * radius, angle + (side < 0 ? 0 : Math.PI));
        }
        player.shield.setActive(cycle > 0.12 && cycle < 0.72);
        player.shield.currentArcDeg = player.shield.isActive ? player.shield.maxArcDeg : 0;
        enemy.shield.setActive(cycle > 0.25 && cycle < 0.82);
        enemy.shield.currentArcDeg = enemy.shield.isActive ? enemy.shield.maxArcDeg : 0;
        const tpc = contentRegistry.getWeapon('tpc');
        if (tpc) {
          for (let i = 0; i < 4; i++) {
            const fireAt = 1 + i * 1.55;
            const age = t - fireAt;
            if (age >= 0 && age < 1.0) engine.projectiles.push(projectileFromSpec(tpc, player.id, player.pos.clone().add(new Vector2(140, 0)), player.facingRad, age, 12000 + i));
          }
        }
        const beamSpec = contentRegistry.getWeapon('tachyonlance');
        if (beamSpec && t >= 4.1 && t < 5.5) {
          engine.beams.push({
            id: 12050,
            sourceShipId: enemy.id,
            isPlayer: false,
            specId: beamSpec.id,
            startPos: enemy.pos.clone().add(new Vector2(-80, 0)),
            endPos: player.pos.clone(),
            damagePerSec: beamSpec.damagePerSecond,
            damageType: beamSpec.type,
            color: [...beamSpec.color],
            duration: 0.2,
            maxDuration: 0.2,
            width: beamSpec.projWidth || 24,
            elapsedTime: t - 4.1,
            textureType: beamSpec.textureType,
            textureScrollSpeed: beamSpec.textureScrollSpeed,
            fringeColor: beamSpec.fringeColor,
            coreColor: beamSpec.coreColor,
            glowColor: beamSpec.glowColor,
            hitGlowRadius: beamSpec.hitGlowRadius,
            isHitting: true
          });
        }
        break;
      }
    }
  }

  private addShieldHit(ship: { shield: { ripples: Array<{ angle: number; intensity: number; life: number; color: [number, number, number] }> } }, now: number, at: number, angle: number, color: [number, number, number]): void {
    const age = now - at;
    if (age < 0 || age > 0.4) return;
    const life = 0.4 - age;
    ship.shield.ripples.push({ angle, intensity: clamp01(life / 0.4), life, color });
  }

  private addMuzzle(target: MuzzleFlash[], origin: Vector2, angle: number, spec: WeaponSpec, age: number, id: number): void {
    if (age < 0 || age > 0.12) return;
    const life = 0.12 - age;
    target.push({ id, pos: origin.clone(), angleRad: angle, size: spec.muzzleFlashSize || 70, color: spec.muzzleFlashColor ? [...spec.muzzleFlashColor] : [...spec.color], life, maxLife: 0.12 });
  }

  private addExplosion(target: ExplosionAnimation[], pos: Vector2, radius: number, age: number, id: number): void {
    const maxLife = 0.95;
    if (age < 0 || age > maxLife) return;
    const progress = clamp01(age / maxLife);
    target.push({
      id,
      pos: pos.clone(),
      radius: radius * (0.3 + 0.7 * Math.sin(progress * Math.PI * 0.5)),
      maxRadius: radius,
      life: maxLife - age,
      maxLife,
      frame: Math.min(6, Math.floor(progress * 7)),
      rotation: this.session.visualRandom.sample(`explosion-${id}`) * Math.PI * 2,
      color: [255, 150, 55],
      hasShockwaveRing: true,
      shockwaveRadius: 6 + progress * radius * 1.6,
      maxShockwaveRadius: radius * 1.6
    });
  }
}
