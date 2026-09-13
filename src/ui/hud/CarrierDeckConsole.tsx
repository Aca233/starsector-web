import React from 'react';
import { CombatEngine } from '../../engine/simulation/CombatEngine';

export interface CarrierDeckConsoleProps {
  engine: CombatEngine;
}

export const CarrierDeckConsole: React.FC<CarrierDeckConsoleProps> = ({ engine }) => {
  const playerWings = engine.playerWings || [];
  const isRecall = engine.isFighterRecall;

  if (playerWings.length === 0) return null;

  return (
    <div className="bg-black/85 border border-[#94ff00]/60 p-2 text-xs font-mono select-none text-[#94ff00] drop-shadow-[0_0_3px_rgba(148,255,0,0.5)] flex flex-col gap-1.5 w-[220px]">
      <div className="flex items-center justify-between border-b border-[#94ff00]/40 pb-1">
        <span className="font-bold text-[11px] tracking-wide">机库甲板</span>
        <button
          onClick={() => engine.toggleFighterRecall()}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-[#94ff00]/60 hover:bg-[#94ff00]/20 text-[#94ff00] transition"
          title="[Z] 切换自由突击 / 全员召回"
        >
          [Z] {isRecall ? '全员召回' : '自由交火'}
        </button>
      </div>

      {/* 联队状态列表 */}
      <div className="flex flex-col gap-1">
        {playerWings.map((wing) => {
          const isBroadsword = wing.specId === 'broadsword';
          const aliveCount = isBroadsword
            ? engine.fighters.filter(f => f.isPlayer && !f.isDead).length
            : engine.bombers.filter(b => b.isPlayer && !b.isDead).length;

          const crrPercent = Math.round(wing.crr * 100);
          const activeRebuild = wing.rebuildQueue[0];

          return (
            <div key={wing.wingId} className="border-b border-[#94ff00]/20 pb-1 flex flex-col gap-0.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-bold truncate">{wing.name.replace('中队', '')}</span>
                <span className="font-mono text-[#b4ff32]">
                  {aliveCount} / {wing.maxCrafts}
                </span>
              </div>

              <div className="flex items-center justify-between text-[9px] text-[#94ff00]/80">
                <span>战备率 (CRR)</span>
                <span>{crrPercent}%</span>
              </div>

              {activeRebuild ? (
                <div className="flex items-center justify-between text-[9px] text-amber-300">
                  <span className="animate-pulse">重构中...</span>
                  <span>{activeRebuild.timer.toFixed(1)}s</span>
                </div>
              ) : (
                <div className="text-[9px] text-[#94ff00]/60">
                  {aliveCount === wing.maxCrafts ? '满编巡航' : '整备待命'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
