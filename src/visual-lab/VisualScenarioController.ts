import { contentRegistry } from '../engine/content/ContentRegistry';
import { VISUAL_LAB_WINGS } from './VisualLabFleet';
import { Vector2 } from '../engine/math/Vector2';
import type { CombatSession } from '../engine/runtime/CombatSession';
import type { ExplosionAnimation, MuzzleFlash } from '../engine/simulation/CombatTypes';
import type { Beam, Projectile, WeaponSpec } from '../engine/simulation/Weapon';
import { SimulationRandom } from '../engine/simulation/SimulationRandom';
import { createExplosionPuffs, createShipExplosion } from '../engine/visual/ExplosionVisuals';

export interface VisualScenarioDefinition {
  id: string;
  title: string;
  description: string;
  duration: number;
  shipId: string;
  checkpoints: number[];
  mode?: 'SYNTHETIC' | 'REAL_WEAPON' | 'REAL_SYSTEM';
}

/** The acceptance-scene catalog from the M2 plan. */
export const VISUAL_SCENARIOS: VisualScenarioDefinition[] = [
  { id: 'VIS-01', title: '攻势静止，四个朝向', description: '固定镜头依次检查 0° / 90° / 180° / 270° 舰体与挂点。', duration: 4, shipId: 'onslaught', checkpoints: [0.25, 1.25, 2.25, 3.25] },
  { id: 'VIS-02', title: '怠速、推进、松键、侧移、冲刺', description: '同一艘攻势按固定时间轴展示发动机状态。', duration: 6, shipId: 'onslaught', checkpoints: [0.5, 1.6, 2.7, 3.6, 4.65, 5.55] },
  { id: 'VIS-03', title: '护盾开关与单次受击', description: '真实护盾展开与关闭时序，并在固定时刻注入一次护盾命中。', duration: 4.5, shipId: 'onslaught', checkpoints: [0.6, 1.0, 1.8, 3.55], mode: 'REAL_SYSTEM' },
  { id: 'VIS-04', title: '多次连续护盾命中', description: '固定方位与节奏推进真实护盾分段受击与恢复。', duration: 4.5, shipId: 'onslaught', checkpoints: [0.95, 1.65, 2.35], mode: 'REAL_SYSTEM' },
  { id: 'VIS-05', title: 'TPC 单发', description: '合成分层场景：单次 TPC 枪口闪光、弹体、尾迹时间轴。', duration: 3.2, shipId: 'onslaught', checkpoints: [0.82, 0.95, 1.18, 1.55], mode: 'SYNTHETIC' },
  { id: 'VIS-06', title: '实弹炮连续开火', description: '合成分层场景：Mark IX 连续发射，固定发射间隔与弹道。', duration: 4.2, shipId: 'onslaught', checkpoints: [0.7, 1.4, 2.45, 3.4], mode: 'SYNTHETIC' },
  { id: 'VIS-07', title: '光束充能、照射、停止', description: '典范主炮固定充能、持续照射和停止消退。', duration: 4.6, shipId: 'paragon', checkpoints: [0.8, 1.3, 2.2, 3.3, 3.55] },
  { id: 'VIS-08', title: '导弹视觉层：直飞与命中', description: '合成分层场景：仅检查直飞导弹本体、尾迹与命中爆光；不作为制导转弯证据。', duration: 4.6, shipId: 'onslaught', checkpoints: [0.8, 1.5, 2.55, 3.5], mode: 'SYNTHETIC' },
  { id: 'VIS-09', title: '排散完整过程', description: '固定初始幅能，调用真实排幅状态机直到完成；渐入、粒子与 HUD 倒计时共享同一状态。', duration: 14, shipId: 'onslaught', checkpoints: [0.5, 0.8, 2.0, 6.0, 13.0], mode: 'REAL_SYSTEM' },
  { id: 'VIS-10', title: '小命中与舰船爆炸', description: '先展示局部小命中，再展示完整舰船毁灭爆炸层。', duration: 4.8, shipId: 'onslaught', checkpoints: [0.9, 2.4, 2.65, 3.05] },
  { id: 'VIS-11', title: '固定状态 HUD', description: '冻结战斗状态，用于 HUD 布局与多分辨率截图。', duration: 10, shipId: 'onslaught', checkpoints: [2.0] },
  { id: 'VIS-12', title: '双舰加舰载机实战', description: '受控双舰、战机和轰炸机综合图层场景。', duration: 8, shipId: 'onslaught', checkpoints: [1.5, 4.6, 6.2] },
  { id: 'VIS-13', title: '相位进入、线圈与退出', description: '厄运相位线圈的真实状态机、移动残影与冷却。', duration: 5, shipId: 'doom', checkpoints: [0.6, 1.1, 2.1, 2.6, 3.2, 4.8], mode: 'REAL_SYSTEM' },
  { id: 'WPN-TPC-01', title: 'TPC 真实开火：单炮空射', description: '走实际挂点、火控、投射物更新与渲染链的可重播 TPC 单炮空射。', duration: 2.4, shipId: 'onslaught', checkpoints: [0.86, 0.92, 0.98, 1.2], mode: 'REAL_WEAPON' },
  { id: 'WPN-AUTOPULSE-01', title: 'Autopulse 真实开火：单炮空射', description: '使用典范 WS 001 大型硬点，走实际火控与投射物链的可重播 Autopulse 单炮空射。', duration: 2.2, shipId: 'paragon', checkpoints: [0.86, 0.92, 0.98, 1.15], mode: 'REAL_WEAPON' },
  { id: 'WPN-MARK9-01', title: 'Mark IX 真实开火：双管交替', description: '使用攻势 WS 019 前向大型炮塔持续开火，检查双管交替、后坐、枪口粒子与实体弹道。', duration: 2.4, shipId: 'onslaught', checkpoints: [0.75, 0.85, 0.95, 1.05, 1.45], mode: 'REAL_WEAPON' },
  { id: 'WPN-HEAVYMAULER-01', title: 'Heavy Mauler 真实开火：单炮空射', description: '在攻势 WS 012 中型炮塔临时装入 Registry 中的 Heavy Mauler，走真实火控、枪口粒子、后坐与投射物链。', duration: 2.2, shipId: 'onslaught', checkpoints: [0.86, 0.92, 0.98, 1.18], mode: 'REAL_WEAPON' },
  { id: 'WPN-HVEL-01', title: 'Hypervelocity Driver 真实开火：单炮空射', description: '使用攻势 WS 012 原生 HVD，走真实火控、枪口粒子、后坐与投射物链。', duration: 2.2, shipId: 'onslaught', checkpoints: [0.86, 0.92, 0.98, 1.18], mode: 'REAL_WEAPON' },
  { id: 'WPN-LIGHTMG-01', title: 'Light MG 真实开火：Broadsword 单管', description: '使用阔剑 WS 001 原生轻机枪，走来源 5 发 burst 与 RAY-style 弹体契约，检查 beam-like 弹体成像。', duration: 2.0, shipId: 'broadsword', checkpoints: [0.86, 0.92, 0.98, 1.12], mode: 'REAL_WEAPON' },
  { id: 'WPN-FLAK-01', title: 'Flak 真实开火：单管后向空射', description: '在攻势 WS 014 临时装入 Flak 规格并朝后空射，检查来源弹体、枪口焰、后坐与已对齐的近炸半径契约。', duration: 2.0, shipId: 'onslaught', checkpoints: [0.86, 0.92, 0.98, 1.15], mode: 'REAL_WEAPON' },
  { id: 'WPN-DUALFLAK-01', title: 'Dual Flak 真实开火：双管交替', description: '使用攻势原生 WS 014 双管高射炮朝后持续开火，检查双管交替、来源弹宽和短促枪口粒子。', duration: 2.0, shipId: 'onslaught', checkpoints: [0.72, 0.82, 1.06, 1.12, 1.35], mode: 'REAL_WEAPON' },
  { id: 'WPN-BEAM-01', title: 'Tachyon Lance 真实开火：单束空射', description: '使用典范 WS 003 原生 Tachyon Lance，走真实火控与 BeamSimulation，检查来源宽度、RGBA、纹理滚动和 burst 生命周期。', duration: 2.2, shipId: 'paragon', checkpoints: [0.86, 0.92, 0.98, 1.3, 1.8], mode: 'REAL_WEAPON' },
  { id: 'WPN-BEAM-02', title: 'Graviton Beam 真实开火：持续束', description: '使用典范 WS 005 原生 Graviton Beam，走 0.1s 充能/退能与单实体持续束生命周期，检查连续 UV 相位。', duration: 2.0, shipId: 'paragon', checkpoints: [0.72, 0.9, 1.08, 1.28, 1.5], mode: 'REAL_WEAPON' },
  { id: 'WPN-BEAM-03', title: 'Tactical Laser 真实开火：持续束', description: '使用典范 WS 007 原生 Tactical Laser 持续开火，检查 13-unit 来源宽度、绿色 RGBA 与单实体持续束生命周期。', duration: 2.0, shipId: 'paragon', checkpoints: [0.72, 0.9, 1.08, 1.28, 1.5], mode: 'REAL_WEAPON' },
  { id: 'WPN-MSL-01', title: 'Reaper 真实开火：直飞与红色 GLOW 尾迹', description: '使用 Doom WS 001 原生 Typhoon/Reaper 发射器空射，检查 compact 弹体、发射烟、发动机与红色 GLOW 尾迹；Reaper 不做转弯验收。', duration: 2.5, shipId: 'doom', checkpoints: [0.86, 0.94, 1.08, 1.4, 2.0], mode: 'REAL_WEAPON' },
  { id: 'WPN-MSL-02', title: 'Atropos 真实开火：制导转弯与尾迹', description: '使用 Dagger WS 002 原生 Atropos 对偏置目标开火，检查实际 MissileGuidance 转向以及来源 GLOW 尾迹。', duration: 2.5, shipId: 'dagger', checkpoints: [0.62, 0.78, 1.0, 1.25, 1.7], mode: 'REAL_WEAPON' },
  { id: 'WPN-MSL-03', title: 'Annihilator 真实开火：快速火箭', description: '使用 Onslaught WS 021 持续开火，检查双管交替、小型火箭、发射烟与短寿命 NORMAL 尾迹。', duration: 2.2, shipId: 'onslaught', checkpoints: [0.72, 0.86, 1.05, 1.28, 1.55], mode: 'REAL_WEAPON' },
  { id: 'WPN-MSL-04', title: 'Sabot 真实开火：MIRV 分裂链', description: '使用 Doom WS 003 对真实目标开火，检查来源弹体/烟/发动机/尾迹以及 source-aligned 五弹头 MIRV 分裂。', duration: 2.5, shipId: 'doom', checkpoints: [0.62, 0.8, 1.1, 1.45, 1.9], mode: 'REAL_WEAPON' },
  { id: 'WPN-HBLASTER-01', title: 'Heavy Blaster 真实开火：装甲命中', description: '使用 Doom WS 007 原生 Heavy Blaster 对无盾目标开火，检查来源 beam-like 投射物、枪口粒子与真实装甲/舰体命中链。', duration: 1.8, shipId: 'doom', checkpoints: [0.7, 0.82, 0.98, 1.12, 1.35], mode: 'REAL_WEAPON' },
  { id: 'WPN-PDBURST-01', title: 'Burst PD 真实开火：护盾接触', description: '使用 Doom WS 009 原生 Burst PD 对已展开护盾目标开火，检查来源 Beam 材质与确定性的护盾接触节拍。', duration: 1.5, shipId: 'doom', checkpoints: [0.58, 0.66, 0.74, 0.86, 1.05], mode: 'REAL_WEAPON' }
];

