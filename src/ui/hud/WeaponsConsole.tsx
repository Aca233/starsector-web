import React from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { Bot } from 'lucide-react';
import { summarizeGroupAmmo } from './hudUtils';

/**
 * 官方正统底部中央武器控制台 (使用 weapons_bar_... 与 weapon_status_bg.png)
 */
export const WeaponsConsole: React.FC<{ player: Ship; isAutopilot?: boolean }> = ({ player, isAutopilot }) => {
  const totalFluxRatio = Math.min(1.0, player.flux.totalFlux / player.spec.maxFlux);
  const hardFluxRatio = Math.min(1.0, player.flux.hardFlux / player.spec.maxFlux);

  const mountsOfGroup = (slotIds: string[]) => player.weapons.filter((w) => slotIds.includes(w.slotId));
  const activeGroup = player.weaponGroups[player.selectedGroupIndex];
  const activeAmmo = summarizeGroupAmmo(activeGroup ? mountsOfGroup(activeGroup.weaponSlotIds) : []);

  return (
    <div className="w-[640px] flex flex-col items-center">
      {/* 官方自动战术托管指示条 (Autopilot Indicator) */}
      {isAutopilot && !player.flux.isOverloaded && (
        <div className="mb-2 px-3 py-0.5 bg-emerald-950/90 border border-emerald-400 rounded text-emerald-300 font-mono text-[11px] tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse">
          <Bot size={13} />
          <span>[U] 旗舰自动战术托管中 (AUTOPILOT ENGAGED)</span>
        </div>
      )}

      {/* 官方紧急过载与排散战斗警报条 (Centered Combat Alerts) */}
      {player.flux.isOverloaded && (
        <div className="mb-2 px-4 py-1 bg-red-950/90 border-2 border-red-500 rounded text-red-300 font-bold text-xs tracking-widest uppercase animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.8)] flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          <span>过载！ OVERLOADED! {player.flux.overloadTimer.toFixed(1)}s</span>
        </div>
      )}
      {player.flux.isVenting && !player.flux.isOverloaded && (
        <div className="mb-2 px-4 py-1 bg-cyan-950/90 border-2 border-cyan-400 rounded text-cyan-200 font-bold text-xs tracking-widest uppercase animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.8)] flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span>正在排散热量 VENTING FLUX...</span>
        </div>
      )}

      {/* 顶部 Starsector 经典横幅幅能仪表 */}
      <div className="w-full flex items-center justify-between mb-1 px-1 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-cyan-300 font-bold tracking-wider">
            FLUX: {Math.round(player.flux.totalFlux)} / {player.spec.maxFlux}
          </span>
          <span className="text-slate-400 text-[10px]">
            ({Math.round(totalFluxRatio * 100)}%)
          </span>
          {/* 当前编组剩余弹药 (导弹/火箭等有限弹药武器) */}
          {activeAmmo.limited && (
            <span
              className={`font-bold tracking-wider ${
                activeAmmo.allEmpty ? 'text-red-400 animate-pulse' : activeAmmo.lowest <= 2 ? 'text-amber-300' : 'text-amber-200/90'
              }`}
              title="当前编组剩余弹药 / 弹药上限"
            >
              {activeAmmo.allEmpty ? '弹药耗尽 NO AMMO' : `弹药 AMMO: ${activeAmmo.remaining}/${activeAmmo.capacity}`}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400">
          <span className="text-[#ffd200] font-bold">[V]</span> {player.flux.isVenting ? '正在排散 (VENTING...)' : '主动排散 (Vent)'}
        </div>
      </div>

      {/* 横向幅能槽 */}
      <div className="w-full h-3 bg-slate-950/90 border border-slate-700/80 rounded flex overflow-hidden p-0.5 mb-2 shadow-inner">
        <div 
          className="h-full bg-fuchsia-500/90 transition-all duration-75"
          style={{ width: `${hardFluxRatio * 100}%` }}
        />
        <div 
          className="h-full bg-cyan-400/90 transition-all duration-75"
          style={{ width: `${Math.max(0, (totalFluxRatio - hardFluxRatio)) * 100}%` }}
        />
      </div>

      {/* 5 武器组卡槽 (使用 weapon_status_bg.png) */}
      <div className="w-full grid grid-cols-5 gap-2">
        {player.weaponGroups.map((group, gIdx) => {
          const isActive = player.selectedGroupIndex === gIdx;
          const mountsInGroup = mountsOfGroup(group.weaponSlotIds);
          const firstMount = mountsInGroup[0];
          const count = mountsInGroup.length;
          const isAutofire = group.isAutofire;
          const ammo = summarizeGroupAmmo(mountsInGroup);

          // 计算最高冷却进度与故障抢修状态
          const anyDisabled = mountsInGroup.some((m) => m.isDisabled);
          const maxDisabledTimer = mountsInGroup.reduce((acc, m) => Math.max(acc, m.disabledTimer), 0);
          const maxCd = mountsInGroup.reduce((acc, m) => Math.max(acc, m.cooldownTimer), 0);
          const maxCdDuration = mountsInGroup.reduce((acc, m) => Math.max(acc, m.spec.refireDelay || 1), 0);
          const cdRatio = maxCdDuration > 0 ? Math.min(1.0, maxCd / maxCdDuration) : 0;

          return (
            <div
              key={group.index}
              onClick={() => player.selectWeaponGroup(group.index)}
              className={`relative h-[68px] rounded cursor-pointer transition-all duration-100 flex flex-col justify-between p-1.5 select-none ${
                anyDisabled
                  ? 'border-2 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                  : isActive
                  ? 'border-2 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.5)] scale-[1.02]'
                  : 'border border-slate-700/70 hover:border-slate-500/80 opacity-90'
              }`}
              style={{
                backgroundImage: 'url(/game-assets/graphics/hud/weapon_status_bg.png)',
                backgroundSize: '100% 100%',
                backgroundColor: 'rgba(15, 23, 42, 0.85)'
              }}
            >
              {/* 顶部: 组号 + 射击模式切换 */}
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className={`px-1 rounded text-[9px] ${anyDisabled ? 'bg-amber-600 text-slate-950 font-mono' : isActive ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>
                  [{group.index + 1}]
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    player.toggleFireMode(group.index);
                  }}
                  className="text-[9px] px-1 py-0.2 rounded hover:bg-slate-700/70 text-slate-400 hover:text-cyan-300 font-mono transition"
                  title="点击切换齐射/交替开火模式 (LINKED / ALTERNATING)"
                >
                  {group.mode === 'LINKED' ? 'LNK' : 'ALT'}
                </button>
              </div>

              {/* 中部: 武器名称与数量 */}
              <div className="truncate my-0.5">
                {firstMount ? (
                  <div>
                    <div className="text-[10px] font-bold text-slate-200 truncate">
                      {count > 1 ? `${count}x ` : ''}
                      {i18n.t(firstMount.spec.nameKey).replace(/（.*）/, '').replace(/\(.*\)/, '')}
                    </div>
                    <div className="text-[8px] text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                      <span>{firstMount.spec.type}</span>
                      {/* 有限弹药武器 (火箭/导弹/点防连发) 显示剩余弹药 */}
                      {ammo.limited && (
                        <span
                          className={`font-mono font-bold tracking-tight ${
                            ammo.allEmpty ? 'text-red-400' : ammo.lowest <= 2 ? 'text-amber-300' : 'text-amber-200/90'
                          }`}
                        >
                          {ammo.allEmpty ? '弹尽' : `弹药 ${ammo.remaining}/${ammo.capacity}`}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-500 italic">空编组</div>
                )}
              </div>

              {/* 底部: 冷却条 / 故障抢修指示 + 自动开火按钮 */}
              <div className="flex items-center justify-between gap-1">
                {/* 冷却进度条 / 故障抢修倒计时 */}
                {anyDisabled ? (
                  <div className="flex-1 px-1 py-0.2 bg-amber-950/80 border border-amber-500/80 rounded flex items-center justify-between text-[8px] font-mono text-amber-300 font-bold animate-pulse">
                    <span>OFFLINE</span>
                    <span>{maxDisabledTimer.toFixed(1)}s</span>
                  </div>
                ) : (
                  <div className="flex-1 h-1.5 bg-slate-950 rounded overflow-hidden">
                    <div 
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{
                        width: `${(1 - cdRatio) * 100}%`,
                        backgroundImage: 'url(/game-assets/graphics/hud/weapons_bar_cooldown.png)',
                        backgroundSize: 'cover'
                      }}
                    />
                  </div>
                )}

                {/* AUTO 开关 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    player.toggleAutofire(gIdx);
                  }}
                  className={`px-1 py-0.2 rounded text-[8px] flex items-center gap-0.5 border ${
                    isAutofire
                      ? 'border-emerald-400/60 text-emerald-300 bg-emerald-950/40 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                      : 'border-slate-700 text-slate-500 bg-slate-900/60 hover:border-slate-500'
                  }`}
                  title="点击切换自动开火 (Ctrl + 编组号)"
                >
                  <div className={`w-1 h-1 rounded-full ${isAutofire ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-slate-600'}`} />
                  <span>AUTO</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
