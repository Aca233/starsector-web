import { effectiveHullStats } from '../engine/extensions/HullMods';
import { useState } from "react";
import type { ShipSpec } from "../engine/content/ShipSpec";
import { i18n } from "../engine/i18n/LocalizationManager";
import { NativeButton } from "./NativeChrome";
import { ShipStage } from "../studio/ShipStage";
import { Modal } from "./core/UI";
import { TacticalHelpPanel } from "./TacticalHelpPanel";
import { NativeBitmapText } from "./NativeBitmapText";
import "./combat-pause-menu.css";

/** Native simulation menu: ship on the left; settings/end/resume on the right. */
export function CombatPauseMenu({
  spec,
  shipName,
  endLabel,
  onSettings,
  onEnd,
  onResume,
  onRestart,
  restartLabel = "重新开始",
}: {
  spec: ShipSpec;
  shipName?: string;
  endLabel: string;
  onSettings: () => void;
  onEnd: () => void;
  onResume: () => void;
  onRestart?: () => void;
  restartLabel?: string;
}) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  return (
    <>
    <Modal title="暂停菜单" eyebrow="" onClose={onResume} initialFocus="panel">
      <div className="combat-pause-layout">
        <section className="combat-pause-ship" aria-label="当前舰船">
          <div className="combat-pause-ship-name">
            <span title={shipName ?? i18n.t(spec.nameKey)}>
              <NativeBitmapText font="caption" color="rgba(255,255,255,0.392)">{shipName ?? i18n.t(spec.nameKey)}</NativeBitmapText>
            </span>
            <span><NativeBitmapText font="caption" color="rgba(255,255,255,0.392)">{i18n.t(spec.designationKey)}</NativeBitmapText></span>
          </div>
          <div className="combat-pause-portrait">
            <ShipStage spec={spec} home />
          </div>
        </section>
        <div className="combat-pause-actions">
          <NativeButton className="combat-pause-button" font="action" align="right" onClick={onSettings}>游戏设置</NativeButton>
          <div className="combat-pause-end-actions">
            {onRestart && <NativeButton className="combat-pause-button" font="action" align="right" onClick={() => setConfirmRestart(true)}>{restartLabel}</NativeButton>}
            <NativeButton className="combat-pause-button" font="action" align="right" onClick={onEnd}>{endLabel}</NativeButton>
            <NativeButton className="combat-pause-button" font="action" align="right" onClick={onResume}>返回游戏</NativeButton>
          </div>
        </div>
      </div>
    </Modal>
    {confirmRestart && onRestart && <Modal title={restartLabel + '？'} eyebrow="操作确认" width="small"
      description="本次战斗进度将被清空，舰船设计和已保存的装配方案不会改变。"
      onClose={() => setConfirmRestart(false)} footer={<>
        <NativeButton onClick={() => setConfirmRestart(false)}>取消</NativeButton>
        <NativeButton onClick={() => { setConfirmRestart(false); onRestart(); }}>确认{restartLabel}</NativeButton>
      </>}><p>继续后将重新开始本次战斗。</p></Modal>}
    </>
  );
}

export function CombatSettingsMenu({
  spec,
  defaultMouseSteering,
  onDefaultMouseSteeringChange,
  muted,
  onMutedChange,
  hasFighters,
  canRestart,
  shipActionLabel,
  onClose,
  onOpenFleet,
  onOpenShips,
}: {
  spec: ShipSpec;
  defaultMouseSteering: boolean;
  onDefaultMouseSteeringChange: (value: boolean) => void;
  muted: boolean;
  onMutedChange: (value: boolean) => void;
  hasFighters: boolean;
  canRestart: boolean;
  shipActionLabel?: string;
  onClose: () => void;
  onOpenFleet?: () => void;
  onOpenShips?: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <Modal
        title="游戏设置"
        eyebrow=""
        onClose={onClose}
        footer={<NativeButton onClick={onClose}>返回</NativeButton>}
      >
        <div className="combat-settings">
          <h3>操纵</h3>
          <label>
            <span>默认鼠标转向</span>
            <input
              type="checkbox"
              checked={defaultMouseSteering}
              onChange={(event) =>
                onDefaultMouseSteeringChange(event.target.checked)
              }
            />
          </label>
          <p>
            {defaultMouseSteering
              ? "船头跟随鼠标，A / D 横移；按住 Shift 恢复键盘转向。"
              : "鼠标只控制瞄准；按住 Shift 让船头跟随鼠标。"}
          </p>
          <h3>声音</h3>
          <label>
            <span>静音</span>
            <input
              type="checkbox"
              checked={muted}
              onChange={(event) => onMutedChange(event.target.checked)}
            />
          </label>
          <h3>操作说明</h3>
          <div className="combat-settings-links">
            <NativeButton onClick={() => setHelpOpen(true)}>
              查看操作说明
            </NativeButton>
            {onOpenShips && (
              <NativeButton onClick={onOpenShips}>舰船资料</NativeButton>
            )}
            {onOpenFleet && (
              <NativeButton onClick={onOpenFleet}>舰队 / 存档</NativeButton>
            )}
          </div>
        </div>
      </Modal>
      {helpOpen && (
        <TacticalHelpPanel
          shipActionLabel={shipActionLabel}
          weaponGroupCount={spec.defaultWeaponGroups?.length ?? 7}
          hasFighters={hasFighters}
          hasSystem={spec.systemType !== "NONE"}
          hasShield={effectiveHullStats(spec).shieldType !== "NONE" || (!!spec.defenseSystemType && spec.defenseSystemType !== "NONE")}
          canRestart={canRestart}
          defaultMouseSteering={defaultMouseSteering}
          onDefaultMouseSteeringChange={onDefaultMouseSteeringChange}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </>
  );
}
