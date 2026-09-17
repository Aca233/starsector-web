import React from "react";
import { DEFAULT_MOUSE_STEERING } from "../engine/runtime/CombatControlSettings";
import { Keycap, Modal, Section } from "./core/UI";

const groups = [
  {
    title: "舰船操纵",
    rows: [
      ["W / S", "前进 / 倒车"],
      ["A / D", "舰船左转 / 右转"],
      ["Q / E", "左移 / 右移"],
      ["Shift（按住）", "船头跟随鼠标，A / D 改为横移"],
      ["X", "沿当前速度方向制动"],
      ["鼠标指针", "武器瞄准，镜头平滑偏向鼠标方向；当前已关闭船头跟随"],
      ["U", "切换自动驾驶；自动驾驶时由 AI 接管推进、开火、系统和防御"],
    ],
  },
  {
    title: "武器与防御",
    rows: [
      ["鼠标左键", "发射选定武器组"],
      ["鼠标右键", "优先使用独立防御；否则开关护盾 / 相位潜航"],
      ["1–7", "选择武器组"],
      ["Ctrl + 1–7", "切换武器组自动开火"],
      ["Shift + 1–7", "切换武器组齐射 / 交替（不改变选中组）"],
      ["鼠标悬停", "仅显示鼠标下舰船的幅能 / 结构 / 战备；移开隐藏，R 锁定详情保留"],
      ["R", "锁定鼠标下的可见敌舰并显示详情；同舰 / 空白处再按 R 取消，其他敌舰则切换"],
      ["F", "激活舰船系统（与右键独立防御分开）"],
      ["V", "排散幅能"],
    ],
  },
  {
    title: "战术与界面",
    rows: [
      ["Esc", "打开 / 关闭暂停菜单"],
      ["Space", "暂停 / 继续战斗"],
      ["Tab", "打开 / 关闭战术地图"],
      ["G（模拟地图）", "打开盟军 / 敌军舰船部署，不自动暂停；部署完成自动关闭地图"],
      ["左键（地图）", "选择单位"],
      ["右键（地图）", "对敌集火 / 设置航路点（旗舰收到指令后开启自动驾驶）"],
      ["A / Del（地图）", "选择全舰 / 取消指令"],
      ["拖动 / 滚轮（地图）", "平移 / 缩放战术地图"],
      ["F / Home（地图）", "定位所选舰船 / 全览可见接触"],
      ["F2（地图）", "舰船信息与地图操作说明"],
      ["D / L / M / H（友舰）", "原地防守 / 轻型、中型、重型护航"],
      ["R / V / E（敌舰）", "设为目标 / 回避 / 集中攻击"],
      ["Z", "切换当前舰船的联队出击 / 召回，不影响其他航母"],
      ["M", "切换沙盒舰船"],
      ["Esc 菜单", "重新开始当前战斗（需确认）"],
      ["H / Esc", "关闭本指南"],
    ],
  },
];
export function TacticalHelpPanel({
  shipActionLabel,
  weaponGroupCount = 7,
  hasFighters,
  canRestart,
  hasSystem,
  hasShield,
  defaultMouseSteering = DEFAULT_MOUSE_STEERING,
  onDefaultMouseSteeringChange,
  onClose,
}: {
  shipActionLabel?: string;
  weaponGroupCount?: number;
  hasFighters: boolean;
  canRestart: boolean;
  hasSystem: boolean;
  hasShield: boolean;
  defaultMouseSteering?: boolean;
  onDefaultMouseSteeringChange?: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="战术操作"
      eyebrow="操作手册"
      description="界面快捷键与当前战斗操纵方式。松开推进键会保持滑行，使用 X 主动制动。"
      onClose={onClose}
      onShortcut={(key) => {
        if (key === "h") onClose();
      }}
    >
      {onDefaultMouseSteeringChange && (
        <Section title="鼠标转向设置">
          <label className="ui-help-row">
            <span>默认鼠标转向（反转 Shift 行为）</span>
            <input
              type="checkbox"
              checked={defaultMouseSteering}
              onChange={(event) =>
                onDefaultMouseSteeringChange(event.target.checked)
              }
            />
          </label>
          <p className="ui-caption">
            {defaultMouseSteering
              ? "当前：船头跟随鼠标，A/D 横移；按住 Shift 恢复 A/D 转向。Q/E 始终横移。"
              : "当前：鼠标只瞄准武器，A/D 转向；按住 Shift 让船头跟随鼠标。Q/E 始终横移。"}
          </p>
        </Section>
      )}
      {groups.map((group) => (
        <Section key={group.title} title={group.title}>
          <div className="ui-help-grid">
            {group.rows
              .filter(
                ([key]) =>
                  (key !== "Z" || hasFighters) &&
                  (key !== "Esc 菜单" || canRestart) &&
                  (key !== "F" || hasSystem) &&
                  (key !== "鼠标右键" || hasShield),
              )
              .map(([key, text]) => (
                <div className="ui-help-row" key={key}>
                  <span>
                    {key === "M" && shipActionLabel
                      ? shipActionLabel
                      : defaultMouseSteering && key === "A / D"
                        ? "左移 / 右移（按住 Shift 改为转向）"
                        : defaultMouseSteering && key === "Shift（按住）"
                          ? "暂停鼠标转向，A / D 改为转向"
                          : defaultMouseSteering && key === "鼠标指针"
                            ? "武器瞄准并引导船头转向，镜头平滑偏向鼠标方向"
                            : text}
                  </span>
                  <Keycap>{key.replace("1–7", `1–${weaponGroupCount}`)}</Keycap>
                </div>
              ))}
          </div>
        </Section>
      ))}
    </Modal>
  );
}