const EPSILON = 1e-9;
const SHIELD_HITS = [[0.9, -0.38], [1.25, -0.12], [1.6, 0.15], [1.95, 0.4], [2.3, 0.05]] as const;

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
  const sourceShot = !spec.isRocket && (spec.spawnType === 'BALLISTIC' || spec.spawnType === 'BALLISTIC_AS_BEAM');
  const fade = sourceShot && (spec.fadeTime ?? 0) > 0 ? clamp01((age - spec.range / speed) / spec.fadeTime!) : 0;
  return {
    id,
    sourceShipId,
    isPlayer: true,
    specId: spec.id,
    pos,
    prevPos,
    vel: Vector2.fromAngle(facing, speed),
    damage: spec.damagePerShot * (1 - fade) ** 2,
    empDamage: (spec.empPerShot ?? 0) * (1 - fade) ** 2,
    unfadedDamage: spec.damagePerShot,
    unfadedEmp: spec.empPerShot ?? 0,
    sourceMoveSpeed: sourceShot ? speed : undefined,
    sourceVelocity: sourceShot ? new Vector2() : undefined,
    ballisticTail: sourceShot ? pos.clone().add(Vector2.fromAngle(facing, -Math.min(spec.projLength ?? 0, distance))) : undefined,
    prevBallisticTail: sourceShot ? prevPos.clone().add(Vector2.fromAngle(facing, -Math.min(spec.projLength ?? 0, Math.max(0, distance - speed / 60)))) : undefined,
    fadeProgress: fade,
    prevFadeProgress: fade,
    softFlux: fade > 0,
    damageType: spec.type,
    radius: spec.projRadius,
    rangeRemaining: Math.max(0, spec.range - distance),
    totalRange: spec.range,
    elapsedTime: Math.max(0, age),
    color: [...spec.color],
    spawnType: spec.spawnType,
    visualSpawnType: spec.visualSpawnType,
    textureType: spec.textureType,
    textureScrollSpeed: spec.textureScrollSpeed,
    fadeTime: spec.fadeTime,
    pixelsPerTexel: spec.pixelsPerTexel,
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
    missileEngineVisualSpec: spec.missileEngineVisualSpec,
    missileTrailSpec: spec.missileTrailSpec,
    missileExplosionVisualSpec: spec.missileExplosionVisualSpec,
    isTwoStage: spec.isTwoStage,
    hitpoints: spec.missileHp,
    maxHitpoints: spec.missileHp
  };
}

