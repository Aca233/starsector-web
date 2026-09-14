import React, { useState, useEffect } from 'react';
import { CombatEngine } from '../engine/simulation/CombatEngine';
import { FixedTimestepScheduler } from '../engine/simulation/FixedTimestepScheduler';
import { Locale } from '../engine/i18n/LocalizationManager';
import { Vector2 } from '../engine/math/Vector2';
import { 
  X,
  Gauge,
  Layers
} from 'lucide-react';
import { ShipPaperDoll } from './hud/ShipPaperDoll';
import { PlayerStatusCard } from './hud/PlayerStatusCard';
import { TargetStatusCard } from './hud/TargetStatusCard';
import { WeaponsConsole } from './hud/WeaponsConsole';
import { RadioChatterLog } from './hud/RadioChatterLog';
import { CarrierDeckConsole } from './hud/CarrierDeckConsole';
import { AuthenticTacticalConsole } from './hud/AuthenticTacticalConsole';
import { FloatingShipHUD } from './hud/FloatingShipHUD';
import { CombatRadar } from './hud/CombatRadar';
import { getHudDensity } from './hud/HudLayout';

// 导出子组件，保证对外模块与测试兼容性
export { 
  ShipPaperDoll, 
  PlayerStatusCard, 
  TargetStatusCard, 
  WeaponsConsole, 
  RadioChatterLog, 
  CarrierDeckConsole, 
  AuthenticTacticalConsole, 
  FloatingShipHUD, 
  CombatRadar 
};

