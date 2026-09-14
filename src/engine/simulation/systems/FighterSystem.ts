import { Vector2 } from '../../math/Vector2';
import { FighterAIState, BomberAIState, TacticalOrder, ContrailParticle, FlightDeckWing } from '../CombatTypes';
import { Ship } from '../Ship';
import { Projectile, Beam } from '../Weapon';
import { modManager } from '../../modding/ModManager';
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
  getPlayerPos: () => Vector2;
  recordFighterDestroyed: (isPlayerCraft: boolean) => void;
  recordFighterRebuilt: (isPlayerCraft: boolean) => void;
  destructionSideEffectsEnabled: () => boolean;
}

/**
 * 远行星号官方舰载机联队与机库甲板系统 (FighterSystem)
 * 深度实现:
 * 1. 官方航母机库甲板 (Flight Decks) 与战备重建率 (Carrier Replacement Rate - CRR)
 * 2. 战机战损进入机库队列倒计时重建，倒计时结束从母舰机库弹射出击
 * 3. 敌我双方航空中队全自主空战 AI：拦截导弹 (INTERCEPT)、咬尾缠斗 (DOGFIGHT)、掠袭战舰 (ATTACK) 与伴随护航 (ESCORT)
 * 4. 鱼雷轰炸机突击发射与返航甲板补给装填循环
 */
export class FighterSystem {
  public fighters: Ship[] = [];
  public fighterAIModes: Map<string, FighterAIState> = new Map();
  public bombers: Ship[] = [];
  public bomberAIModes: Map<string, BomberAIState> = new Map();
  public isFighterRecall = false;

  public playerWings: FlightDeckWing[] = [];
  public enemyWings: FlightDeckWing[] = [];

  constructor(
    private readonly random = new SimulationRandom(),
    private readonly visualRandom = new SimulationRandom(0xf17e7a11)
  ) {}

  public init(playerShip: Ship, enemyShip?: Ship) {
    this.fighters = [];
    this.bombers = [];
    this.fighterAIModes.clear();
    this.bomberAIModes.clear();
    this.isFighterRecall = false;

    // 只有配备机库甲板或改装机库的舰船才搭载联队 (典范与厄运为纯战列/相位舰，无机库)
    const hasPlayerFlightDecks = playerShip.spec.id === 'onslaught' || (playerShip.spec.fighterBays && playerShip.spec.fighterBays > 0);

    // 1. 初始化玩家航母甲板联队
    if (hasPlayerFlightDecks) {
      this.playerWings = [
        {
          wingId: 'player_broadsword_wing',
          name: '阔剑重型战斗机中队',
          specId: 'broadsword',
          isPlayer: true,
          maxCrafts: 3,
          crr: 1.0,
          rebuildQueue: []
        },
        {
          wingId: 'player_dagger_wing',
          name: '匕首鱼雷轰炸机中队',
          specId: 'dagger',
          isPlayer: true,
          maxCrafts: 2,
          crr: 1.0,
          rebuildQueue: []
        }
      ];
    } else {
      this.playerWings = [];
    }

    // 2. 初始化敌方航母甲板联队 (3 架敌方阔剑拦截机)
    this.enemyWings = [
      {
        wingId: 'enemy_broadsword_wing',
        name: '敌方拦截机中队',
        specId: 'broadsword',
        isPlayer: false,
        maxCrafts: 3,
        crr: 1.0,
        rebuildQueue: []
      }
    ];

    const ftrSpec = modManager.getShip('broadsword');
    if (ftrSpec) {
      // 部署 3 架玩家阔剑重型战斗机伴随旗舰 (仅限搭载机库的旗舰)
      if (hasPlayerFlightDecks) {
        const playerOffsets = [
          new Vector2(-100, 90),
          new Vector2(-150, 150),
          new Vector2(-150, -150)
        ];
        for (let i = 0; i < 3; i++) {
          const spawnPos = playerShip.pos.clone().add(playerOffsets[i]);
          const ftr = new Ship(`player_ftr_${i}`, ftrSpec, true, spawnPos, playerShip.facingRad, this.random);
          this.fighters.push(ftr);
          this.fighterAIModes.set(ftr.id, { state: 'ESCORT', timer: this.random.next() * 2 });
        }
      }

      // 部署 3 架敌方阔剑拦截机护卫敌舰
      if (enemyShip) {
        const enemyOffsets = [
          new Vector2(-100, 90).rotate(Math.PI),
          new Vector2(-150, 150).rotate(Math.PI),
          new Vector2(-150, -150).rotate(Math.PI)
        ];
        for (let i = 0; i < 3; i++) {
          const spawnPos = enemyShip.pos.clone().add(enemyOffsets[i]);
          const eFtr = new Ship(`enemy_ftr_${i}`, ftrSpec, false, spawnPos, enemyShip.facingRad, this.random);
          this.fighters.push(eFtr);
          this.fighterAIModes.set(eFtr.id, { state: 'ESCORT', timer: this.random.next() * 2 });
        }
      }
    }

    const bmrSpec = modManager.getShip('dagger');
    if (bmrSpec && hasPlayerFlightDecks) {
      // 部署 2 架匕首级鱼雷轰炸机
      const bmrOffsets = [
        new Vector2(-190, 70),
        new Vector2(-190, -70)
      ];
      for (let i = 0; i < 2; i++) {
        const spawnPos = playerShip.pos.clone().add(bmrOffsets[i]);
        const bmr = new Ship(`player_bmr_${i}`, bmrSpec, true, spawnPos, playerShip.facingRad, this.random);
        this.bombers.push(bmr);
        this.bomberAIModes.set(bmr.id, { state: 'ESCORT', timer: this.random.next() * 2, hasTorpedo: true });
      }
    }
  }

