import React from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { CombatEngine } from '../../engine/simulation/CombatEngine';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { ShipPaperDoll } from './ShipPaperDoll';

export interface AuthenticTacticalConsoleProps {
  player: Ship;
  combatTime?: number;
  engine?: CombatEngine;
}

/**
 * 1:1 原版左下角战术控制台 (AuthenticTacticalConsole)
 * 严格对齐官方实机原版照片 (media_1789200834134.png & hud_crop.png):
 * - 纯净荧光绿 (#94ff00) 军规 CRT 终端风格
 * - 左侧为 2D 舰船结构/装甲纸娃娃 (holo_status.png、航速、装甲网格动态受损、舰名铭牌)
 * - 右侧为核心控制台:
 *   - 顶部状态增益/减益浮标 (幅能排空/过载/零幅能加速/战备)
 *   - 第一行: 幅能 : [槽位与限位竖线]       0
 *   - 第二行: 结构 : [实心生命槽]           18000
 *   - 第三行: 战术系统 ----                 | 就绪
 *   - 45 度军规折角分隔线
 *   - 武器组标题
 *   - 1 ~ 5 号武器组 (组号、武器图标、名称、齐射/交替、伤害类型、自动开火: ■)
 *   - 逐门武器就绪与冷却指示器
 *   - 航母机库甲板中队战备
 */
