import React, { useEffect } from 'react';
import { BattleResult } from '../engine/simulation/CombatStatistics';
import { Trophy, Skull, RefreshCw, SlidersHorizontal, Eye, Shield, Zap, Target, Plane } from 'lucide-react';

export interface CombatResultsModalProps {
  battleResult: BattleResult;
  onRestart: () => void;
  onOpenModManager: () => void;
  onClose: () => void;
}

export const CombatResultsModal: React.FC<CombatResultsModalProps> = ({
  battleResult,
  onRestart,
  onOpenModManager,
  onClose
}) => {
  const { isVictory, rank, combatDuration, playerStats } = battleResult;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onRestart();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onOpenModManager();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onRestart, onOpenModManager]);

  const totalDmg = Math.max(1, playerStats.totalDamageDealt);
  const kRatio = (playerStats.kineticDamage / totalDmg) * 100;
  const heRatio = (playerStats.heDamage / totalDmg) * 100;
  const eRatio = (playerStats.energyDamage / totalDmg) * 100;
  const fRatio = (playerStats.fragDamage / totalDmg) * 100;

  const rankColors = {
    S: 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.6)]',
    A: 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.5)]',
    B: 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-[0_0_16px_rgba(14,165,233,0.4)]',
    C: 'bg-slate-700/30 border-slate-500 text-slate-300',
    D: 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
  };

  return (
    <div data-testid="combat-results-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md font-mono select-none pointer-events-auto p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-950/95 border border-cyan-500/60 rounded-lg shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden flex flex-col">
        
        {/* 顶部军规抬头横幅 */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isVictory 
            ? 'bg-gradient-to-r from-cyan-950/80 via-slate-900/80 to-emerald-950/80 border-cyan-500/40' 
            : 'bg-gradient-to-r from-red-950/80 via-slate-900/80 to-amber-950/80 border-red-500/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full border ${
              isVictory 
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]' 
                : 'bg-red-500/20 border-red-400 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
            }`}>
              {isVictory ? <Trophy size={24} /> : <Skull size={24} />}
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-wider ${isVictory ? 'text-cyan-300' : 'text-red-400'}`}>
                {isVictory ? '战区大捷 · 目标旗舰已被击沉' : '旗舰战沉 · 核心反应堆熔毁'}
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>战术空域战斗评估报告</span>
                <span>•</span>
                <span>耗时: {combatDuration.toFixed(1)} 秒</span>
              </div>
            </div>
          </div>

          {/* 综合评价等级 */}
          <div className={`px-4 py-1.5 rounded border text-center font-black ${rankColors[rank]}`}>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest">战术评级</div>
            <div className="text-2xl leading-none mt-0.5">{rank}</div>
          </div>
        </div>

        {/* 核心数据网格 */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
          
          {/* 1. 伤害输出分类统计 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex items-center justify-between text-slate-200 font-bold border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Target size={14} />
                <span>旗舰武器火力输出 (DAMAGE DELT)</span>
              </div>
              <span className="text-cyan-300 text-sm font-black">{Math.round(playerStats.totalDamageDealt).toLocaleString()}</span>
            </div>

            {/* 伤害构成比例条 */}
            <div className="w-full h-2.5 bg-slate-950 rounded overflow-hidden flex">
              <div style={{ width: `${kRatio}%` }} className="bg-sky-500 title" title="动能伤害" />
              <div style={{ width: `${heRatio}%` }} className="bg-amber-500" title="高爆伤害" />
              <div style={{ width: `${eRatio}%` }} className="bg-cyan-400" title="能量伤害" />
              <div style={{ width: `${fRatio}%` }} className="bg-slate-400" title="破片伤害" />
            </div>

            {/* 详细数值 */}
            <div className="grid grid-cols-4 gap-2 text-[11px] pt-1">
              <div className="bg-slate-950/60 p-1.5 rounded border border-sky-900/40">
                <div className="text-sky-400 font-semibold">动能 (KINETIC)</div>
                <div className="text-slate-200 font-bold mt-0.5">{Math.round(playerStats.kineticDamage).toLocaleString()}</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-amber-900/40">
                <div className="text-amber-400 font-semibold">高爆 (HE)</div>
                <div className="text-slate-200 font-bold mt-0.5">{Math.round(playerStats.heDamage).toLocaleString()}</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-cyan-900/40">
                <div className="text-cyan-400 font-semibold">能量 (ENERGY)</div>
                <div className="text-slate-200 font-bold mt-0.5">{Math.round(playerStats.energyDamage).toLocaleString()}</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-700/40">
                <div className="text-slate-400 font-semibold">破片 (FRAG)</div>
                <div className="text-slate-200 font-bold mt-0.5">{Math.round(playerStats.fragDamage).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* 2. 防御抗损与幅能统计 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold border-b border-slate-800 pb-1.5">
                <Shield size={14} />
                <span>防御与装甲抗损</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">护盾吸收幅能:</span>
                  <span className="text-cyan-300 font-bold">{Math.round(playerStats.shieldDamageAbsorbed).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">装甲硬抗吸收:</span>
                  <span className="text-amber-300 font-bold">{Math.round(playerStats.armorDamageSoaked).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">结构承受损伤:</span>
                  <span className="text-red-400 font-bold">{Math.round(playerStats.hullDamageTaken).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold border-b border-slate-800 pb-1.5">
                <Zap size={14} />
                <span>火控压制与电浆过载</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">迫使敌舰过载:</span>
                  <span className="text-emerald-400 font-bold">{playerStats.overloadsInflicted} 次</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">自身过载受创:</span>
                  <span className={playerStats.overloadsSuffered > 0 ? 'text-red-400 font-bold' : 'text-slate-300 font-bold'}>
                    {playerStats.overloadsSuffered} 次
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">电离 EMP 损伤:</span>
                  <span className="text-sky-300 font-bold">{Math.round(playerStats.empDamageDealt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 防空近炸拦截与舰载机制空权 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-purple-400 font-bold border-b border-slate-800 pb-1.5">
              <Plane size={14} />
              <span>航空母舰舰载机与点防拦截</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">近炸拦截导弹</div>
                <div className="text-emerald-400 font-bold text-sm mt-0.5">{playerStats.missilesIntercepted} 枚</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">击坠敌方战机</div>
                <div className="text-cyan-300 font-bold text-sm mt-0.5">{playerStats.fightersDestroyed} 架</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">友方战机阵亡</div>
                <div className="text-red-400 font-bold text-sm mt-0.5">{playerStats.fightersLost} 架</div>
              </div>
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">机库甲板重构</div>
                <div className="text-purple-300 font-bold text-sm mt-0.5">{playerStats.fightersRebuilt} 架</div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作控制栏 */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white flex items-center gap-1.5 text-xs transition"
          >
            <Eye size={13} />
            <span>自由观察战场残骸 [ESC]</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenModManager}
              className="px-3.5 py-1.5 rounded border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300 flex items-center gap-1.5 text-xs transition"
            >
              <SlidersHorizontal size={13} />
              <span>更换旗舰与武器 [MOD]</span>
            </button>
            <button
              onClick={onRestart}
              className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold flex items-center gap-1.5 text-xs transition shadow-[0_0_12px_rgba(6,182,212,0.5)]"
            >
              <RefreshCw size={13} />
              <span>重新开始战斗 [R]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
