import { HYPERION_JUMP_ID } from '../../engine/content/HyperionIds';
import { jumpTargetingEntryFailure } from '../../engine/content/HyperionJumpTarget';
import './void-shield.css';
import './combat-interface.css';
import { assemblyShipIds } from '../../engine/content/ModuleGeometry';
import { SystemIcon } from '../SystemIcon';
import { readSystemBindings, selectedSystemSlot, systemBindingLabel } from '../../engine/runtime/SystemBindings';
import '../../studio/system-loadout.css';
import React from 'react';
import type { HudShip as Ship } from '../../engine/runtime/CombatHudView';
import type { CombatHudView as CombatEngine } from '../../engine/runtime/CombatHudView';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { ShipPaperDoll } from './ShipPaperDoll';
import { buildWeaponHudGroups } from './WeaponHudModel';
import type { WeaponGroupControls } from './WeaponGroupConsole';
import { WeaponGroupConsole } from './WeaponGroupConsole';
import type { CombatHudVisuals } from '../../engine/visual/CombatHudVisuals';
import { HudMeter } from './HudMeter';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';

export interface AuthenticTacticalConsoleProps {
  player: Ship;
  combatTime?: number;
  engine?: CombatEngine;
  hudVisuals?: CombatHudVisuals;
  weaponControls?: WeaponGroupControls;
  onToggleRecall?: () => void;
  onActivateSystem?: (slot: number) => void;
  onSelectModule?: (index: number) => void;
}

