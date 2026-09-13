import React from 'react';
import { Ship } from '../../engine/simulation/Ship';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { ShipPaperDoll } from './ShipPaperDoll';

/**
 * 官方正统右上角目标状态卡 (使用 target_status_bg2.png, bar_armor.png, bar_energy.png)
 */
export const TargetStatusCard: React.FC<{ enemy: Ship; dist: number }> = ({ enemy, dist }) => {
  const enemyHullRatio = Math.max(0, enemy.hullHp / enemy.spec.hitpoints);
  const enemyFluxRatio = Math.min(1.0, enemy.flux.totalFlux / enemy.spec.maxFlux);

  return (
    <div className="flex items-start gap-3">
      {/* 战术雷达锁定目标数据卡 */}
      <div className="bg-slate-950/85 border border-red-500/50 p-2.5 rounded text-[11px] font-mono shadow-2xl text-right min-w-[130px]">
        <div className="text-red-400 font-bold text-xs tracking-wider flex items-center justify-end gap-1">
          <span>{i18n.t(enemy.spec.nameKey).split(' ')[0]}</span>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          {enemy.spec.designationKey ? i18n.t(enemy.spec.designationKey) : '战列舰'}
        </div>
        <div className="text-[10px] text-slate-300 mt-1">
          距离: <span className="text-red-300 font-bold">{dist}</span> SU
        </div>
        <div className="text-[9px] text-red-400/80 mt-0.5">
          {enemy.shield.isActive ? 'SHIELD ACTIVE' : 'SHIELD DOWN'}
        </div>
      </div>

      {/* 官方目标状态框 target_status_bg2.png (247x203) */}
      <div 
        className="relative w-[247px] h-[203px] select-none"
        style={{
          backgroundImage: 'url(/api/asset?path=graphics/hud/target_status_bg2.png)',
          backgroundSize: '247px 203px',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* 垂直结构条 Slot 1 (x: 6px, y: 5px, w: 14px, h: 184px) */}
        <div className="absolute left-[6px] top-[5px] w-[14px] h-[184px] overflow-hidden flex flex-col justify-end">
          <div
            className="w-full transition-all duration-100"
            style={{
              height: `${Math.round(enemyHullRatio * 184)}px`,
              backgroundImage: 'url(/api/asset?path=graphics/hud/bar_armor.png)',
              backgroundRepeat: 'repeat-y',
              backgroundPosition: 'bottom center',
              filter: 'hue-rotate(-90deg) saturate(1.8)'
            }}
          />
        </div>

        {/* 垂直幅能条 Slot 2 (x: 25px, y: 5px, w: 14px, h: 184px) */}
        <div className="absolute left-[25px] top-[5px] w-[14px] h-[184px] overflow-hidden flex flex-col justify-end">
          <div
            className={`w-full transition-all duration-75 ${enemy.flux.isOverloaded ? 'animate-pulse' : ''}`}
            style={{
              height: `${Math.round(enemyFluxRatio * 184)}px`,
              backgroundImage: 'url(/api/asset?path=graphics/hud/bar_energy.png)',
              backgroundRepeat: 'repeat-y',
              backgroundPosition: 'bottom center',
              filter: enemy.flux.isOverloaded ? 'hue-rotate(180deg) saturate(3)' : 'none'
            }}
          />
        </div>

        {/* 右侧 198x198 目标纸娃娃区域 (x: 45px, y: 0px) */}
        <div className="absolute top-[0px] left-[45px] w-[198px] h-[198px]">
          <ShipPaperDoll ship={enemy} isEnemy={true} />
        </div>
      </div>
    </div>
  );
};
