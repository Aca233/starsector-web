import { installedHullMods } from '../../extensions/HullMods';
import type { SystemWorld } from '../../extensions/ship-systems/Types';
import type { Projectile } from '../Weapon';
import { ENGINE_VISUAL_PROFILES } from '../../visual/VisualProfiles';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../Ship';
import { sound } from '../../audio/SoundManager';
import { i18n } from '../../i18n/LocalizationManager';
import { CombatFXSystem } from './CombatFXSystem';
import { SimulationRandom } from '../SimulationRandom';

export interface ShipStatusContext {
  spawnNativeMine?: SystemWorld['spawnNativeMine'];
  spawnShip?: import('../../extensions/ship-systems/Types').SystemWorld['spawnShip'];
  addCombatEffect?: import('../../extensions/ship-systems/Types').SystemWorld['addCombatEffect'];
  fx: CombatFXSystem;
  playerShip: Ship;
  enemyShip: Ship;
  ships?: Ship[];
  /** Consume component events for fighters too, without applying capital status FX to them. */
  componentShips?: Ship[];
  projectiles?: Projectile[];
  asteroids?: readonly { pos: Vector2; radius: number; hp?: number }[];
  addRadioMessage: (sender: string, faction: 'PLAYER' | 'ENEMY' | 'HQ', text: string, color?: [number, number, number]) => void;
  deployReserveWing?: (carrier: Ship) => void;
  recoverWingCraft?: (carrier: Ship, craft: Ship) => void;
  detachWingCraft?: (carrier: Ship, craft: Ship) => boolean;
  retireCombatCraft?: (craft: Ship) => void;
  advanceDroneLauncher?: (carrier: Ship, system: Ship['system'], dt: number) => void;
  deployMine: (targetPos: Vector2, sourceShip: Ship, range?: number) => void;
  statsTracker?: any;
  combatRandom: SimulationRandom;
  visualRandom: SimulationRandom;
}

/**
 * 战舰状态机特效与损管播报系统 (CombatShipStatusSystem)
 * 负责舰船过载电弧、状态通知、空雷战术触发及损管抢修播报；战损粒子由实际受击路径触发。
 */