  public toggleRecall(
    addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color: [number, number, number]) => void
  ) {
    this.isFighterRecall = !this.isFighterRecall;
    if (this.isFighterRecall) {
      sound.play('fighter_recall', 0.85);
      addRadioMessage('舰载机调度台', 'PLAYER', '全编队注意！立即停止交战，全速返航母舰甲板！', [100, 220, 255]);
    } else {
      sound.play('fighter_deploy', 0.85);
      addRadioMessage('舰载机调度台', 'PLAYER', '解除召回限制！全机中队自主锁定敌机与敌舰自由猎杀！', [120, 255, 160]);
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
    const ftrSpec = modManager.getShip('broadsword');
    const bmrSpec = modManager.getShip('dagger');

    for (let i = this.fighters.length - 1; i >= 0; i--) {
      if (!this.fighters[i].isDead) continue;
      this.fighterAIModes.delete(this.fighters[i].id);
      this.fighters.splice(i, 1);
    }
    for (let i = this.bombers.length - 1; i >= 0; i--) {
      if (!this.bombers[i].isDead) continue;
      this.bomberAIModes.delete(this.bombers[i].id);
      this.bombers.splice(i, 1);
    }

    // 1. 处理玩家母舰甲板联队
    for (const wing of this.playerWings) {
      const isBroadsword = wing.specId === 'broadsword';
      const aliveList = isBroadsword
        ? this.fighters.filter(f => f.isPlayer && !f.isDead)
        : this.bombers.filter(b => b.isPlayer && !b.isDead);

      const totalCrafts = aliveList.length + wing.rebuildQueue.length;
      let missing = wing.maxCrafts - totalCrafts;

      while (missing > 0 && !playerShip.isDead) {
        const baseTime = isBroadsword ? 12.0 : 16.0;
        const rebuildTime = baseTime / Math.max(0.25, wing.crr);
        wing.rebuildQueue.push({
          craftId: this.random.nextId('p_rebuild'),
          timer: rebuildTime,
          maxTimer: rebuildTime
        });
        // 损失战机导致 CRR 战备率轻微衰减
        wing.crr = Math.max(0.25, wing.crr - 0.04);
        missing--;
      }

      // 甲板空闲或满编时，战备率缓慢自然回升
      if (wing.rebuildQueue.length === 0) {
        wing.crr = Math.min(1.0, wing.crr + 0.015 * dt);
      }

      // 更新机库重建倒计时
      for (let i = wing.rebuildQueue.length - 1; i >= 0; i--) {
        const item = wing.rebuildQueue[i];
        item.timer -= dt;
        if (item.timer <= 0 && !playerShip.isDead) {
          wing.rebuildQueue.splice(i, 1);
          // 从母舰机库弹射升空
          const spawnPos = playerShip.pos.clone().add(new Vector2(-60, (this.random.next() - 0.5) * 40).rotate(playerShip.facingRad));
          if (isBroadsword && ftrSpec) {
            const newFtr = new Ship(this.random.nextId('player_ftr_rep'), ftrSpec, true, spawnPos, playerShip.facingRad, this.random);
            newFtr.vel = playerShip.vel.clone().add(Vector2.fromAngle(playerShip.facingRad, 140));
            this.fighters.push(newFtr);
            this.fighterAIModes.set(newFtr.id, { state: 'ESCORT', timer: 2.0 });
            fx.recordFighterRebuilt(true);
          } else if (!isBroadsword && bmrSpec) {
            const newBmr = new Ship(this.random.nextId('player_bmr_rep'), bmrSpec, true, spawnPos, playerShip.facingRad, this.random);
            newBmr.vel = playerShip.vel.clone().add(Vector2.fromAngle(playerShip.facingRad, 120));
            this.bombers.push(newBmr);
            this.bomberAIModes.set(newBmr.id, { state: 'ESCORT', timer: 2.0, hasTorpedo: true });
            fx.recordFighterRebuilt(true);
          }

          sound.play('fighter_deploy', 0.85);
          fx.addFloatingText(playerShip.pos.clone(), `${wing.name} 补充出击!`, [120, 255, 180], 13, 2.0);
          fx.addRadioMessage('机库调度台', 'PLAYER', `新造 ${wing.name} 机体已完成甲板检修并弹射出击！`, [120, 255, 180]);
        }
      }
    }

    // 2. 处理敌方母舰甲板联队
    for (const wing of this.enemyWings) {
      const aliveList = this.fighters.filter(f => !f.isPlayer && !f.isDead);
      const totalCrafts = aliveList.length + wing.rebuildQueue.length;
      let missing = wing.maxCrafts - totalCrafts;

      while (missing > 0 && !enemyShip.isDead) {
        const baseTime = 13.0;
        const rebuildTime = baseTime / Math.max(0.25, wing.crr);
        wing.rebuildQueue.push({
          craftId: this.random.nextId('e_rebuild'),
          timer: rebuildTime,
          maxTimer: rebuildTime
        });
        wing.crr = Math.max(0.25, wing.crr - 0.04);
        missing--;
      }

      if (wing.rebuildQueue.length === 0) {
        wing.crr = Math.min(1.0, wing.crr + 0.015 * dt);
      }

      for (let i = wing.rebuildQueue.length - 1; i >= 0; i--) {
        const item = wing.rebuildQueue[i];
        item.timer -= dt;
        if (item.timer <= 0 && !enemyShip.isDead && ftrSpec) {
          wing.rebuildQueue.splice(i, 1);
          const spawnPos = enemyShip.pos.clone().add(new Vector2(-60, (this.random.next() - 0.5) * 40).rotate(enemyShip.facingRad));
          const newEFtr = new Ship(this.random.nextId('enemy_ftr_rep'), ftrSpec, false, spawnPos, enemyShip.facingRad, this.random);
          newEFtr.vel = enemyShip.vel.clone().add(Vector2.fromAngle(enemyShip.facingRad, 140));
          this.fighters.push(newEFtr);
          this.fighterAIModes.set(newEFtr.id, { state: 'ESCORT', timer: 2.0 });
          fx.recordFighterRebuilt(false);
        }
      }
    }
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

      const isPlayer = ftr.isPlayer;
      const friendlyCapital = isPlayer ? playerShip : enemyShip;
      const hostileCapital = isPlayer ? enemyShip : playerShip;

      let modeData = this.fighterAIModes.get(ftr.id);
      if (!modeData) {
        modeData = { state: 'ESCORT', timer: 0 };
        this.fighterAIModes.set(ftr.id, modeData);
      }
      modeData.timer -= dt;

      // 敌方来袭重型导弹检测 (点防近程威胁)
      const nearbyHostileMissile = projectiles.find(
        (p) => p.isRocket && p.isPlayer !== isPlayer && p.pos.distanceTo(ftr.pos) < 680
      );

      // 敌方航空中队检测 (空战咬尾目标)
      const opposingCrafts = isPlayer
        ? this.fighters.filter(f => !f.isPlayer && !f.isDead)
        : [...this.fighters.filter(f => f.isPlayer && !f.isDead), ...this.bombers.filter(b => !b.isDead)];

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
      if (nearbyHostileMissile) {
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
      else if (isPlayer && this.isFighterRecall) {
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
      // 3. 空空格斗咬尾 (Dogfight): 发现敌方战机/轰炸机，进入高速咬尾火神扫射
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
      // 4. 敌舰在攻击范围内：发起俯冲扫射突击 (Attack Run)
      else if (!hostileCapital.isDead && ftr.pos.distanceTo(hostileCapital.pos) < 1800) {
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
      // 5. 巡弋编队护卫母舰 (Escort Formation)
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

      ftr.update(dt, hostileCapital, spawnProj, spawnBeam, spawnFlash);

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
            color: isPlayer ? [240, 180, 100] : [255, 100, 80]
          });
        }
      }

      if (ftr.hullHp <= 0 && !ftr.isDead && fx.destructionSideEffectsEnabled()) {
        ftr.isDead = true;
        fx.recordFighterDestroyed(ftr.isPlayer);
        sound.playAtPos('explosion', ftr.pos, fx.getPlayerPos(), 0.45);
        fx.spawnAuthenticExplosion(ftr.pos, 42, [255, 180, 50], true);
        fx.spawnDebris(ftr.pos, 8, [130, 115, 100], 100);
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

      let mode = this.bomberAIModes.get(bmr.id);
      if (!mode) {
        mode = { state: 'ESCORT', timer: 0, hasTorpedo: true };
        this.bomberAIModes.set(bmr.id, mode);
      }
      mode.timer -= dt;

      // 检查战术地图对轰炸机的特定指令 (Tactical Orders)
      const specificOrder = fx.getOrder(bmr.id);
      const fleetOrder = fx.getOrder('fleet');
      const activeOrder = specificOrder || fleetOrder;

      // 1. 召回模式或正在重载修理
      if (mode.state === 'DOCKED') {
        bmr.hullHp = Math.min(bmr.spec.hitpoints, bmr.hullHp + 60 * dt);
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
          mode.state = this.isFighterRecall ? 'ESCORT' : 'ATTACK_RUN';
          mode.timer = 12.0;
          fx.addFloatingText(bmr.pos, 'DAGGER ARMED & LAUNCHING', [100, 220, 255], 13, 1.8);
          sound.playAtPos('fighter_deploy', bmr.pos, fx.getPlayerPos(), 0.6);
          fx.addRadioMessage('匕首轰炸分队', 'PLAYER', '重型鱼雷补充完毕，重新出击！', [100, 220, 255]);
        }
      } else if (this.isFighterRecall || mode.state === 'RETURN_TO_REARM' || !mode.hasTorpedo) {
        // 返航母舰甲板
        const dockPoint = playerShip.pos.clone().add(new Vector2(-120, 0).rotate(playerShip.facingRad));
        const toDock = dockPoint.sub(bmr.pos);
        const dist = toDock.length();

        if (dist < 70 && !mode.hasTorpedo) {
          mode.state = 'DOCKED';
          mode.timer = 3.2;
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
      } else if (activeOrder && activeOrder.type === 'WAYPOINT' && activeOrder.targetPos) {
        // 执行战术航路点机动
        const toWp = activeOrder.targetPos.clone().sub(bmr.pos);
        const dist = toWp.length();
        if (dist < 90) {
          fx.cancelOrder(bmr.id);
        } else {
          const targetAngle = toWp.heading();
          let angleDiff = targetAngle - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff);
          bmr.throttle = 1.0;
        }
      } else if (!enemyShip.isDead && mode.hasTorpedo) {
        // 发起鱼雷突袭攻击循环 (Torpedo Attack Run)
        mode.state = 'ATTACK_RUN';
        const targetShip = enemyShip;
        const toEnemy = targetShip.pos.clone().sub(bmr.pos);
        const dist = toEnemy.length();
        bmr.aimTargetWorld = targetShip.pos.clone();

        const targetAngle = toEnemy.heading();
        let angleDiff = targetAngle - bmr.facingRad;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        bmr.turnInput = Math.sign(angleDiff);
        bmr.throttle = 1.0;

        // 进入 650 SU 鱼雷射界并迎头对准 (角度差 < 20度): 发射阿特罗波斯高爆鱼雷！
        if (dist < 650 && Math.abs(angleDiff) < 0.35 && mode.hasTorpedo) {
          bmr.isFiringMain = true;
          mode.hasTorpedo = false;
          mode.state = 'RETURN_TO_REARM';
          fx.addFloatingText(bmr.pos, 'ATROPOS TORPEDO LAUNCHED!', [255, 140, 40], 14, 2.0);
          fx.addCameraShake(3, 0.2);
          fx.addRadioMessage('匕首轰炸分队', 'PLAYER', '阿特罗波斯重型鱼雷已齐射！脱离攻击航线！', [255, 180, 60]);
        } else {
          bmr.isFiringMain = false;
        }
      } else {
        // 巡航编队护卫
        mode.state = 'ESCORT';
        const slot = escortSlots[i % escortSlots.length];
        const targetWorld = playerShip.pos.clone().add(slot.clone().rotate(playerShip.facingRad));
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
          let angleDiff = playerShip.facingRad - bmr.facingRad;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          bmr.turnInput = Math.sign(angleDiff) * 0.4;
          bmr.throttle = playerShip.throttle * 0.8;
        }
      }

      bmr.update(dt, enemyShip, spawnProj, spawnBeam, spawnFlash);

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
        bmr.isDead = true;
        fx.recordFighterDestroyed(bmr.isPlayer);
        sound.playAtPos('fighter_explosion', bmr.pos, fx.getPlayerPos(), 0.5);
        fx.spawnAuthenticExplosion(bmr.pos, 50, [255, 120, 50], true);
        fx.spawnDebris(bmr.pos, 10, [140, 160, 190], 120);
      }
    }
  }
}
