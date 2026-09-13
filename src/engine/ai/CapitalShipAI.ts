import { Ship } from '../simulation/Ship';

/**
 * 战列舰专属战术 AI (CapitalShipAI)
 * 具备深刻理解《远行星号》主力舰战术的逻辑:
 * 1. 攻势级 AI: 侵略性肉搏风格，强行前压，寻找时机点火【冲刺推进】突破阵线，近距离 TPC + 重炮齐射摧毁敌舰。
 * 2. 典范级 AI: 距离控制大师，保持 800-1100 码最佳狙击距离，利用 360 度全向盾抗压；
 *    当幅能偏高或遭遇大爆发时果断展开【堡垒护盾】，吸收完火力后撤盾反击。
 */
export class CapitalShipAI {
  public ship: Ship;
  public targetShip: Ship;

  private ventCheckTimer = 0;
  private thinkTimer = 0;

  constructor(ship: Ship, targetShip: Ship) {
    this.ship = ship;
    this.targetShip = targetShip;
  }

  public update(dt: number) {
    if (this.ship.isDead || this.targetShip.isDead) return;

    this.thinkTimer -= dt;
    this.ventCheckTimer -= dt;

    const toTarget = this.targetShip.pos.clone().sub(this.ship.pos);
    const dist = toTarget.length();
    const targetAngle = toTarget.heading();

    // 默认瞄准敌舰中心
    this.ship.aimTargetWorld.copy(this.targetShip.pos);

    // 1. 转向控制：始终将最强火力弧面对敌方
    let angleDiff = targetAngle - this.ship.facingRad;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    if (Math.abs(angleDiff) > 0.05) {
      this.ship.turnInput = Math.sign(angleDiff);
    } else {
      this.ship.turnInput = 0;
    }

    // 2. 机动与战术系统逻辑差异化
    if (this.ship.spec.id === 'onslaught') {
      this.updateOnslaughtTactics(dist, angleDiff);
    } else if (this.ship.spec.id === 'paragon') {
      this.updateParagonTactics(dist, angleDiff);
    } else if (this.ship.spec.id === 'doom') {
      this.updateDoomTactics(dist, angleDiff);
    }

    // 3. 火控与射击决策
    // 当敌舰位于前向有效火力扇面内且未相位潜航时，激活主火控
    this.ship.isFiringMain = (Math.abs(angleDiff) < 0.45 && dist < 1200 && !this.ship.isPhased);

    // 4. 主动散热排散决策
    if (this.ventCheckTimer <= 0) {
      this.ventCheckTimer = 1.0;
      // 当敌舰过载，或者自身幅能高而距离远且敌舰未开火时，主动排散
      if (this.ship.flux.fluxPercent > 0.8 && (dist > 1200 || this.targetShip.flux.isOverloaded)) {
        this.ship.startVenting();
      }
    }
  }

  private updateOnslaughtTactics(dist: number, angleDiff: number) {
    // 攻势级渴望贴脸肉搏
    const idealDist = 550;
    if (dist > idealDist + 100) {
      this.ship.throttle = 1.0; // 往前冲
    } else if (dist < idealDist - 100) {
      this.ship.throttle = -0.3; // 保持身位
    } else {
      this.ship.throttle = 0.2;
    }

    // 冲刺推进系统 (Burn Drive) 触发时机:
    // 朝向大致对准目标且距离在 700 ~ 1300 之间，立刻发动蛮牛冲撞！
    if (
      !this.ship.system.isActive &&
      !this.ship.system.isCoolingDown &&
      Math.abs(angleDiff) < 0.25 &&
      dist > 750 &&
      dist < 1400
    ) {
      this.ship.system.activate();
    }

    // 攻势护盾决策: 幅能低于 85% 且处于交火距离时开启
    if (this.ship.flux.fluxPercent < 0.85 && dist < 1200) {
      this.ship.shield.setActive(true);
    } else {
      this.ship.shield.setActive(false);
    }
  }

  private updateParagonTactics(dist: number, _angleDiff: number) {
    // 典范级渴望保持 800 - 1000 码的最佳激光/长矛焦距
    const idealDist = 900;
    if (dist > idealDist + 80) {
      this.ship.throttle = 1.0;
    } else if (dist < idealDist - 80) {
      this.ship.throttle = -0.7; // 稳健风筝倒车
    } else {
      this.ship.throttle = 0;
    }

    // 典范常态开启全向 360 度护盾
    if (!this.ship.flux.isOverloaded && !this.ship.flux.isVenting) {
      this.ship.shield.setActive(true);
    }

    // 堡垒护盾 (Fortress Shield) 激活时机:
    // 当幅能超过 65% 且敌方火力凶猛，或者敌舰开启冲刺推进撞过来时，激活金身！
    if (
      !this.ship.system.isActive &&
      !this.ship.system.isCoolingDown &&
      (this.ship.flux.fluxPercent > 0.65 || (this.targetShip.system.isActive && dist < 700))
    ) {
      this.ship.system.activate();
    }
  }

  private updateDoomTactics(dist: number, _angleDiff: number) {
    // 厄运级相位战术：利用相位潜航高速机动绕后，伺机布设水雷与齐射死神鱼雷
    const idealDist = 600;
    if (dist > idealDist + 100) {
      this.ship.throttle = 1.0;
    } else if (dist < idealDist - 100) {
      this.ship.throttle = -0.4;
    } else {
      this.ship.throttle = 0.5;
    }

    // 1. 相位潜航 (Phase Cloak) 决策:
    // 当自身在敌舰重炮射程内且幅能较低时，潜入相位空间高速机动
    const shouldPhase = (dist < 1100 && this.ship.flux.fluxPercent < 0.65 && !this.ship.flux.isOverloaded);
    const mustUnphase = this.ship.flux.fluxPercent > 0.82;
    if (mustUnphase) {
      this.ship.shield.setActive(false);
    } else if (shouldPhase && !this.ship.shield.isActive) {
      this.ship.shield.setActive(true);
    }

    // 2. 空雷突袭 (Mine Strike) 决策:
    // 当充能可用且距离在 1200 以内时，在敌舰附近空间折跃布雷
    if (this.ship.system.type === 'MINE_STRIKE' && this.ship.system.charges > 0 && !this.ship.system.isCoolingDown && dist < 1200) {
      this.ship.system.activate();
    }
  }
}