/** Combat-only presentation; every action still uses the caller's authority callbacks. */
export const AuthenticTacticalConsole: React.FC<AuthenticTacticalConsoleProps> = ({ player, engine, hudVisuals, weaponControls, onToggleRecall, onActivateSystem, onSelectModule }) => {
  const isZeroFlux = player.flux.isEngineBoostActive;
  const speed = player.vel.length().toFixed(1);
  const totalFlux = Math.trunc(player.flux.totalFlux);
  const maxFlux = player.flux.maxFlux || 10000;
  const fluxRatio = Math.min(1.0, Math.max(0, player.flux.totalFlux / maxFlux));
  const hullHp = Math.trunc(player.hullHp);
  const maxHull = player.maxHullHp || 15000;
  const hullRatio = Math.min(1.0, Math.max(0, player.hullHp / maxHull));
  // Read the same phase/flux multiplier as shipMotionStats, including refit and IN/OUT effects.
  const phaseSpeedPercent = player.shield.type === 'PHASE' && player.shield.isPhaseEngaged
    ? Math.round(player.phaseSpeedMultiplier * 100)
    : 100;

  const systemEntryFailure = (system: typeof player.system) => system.type === HYPERION_JUMP_ID ? jumpTargetingEntryFailure(system) : system.activationFailureReason;

  // 战术系统名称与状态
  const systemStatus = (system: typeof player.system) => !system.available ? '未接入 · 不可激活' : player.isDead || system.disabled ? '离线'
    : system.state === 'IN' ? '启动中' : system.state === 'OUT' ? '关闭中' : system.isActive ? system.statusText ?? '运行中'
    : system.isCoolingDown ? '冷却中 (' + system.cooldownTimer.toFixed(1) + 's)' : systemEntryFailure(system) ?? system.statusText ?? (system.type === HYPERION_JUMP_ID ? '选择位置 / 朝向' : '就绪');

  // 原版参考战备与敌情感知 (RepairTracker.java & C.java)
  const hasEnemiesInRange = player.significantEnemiesInRange;
  const remainingPPT = Math.max(0, Math.ceil(player.peakPerformanceRemaining));
  const crPercent = Math.round(player.currentCR * 100);
  const isFlameout = player.flameoutRatio > 0.05;

  const weaponPlayer = engine?.weaponShip ?? player;
  const moduleControlled = weaponPlayer.id !== player.id;
  const canSelectModule = !!onSelectModule && player.fireControlMode === 'MANUAL' && !player.isDead && player.hullHp > 0 && !player.isDocked && !player.isRetreated;
  const weaponOwnerName = moduleControlled ? weaponPlayer.spec.i18n?.[i18n.getLocale()]?.[weaponPlayer.spec.nameKey] ?? i18n.t(weaponPlayer.spec.nameKey) : '本体';
  const groups = buildWeaponHudGroups(weaponPlayer);
  const assemblyIds = new Set(assemblyShipIds(player.id, player.spec));
  const liveCarriers = new Set(engine?.ships.filter(ship => assemblyIds.has(ship.id) && !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked).map(ship => ship.id));
  const carrierWings = engine ? [...engine.playerWings, ...engine.enemyWings].filter(wing => liveCarriers.has(wing.carrierId)) : [];
  // 当前选中武器组的各门武器
  const activeGroup = weaponPlayer.weaponGroups[weaponPlayer.selectedGroupIndex];
  const activeMounts = activeGroup ? weaponPlayer.weapons.filter(w => activeGroup.weaponSlotIds.includes(w.slotId)) : [];

  return (
    <div className="combat-console" role="region" aria-label="战斗控制台"
      data-expanded-loadout={groups.reduce((count, group) => count + group.entries.length, 0) + activeMounts.length > 10}>
      {/* 2. 核心战术控制台主体 (幅能、结构、系统、军规折线、武器组火控列表) */}
      <div className="combat-console-body">
        {player.shield.voidShield && <div className="hud-void-shield" data-void-shield
          aria-label="虚空盾状态" title="整舰共享屏障，不产生载荷；右键开关不重置承载。排散/过载暂停防御与重建。">
          <div className="hud-text">虚空盾 · {Math.ceil(player.shield.voidShield.integrity / player.shield.voidShield.integrityPerLayer)}/{player.shield.voidShield.layers} 层
            · {player.isDead || player.isRetreated ? '离线' : player.shield.voidShield.suppressed ? '供能暂停' : !player.shield.voidShield.armed ? '手动关闭' : player.shield.voidShield.restartRemaining > 0 ? '屏障崩溃' : player.shield.isActive ? '在线' : '首层重建'}</div>
          <div className="hud-void-layers">{Array.from({length:player.shield.voidShield.layers},(_,i)=>
            <span key={i}><i style={{width:(100*Math.max(0,Math.min(1,player.shield.voidShield!.integrity/player.shield.voidShield!.integrityPerLayer-i)))+'%'}}/></span>)}</div>
          <div className="hud-text">{Math.ceil(player.shield.voidShield.integrity)} / {player.shield.voidShield.layers*player.shield.voidShield.integrityPerLayer}
            {player.shield.voidShield.restartRemaining > 0 ? ' · 重启 '+Math.ceil(player.shield.voidShield.restartRemaining)+'s'
              : player.shield.voidShield.quietRemaining > 0 ? ' · 受击抑制 '+Math.ceil(player.shield.voidShield.quietRemaining)+'s'
              : player.shield.voidShield.integrity===0 ? ' · 重建 '+Math.floor(100*player.shield.voidShield.rebuild/player.shield.voidShield.integrityPerLayer)+'%' : ''}</div>
        </div>}
        {player.system.passiveStatusText && <div className="hud-text text-[10px]" role="status" aria-label="内置插件状态">{player.system.passiveStatusText}</div>}
        {/* 顶部动态状态增益/减益浮标 (仅在异常/激活时于幅能槽上方显现) */}
        <div className="hud-console-alerts">
          {/* 幅能排空 (Active Venting) */}
          {player.flux.isVenting && (
            <div className="flex items-center gap-1.5 animate-pulse text-cyan-300">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/venting_flux2.png')}
                alt=""
                className="w-4 h-4 object-contain"
              />
              <span className="font-bold"><span className="hud-text">载荷排空</span></span>
              <span className="text-[#9bff00]/90"><span className="hud-text">({Math.ceil(player.timeToVent)}s 剩余)</span></span>
            </div>
          )}

          {/* 深度过载 (Overloaded) */}
          {player.flux.isOverloaded && (
            <div className="flex items-center gap-1.5 animate-pulse text-red-400">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/overloaded.png')}
                alt=""
                className="w-4 h-4 object-contain"
              />
              <span className="font-bold"><span className="hud-text">载荷过载</span></span>
              <span className="text-red-300/90"><span className="hud-text">({Math.ceil(player.flux.overloadTimer)}s 后恢复)</span></span>
            </div>
          )}

          {phaseSpeedPercent < 100 && !player.isDead && player.hullHp > 0 && !player.isDocked && !player.isRetreated && (
            <div className="text-amber-300 font-bold" data-phase-coil-load
              title="硬载荷越高，相位最高航速越低；退出相位并耗散硬载荷可恢复。此百分比不包含相位时间流速增益。">
              <span className="hud-text">相位线圈负荷：最高航速降至 {phaseSpeedPercent}%</span>
            </div>
          )}

          {/* 零幅能加速 (Zero Flux Boost) */}
          {isZeroFlux && !player.flux.isVenting && !player.flux.isOverloaded && (
            <div className="flex items-center gap-1.5 text-amber-300">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/engine_boost2.png')}
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold"><span className="hud-text">零载荷加速</span></span>
              <span className="text-[#9bff00]/80"><span className="hud-text">(+50 航速)</span></span>
            </div>
          )}

          {/* 引擎受损 (Engine Damage) */}
          {isFlameout && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/engine_damage.png')}
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold"><span className="hud-text">引擎受损</span></span>
              <span className="text-[#9bff00]/80"><span className="hud-text">({Math.round((1 - player.flameoutRatio) * 100)}% 剩余)</span></span>
            </div>
          )}

          {/* 战备时钟衰减警告 (仅当开始扣除 PPT 或战备衰减时显示) */}
          {hasEnemiesInRange && remainingPPT <= 0 && (
            <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/cr_tactical3.png')}
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold"><span className="hud-text">战备衰减</span></span>
              <span className="text-amber-300/90"><span className="hud-text">({crPercent}%)</span></span>
            </div>
          )}
        </div>

        {/* _return: 45px labels, 3px gap, 80x7 meters, 104px right-aligned values. */}
        <div className="hud-console-meter-row" data-meter="flux" data-critical={fluxRatio > .85}>
          <span className="hud-text">载荷</span>
          <HudMeter readFlash={hudVisuals?.readFluxFlash} label="载荷" fluid value={fluxRatio} minimum={player.flux.hardFlux / maxFlux} />
          <span className="hud-meter-number"><span className="hud-text">{totalFlux.toLocaleString()}<small> / {maxFlux.toLocaleString()}</small></span></span>
        </div>
        <div className="hud-console-meter-row" data-meter="hull" data-critical={hullRatio < .25}>
          <span className="hud-text">结构</span>
          <HudMeter label="结构" fluid value={hullRatio} />
          <span className="hud-meter-number"><span className="hud-text">{hullHp.toLocaleString()}<small> / {maxHull.toLocaleString()}</small></span></span>
        </div>

        <div className="hud-ship-speed" aria-label="当前航速" title="当前实际航速（空间单位/秒），不是最高航速">
          <span className="hud-text">航速</span>
          <span className="hud-speed-readout"><span data-speed-value>{speed}</span><small>SU/s</small></span>
        </div>

        <div className="hud-system-list" aria-label="舰船技能">
          {player.systems.map((system, slot) => <button type="button" key={slot} className="hud-system-button" data-active={system.isActive} data-cooling={system.isCoolingDown}
            aria-label={`激活技能 ${slot + 1}：${system.name}`} aria-current={readSystemBindings().wheelSelect && selectedSystemSlot(player) === slot}
            disabled={!onActivateSystem || !!systemEntryFailure(system)} title={system.isActive ? system.statusText ?? system.description : systemEntryFailure(system) ?? system.description}
            onClick={() => onActivateSystem?.(slot)}>
            <span className="hud-system-name"><SystemIcon systemId={system.type} />{system.name}</span><kbd>{systemBindingLabel(slot)}</kbd>
            <span className="hud-system-status">{system.definition.charges !== undefined ? `${system.charges}/${system.maxCharges} · ` : ''}{systemStatus(system)}</span>
          </button>)}
          {player.defenseSystem.type !== 'NONE' && <div className="hud-system-button" title={player.defenseSystem.isActive ? player.defenseSystem.statusText ?? player.defenseSystem.description : player.defenseSystem.activationFailureReason ?? player.defenseSystem.description}><span className="hud-system-name"><SystemIcon systemId={player.defenseSystem.type} />{player.defenseSystem.name}</span><kbd>右键</kbd><span className="hud-system-status">{player.defenseSystem.definition.charges !== undefined ? `${player.defenseSystem.charges}/${player.defenseSystem.maxCharges} · ` : ''}{systemStatus(player.defenseSystem)}</span></div>}
          {player.defenseSystem.type !== 'NONE' && player.shield.type !== 'NONE' && <div className="hud-system-button"><span className="hud-system-name">{player.shield.type === 'PHASE' ? '相位潜航' : '舰体护盾'}</span><kbd>Shift + 右键</kbd><span className="hud-system-status">{player.shield.isRaiseRequested ? '开启' : '关闭'}</span></div>}
        </div>

        <div className="hud-ship-portrait relative flex items-center justify-center">
          <ShipPaperDoll ship={player} isEnemy={false} size={135} selectedModuleId={player.spec.modules?.length ? weaponPlayer.id : undefined} onSelectModule={canSelectModule && player.spec.modules?.length ? onSelectModule : undefined} />
        </div>
      </div>
      <div className="combat-console-armament">
        {!!player.spec.modules?.length && <div className="flex items-center justify-between gap-2 text-[10px] pb-1" data-testid="module-fire-control" data-weapon-owner={weaponPlayer.id}>
          <span title="只切换武器火控；移动、护盾、排散、技能仍由本体执行">火控：{weaponOwnerName}</span>
          {moduleControlled ? <button type="button" disabled={!canSelectModule} className="shrink-0 hover:text-white" onClick={event=>{event.stopPropagation();onSelectModule?.(0);}}>返回本体</button>
            : <span className="opacity-70">{canSelectModule?'点击舰体模块或装甲图接管':'自动驾驶 / 不可接管'}</span>}
        </div>}
        <div className="hud-weapon-layout">
        <WeaponGroupConsole player={weaponPlayer} groups={groups} {...weaponControls} />

        {/* 当前选中武器组的逐门武器冷却就绪状态 (Tickers) */}
        {activeMounts.length > 0 && (
          <section className="hud-mount-details" aria-label="武器状态">
          <h3 className="hud-detail-heading">武器状态 <span>{activeMounts.length}</span></h3>
          <div className="hud-mount-status" role="list" aria-label="选中组武器状态">
            {activeMounts.map((m) => {
              const name = i18n.t(m.spec.nameKey).split(' (')[0];
              const isCooling = m.cooldownTimer > 0;
              const limitedAmmo = Number.isFinite(m.ammo);
              const maxAmmo = m.spec.maxAmmo ?? m.ammo;
              return (
                <div key={m.slotId} role="listitem" data-slot-id={m.slotId} title={`${name} · ${m.slotId}`} className="flex items-center justify-between text-[10px]">
                  <span className="hud-mount-name text-[#9bff00]/90"><span className="hud-text">{name}</span></span>
                  <span className="hud-mount-readout flex items-center gap-1.5">
                    {limitedAmmo && (
                      <span
                        className={`font-bold ${
                          m.ammo < 1 ? 'text-red-400 animate-pulse' : m.ammo <= 2 ? 'text-amber-300' : 'text-amber-200/90'
                        }`}
                      ><span className="hud-text">
                        {m.ammo < 1 ? '弹尽' : `弹药 ${m.ammo}/${maxAmmo}`}
                      </span></span>
                    )}
                    <span className={m.isDisabled ? "text-red-400" : "text-[#9bff00]/70 ui-font"}><span className="hud-text">
                      {m.isDisabled ? (m.isPermanentlyDisabled ? '永久故障' : `故障 ${Math.ceil(m.disabledTimer * weaponPlayer.combatWeaponRepairTimeMultiplier)}s`) : isCooling ? `冷却 ${m.cooldownTimer.toFixed(1)}s` : m.gravityTractor?.phase==='HOLD' ? `${m.gravityTractor.status} · ${(m.spec.gravityTractor!.holdTime-m.gravityTractor.age).toFixed(1)}s` : m.gravityTractor?.status ?? '就绪'}
                    </span></span>
                  </span>
                </div>
              );
            })}
          </div></section>
        )}

        </div>

        {/* 航母机库甲板状态 (若有舰载联队) */}
        {engine && carrierWings.length > 0 && (
          <div className="hud-carrier-deck">
            <div className="flex items-center justify-between font-bold text-[10px] pb-0.5">
              <span><span className="hud-text">机库甲板 ({carrierWings.length} 联队)</span></span>
              <button type="button" disabled={!onToggleRecall} aria-label={player.fighterRecall ? '本舰联队出击' : '召回本舰联队'}
                title={player.fighterRecall ? '[Z] 解除本舰联队召回' : '[Z] 召回本舰及存活模块联队；其他航母不受影响'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRecall?.();
                }}
                className="cursor-pointer hover:text-white text-[9px] text-[#9bff00]/80"
              ><span className="hud-text">
                [Z] {player.fighterRecall ? '本舰联队召回' : '本舰联队出击'}
              </span></button>
            </div>
            {carrierWings.map((wing) => {
              const members = engine.ships.filter(craft => craft.flightDeckWingId === wing.wingId && !craft.isDead && !craft.isRetreated);
              const aliveCount = members.length, dockedCount = members.filter(craft => craft.isDocked).length;

              return (
                <div key={wing.wingId} className="flex items-center justify-between text-[9px]">
                  <span><span className="hud-text">{i18n.t(wing.name).replace('中队', '')}</span></span>
                  <span className="ui-font font-bold text-[#9bff00]"><span className="hud-text">
                    {aliveCount}/{wing.maxCrafts}{dockedCount > 0 ? ` · 停靠${dockedCount}` : ''} (CRR {Math.round(wing.crr * 100)}%)
                  </span></span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