export const AuthenticTacticalConsole: React.FC<AuthenticTacticalConsoleProps> = ({ player, engine }) => {
  const isZeroFlux = player.flux.totalFlux <= 0 && !player.shield.isActive && !player.flux.isOverloaded;
  const speed = player.vel.length().toFixed(1);
  const totalFlux = Math.round(player.flux.totalFlux);
  const maxFlux = player.spec.maxFlux || 10000;
  const fluxRatio = Math.min(1.0, Math.max(0, player.flux.totalFlux / maxFlux));
  const hullHp = Math.round(player.hullHp);
  const maxHull = player.spec.hitpoints || 15000;
  const hullRatio = Math.min(1.0, Math.max(0, player.hullHp / maxHull));

  // 战术系统名称与状态
  const systemName =
    player.system.type === 'BURN_DRIVE'
      ? '冲刺推进'
      : player.system.type === 'FORTRESS_SHIELD'
      ? '堡垒护盾'
      : player.system.type === 'MINE_STRIKE'
      ? '空雷突袭'
      : '相位潜航';

  const systemStatus = player.system.isActive
    ? '激活运行中'
    : player.system.isCoolingDown
    ? `冷却中 (${player.system.cooldownTimer.toFixed(1)}s)`
    : '就绪';

  // 1:1 原版战备与敌情感知 (RepairTracker.java & C.java)
  const hasEnemiesInRange = player.areSignificantEnemiesInRange(2500, engine?.enemyShip);
  const remainingPPT = Math.max(0, Math.ceil(player.peakPerformanceRemaining));
  const crPercent = Math.round(player.currentCR * 100);
  const isFlameout = player.getFlameoutRatio() > 0.05;

  const damageTypeLabel = (type: string) => {
    switch (type) {
      case 'KINETIC': return '动能';
      case 'HIGH_EXPLOSIVE': return '高爆';
      case 'ENERGY': return '能量';
      case 'FRAGMENTATION': return '破片';
      default: return '能量';
    }
  };

  // 当前选中武器组的各门武器
  const activeGroup = player.weaponGroups[player.selectedGroupIndex];
  const activeMounts = activeGroup ? player.weapons.filter(w => activeGroup.weaponSlotIds.includes(w.slotId)) : [];

  return (
    <div className="pointer-events-auto flex items-end font-mono select-none text-[#94ff00] text-[11px] leading-tight tracking-tight drop-shadow-[0_0_2px_rgba(148,255,0,0.6)]">
      {/* 1. 舰船结构与装甲纸娃娃 (Ship Structure Paper Doll & Hull Status) */}
      <div className="flex flex-col items-start mr-3.5 pb-1 select-none">
        {/* 航速指示 */}
        <div className="w-full pb-0.5 border-b border-[#94ff00]/60 mb-1 text-[11px] font-bold">
          航速 &nbsp;{speed}
        </div>

        {/* 舰船结构/装甲纸娃娃画布 (1:1 官方 holo_status.png 同心准星与装甲损耗) */}
        <div className="w-[135px] h-[135px] relative flex items-center justify-center">
          <ShipPaperDoll ship={player} isEnemy={false} size={135} />
        </div>

        {/* 舰船铭牌与型号 */}
        <div className="text-[10px] mt-1 space-y-0.5">
          <div className="font-bold text-[#b4ff32] tracking-wider">
            {player.shipName}
          </div>
          <div className="text-[#94ff00] text-[10px]">
            {i18n.t(player.spec.nameKey).split(' ')[0]}级
          </div>
          <div className="text-[#94ff00]/80 text-[9px]">
            {player.spec.designation || (player.spec.designationKey ? i18n.t(player.spec.designationKey) : '战列舰')}
          </div>
        </div>
      </div>

      {/* 2. 核心战术控制台主体 (幅能、结构、系统、军规折线、武器组火控列表) */}
      <div className="flex flex-col w-[320px]">
        {/* 顶部动态状态增益/减益浮标 (仅在异常/激活时于幅能槽上方显现) */}
        <div className="flex flex-col gap-1 pb-1 text-[10px]">
          {/* 幅能排空 (Active Venting) */}
          {player.flux.isVenting && (
            <div className="flex items-center gap-1.5 animate-pulse text-cyan-300">
              <img
                src="/game-assets/graphics/icons/tactical/venting_flux2.png"
                alt=""
                className="w-4 h-4 object-contain"
              />
              <span className="font-bold">幅能排空</span>
              <span className="text-[#94ff00]/90">({Math.ceil(player.flux.getTimeToVent())}s 剩余)</span>
            </div>
          )}

          {/* 深度过载 (Overloaded) */}
          {player.flux.isOverloaded && (
            <div className="flex items-center gap-1.5 animate-pulse text-red-400">
              <img
                src="/game-assets/graphics/icons/tactical/overloaded.png"
                alt=""
                className="w-4 h-4 object-contain"
              />
              <span className="font-bold">深度过载</span>
              <span className="text-red-300/90">({Math.ceil(player.flux.overloadTimer)}s 后恢复)</span>
            </div>
          )}

          {/* 零幅能加速 (Zero Flux Boost) */}
          {isZeroFlux && !player.flux.isVenting && !player.flux.isOverloaded && (
            <div className="flex items-center gap-1.5 text-amber-300">
              <img
                src="/game-assets/graphics/icons/tactical/engine_boost2.png"
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold">零幅能加速</span>
              <span className="text-[#94ff00]/80">(+50 航速)</span>
            </div>
          )}

          {/* 引擎受损 (Engine Damage) */}
          {isFlameout && (
            <div className="flex items-center gap-1.5 text-orange-400">
              <img
                src="/game-assets/graphics/icons/tactical/engine_damage.png"
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold">引擎受损</span>
              <span className="text-[#94ff00]/80">({Math.round((1 - player.getFlameoutRatio()) * 100)}% 剩余)</span>
            </div>
          )}

          {/* 战备时钟衰减警告 (仅当开始扣除 PPT 或战备衰减时显示) */}
          {hasEnemiesInRange && remainingPPT <= 0 && (
            <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
              <img
                src="/game-assets/graphics/icons/tactical/cr_tactical3.png"
                alt=""
                className="w-3.5 h-3.5 object-contain"
              />
              <span className="font-bold">战备衰减</span>
              <span className="text-amber-300/90">({crPercent}%)</span>
            </div>
          )}
        </div>

        {/* 第一行: 幅能 : [槽位 |] 0 */}
        <div className="flex items-center justify-between h-[15px]">
          <span className="font-bold w-12 text-[#94ff00]">幅能&nbsp;:</span>
          <div className="relative flex-1 h-[8px] mx-2 bg-black/70 border border-[#94ff00]/60 overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                player.flux.isOverloaded
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-[#94ff00]'
              }`}
              style={{ width: `${fluxRatio * 100}%` }}
            />
            {/* 右端 100% 幅能限位竖线 */}
            <div className="absolute right-0 top-0 bottom-0 w-[1.5px] bg-[#94ff00]" />
          </div>
          <span className="w-14 text-right font-bold text-[12px] text-[#94ff00]">
            {totalFlux}
          </span>
        </div>

        {/* 第二行: 结构 : [实心生命槽] 18000 */}
        <div className="flex items-center justify-between h-[15px] mt-[1px]">
          <span className="font-bold w-12 text-[#94ff00]">结构&nbsp;:</span>
          <div className="relative flex-1 h-[8px] mx-2 bg-black/70 border border-[#94ff00]/60 overflow-hidden">
            <div
              className="h-full bg-[#94ff00] transition-all duration-75"
              style={{ width: `${hullRatio * 100}%` }}
            />
          </div>
          <span className="w-14 text-right font-bold text-[12px] text-[#94ff00]">
            {hullHp}
          </span>
        </div>

        {/* 第三行: 堡垒护盾 ---- | 就绪 */}
        <div className="flex items-center justify-between h-[15px] mt-[1px] text-[11px]">
          <span className="font-bold text-[#94ff00]">{systemName}</span>
          <div className="flex items-center gap-2">
            <span className="text-[#94ff00]/70 font-mono tracking-widest">----</span>
            <span className="text-[#94ff00]">|&nbsp;{systemStatus}</span>
          </div>
        </div>

        {/* 军规折角分隔横线 (45 度左侧上挑转水平线，1:1 hud_crop.png) */}
        <svg className="w-[320px] h-[12px] my-[1px] overflow-visible pointer-events-none">
          <polyline
            points="0,11 11,1 320,1"
            stroke="#94ff00"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        {/* 武器组标题 */}
        <div className="font-bold text-[#94ff00] text-[11px] pl-3 mb-[2px]">
          武器组
        </div>

        {/* 武器组列表 (1 ~ 5) */}
        <div className="space-y-[2px]">
          {player.weaponGroups.map((group, gIdx) => {
            const isSelected = player.selectedGroupIndex === gIdx;
            const mounts = player.weapons.filter(w => group.weaponSlotIds.includes(w.slotId));
            const first = mounts[0];
            const rawName = first ? i18n.t(first.spec.nameKey) : '空置挂点';
            const weaponName = rawName.split(' ')[0];
            const count = mounts.length;
            const dmgType = first ? damageTypeLabel(first.spec.type) : '能量';
            const fireMode = group.mode === 'LINKED' ? '齐射' : '交替';
            const isAutofire = group.isAutofire;

            return (
              <div
                key={gIdx}
                onClick={() => player.selectWeaponGroup(gIdx)}
                className={`px-1.5 py-[1px] cursor-pointer transition select-none ${
                  isSelected
                    ? 'text-white font-bold drop-shadow-[0_0_2px_#94ff00]'
                    : 'text-[#94ff00] hover:text-white'
                }`}
              >
                {/* 第一行: 组号 + 武器图标 + 数量与名称 + 射击模式 */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="font-bold text-[12px]">{gIdx + 1}.</span>
                    {first?.spec.turretSpriteUrl && (
                      <img
                        src={first.spec.turretSpriteUrl}
                        alt=""
                        className="w-3.5 h-3.5 object-contain rotate-[-90deg] inline-block filter brightness-150"
                      />
                    )}
                    <span className="truncate tracking-tight">
                      {count > 1 ? `${count}X ` : ''}{weaponName}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#94ff00]/90 ml-2">
                    {fireMode}
                  </span>
                </div>

                {/* 第二行: 伤害类型 + 自动开火开关 */}
                <div className="flex items-center justify-between pl-4 text-[10px] text-[#94ff00]/85">
                  <span>伤害类型:&nbsp;{dmgType}</span>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      player.toggleAutofire(gIdx);
                    }}
                    className="flex items-center gap-1 cursor-pointer hover:text-white"
                    title={`[Ctrl+${gIdx + 1}] 切换自动开火`}
                  >
                    <span>自动开火:</span>
                    <span className="font-bold text-[12px] text-[#94ff00]">
                      {isAutofire ? '■' : '□'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 当前选中武器组的逐门武器冷却就绪状态 (Tickers) */}
        {activeMounts.length > 0 && (
          <div className="pt-1 mt-1 border-t border-[#94ff00]/30 space-y-0.5 text-[10px]">
            {activeMounts.slice(0, 4).map((m, mIdx) => {
              const name = i18n.t(m.spec.nameKey).split(' ')[0];
              const isCooling = m.cooldownTimer > 0;
              return (
                <div key={mIdx} className="flex items-center justify-between text-[10px]">
                  <span className="text-[#94ff00]/90">{name}</span>
                  <span className="text-[#94ff00]/70 font-mono">
                    {isCooling ? `---- (${m.cooldownTimer.toFixed(1)}s)` : '---- |'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 航母机库甲板状态 (若有舰载联队) */}
        {engine && engine.playerWings && engine.playerWings.length > 0 && (
          <div className="pt-1 mt-1 border-t border-[#94ff00]/40 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between font-bold text-[10px] pb-0.5">
              <span>机库甲板 ({engine.playerWings.length} 联队)</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  engine.toggleFighterRecall();
                }}
                className="cursor-pointer hover:text-white text-[9px] text-[#94ff00]/80"
              >
                [Z] {engine.isFighterRecall ? '全员召回' : '自由交火'}
              </span>
            </div>
            {engine.playerWings.map((wing) => {
              const isBroadsword = wing.specId === 'broadsword';
              const aliveCount = isBroadsword
                ? engine.fighters.filter(f => f.isPlayer && !f.isDead).length
                : engine.bombers.filter(b => b.isPlayer && !b.isDead).length;

              return (
                <div key={wing.wingId} className="flex items-center justify-between text-[9px]">
                  <span>{wing.name.replace('中队', '')}</span>
                  <span className="font-mono font-bold text-[#b4ff32]">
                    {aliveCount}/{wing.maxCrafts} (CRR {Math.round(wing.crr * 100)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
