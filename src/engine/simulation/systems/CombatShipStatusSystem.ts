import { Vector2 } from '../../math/Vector2';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';
import { i18n } from '../../i18n/LocalizationManager';
import { CombatFXSystem } from './CombatFXSystem';
import { SimulationRandom } from '../SimulationRandom';

export interface ShipStatusContext {
  fx: CombatFXSystem;
  playerShip: Ship;
  enemyShip: Ship;
  addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color?: [number, number, number]) => void;
  deployMine: (targetPos: Vector2, sourceShip: Ship) => void;
  statsTracker?: any;
  combatRandom: SimulationRandom;
  visualRandom: SimulationRandom;
}

/**
 * 战舰状态机特效与损管播报系统 (CombatShipStatusSystem)
 * 负责舰船过载电弧、主动排能等离子尾气、舰体黑烟、装甲剥落烟雾、空雷战术触发及损管抢修播报。
 */
export class CombatShipStatusSystem {
  public update(dt: number, ctx: ShipStatusContext) {
    // 沉浸音频：玩家舰船处于过载、主动排能或相位潜航时，全局音效进入低通滤波
    sound.setMuffled(ctx.playerShip.flux.isOverloaded || ctx.playerShip.flux.isVenting || ctx.playerShip.isPhased);

    const ships = [ctx.playerShip, ctx.enemyShip];

    for (const ship of ships) {
      if (ship.isDead) continue;

      // 舰船状态改变检测浮动战斗文字
      if (!ship.prevOverloaded && ship.flux.isOverloaded) {
        if (ctx.statsTracker) {
          ctx.statsTracker.recordOverload(!ship.isPlayer);
        }
        ctx.fx.addFloatingText(
          ship.pos.clone().add(new Vector2(0, -ship.spec.collisionRadius * 0.7)),
          `OVERLOADED! (${ship.flux.overloadDuration.toFixed(1)}s)`,
          [255, 60, 60],
          16,
          2.2
        );
        if (ship.isPlayer) {
          ctx.addRadioMessage('损管警报', 'PLAYER', '警告！电弧熔断！核心幅能系统发生深度过载！', [255, 80, 80]);
        } else {
          ctx.addRadioMessage('战术火控', 'PLAYER', '目标舰护盾完全崩溃！敌舰已陷入深度过载！', [120, 255, 140]);
        }
      }
      ship.prevOverloaded = ship.flux.isOverloaded;

      if (!ship.prevVenting && ship.flux.isVenting) {
        ctx.fx.addFloatingText(
          ship.pos.clone().add(new Vector2(0, -ship.spec.collisionRadius * 0.7)),
          'VENTING FLUX',
          [100, 220, 255],
          14,
          1.6
        );
        if (ship.isPlayer) {
          ctx.addRadioMessage('轮机工段', 'PLAYER', '正在紧急主动排散幅能...', [100, 220, 255]);
        }
      }
      ship.prevVenting = ship.flux.isVenting;

      // 1. 舰船过载剧烈电弧失控
      if (ship.flux.isOverloaded) {
        if (ctx.visualRandom.next() < dt * 18) {
          const r1 = (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.3;
          const r2 = (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.3;
          const start = ship.pos.clone().add(new Vector2(r1, r2).rotate(ship.facingRad));
          const end = start.clone().add(new Vector2(
            (ctx.visualRandom.next() - 0.5) * 60,
            (ctx.visualRandom.next() - 0.5) * 60
          ));
          ctx.fx.spawnEmpArc(start, end, {
            coreColor: [255, 255, 255],
            glowColor: [80, 180, 255],
            thickness: 1.8,
            life: 0.12
          });
          ctx.fx.spawnSparks(end, 4, [100, 200, 255]);
        }
      }

      // 2. 舰船主动排散表面静电泄放微电弧 (严格对齐 D.java: getEMPDisplayMult)
      if (ship.flux.isVenting) {
        const empMult = ship.flux.totalFlux / Math.max(1, ship.flux.baseDissipation * 2.0);
        const arcRate = Math.min(1.0, empMult > 2.0 ? 1.0 : empMult * 0.5);
        if (ctx.visualRandom.next() < dt * 14 * arcRate) {
          const r1 = (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.1;
          const r2 = (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 1.1;
          const start = ship.pos.clone().add(new Vector2(r1, r2).rotate(ship.facingRad));
          const end = start.clone().add(new Vector2(
            (ctx.visualRandom.next() - 0.5) * 45,
            (ctx.visualRandom.next() - 0.5) * 45
          ));
          ctx.fx.spawnEmpArc(start, end, {
            coreColor: [255, 255, 255],
            glowColor: [180, 50, 255],
            thickness: 1.4,
            life: 0.09
          });
        }
      }

      // 3. 舰船严重受创时舰体裂隙冒黑烟与火星
      const damageRatio = 1.0 - (ship.hullHp / ship.spec.hitpoints);
      if (damageRatio > 0.35 && ctx.visualRandom.next() < dt * damageRatio * 16) {
        const ventOff = new Vector2(
          (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 0.8,
          (ctx.visualRandom.next() - 0.5) * ship.spec.collisionRadius * 0.8
        ).rotate(ship.facingRad);
        const ventPos = ship.pos.clone().add(ventOff);

        ctx.fx.contrails.push({
          pos: ventPos,
          vel: Vector2.fromAngle(
            ship.facingRad + Math.PI + (ctx.visualRandom.next() - 0.5) * 1.2,
            25 + ctx.visualRandom.next() * 35
          ).addScaled(ship.vel, 0.3),
          life: 0.9 + ctx.visualRandom.next() * 0.6,
          maxLife: 1.5,
          size: 10 + ctx.visualRandom.next() * 8,
          maxSize: 32 + ctx.visualRandom.next() * 18,
          alpha: 0.75 * damageRatio,
          rotation: ctx.visualRandom.next() * Math.PI * 2,
          color: [35, 35, 40]
        });

        if (ship.hullHp < ship.spec.hitpoints * 0.45 && ctx.visualRandom.next() < 0.6) {
          ctx.fx.particles.push({
            pos: ventPos.clone(),
            vel: Vector2.fromAngle(ctx.visualRandom.next() * Math.PI * 2, 40 + ctx.visualRandom.next() * 60).addScaled(ship.vel, 0.5),
            life: 0.2 + ctx.visualRandom.next() * 0.25,
            maxLife: 0.45,
            size: 3 + ctx.visualRandom.next() * 4,
            color: [255, 140 + ctx.visualRandom.next() * 80, 30],
            alpha: 1.0
          });
        }
      }

      // 3.5 穿透/剥落装甲格持续逸散微弱青烟与熔渣火星
      if (ship.armor && ctx.visualRandom.next() < dt * 6) {
        const armor = ship.armor;
        const randC = Math.floor(ctx.visualRandom.next() * armor.cols);
        const randR = Math.floor(ctx.visualRandom.next() * armor.rows);
        const cellVal = armor.getCell(randC, randR);
        if (cellVal < armor.maxCellArmor * 0.25) {
          const halfW = (armor.cols * armor.cellWidth) / 2;
          const halfH = (armor.rows * armor.cellHeight) / 2;
          const localPos = new Vector2(
            -halfW + (randC + 0.5) * armor.cellWidth,
            -halfH + (randR + 0.5) * armor.cellHeight
          ).rotate(ship.facingRad);
          const worldPos = ship.pos.clone().add(localPos);

          ctx.fx.contrails.push({
            pos: worldPos,
            vel: Vector2.fromAngle(ship.facingRad + Math.PI + (ctx.visualRandom.next() - 0.5) * 1.5, 15 + ctx.visualRandom.next() * 20).addScaled(ship.vel, 0.4),
            life: 0.5 + ctx.visualRandom.next() * 0.3,
            maxLife: 0.8,
            size: 6 + ctx.visualRandom.next() * 4,
            maxSize: 18 + ctx.visualRandom.next() * 8,
            alpha: 0.5,
            rotation: ctx.visualRandom.next() * Math.PI * 2,
            color: [45, 45, 50]
          });

          if (ctx.visualRandom.next() < 0.4) {
            ctx.fx.particles.push({
              pos: worldPos.clone(),
              vel: Vector2.fromAngle(ctx.visualRandom.next() * Math.PI * 2, 20 + ctx.visualRandom.next() * 30).addScaled(ship.vel, 0.4),
              life: 0.2 + ctx.visualRandom.next() * 0.2,
              maxLife: 0.4,
              size: 2 + ctx.visualRandom.next() * 2,
              color: [255, 110 + ctx.visualRandom.next() * 60, 30],
              alpha: 0.9
            });
          }
        }
      }

      // 4. 空雷突袭战术系统触发响应
      if (ship.system.type === 'MINE_STRIKE' && ship.system.isActive) {
        ship.system.isActive = false;
        let deployPos: Vector2;
        if (ship.isPlayer) {
          deployPos = ship.aimTargetWorld.clone();
        } else {
          const enemyTarget = ship.id === ctx.playerShip.id ? ctx.enemyShip : ctx.playerShip;
          const offsetAngle = enemyTarget.facingRad + Math.PI + (ctx.combatRandom.next() - 0.5) * 1.0;
          deployPos = enemyTarget.pos.clone().add(Vector2.fromAngle(offsetAngle, 220 + ctx.combatRandom.next() * 100));
        }
        ctx.deployMine(deployPos, ship);
      }

      // 5. 挂点抢修完毕重新上线通知 (严格对齐 Starsector 损管系统)
      if (ship.justRepairedMounts && ship.justRepairedMounts.length > 0) {
        for (const mount of ship.justRepairedMounts) {
          const mountWorldPos = ship.pos.clone().add(mount.relativePos.clone().rotate(ship.facingRad));
          ctx.fx.addFloatingText(mountWorldPos, `ONLINE: ${mount.slotId}`, [80, 255, 120], 13, 1.6);
          ctx.fx.spawnSparks(mountWorldPos, 15, [100, 255, 180]);
          const weaponName = i18n.t(mount.spec.nameKey).split(' ')[0] || mount.slotId;
          sound.play('ui_button_press', 0.65);
          if (ship.isPlayer) {
            ctx.addRadioMessage('损管汇报', 'PLAYER', `挂点 [${mount.slotId} - ${weaponName}] 抢修完毕，火控重新上线！`, [80, 255, 140]);
          }
        }
        ship.justRepairedMounts = [];
      }
    }
  }
}
