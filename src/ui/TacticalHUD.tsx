import React, { useState, useEffect } from "react";
import type { CombatHudVisuals } from "../engine/visual/CombatHudVisuals";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { FixedTimestepScheduler } from "../engine/simulation/FixedTimestepScheduler";
import { Vector2 } from "../engine/math/Vector2";
import { ShipPaperDoll } from "./hud/ShipPaperDoll";
import { AuthenticTacticalConsole } from "./hud/AuthenticTacticalConsole";
import { FloatingShipHUD } from "./hud/FloatingShipHUD";
import { CombatContacts } from "./hud/CombatContacts";
import { CombatRadar } from "./hud/CombatRadar";
import { getHudDensity } from "./hud/HudLayout";
import { TacticalMap } from "./tactical/TacticalMap";
import type { ShipCommand } from '../engine/runtime/CombatCommands';
import { CombatNotifications } from './hud/CombatNotifications';
import { TacticalHelpPanel } from "./TacticalHelpPanel";

// 导出子组件，保持现有对外模块接口
export {
  ShipPaperDoll,
  AuthenticTacticalConsole,
  FloatingShipHUD,
  CombatRadar,
};

export interface TacticalHUDProps {
  engine: CombatEngine;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  autopilot: boolean;
  onAutopilotChange: (enabled: boolean) => void;
  onShipCommand?: (command: ShipCommand) => void;
  controlNotice?: { ship: CombatEngine['playerShip'] };
  defaultMouseSteering?: boolean;
  onDefaultMouseSteeringChange?: (value: boolean) => void;
  hudVisuals?: CombatHudVisuals;
  scheduler: FixedTimestepScheduler;
  onOpenModManager: () => void;
  shipActionLabel?: string;
  cameraPosRef?: React.MutableRefObject<Vector2>;
  zoomRef?: React.MutableRefObject<number>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onHelpChange?: (open: boolean) => void;
  inputBlocked?: boolean;
  onOpenDeployment?: () => void;
  canRestart?: boolean;
  debug?: boolean;
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  engine,
  paused,
  onPausedChange,
  autopilot,
  onAutopilotChange,
  onShipCommand,
  controlNotice,
  defaultMouseSteering,
  onDefaultMouseSteeringChange,
  hudVisuals,
  scheduler,
  canRestart = true,
  debug = false,
  onOpenModManager,
  shipActionLabel,
  cameraPosRef,
  zoomRef,
  canvasRef,
  onHelpChange,
  inputBlocked = false,
  onOpenDeployment,
}) => {
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [hudDensity, setHudDensity] = useState(() =>
    getHudDensity(
      typeof window !== "undefined" ? window.innerWidth : 1920,
      typeof window !== "undefined" ? window.innerHeight : 1080,
    ),
  );
  const [, setHudTick] = useState(0);

  const player = engine.playerShip;

  useEffect(() => {
    onHelpChange?.(showHelpDrawer);
  }, [showHelpDrawer, onHelpChange]);

  // 快捷键监听: [H] 打开战术指南, [M] 打开模组工坊
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        engine.isTacticalMap ||
        e.defaultPrevented ||
        !!document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        inputBlocked ||
        e.repeat ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        target?.isContentEditable ||
        target?.closest('input, textarea, select, [role="dialog"]')
      )
        return;
      if (e.key === "h" || e.key === "H") {
        setShowHelpDrawer((prev) => !prev);
      } else if (e.key === "m" || e.key === "M") {
        onOpenModManager();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, onOpenModManager, inputBlocked]);

  useEffect(() => {
    const updateDensity = () =>
      setHudDensity(getHudDensity(window.innerWidth, window.innerHeight));
    updateDensity();
    window.addEventListener("resize", updateDensity);
    return () => window.removeEventListener("resize", updateDensity);
  }, []);

  // Keep mutable simulation snapshots local to the HUD subtree. The render loop no
  // longer forces the entire App tree to rerender every 100 ms.
  useEffect(() => {
    const timer = window.setInterval(() => setHudTick((tick) => tick + 1), 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="hud-overlay select-none pointer-events-none ui-font"
      data-hud-density={hudDensity}
      data-combat-input-block
    >
      {paused && <div className="combat-pause-status" role="status" aria-live="polite" aria-atomic="true">
        <strong>战斗已暂停</strong><span>{inputBlocked || showHelpDrawer ? '关闭当前窗口后可切换暂停' : '空格继续'}</span>
      </div>}
      <CombatNotifications engine={engine} controlNotice={controlNotice?.ship === player && !autopilot
        && !engine.battleResult && !player.isDead && player.hullHp > 0 && !player.isDocked && !player.isRetreated && !player.retreating
        ? '自动驾驶已关闭 · 已切换为手动操作' : undefined} />
      {engine.playerShip.isDead && !engine.battleResult && !engine.isTacticalMap && (
        <div className="combat-observer-hint">旗舰已损失 · WASD / 方向键观察战场 · Tab 战术地图</div>
      )}
      {engine.isTacticalMap && <TacticalMap engine={engine} paused={paused} onPausedChange={onPausedChange}
        autopilot={autopilot} onAutopilotChange={onAutopilotChange} inputBlocked={inputBlocked || showHelpDrawer}
        cameraPosRef={cameraPosRef} zoomRef={zoomRef} canvasRef={canvasRef} onOpenDeployment={onOpenDeployment} />}

      {!engine.isTacticalMap && <>
      {/* 2. 近空战况标牌（易读字体、阵营颜色和仪表尺寸） */}
      <CombatContacts engine={engine} cameraPosRef={cameraPosRef} zoomRef={zoomRef} canvasRef={canvasRef}
        scheduler={scheduler} paused={paused} blocked={inputBlocked || showHelpDrawer} />

      {/* 3. 左下角：战术武器控制台（完整布局仍需原版对照） */}
      <div className="hud-console-anchor pointer-events-auto absolute z-20" inert={!!engine.battleResult}>
        <AuthenticTacticalConsole
          player={player}
          engine={engine}
          hudVisuals={hudVisuals}
          weaponControls={onShipCommand ? {
            onSelectGroup: value => onShipCommand({ kind: 'group', value }),
            onToggleMode: value => onShipCommand({ kind: 'mode', value }),
            onToggleAutofire: value => onShipCommand({ kind: 'autofire', value }),
          } : undefined}
          onToggleRecall={onShipCommand ? () => onShipCommand({ kind: 'recall' }) : undefined}
        />
      </div>

      {/* 5. 右下角原版风格战术雷达：固定像素内容，自身随 HUD density 缩放。 */}
      <div className="hud-radar-anchor pointer-events-none absolute z-20">
        <CombatRadar engine={engine} />
      </div>

      </>}

      {/* 5. 底部右侧：浏览器帧与主线程工作占比（不是 CPU/GPU idle） */}
      {debug && (
        <div className="hud-perf-anchor pointer-events-none absolute text-[#94ff00]/40 ui-font text-[10px] select-none">
          FPS: {scheduler.measuredFPS} | JS Work:{" "}
          {scheduler.measuredFrameBudgetPercent}%
        </div>
      )}

      {/* 7. [H] 战术指令帮助抽屉 (仅按 H 键呼出) */}
      {showHelpDrawer && (
        <TacticalHelpPanel
          shipActionLabel={shipActionLabel}
          weaponGroupCount={player.weaponGroups.length}
          defaultMouseSteering={defaultMouseSteering}
          onDefaultMouseSteeringChange={onDefaultMouseSteeringChange}
          hasSystem={player.system.available}
          hasShield={player.shield.type !== "NONE" || player.defenseSystem.type !== "NONE"}
          hasFighters={[...engine.playerWings, ...engine.enemyWings].some(wing => wing.carrierId === player.id)}
          canRestart={canRestart}
          onClose={() => setShowHelpDrawer(false)}
        />
      )}
    </div>
  );
};