export class CombatShipStatusSystem {
  private combatScope = {};
  public reset(): void { this.combatScope = {}; }
  public update(dt: number, ctx: ShipStatusContext) {
    // 沉浸音频：玩家舰船处于过载、主动排能或相位潜航时，全局音效进入低通滤波
    sound.setMuffled(ctx.playerShip.flux.isOverloaded || ctx.playerShip.flux.isVenting || ctx.playerShip.isPhased);

    const ships = ctx.ships ?? [ctx.playerShip, ctx.enemyShip];

    for (const ship of ships) {
      if (ship.isDead) continue;

      // 舰船状态改变检测浮动战斗文字
      if (!ship.prevOverloaded && ship.flux.isOverloaded) {
        if (ctx.statsTracker) {
          ctx.statsTracker.recordOverload(!ship.isPlayer);
        }
        if (!ship.justShieldMalfunction) {
          ctx.fx.addFloatingText(
            ship.pos.clone().add(new Vector2(0, -ship.spec.collisionRadius * 0.7)),
            i18n.t('combat.overloaded'),
            [255, 60, 60],
            16,
            2.2
          );
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

      // Overload is a ship-local native EMP decal, not world-space damaging arcs.

      // Standard venting is the renderer's radial/plume animation, not EMP arcs.

      // Armor damage emits source one-shot particles at the actual hit in the damage path.
      // No hull-HP threshold smoke or randomly sampled empty/support-cell emitters.

      // Registered system effects run after the shared ship lifecycle update.


    }
    for (const ship of ctx.componentShips ?? ships) {
      if (ship.isDocked) continue;
      if (!ship.isDead && !ship.isRetreated) {
        const world: SystemWorld = { combatScope: this.combatScope, spawnNativeMine:ctx.spawnNativeMine, spawnShip:ctx.spawnShip, addCombatEffect:ctx.addCombatEffect, ships: ctx.componentShips ?? ships, asteroids: ctx.asteroids, combatRandom: ctx.combatRandom, deployReserveWing: ctx.deployReserveWing, recoverWingCraft: ctx.recoverWingCraft, detachWingCraft:ctx.detachWingCraft, retireCombatCraft:ctx.retireCombatCraft, advanceDroneLauncher: ctx.advanceDroneLauncher, deployMine: ctx.deployMine, projectiles: ctx.projectiles,
          spawnSystemArc: (from, to, color) => ctx.fx.spawnEmpArc(from, to, { coreColor: [255, 255, 255], glowColor: color ?? [130, 155, 145], thickness: 3, life: .3 }),
          spawnSystemSmoke: (spec, pos, facing, velocity) => ctx.fx.spawnLauncherSmoke(spec, pos, facing, velocity) };
        for (const system of ship.allSystems) system.dispatchEvents(ship, world, dt * ship.subjectiveTimeMultiplier);
        for (const mod of installedHullMods(ship.spec)) mod.advanceCombat?.(ship, dt, world);
      }
      if (!ship.isDead) {
        if (ship.justShieldMalfunction) {
          ctx.fx.addFloatingText(ship.pos.clone().add(new Vector2(0, 20)),
            i18n.t('combat.shield_malfunction'), [255, 60, 60], 16, 4);
        }
        for (const damage of ship.justCriticalDamage) {
          if (damage.armorDamage > 0) ctx.fx.spawnArmorDamageSparks(ship, damage.local, damage.armorDamage);
          const total = damage.armorDamage + damage.hullDamage;
          if (total > 0) ctx.fx.addFloatingDamage(ship.pos.clone().add(damage.local.clone().rotate(ship.facingRad)), total, [255, 50, 0]);
        }
        this.updateWeaponStatus(ship, ctx); this.updateEngineStatus(ship, ctx);
      }
      else { ship.justDisabledMounts = []; ship.justRepairedMounts = []; ship.engineController.clearEvents(); }
      ship.justCriticalDamage.length = 0;
      ship.justShieldMalfunction = false;
    }
  }

  private updateEngineStatus(ship: Ship, ctx: ShipStatusContext): void {
    const controller = ship.engineController;
    for (const index of controller.justDisabledEngines) {
      const slot = ship.spec.engineSlots[index];
      const pos = ship.pos.clone().add(new Vector2(slot.x, slot.y).rotate(ship.facingRad));
      const color = (ENGINE_VISUAL_PROFILES[slot.style] ?? ENGINE_VISUAL_PROFILES.LOW_TECH).flameColor;
      // G.cfr_renamed_8 uses the explicit .2s addHitParticle overload, not size-derived duration.
      for (const [diameter, tint] of [[slot.width * 16, color], [slot.width * 4, [1, 1, 1]]] as [number, [number, number, number]][]) {
        ctx.fx.hitGlows.push({ id: ctx.visualRandom.next(), pos: pos.clone(), vel: ship.vel.clone(),
          diameter, life: .2, maxLife: .2, peakAlpha: 1, color: [tint[0] * 255, tint[1] * 255, tint[2] * 255] });
      }
      // Existing sound adapter; native normal hull-style selection is not yet ported.
      sound.playAtPos('engine_flameout', ship.pos, ctx.playerShip.pos, .9, 1);
    }
    if (controller.justFlamedOut && ship.isPlayer) sound.play('flameout_alarm', .85);
    if (ship.spec.hullSize !== 'FIGHTER') {
      if (controller.justFlamedOut) ctx.fx.addFloatingText(ship.pos.clone(), '引擎熄火', [255, 140, 40], 16, 2);
      if (controller.justRestarted) ctx.fx.addFloatingText(ship.pos.clone(), '引擎上线', [100, 255, 140], 16, 2);
    }
    controller.clearEvents();
  }

  private updateWeaponStatus(ship: Ship, ctx: ShipStatusContext): void {
    const isFighter = ship.spec.hullSize === 'FIGHTER';
    // Deferred health-check events, rather than damage-path guesses. Existing
    // Web radio/floaty presentation remains an adapter, emitted once per transition.
    for (const mount of ship.justDisabledMounts) {
      const mountWorldPos = ship.pos.clone().add(mount.relativePos.clone().rotate(ship.facingRad));
      const size = mount.spec.mountSize.toLowerCase();
      sound.playAtPos(mount.isPermanentlyDisabled ? 'weapon_malfunction_' + size : 'disabled_' + size,
        ship.pos, ctx.playerShip.pos, .5, 1);
      if (!isFighter) ctx.fx.addFloatingText(mountWorldPos, (mount.isPermanentlyDisabled ? 'PERMANENTLY DISABLED: ' : 'WEAPON DISABLED: ') + mount.slotId,
        [255, 140, 40], 14, 2);
      if (!isFighter && ship.isPlayer) ctx.addRadioMessage('损管警报', 'PLAYER',
        '武器挂点 [' + mount.slotId + '] 已下线' + (mount.isPermanentlyDisabled ? '，无法战场修复。' : '，正在抢修。'), [255, 120, 60]);
    }
    ship.justDisabledMounts = [];

    // 5. 挂点抢修完毕重新上线通知 (Web presentation adapter)
    if (ship.justRepairedMounts && ship.justRepairedMounts.length > 0) {
      for (const mount of ship.justRepairedMounts) {
        if (isFighter) continue;
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