export class VisualScenarioController {
  private active: VisualScenarioDefinition | null = null;
  private timeSeconds = 0;
  private seed = 1337;
  private previewShipId: string | null = null;

  constructor(public readonly session: CombatSession) {}

  public get scene(): VisualScenarioDefinition | null { return this.active; }
  public get time(): number { return this.timeSeconds; }
  public get currentSeed(): number { return this.seed; }
  public get previewShip(): string | null { return this.previewShipId; }

  public setPreviewShip(shipId: string | null): void {
    const targetTime = this.timeSeconds;
    this.previewShipId = shipId;
    if (this.active) this.rebuild(targetTime);
  }

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
    this.session.switchPlayerShip(this.previewShipId ?? this.active.shipId);
    this.session.setSeed(this.seed);
    if (this.active.id === 'VIS-12' || this.active.id === 'VIS-11') {
      this.session.engine.fighterSystem.init(this.session.engine.playerShip, this.session.engine.enemyShip, VISUAL_LAB_WINGS);
    }
    this.session.pause();
    this.timeSeconds = 0;
    this.session.visualClock.seek(0);
    this.resetBaseState();
    this.applySceneState(0);

    const fixed = this.session.scheduler.fixedDeltaTime;
    while (this.timeSeconds + fixed <= targetTime + EPSILON) this.advance(fixed);
    const remainder = targetTime - this.timeSeconds;
    if (remainder > EPSILON) this.advance(remainder);
    this.session.refreshPresentationAssets();
  }

  private advance(dt: number): void {
    if (!this.active || dt <= 0) return;
    const previousTime = this.timeSeconds;
    this.timeSeconds = Math.min(this.active.duration, previousTime + dt);
    const stepDt = this.timeSeconds - previousTime;
    this.session.visualClock.seek(this.timeSeconds);
    if (this.active.mode === 'REAL_WEAPON' || this.active.mode === 'REAL_SYSTEM') this.advanceSimulatedScene(previousTime, this.timeSeconds, stepDt);
    else this.applySceneState(this.timeSeconds, stepDt);
    this.session.updateVisualOnly(stepDt);
  }

  private advanceSimulatedScene(previousTime: number, currentTime: number, dt: number): void {
    if (!this.active || dt <= 0) return;
    const engine = this.session.engine;
    const player = engine.playerShip;

    switch (this.active.id) {
      case 'VIS-03': {
        player.shield.setActive(currentTime >= 0.45 && currentTime < 3.45);
        player.shield.update(dt, player.facingRad, player.facingRad);
        if (previousTime < 1.75 - EPSILON && currentTime >= 1.75 - EPSILON) {
          player.shield.recordVisualHit(100, 0.12);
        }
        engine.combatTime = currentTime;
        break;
      }
      case 'VIS-04': {
        player.shield.update(dt, player.facingRad, player.facingRad);
        for (const [at, angle] of SHIELD_HITS) {
          if (previousTime < at - EPSILON && currentTime >= at - EPSILON) player.shield.recordVisualHit(100, angle);
        }
        engine.combatTime = currentTime;
        break;
      }
      case 'VIS-09': {
        const ventStart = 0.55;
        if (previousTime < ventStart - EPSILON && currentTime >= ventStart - EPSILON) player.flux.startVenting();
        if (currentTime >= ventStart - EPSILON) player.flux.update(dt, false);
        player.shield.update(dt, player.facingRad, player.facingRad);
        engine.combatTime = currentTime;
        break;
      }
      case 'VIS-13': {
        player.throttle = currentTime >= 0.5 && currentTime < 2.5 ? 1 : 0;
        if (previousTime < 0.5 && currentTime >= 0.5) player.shield.setActive(true);
        if (previousTime < 2.5 && currentTime >= 2.5) player.shield.setActive(false);
        player.update(dt, null, () => {}, () => {});
        engine.combatTime = currentTime;
        break;
      }
      case 'WPN-TPC-01':
      case 'WPN-AUTOPULSE-01':
      case 'WPN-HEAVYMAULER-01':
      case 'WPN-HVEL-01':
      case 'WPN-LIGHTMG-01': {
        const fireAt = 0.9;
        player.throttle = 0;
    player.brakeInput = false;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = previousTime < fireAt - EPSILON && currentTime >= fireAt - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-MARK9-01': {
        const fireStart = 0.72;
        const fireEnd = 1.48;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = currentTime >= fireStart - EPSILON && previousTime < fireEnd - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-FLAK-01': {
        const fireAt = 0.9;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(-1400, 0);
        player.isFiringMain = previousTime < fireAt - EPSILON && currentTime >= fireAt - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-DUALFLAK-01': {
        const fireStart = 0.72;
        const fireEnd = 1.15;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(-1400, 0);
        player.isFiringMain = currentTime >= fireStart - EPSILON && previousTime < fireEnd - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-BEAM-01': {
        // Hold through the source 0.5s charge-up; the lance becomes damage-active at ~0.9s.
        const fireStart = 0.4;
        const fireEnd = 1.0;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = currentTime >= fireStart - EPSILON && previousTime < fireEnd - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-BEAM-02':
      case 'WPN-BEAM-03': {
        const fireStart = 0.72;
        const fireEnd = 1.38;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = currentTime >= fireStart - EPSILON && previousTime < fireEnd - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-MSL-01':
      case 'WPN-MSL-04': {
        const fireAt = this.active.id === 'WPN-MSL-01' ? 0.9 : 0.65;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.copy(engine.enemyShip.pos);
        player.isFiringMain = previousTime < fireAt - EPSILON && currentTime >= fireAt - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-MSL-02': {
        const fireAt = 0.65;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        // Launcher stays forward; the live offset enemy drives actual missile guidance after launch.
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = previousTime < fireAt - EPSILON && currentTime >= fireAt - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-MSL-03': {
        const fireStart = 0.72;
        const fireEnd = 1.55;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.set(1400, 0);
        player.isFiringMain = currentTime >= fireStart - EPSILON && previousTime < fireEnd - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
      case 'WPN-HBLASTER-01':
      case 'WPN-PDBURST-01': {
        const fireAt = this.active.id === 'WPN-HBLASTER-01' ? 0.72 : 0.62;
        player.throttle = 0;
        player.strafeInput = 0;
        player.turnInput = 0;
        player.aimTargetWorld.copy(engine.enemyShip.pos);
        player.isFiringMain = this.active.id === 'WPN-HBLASTER-01'
          ? previousTime < fireAt - EPSILON && currentTime >= fireAt - EPSILON
          : currentTime >= fireAt - EPSILON && previousTime < 1.2 - EPSILON;
        engine.fixedUpdate(dt);
        player.isFiringMain = false;
        break;
      }
    }
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
    player.hullHp = player.maxHullHp;
    enemy.hullHp = enemy.maxHullHp;
    player.isDead = false;
    enemy.isDead = false;
    player.throttle = 0;
    player.strafeInput = 0;
    player.turnInput = 0;
    player.isFiringMain = false;
    player.shield.setActive(false);
    player.shield.currentArcDeg = 0;
    player.shield.resetVisualHits();
    enemy.shield.setActive(false);
    enemy.shield.currentArcDeg = 0;
    enemy.shield.resetVisualHits();
    player.flux.softFlux = 0;
    player.flux.hardFlux = 0;
    player.flux.isVenting = false;
    player.flux.isOverloaded = false;
    player.system.reset();
    enemy.system.reset();
    player.engineController.restore();
    player.justCriticalDamage.length = 0;
    player.resetShieldMalfunctionState();
    enemy.resetShieldMalfunctionState();
    for (const ship of [player, enemy]) {
      ship.crAtDeployment = null;
      ship.lowCRDamageSequence = null;
    }
    for (const mount of player.weapons) {
      mount.cooldownTimer = 0;
      mount.burstRemaining = 0;
      mount.burstTimer = 0;
      mount.firingState = 'IDLE';
      mount.firingStateTimer = 0;
      mount.triggerHeld = false;
      mount.firingCycleId = 0;
      mount.ammo = mount.spec.maxAmmo ?? Number.POSITIVE_INFINITY;
      mount.ammoRechargeProgress = 0;
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
    player.shield.resetVisualHits();
    enemy.shield.resetVisualHits();
    player.throttle = 0;
    player.strafeInput = 0;
    player.turnInput = 0;
    player.isFiringMain = false;
    player.system.isActive = false;
    player.engineController.flameAccelerating = false;
    for (const status of player.engineStatuses) {
      status.prevThrust = status.currentThrust;
      status.currentThrust = 0.4;
      status.prevSpread = status.spread;
      status.spread = 0;
    }
    for (const mount of player.weapons) {
      mount.recoil = 0;
      mount.glowAlpha = 0;
    }
  }

  private applySceneState(t: number, dt = 0): void {
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
    if (!['VIS-03', 'VIS-04', 'VIS-11', 'VIS-12'].includes(scene.id)) {
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
        let thrust = 0.4;
        if (t >= 1 && t < 2.4) { player.throttle = 1; thrust = 1; }
        else if (t >= 2.4 && t < 3.1) { thrust = Math.max(0.4, 1 - (t - 2.4)); }
        else if (t >= 3.1 && t < 4.2) { player.strafeInput = 1; }
        else if (t >= 4.2 && t < 5.25) { player.throttle = 1; player.system.isActive = true; thrust = 1; }
        else if (t >= 5.25) { thrust = Math.max(0, 1 - (t - 5.25) * 1.4); }
        player.engineController.flameAccelerating = player.throttle > 0 || (t >= 2.4 && t <= 2.45);
        player.system.effectLevel = t >= 4.2 && t < 5.25 ? clamp01((t - 4.2) / 0.25) : 0;
        for (const status of player.engineStatuses) {
          status.currentThrust = thrust;
          status.spread = t >= 3.1 && t < 4.2 ? Math.min(90, (t - 3.1) * 270) : 0;
        }
        break;
      }
      case 'VIS-13': {
        setPose(player, -200, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        break;
      }
      case 'VIS-03': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 650, 0, Math.PI);
        break;
      }
      case 'VIS-04': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 650, 0, Math.PI);
        player.shield.setActive(true);
        player.shield.currentArcDeg = player.shield.maxArcDeg;
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
      case 'WPN-TPC-01': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const tpcGroup = player.weaponGroups[0];
        if (tpcGroup) {
          tpcGroup.mode = 'LINKED';
          tpcGroup.weaponSlotIds = ['WS 016'];
          tpcGroup.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-AUTOPULSE-01': {
        setPose(player, -300, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const autopulseGroup = player.weaponGroups[0];
        if (autopulseGroup) {
          autopulseGroup.mode = 'LINKED';
          autopulseGroup.weaponSlotIds = ['WS 001'];
          autopulseGroup.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-MARK9-01': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const mark9Group = player.weaponGroups[0];
        if (mark9Group) {
          mark9Group.mode = 'LINKED';
          mark9Group.weaponSlotIds = ['WS 019'];
          mark9Group.alternatingIndex = 0;
        }
        const mark9 = player.weapons.find((mount) => mount.slotId === 'WS 019');
        if (mark9) {
          mark9.barrelIndex = 0;
          mark9.currentSpreadDeg = mark9.spec.minSpread || 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-HEAVYMAULER-01':
      case 'WPN-HVEL-01': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const weaponId = this.active.id === 'WPN-HEAVYMAULER-01' ? 'heavymauler' : 'hveldriver';
        const sourceSpec = contentRegistry.getWeapon(weaponId);
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 012');
        if (sourceSpec && mount) {
          mount.spec = sourceSpec;
          mount.barrelIndex = 0;
          mount.currentSpreadDeg = sourceSpec.minSpread || 0;
          mount.currentAngleRad = 0;
        }
        const group = player.weaponGroups[0];
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 012'];
          group.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-LIGHTMG-01': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 001');
        if (mount) {
          mount.barrelIndex = 0;
          mount.currentSpreadDeg = mount.spec.minSpread || 0;
          mount.currentAngleRad = 0;
        }
        const group = player.weaponGroups[0];
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 001'];
          group.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-FLAK-01':
      case 'WPN-DUALFLAK-01': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(-1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const weaponId = this.active.id === 'WPN-FLAK-01' ? 'flak' : 'dualflak';
        const sourceSpec = contentRegistry.getWeapon(weaponId);
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 014');
        if (sourceSpec && mount) {
          mount.spec = sourceSpec;
          mount.barrelIndex = 0;
          mount.currentSpreadDeg = sourceSpec.minSpread || 0;
          mount.currentAngleRad = Math.PI;
        }
        const group = player.weaponGroups[0];
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 014'];
          group.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-BEAM-01':
      case 'WPN-BEAM-02':
      case 'WPN-BEAM-03': {
        setPose(player, -300, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const slotId = this.active.id === 'WPN-BEAM-01' ? 'WS 003' : this.active.id === 'WPN-BEAM-02' ? 'WS 005' : 'WS 007';
        const mount = player.weapons.find((weapon) => weapon.slotId === slotId);
        if (mount) {
          mount.currentAngleRad = 0;
          mount.glowAlpha = 0;
          mount.cooldownTimer = 0;
        }
        const group = player.weaponGroups[0];
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = [slotId];
          group.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-MSL-01': {
        setPose(player, -300, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 1;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const group = player.weaponGroups.find((item) => item.index === 1);
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 001'];
          group.alternatingIndex = 0;
        }
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 001');
        if (mount) mount.currentAngleRad = 0;
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-MSL-02': {
        setPose(player, -300, 0, 0);
        setPose(enemy, 560, 260, Math.PI);
        enemy.isDead = false;
        player.currentTargetShip = enemy;
        player.aimTargetWorld.copy(enemy.pos);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const group = player.weaponGroups.find((item) => item.index === 0);
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 002'];
          group.alternatingIndex = 0;
        }
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 002');
        if (mount) mount.currentAngleRad = 0;
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-MSL-03': {
        setPose(player, -260, 0, 0);
        setPose(enemy, 1600, 0, Math.PI);
        enemy.isDead = true;
        player.currentTargetShip = null;
        player.aimTargetWorld.set(1400, 0);
        player.selectedGroupIndex = 1;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const group = player.weaponGroups.find((item) => item.index === 1);
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 021'];
          group.alternatingIndex = 0;
        }
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 021');
        if (mount) {
          mount.currentAngleRad = 0;
          mount.barrelIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-MSL-04': {
        setPose(player, -300, 0, 0);
        setPose(enemy, 500, 0, Math.PI);
        enemy.isDead = false;
        player.currentTargetShip = enemy;
        player.aimTargetWorld.copy(enemy.pos);
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const group = player.weaponGroups.find((item) => item.index === 0);
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = ['WS 003'];
          group.alternatingIndex = 0;
        }
        const mount = player.weapons.find((weapon) => weapon.slotId === 'WS 003');
        if (mount) mount.currentAngleRad = 0;
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
        break;
      }
      case 'WPN-HBLASTER-01':
      case 'WPN-PDBURST-01': {
        setPose(player, -300, 0, 0);
        // Keep the target outside hull-overlap range but well inside the current
        // Web Heavy Blaster range so the real collision path is guaranteed to
        // be exercised rather than ending on range expiry.
        setPose(enemy, this.active.id === 'WPN-HBLASTER-01' ? 180 : 300, 0, Math.PI);
        enemy.isDead = false;
        player.currentTargetShip = enemy;
        player.aimTargetWorld.copy(enemy.pos);
        if (this.active.id === 'WPN-PDBURST-01') {
          enemy.shield.type = enemy.spec.shieldType;
          enemy.shield.setActive(true);
          enemy.shield.currentArcDeg = enemy.shield.maxArcDeg;
        } else {
          // Scenario fixture: prevent enemy AI from auto-deploying a shield so
          // this scene exercises the real armor/hull collision branch.
          enemy.shield.type = 'NONE';
          enemy.shield.setActive(false);
          enemy.shield.currentArcDeg = 0;
        }
        player.selectedGroupIndex = 0;
        for (const group of player.weaponGroups) group.isAutofire = false;
        const slotId = this.active.id === 'WPN-HBLASTER-01' ? 'WS 007' : 'WS 009';
        const mount = player.weapons.find((weapon) => weapon.slotId === slotId);
        if (mount) {
          mount.currentAngleRad = 0;
          mount.cooldownTimer = 0;
          mount.currentSpreadDeg = mount.spec.minSpread || 0;
        }
        const group = player.weaponGroups[0];
        if (group) {
          group.mode = 'LINKED';
          group.weaponSlotIds = [slotId];
          group.alternatingIndex = 0;
        }
        engine.asteroids.length = 0;
        engine.nebulae.length = 0;
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
              width: spec.beamWidth || 25,
              visualMode: spec.beamVisualMode,
              elapsedTime: t - 1.25,
              textureType: spec.textureType,
              textureScrollSpeed: spec.textureScrollSpeed,
              pixelsPerTexel: spec.pixelsPerTexel,
              fringeColor: spec.fringeColor,
              coreColor: spec.coreColor,
              glowColor: spec.glowColor,
              hitGlowRadius: spec.hitGlowRadius,
              hitGlowBrightenDuration: spec.hitGlowBrightenDuration,
              brightness: 1,
              // Isolated synthetic capture: explicitly author contact age rather than use shot age in the renderer.
              hitGlowBrightness: (spec.hitGlowBrightenDuration ?? 1) <= 0 ? 1 : clamp01((t - 1.25) / (spec.hitGlowBrightenDuration ?? 1)),
              hitGlowSizeMult: 1,
              useGlowColorForHitGlow: spec.useGlowColorForHitGlow,
              fringeScrollSpeedMult: spec.fringeScrollSpeedMult,
              coreWidthMult: spec.coreWidthMult,
              isHitting: true
            };
            engine.beams.push(beam);
          }
        }
        break;
      }
      case 'VIS-08': {
        setPose(player, -300, -80, 0);
        setPose(enemy, 480, -80, Math.PI);
        const spec = contentRegistry.getWeapon('typhoon') ?? contentRegistry.getWeapon('annihilatorpod');
        if (spec) {
          const fireAt = 0.6;
          const age = t - fireAt;
          const hitAt = 3.45;
          if (age >= 0 && t < hitAt) {
            const progress = clamp01(age / (hitAt - fireAt));
            const x = -210 + (480 + 210) * progress;
            const y = -80;
            const p = projectileFromSpec(spec, player.id, new Vector2(x, y), 0, 0, 8001);
            p.pos.set(x, y);
            p.prevPos.set(x - 4, y);
            p.vel = new Vector2(320, 0);
            p.facingRad = 0;
            p.elapsedTime = age;
            p.isRocket = true;
            engine.projectiles.push(p);
            const trail = spec.missileTrailSpec;
            for (let s = 0; s <= 14; s++) {
              const sampleAge = age * s / 14;
              const sampleProgress = clamp01(sampleAge / (hitAt - fireAt));
              const px = -210 + (480 + 210) * sampleProgress;
              engine.contrailEngine.addPoint(
                8001,
                new Vector2(px, -80),
                trail?.duration ?? 2,
                trail?.baseWidth ?? 9,
                trail?.widenMult ?? 1.8,
                trail?.minSeg ?? 1,
                trail?.color,
                trail?.blendMode
              );
            }
          }
          if (t >= hitAt && t < hitAt + 0.36) this.addExplosion(engine.fxSystem.explosions, new Vector2(480, -80), 70, t - hitAt, 8002, 'missile');
        }
        break;
      }
      case 'VIS-09': {
        setPose(player, 0, 0, 0);
        setPose(enemy, 1200, 0, Math.PI);
        const initialFlux = player.spec.maxFlux * 0.82;
        player.flux.softFlux = initialFlux * 0.55;
        player.flux.hardFlux = initialFlux * 0.45;
        player.flux.isVenting = false;
        player.flux.ventProgress = 0;
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
        if (destroyAge >= 0 && destroyAge < 2.25) {
          this.addExplosion(engine.fxSystem.explosions, enemy.pos.clone(), 190, destroyAge, 10001, 'ship', enemy.spec.id);
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
        player.hullHp = player.maxHullHp * 0.72;
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
        enemy.shield.setActive(cycle > 0.25 && cycle < 0.82);
        // Poses/projectiles are scripted, but shield deployment owns persistent state.
        // Do not reset it every frame or leave the shutdown/re-raise timer frozen.
        player.shield.update(dt, player.facingRad, player.facingRad);
        enemy.shield.update(dt, enemy.facingRad, enemy.facingRad);
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
            width: beamSpec.beamWidth ?? 25,
            elapsedTime: t - 4.1,
            textureType: beamSpec.textureType,
            textureScrollSpeed: beamSpec.textureScrollSpeed,
            pixelsPerTexel: beamSpec.pixelsPerTexel,
            fringeColor: beamSpec.fringeColor,
            coreColor: beamSpec.coreColor,
            glowColor: beamSpec.glowColor,
            hitGlowRadius: beamSpec.hitGlowRadius,
            hitGlowBrightenDuration: beamSpec.hitGlowBrightenDuration,
            brightness: 1,
            hitGlowBrightness: (beamSpec.hitGlowBrightenDuration ?? 1) <= 0 ? 1 : clamp01((t - 4.1) / (beamSpec.hitGlowBrightenDuration ?? 1)),
            hitGlowSizeMult: 1,
            useGlowColorForHitGlow: beamSpec.useGlowColorForHitGlow,
            fringeScrollSpeedMult: beamSpec.fringeScrollSpeedMult,
            coreWidthMult: beamSpec.coreWidthMult,
            isHitting: true
          });
        }
        break;
      }
    }
  }

  private addMuzzle(target: MuzzleFlash[], origin: Vector2, angle: number, spec: WeaponSpec, age: number, id: number): void {
    if (age < 0 || age > 0.12) return;
    const life = 0.12 - age;
    target.push({ id, specId: spec.id, pos: origin.clone(), angleRad: angle, size: spec.muzzleFlashSize || 70, color: spec.muzzleFlashColor ? [...spec.muzzleFlashColor] : [...spec.color], life, maxLife: 0.12 });
  }

  private addExplosion(
    target: ExplosionAnimation[],
    pos: Vector2,
    radius: number,
    age: number,
    id: number,
    visualKind: 'impact' | 'missile' | 'ship' = 'impact',
    sourceShipId?: string
  ): void {
    const maxLife = 0.95;
    const random = new SimulationRandom(this.seed ^ id);
    if (visualKind === 'ship' && sourceShipId) {
      const spec = contentRegistry.getShip(sourceShipId);
      if (spec) {
        const explosion = createShipExplosion(spec, pos, new Vector2(), random);
        explosion.id = id;
        explosion.life -= age;
        if (explosion.life > 0) target.push(explosion);
        return;
      }
    }
    if (age < 0 || age > maxLife) return;
    const progress = clamp01(age / maxLife);
    target.push({
      id,
      pos: pos.clone(),
      visualKind,
      sourceShipId,
      puffs: createExplosionPuffs(radius * 2, random, true),
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