export interface TacticalHUDProps {
  engine: CombatEngine;
  scheduler: FixedTimestepScheduler;
  onSwitchShip: (shipId: string) => void;
  onReset: () => void;
  onOpenModManager: () => void;
  currentLocale: Locale;
  onToggleLocale: () => void;
  isAutopilot?: boolean;
  onToggleAutopilot?: () => void;
  onActivateSystem?: () => void;
  cameraPosRef?: React.MutableRefObject<Vector2>;
  zoomRef?: React.MutableRefObject<number>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  engine,
  scheduler,
  onReset,
  onOpenModManager,
  isAutopilot,
  onToggleAutopilot,
  cameraPosRef,
  zoomRef,
  canvasRef
}) => {
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [hudDensity, setHudDensity] = useState(() => getHudDensity(typeof window !== 'undefined' ? window.innerWidth : 1920, typeof window !== 'undefined' ? window.innerHeight : 1080));
  const [, setHudTick] = useState(0);

  const player = engine.playerShip;
  const enemy = engine.enemyShip;

  // 快捷键监听: [H] 打开战术指南, [M] 打开模组工坊
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setShowHelpDrawer((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        onOpenModManager();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenModManager]);

  useEffect(() => {
    const updateDensity = () => setHudDensity(getHudDensity(window.innerWidth, window.innerHeight));
    updateDensity();
    window.addEventListener('resize', updateDensity);
    return () => window.removeEventListener('resize', updateDensity);
  }, []);

  // Keep mutable simulation snapshots local to the HUD subtree. The render loop no
  // longer forces the entire App tree to rerender every 100 ms.
  useEffect(() => {
    const timer = window.setInterval(() => setHudTick((tick) => tick + 1), 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="hud-overlay select-none pointer-events-none font-mono"
      data-hud-density={hudDensity}
      data-combat-input-block
    >
      {/* 1. 战术指挥地图全景模式 (仅在按 TAB 展开时显示) */}
      {engine.isTacticalMap && (
        <div className="hud-tactical-bar pointer-events-auto absolute top-12 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-[#94ff00]/70 px-4 py-1.5 rounded flex items-center gap-3 text-xs font-mono shadow-[0_0_24px_rgba(148,255,0,0.4)] z-50 whitespace-nowrap text-[#94ff00]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#94ff00] animate-ping" />
            <span className="font-bold tracking-wider">战术指挥雷达 (TAC-OPS)</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="font-bold text-emerald-400">
            CP: {engine.commandPoints} / {engine.maxCommandPoints}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-sky-300">
            阔剑: {engine.fighters.filter(f => f.isPlayer && !f.isDead).length}架
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-purple-300">
            匕首: {engine.bombers.filter(b => !b.isDead).length}架
          </span>
          <span className="text-slate-600">|</span>
          <button
            onClick={() => engine.toggleFighterRecall()}
            className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
              engine.isFighterRecall
                ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                : 'bg-[#94ff00]/25 border-[#94ff00] text-white'
            }`}
          >
            [Z] {engine.isFighterRecall ? '全员召回防卫' : '全员自由交战'}
          </button>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[11px]">
            左键:选择 | 右键敌舰:集火 | 右键空地:航路点
          </span>
          <span className="text-slate-600">|</span>
          <button 
            onClick={() => engine.toggleTacticalMap()}
            className="text-amber-300 hover:text-amber-200 font-bold underline text-[11px]"
          >
            [TAB] 退出
          </button>
        </div>
      )}

      {/* 2. 舰载原生近空浮动战况标牌 (1:1 原版实机照片 media_1789200834134.png & ship_tag_crop.png) */}
      {!player.isDead && (
        <FloatingShipHUD
          ship={player}
          isEnemy={false}
          cameraPosRef={cameraPosRef}
          zoomRef={zoomRef}
          canvasRef={canvasRef}
        />
      )}

      {!enemy.isDead && (
        <FloatingShipHUD
          ship={enemy}
          isEnemy={true}
          cameraPosRef={cameraPosRef}
          zoomRef={zoomRef}
          canvasRef={canvasRef}
        />
      )}

      {/* 3. 左下角：1:1 原版战术武器控制台 (AuthenticTacticalConsole: media_1789200834134.png) */}
      <div className="hud-console-anchor pointer-events-auto absolute z-20">
        <AuthenticTacticalConsole player={player} engine={engine} />
      </div>

      {/* 4. 极简不侵入式右上角快捷操作指示 (平时高度半透明，悬浮时呈现，不破坏纯正实机战斗沉浸感) */}
      <div className="hud-quickbar-anchor pointer-events-auto absolute flex items-center gap-1.5 font-mono text-[10px] opacity-25 hover:opacity-100 transition-opacity duration-300 select-none z-30 bg-[#0a141c]/60 border border-[#94ff00]/20 px-2 py-1 rounded backdrop-blur-sm">
        <button
          onClick={() => engine.toggleTacticalMap()}
          className="px-1.5 py-0.5 hover:bg-[#94ff00]/20 text-[#94ff00] rounded"
          title="[TAB] 切换战术指挥地图"
        >
          <span className="text-[#ffd200]">[TAB]</span> 地图
        </button>
        <button
          onClick={onToggleAutopilot}
          className={`px-1.5 py-0.5 rounded transition ${
            isAutopilot 
              ? 'bg-emerald-950/80 border border-emerald-400 text-emerald-300 font-bold' 
              : 'hover:bg-[#94ff00]/20 text-[#94ff00]'
          }`}
          title="[U] 切换自动驾驶托管"
        >
          <span className="text-[#ffd200]">[U]</span> {isAutopilot ? 'AUTO' : '托管'}
        </button>
        <button
          onClick={onOpenModManager}
          className="px-1.5 py-0.5 hover:bg-[#94ff00]/20 text-[#94ff00] rounded"
          title="[M] 打开装配与模组工坊"
        >
          <span className="text-[#ffd200]">[M]</span> MOD
        </button>
        <button
          onClick={onReset}
          className="px-1.5 py-0.5 hover:bg-[#94ff00]/20 text-[#94ff00] rounded"
          title="[R] 重启本场战斗"
        >
          <span className="text-[#ffd200]">[R]</span>
        </button>
        <button
          onClick={() => setShowHelpDrawer(prev => !prev)}
          className="px-1.5 py-0.5 hover:bg-[#94ff00]/20 text-[#94ff00] rounded"
          title="[H] 操作指令指南"
        >
          <span className="text-[#ffd200]">[H]</span>
        </button>
      </div>

      {/* 5. 右下角原版风格战术雷达：固定像素内容，自身随 HUD density 缩放。 */}
      <div className="hud-radar-anchor pointer-events-none absolute z-20">
        <CombatRadar engine={engine} />
      </div>

      {/* 5. 底部右侧：浏览器帧与主线程工作占比（不是 CPU/GPU idle） */}
      <div className="hud-perf-anchor pointer-events-none absolute text-[#94ff00]/40 font-mono text-[10px] select-none">
        FPS: {scheduler.measuredFPS} | JS Work: {scheduler.measuredFrameBudgetPercent}%
      </div>

      {/* 7. [H] 战术指令帮助抽屉 (仅按 H 键呼出) */}
      {showHelpDrawer && (
        <div className="hud-help-anchor pointer-events-auto absolute w-84 bg-[#0a141c]/95 border border-[#94ff00]/50 p-4 rounded text-xs shadow-2xl backdrop-blur text-[#94ff00]">
          <div className="flex items-center justify-between border-b border-[#94ff00]/30 pb-2 mb-3">
            <span className="font-bold text-sm text-white">战术操作与系统指南 [H]</span>
            <button
              onClick={() => setShowHelpDrawer(false)}
              className="text-[#94ff00]/60 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center justify-between bg-black/80 border border-[#94ff00]/25 px-3 py-1.5 rounded mb-3 text-[10px]">
            <div className="flex items-center gap-1.5 text-[#94ff00]">
              <Gauge size={12} />
              <span>FPS: {scheduler.measuredFPS}</span>
            </div>
            <div className="h-3 w-px bg-[#94ff00]/30" />
            <div className="flex items-center gap-1.5 text-[#94ff00]">
              <Layers size={12} />
              <span>TPS: {scheduler.measuredTPS} (60Hz)</span>
            </div>
            <div className="h-3 w-px bg-[#94ff00]/30" />
            <span className="text-[#94ff00]/60">α: {scheduler.alpha.toFixed(2)}</span>
          </div>

          <div className="border-t border-[#94ff00]/25 pt-2 text-[10px] space-y-1.5 text-[#94ff00]/90">
            <div className="text-white font-bold mb-1">🎮 官方战术操纵指令表</div>
            <div>• <span className="text-[#ffd200] font-bold">鼠标指针</span>: 自动引导舰船转向瞄准鼠标准星</div>
            <div>• <span className="text-[#ffd200] font-bold">W / S 键</span>: 主推进前进 / 倒车姿态制动</div>
            <div>• <span className="text-[#ffd200] font-bold">A / D 键</span>: 舰体左侧向平移 / 右侧向平移 (Strafe)</div>
            <div>• <span className="text-[#ffd200] font-bold">1 ~ 5</span>: 选定激活武器组 (Active Group)</div>
            <div>• <span className="text-[#ffd200] font-bold">Ctrl + 1~5</span>: 启闭该组自动火控 (Autofire)</div>
            <div>• <span className="text-[#ffd200] font-bold">鼠标左键</span>: 击发当前选定武器组</div>
            <div>• <span className="text-[#ffd200] font-bold">鼠标右键</span>: 升降能量护盾 / 相位潜航</div>
            <div>• <span className="text-[#ffd200] font-bold">F 键</span>: 激活旗舰战术系统 (冲刺/堡垒/空雷)</div>
            <div>• <span className="text-[#ffd200] font-bold">C 键</span>: 发射诱饵热焰弹 (Active Flares)</div>
            <div>• <span className="text-[#ffd200] font-bold">空格 / V 键</span>: 紧急主动散热排散 (Vent Flux)</div>
            <div>• <span className="text-[#ffd200] font-bold">U 键</span>: 启闭旗舰战术自动驾驶托管 (Autopilot)</div>
            <div>• <span className="text-[#ffd200] font-bold">M 键</span>: 打开舰船装配与模组管理 (Mod Manager)</div>
            <div>• <span className="text-[#ffd200] font-bold">Tab 键</span>: 切换全景战术指挥雷达地图</div>
            <div>• <span className="text-[#ffd200] font-bold">H 键</span>: 打开/隐藏本指南</div>
          </div>
        </div>
      )}
    </div>
  );
};
