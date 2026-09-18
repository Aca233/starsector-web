import React from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { CombatEngine } from '../../engine/simulation/CombatEngine';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { ShipPaperDoll } from './ShipPaperDoll';
import { buildWeaponHudGroups, weaponHudHeight } from './WeaponHudModel';
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
}

/** Readable system text (user preference) and source meters; full layout is still being reconciled. */
export const AuthenticTacticalConsole: React.FC<AuthenticTacticalConsoleProps> = ({ player, engine, hudVisuals, weaponControls, onToggleRecall }) => {
  const isZeroFlux = player.flux.totalFlux <= 0 && !player.shield.isActive && !player.flux.isOverloaded;
  const speed = player.vel.length().toFixed(1);
  const totalFlux = Math.trunc(player.flux.totalFlux);
  const maxFlux = player.flux.maxFlux || 10000;
  const fluxRatio = Math.min(1.0, Math.max(0, player.flux.totalFlux / maxFlux));
  const hullHp = Math.trunc(player.hullHp);
  const maxHull = player.maxHullHp || 15000;
  const hullRatio = Math.min(1.0, Math.max(0, player.hullHp / maxHull));
  // Read the same phase/flux multiplier as shipMotionStats, including refit and IN/OUT effects.
  const phaseSpeedPercent = player.shield.type === 'PHASE' && player.shield.isPhaseEngaged
    ? Math.round(player.shield.getPhaseSpeedMultiplier(player.flux.maxFlux > 0 ? player.flux.hardFlux / player.flux.maxFlux : 0) * 100)
    : 100;

  // 战术系统名称与状态
  const systemStatus = (system: typeof player.system) => !system.available ? '未接入 · 不可激活' : player.isDead || system.disabled ? '离线'
    : system.state === 'IN' ? '启动中' : system.state === 'OUT' ? '关闭中' : system.isActive ? '运行中'
    : system.isCoolingDown ? '冷却中 (' + system.cooldownTimer.toFixed(1) + 's)' : system.activationFailureReason ?? system.statusText ?? '就绪';

  // 原版参考战备与敌情感知 (RepairTracker.java & C.java)
  const hasEnemiesInRange = player.areSignificantEnemiesInRange(2500, engine?.findHostile(player));
  const remainingPPT = Math.max(0, Math.ceil(player.peakPerformanceRemaining));
  const crPercent = Math.round(player.currentCR * 100);
  const isFlameout = player.getFlameoutRatio() > 0.05;

  const groups = buildWeaponHudGroups(player);
  const groupHeight = Math.max(50, weaponHudHeight(groups));
  const carrierWings = engine ? [...engine.playerWings, ...engine.enemyWings].filter(wing => wing.carrierId === player.id) : [];
  const wingBand = carrierWings.length ? 58 : 0;
  // _return.setShip: pivot.x = 150 + contentHeight/2 + 1.5; anchor is at x=3.
  const consolePivot = 148.5 + (groupHeight + wingBand) * 0.5;

  // 当前选中武器组的各门武器
  const activeGroup = player.weaponGroups[player.selectedGroupIndex];
  const activeMounts = activeGroup ? player.weapons.filter(w => activeGroup.weaponSlotIds.includes(w.slotId)) : [];

  return (
    <div className="combat-console pointer-events-auto flex items-end ui-font select-none text-[#9bff00] text-[12px] leading-[15px]" style={{ '--console-pivot': `${consolePivot}px` } as React.CSSProperties}>
      {/* 1. 舰船结构与装甲纸娃娃 (Ship Structure Paper Doll & Hull Status) */}
      <div className="combat-paperdoll flex flex-col items-start mr-3.5 pb-1 select-none">
        {/* 航速指示 */}
        <div className="w-full pb-0.5 border-b border-[#9bff00]/60 mb-1 text-[11px] font-bold"><span className="hud-text">
          航速 &nbsp;{speed}
        </span></div>

        {/* 舰船结构/装甲纸娃娃画布 (原版参考 holo_status.png 同心准星与装甲损耗) */}
        <div className="w-[135px] h-[135px] relative flex items-center justify-center">
          <ShipPaperDoll ship={player} isEnemy={false} size={135} />
        </div>

        {/* 舰船铭牌与型号 */}
        <div className="text-[10px] mt-1 space-y-0.5 w-[135px] break-words">
          <div className="font-bold text-[#9bff00] tracking-wider"><span className="hud-text">
            {player.shipName}
          </span></div>

          <div className="text-[#9bff00]/80 text-[9px]"><span className="hud-text">
            {player.spec.designation || (player.spec.designationKey ? i18n.t(player.spec.designationKey) : '')}
          </span></div>
        </div>
      </div>

      {/* 2. 核心战术控制台主体 (幅能、结构、系统、军规折线、武器组火控列表) */}
      <div className="combat-console-body flex flex-col w-[340px]">
        {/* 顶部动态状态增益/减益浮标 (仅在异常/激活时于幅能槽上方显现) */}
        <div className="flex flex-col gap-1 pb-1 text-[10px]">
          {/* 幅能排空 (Active Venting) */}
          {player.flux.isVenting && (
            <div className="flex items-center gap-1.5 animate-pulse text-cyan-300">
              <img
                src={runtimeAssetUrl('graphics/icons/tactical/venting_flux2.png')}
                alt=""
                className="w-4 h-4 object-contain"
              />
              <span className="font-bold"><span className="hud-text">幅能排空</span></span>
              <span className="text-[#9bff00]/90"><span className="hud-text">({Math.ceil(player.flux.getTimeToVent())}s 剩余)</span></span>
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
              <span className="font-bold"><span className="hud-text">幅能过载</span></span>
              <span className="text-red-300/90"><span className="hud-text">({Math.ceil(player.flux.overloadTimer)}s 后恢复)</span></span>
            </div>
          )}

          {phaseSpeedPercent < 100 && !player.isDead && player.hullHp > 0 && !player.isDocked && !player.isRetreated && (
            <div className="text-amber-300 font-bold" data-phase-coil-load
              title="硬幅能越高，相位最高航速越低；退出相位并耗散硬幅能可恢复。此百分比不包含相位时间流速增益。">
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
              <span className="font-bold"><span className="hud-text">零幅能加速</span></span>
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
              <span className="text-[#9bff00]/80"><span className="hud-text">({Math.round((1 - player.getFlameoutRatio()) * 100)}% 剩余)</span></span>
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
        <div className="hud-console-meter-row">
          <span className="hud-text">幅能</span>
          <HudMeter readFlash={hudVisuals?.readFluxFlash} label="幅能" value={fluxRatio} minimum={player.flux.hardFlux / maxFlux} />
          <span className="hud-meter-number"><span className="hud-text">{totalFlux}</span></span>
        </div>
        <div className="hud-console-meter-row">
          <span className="hud-text">结构</span>
          <HudMeter label="结构" value={hullRatio} />
          <span className="hud-meter-number"><span className="hud-text">{hullHp}</span></span>
        </div>

        {/* Only installed systems have a status row. */}
        {[{ system: player.system, key: 'F' }, { system: player.defenseSystem, key: '右键' }].filter(s => s.system.type !== 'NONE').map(({system, key}) => <div key={key} className="flex items-center justify-between h-[15px] mt-[1px] text-[11px]">
          <span className="font-bold text-[#9bff00]"><span className="hud-text">{system.name} [{key}]</span></span>
          <div className="flex items-center gap-2">
            {system.maxCharges > 1 && <span>{system.charges}/{system.maxCharges}</span>}
            <span className="text-[#9bff00]"><span className="hud-text">|&nbsp;{systemStatus(system)}</span></span>
          </div>
        </div>)}

        {/* 军规折角分隔横线 (45 度左侧上挑转水平线，Web 布局（尚待原版对齐）) */}
        <svg className="w-[320px] h-[12px] my-[1px] overflow-visible pointer-events-none">
          <polyline
            points="0,11 11,1 320,1"
            stroke="#9bff00"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        <div className="hud-weapon-layout">
        <WeaponGroupConsole player={player} groups={groups} {...weaponControls} />

        {/* 当前选中武器组的逐门武器冷却就绪状态 (Tickers) */}
        {activeMounts.length > 0 && (
          <div className="hud-mount-status pt-1 mt-1 border-t border-[#9bff00]/30 space-y-0.5 text-[10px]" role="list" aria-label="选中组武器状态">
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
                      {m.isDisabled ? (m.isPermanentlyDisabled ? '永久故障' : `故障 ${Math.ceil(m.disabledTimer * player.combatWeaponRepairTimeMultiplier)}s`) : isCooling ? `---- (${m.cooldownTimer.toFixed(1)}s)` : '---- |'}
                    </span></span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        </div>

        {/* 航母机库甲板状态 (若有舰载联队) */}
        {engine && carrierWings.length > 0 && (
          <div className="pt-1 mt-1 border-t border-[#9bff00]/40 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between font-bold text-[10px] pb-0.5">
              <span><span className="hud-text">机库甲板 ({carrierWings.length} 联队)</span></span>
              <button type="button" aria-label={player.fighterRecall ? '本舰联队出击' : '召回本舰联队'}
                title={player.fighterRecall ? '[Z] 解除本舰联队召回' : '[Z] 召回本舰联队；其他航母不受影响'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToggleRecall) onToggleRecall(); else engine.toggleFighterRecall();
                }}
                className="cursor-pointer hover:text-white text-[9px] text-[#9bff00]/80"
              ><span className="hud-text">
                [Z] {player.fighterRecall ? '本舰联队召回' : '本舰联队出击'}
              </span></button>
            </div>
            {carrierWings.map((wing) => {
              const aliveCount = engine.ships.filter(craft => craft.flightDeckWingId === wing.wingId && !craft.isDead).length;

              return (
                <div key={wing.wingId} className="flex items-center justify-between text-[9px]">
                  <span><span className="hud-text">{wing.name.replace('中队', '')}</span></span>
                  <span className="ui-font font-bold text-[#9bff00]"><span className="hud-text">
                    {aliveCount}/{wing.maxCrafts} (CRR {Math.round(wing.crr * 100)}%)
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
