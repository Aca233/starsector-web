import React from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { ShipPaperDoll } from './ShipPaperDoll';
import { ShieldAlert, Flame, Zap } from 'lucide-react';

/**
 * 官方正统左下角旗舰状态框 (使用 player_status_bg2.png, bar_armor.png, bar_energy.png)
 */
export interface PlayerStatusCardProps {
  player: Ship;
  onActivateSystem?: () => void;
  countermeasureCooldown?: number;
  onLaunchCountermeasures?: () => void;
}

export const PlayerStatusCard: React.FC<PlayerStatusCardProps> = ({
  player,
  onActivateSystem,
  countermeasureCooldown = 0,
  onLaunchCountermeasures
}) => {
  const hullRatio = Math.max(0, player.hullHp / player.spec.hitpoints);
  const totalFluxRatio = Math.min(1.0, player.flux.totalFlux / player.spec.maxFlux);
  const hardFluxRatio = Math.min(1.0, player.flux.hardFlux / player.spec.maxFlux);
  const speed = player.vel.length().toFixed(1);
  const crPercent = Math.round(player.currentCR * 100);
  const remainingPPT = Math.max(0, Math.ceil(player.peakPerformanceRemaining));
  const isZeroFluxBoost = player.flux.isEngineBoostActive;

  return (
    <div className="flex flex-col items-start gap-1.5 font-mono select-none">
      {/* 战术状态微章 (1:1 严格对齐 Starsector 战备与异常状态提示) */}
      <div className="flex flex-col gap-1 text-[10px] min-w-[220px]">
        {/* 幅能排空 */}
        {player.flux.isVenting && (
          <div className="flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-400/80 px-2 py-0.5 rounded animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            <img src="/game-assets/graphics/icons/tactical/venting_flux2.png" alt="" className="w-4 h-4 object-contain" />
            <span className="text-cyan-300 font-bold">幅能排散中 ({Math.ceil(player.flux.getTimeToVent())}s)</span>
          </div>
        )}

        {/* 深度过载 */}
        {player.flux.isOverloaded && (
          <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-500/80 px-2 py-0.5 rounded animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]">
            <img src="/game-assets/graphics/icons/tactical/overloaded.png" alt="" className="w-4 h-4 object-contain" />
            <span className="text-red-300 font-bold">过载中！ ({Math.ceil(player.flux.overloadTimer)}s)</span>
          </div>
        )}

        {/* 零幅能引擎加力 */}
        {isZeroFluxBoost && (
          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/50 px-2 py-0.5 rounded text-[9px] text-emerald-300">
            <img src="/game-assets/graphics/icons/tactical/engine_boost2.png" alt="" className="w-3.5 h-3.5 object-contain" />
            <span>零幅能加速 +50 SU</span>
          </div>
        )}

        {/* 峰值性能倒计时与战备值 */}
        {remainingPPT <= 60 && remainingPPT > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded text-[9px] text-amber-300 animate-pulse">
            <img src="/game-assets/graphics/icons/tactical/cr_tactical3.png" alt="" className="w-3.5 h-3.5 object-contain" />
            <span>峰值性能剩余 {remainingPPT}s (CR {crPercent}%)</span>
          </div>
        )}
      </div>

      {/* 官方军规背景框 player_status_bg2.png (247x209) */}
      <div 
        className="relative w-[247px] h-[209px] select-none shadow-2xl"
        style={{
          backgroundImage: 'url(/game-assets/graphics/hud/player_status_bg2.png)',
          backgroundSize: '247px 209px',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* 左侧 198x198 纸娃娃区域 (x: 2, y: 5) */}
        <div className="absolute top-[5px] left-[2px] w-[198px] h-[198px]">
          <ShipPaperDoll ship={player} isEnemy={false} />
        </div>

        {/* 垂直结构/装甲条 Slot 1 (x: 208px, y: 14px, w: 14px, h: 184px) */}
        <div className="absolute left-[208px] top-[14px] w-[14px] h-[184px] overflow-hidden flex flex-col justify-end">
          <div
            className="w-full transition-all duration-100"
            style={{
              height: `${Math.round(hullRatio * 184)}px`,
              backgroundImage: 'url(/game-assets/graphics/hud/bar_armor.png)',
              backgroundRepeat: 'repeat-y',
              backgroundPosition: 'bottom center',
              filter: hullRatio > 0.5 ? 'none' : hullRatio > 0.25 ? 'hue-rotate(-45deg)' : 'hue-rotate(-90deg) saturate(2)'
            }}
          />
        </div>

        {/* 垂直幅能条 Slot 2 (x: 227px, y: 14px, w: 14px, h: 184px) */}
        <div className="absolute left-[227px] top-[14px] w-[14px] h-[184px] overflow-hidden flex flex-col justify-end">
          <div
            className={`w-full transition-all duration-75 ${player.flux.isOverloaded ? 'animate-pulse' : ''}`}
            style={{
              height: `${Math.round(totalFluxRatio * 184)}px`,
              backgroundImage: 'url(/game-assets/graphics/hud/bar_energy.png)',
              backgroundRepeat: 'repeat-y',
              backgroundPosition: 'bottom center',
              filter: player.flux.isOverloaded 
                ? 'hue-rotate(180deg) saturate(3)' 
                : hardFluxRatio > 0.4 
                ? 'hue-rotate(80deg)' 
                : 'none'
            }}
          />
        </div>
      </div>

      {/* 状态读数与战术系统栏 */}
      <div className="w-[247px] bg-slate-950/85 border border-slate-700/60 p-2 rounded text-[11px] font-mono shadow-xl space-y-1">
        <div className="flex justify-between items-center text-slate-200">
          <span className="font-bold text-cyan-400 tracking-wide">
            {player.shipName || 'TTS HEGEMON'}
          </span>
          <span className="text-[10px] text-slate-400">
            航速 <span className="text-cyan-300 font-bold">{speed}</span>
          </span>
        </div>

        <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-800 pb-1">
          <span>{i18n.t(player.spec.nameKey).split(' ')[0]}级 {player.spec.designation || '战列舰'}</span>
          <span className="text-slate-300">
            装甲 {Math.round(player.armor.getIntegrityPercentage() * 100)}%
          </span>
        </div>

        <div className="flex justify-between text-[10px] text-slate-400">
          <span>结构: {Math.round(player.hullHp)}/{player.spec.hitpoints}</span>
          <span className="text-cyan-300">幅能: {Math.round(player.flux.totalFlux)}/{player.spec.maxFlux}</span>
        </div>

        {/* 战术系统 [F] */}
        <div className="flex flex-col bg-slate-900/90 border border-slate-800 px-2 py-1.5 rounded gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className={`p-0.5 rounded ${player.system.isActive ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`}>
                {player.system.type === 'BURN_DRIVE' ? <Flame size={13} /> : player.system.type === 'MINE_STRIKE' ? <Zap size={13} /> : <ShieldAlert size={13} />}
              </div>
              <span className="text-[10px] text-slate-300">
                {player.system.type === 'BURN_DRIVE' ? '冲刺推进 (Burn)' : player.system.type === 'MINE_STRIKE' ? `空雷突袭 (${player.system.charges}/${player.system.maxCharges})` : '堡垒护盾 (Fortress)'}
              </span>
            </div>
            <button
              onClick={() => {
                if (onActivateSystem) {
                  onActivateSystem();
                } else {
                  player.system.activate();
                }
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                player.system.isActive
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                  : player.system.isCoolingDown
                  ? 'bg-slate-800 text-slate-500'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              [F] {player.system.type === 'MINE_STRIKE' ? `[${player.system.charges}]` : player.system.isActive ? `${player.system.activeTimer.toFixed(0)}s` : player.system.isCoolingDown ? `${player.system.cooldownTimer.toFixed(0)}s` : 'READY'}
            </button>
          </div>

          {/* 空雷突袭充能槽 / 系统运行进度指示条 */}
          {player.system.type === 'MINE_STRIKE' ? (
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: player.system.maxCharges }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 h-1.5 rounded-xs border transition-all ${
                    idx < player.system.charges
                      ? 'bg-amber-400 border-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                />
              ))}
            </div>
          ) : player.system.isActive ? (
            <div className="w-full h-1 bg-slate-950 rounded overflow-hidden">
              <div
                className="h-full bg-amber-400 shadow-[0_0_8px_#f59e0b] transition-all duration-75"
                style={{ width: `${Math.max(0, (player.system.activeTimer / player.system.maxDuration)) * 100}%` }}
              />
            </div>
          ) : player.system.isCoolingDown ? (
            <div className="w-full h-1 bg-slate-950 rounded overflow-hidden">
              <div
                className="h-full bg-cyan-600 transition-all duration-75"
                style={{ width: `${Math.max(0, (1 - player.system.cooldownTimer / player.system.maxCooldown)) * 100}%` }}
              />
            </div>
          ) : null}
        </div>

        {/* 诱饵热焰防御对抗 [C] */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-2 py-1 rounded">
          <span className="text-[10px] text-amber-300 font-mono">诱饵热焰 (Flares)</span>
          <button
            onClick={() => onLaunchCountermeasures && onLaunchCountermeasures()}
            disabled={countermeasureCooldown > 0}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
              countermeasureCooldown > 0
                ? 'bg-slate-800 text-slate-500'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.5)]'
            }`}
          >
            [C] {countermeasureCooldown > 0 ? `${countermeasureCooldown.toFixed(0)}s` : 'READY'}
          </button>
        </div>

        {player.isPhased && (
          <div className="text-[9px] text-indigo-300 bg-indigo-950/70 border border-indigo-500/50 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
            <span>[右键] 相位空间潜航中 (P-SPACE: 3x SPEED)</span>
          </div>
        )}

        {isZeroFluxBoost && (
          <div className="text-[9px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>零幅能加速 +50 SU</span>
          </div>
        )}
      </div>
    </div>
  );
};
