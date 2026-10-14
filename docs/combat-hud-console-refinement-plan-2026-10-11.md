# 局内左下角战斗控制台（Tactical Console）视觉精修策划案（2026-10-11）

## 一、 目标与玩家体验

- **核心目标**：解决当前战斗局内左下角信息面板（[`AuthenticTacticalConsole.tsx`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/hud/AuthenticTacticalConsole.tsx) / [`combat-presentation.css`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/combat-presentation.css)）“深蓝矩形黑块贴死边缘、左列装甲图孤立悬空、右列武器状态左右拉扯出大片空洞、文字与按钮层次粗糙”的问题。
- **已确认的产品取舍**：采用用户确认的 **“精修现代透明双栏 HUD 风格”** —— 去除生硬贴边的 95% 不透明深蓝大色块，改为通透渐隐背景与 1px 战术细线分区；左列改为“装甲图 + 载荷/结构/航速”紧凑并排；消除右列武器状态列表中间的大片空洞，优化武器组、按键徽标与状态指示的字重和视觉层次。

---

## 二、 本次范围与明确不做的内容

### 1. 本次范围
- [`src/ui/hud/AuthenticTacticalConsole.tsx`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/hud/AuthenticTacticalConsole.tsx)：重组左列核心遥测区（`.hud-core-telemetry`：左侧紧凑装甲图 `.hud-ship-portrait` + 右侧 `.hud-telemetry-gauges` 载荷/结构/航速三行），优化系统技能行与状态浮标结构。
- [`src/ui/combat-presentation.css`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/combat-presentation.css)：
  - 移除 `:root[data-ui-theme="vanguard"] .combat-console` 的不透明深蓝矩形背景覆盖，改为左下角柔和渐隐衬底与细线分栏；
  - 精修左列载荷/结构进度条、航速读数、战术系统按钮、状态提示标签的对齐与层次；
  - 精修右列武器组选中态、编号徽标、齐射/交替与自动开火开关，以及“武器状态”列表的紧凑排布（消除左右两端拉扯造成的中间空白）。

### 2. 明确不做的内容
- 不改动任何战斗模拟逻辑、武器开火规则、幅能/结构计算、模块接管协议或联机指令回调；
- 不改动右下角雷达、右上角目标检视卡、顶部暂停状态条或 `Tab` 战术地图；
- 不恢复旧版已删除的侧边重复舰名列（保持 `combat-hud-speed-source-notes-2026-09-28.md` 的验收契约）。

---

## 三、 原版依据与当前差异对照

| 维度 | 原版 0.98a-RC8 依据 (`_return.java` / `F.java` / `oOOO.java`) | 当前实现问题（见用户实机截图） | 本次精修方案 |
| :--- | :--- | :--- | :--- |
| **背景与边界** | `_return.java:251` 使用向外羽化 20px 的柔和暗角衬底，无生硬矩形色块边框 | `:root[data-ui-theme="vanguard"] .combat-console` 强加了 95% 不透明深蓝渐变矩形且 `padding: 0`，文字贴死边缘 | 移除深蓝实心方块，采用柔和羽化暗角衬底 + 1px 战术细线内部分隔，保持战场通透感与呼吸间距 |
| **左列核心遥测与装甲图** | 装甲图（`_new`）与幅能/结构条（`I`）、系统状态（`B`）、速度/增益（`C`）紧凑分布于左下象限 | 载荷/结构条占满宽，92×92 装甲图孤悬在左列下部中央，两侧大片空白；零载荷加速被推到最底部 | 左列顶部设为 `.hud-core-telemetry`：**左侧 76×76 装甲图 + 右侧紧凑载荷/结构/航速三行并排**，下方紧接系统技能与紧凑状态徽标 |
| **右列武器组与挂点状态** | `F.java` 武器组紧凑排列；`oOOO.java` 挂点状态宽度收敛为 200px，武器名与状态紧密相邻 | 右列过宽且 `.hud-mount-status > div` 使用全宽 `justify-between`，导致左端“耀星针”与右端“就绪”之间隔出十几厘米空白 | 收敛右列有效宽度并加入列间细线分隔；武器状态项采用紧凑双列/微胶囊行（带虚线引导或紧凑间距），让武器名与就绪/冷却状态紧密成对 |

---

## 四、 界面布局、视觉层级与交互流程

### 1. 左列：舰船遥测与战术系统区（`.combat-console-body`）
- **顶部异常/增益提示带（`.hud-console-alerts`）**：
  - 当触发“载荷排空”、“载荷过载”、“相位线圈负荷”、“零载荷加速”、“引擎受损”、“战备衰减”时，以紧凑的微透状态徽标（带 14px 战术图标与左侧高亮色标）显示，不拉出突兀的通栏顶线。
- **核心遥测并排区（`.hud-core-telemetry`）**：
  - **左侧本舰装甲图（`.hud-ship-portrait`）**：桌面端 `78×78px`（窄屏 `<= 900px` 自动隐藏），保留复合模块点击接管火控与键盘 `ArrowLeft`/`ArrowRight`/`Home` 切换功能。
  - **右侧三行核心读数（`.hud-telemetry-gauges`）**：
    1. **载荷行（`[data-meter="flux"]`）**：上行左对齐 `载荷` 标签、右对齐 `当前 / 上限` 等宽数字；下行 `6px` 高锐利进度条（含硬载荷游标与高载荷脉冲高亮）。
    2. **结构行（`[data-meter="hull"]`）**：上行左对齐 `结构` 标签、右对齐 `当前 / 上限` 等宽数字；下行 `6px` 高结构进度条（低结构 `<25%` 告警变红）。
    3. **航速行（`.hud-ship-speed`）**：左对齐 `航速` 标签，右对齐高亮实时数值 `[data-speed-value]` + `SU/s` 单位（严格保持位于 `hull` 下方、`systems` 上方的纵向拓扑关系）。
- **战术系统技能列表（`.hud-system-list`）**：
  - 每个系统按钮采用紧凑单卡双行/左文右铭牌布局：左侧为 `SystemIcon` + 系统名称 + 当前状态（就绪/运行中/冷却秒数/充能数），右侧为金属铜色按键徽标 `<kbd>F</kbd>` / `<kbd>右键</kbd>`；激活或冷却时呈现清晰的状态色提示。

### 2. 右列：武器组火控与挂点状态区（`.combat-console-armament`）
- **列间分隔**：与左列之间通过 `1px` 半透明战术垂直细线（`var(--ds-hud-divider)`）自然分区。
- **武器组列表（`.hud-weapon-groups`）**：
  - 选中组左侧带有 `2px` 亮色战术指示条与微透高亮背景，组号徽标 `1`–`7` 高亮；
  - 武器条目紧凑显示 `24×24` 武器图标、`数量× 武器名` 与伤害类型/弹药副标题；
  - 右侧 `[齐射/交替]` 与 `[自动 ●]` 按钮对齐收敛，悬停与激活态边界清晰。
- **选中组武器状态（`.hud-mount-details` / `.hud-mount-status`）**：
  - 标题行显示 `武器状态` 与挂点数量徽标；
  - 列表当挂点数 `>= 4` 时自动采用 **2 列紧凑网格**（`< 4` 时采用紧凑单列 + 引导虚线填充），彻底消除武器名称与“就绪/冷却/弹药”读数之间的大片空白。
- **航母机库甲板（`.hud-carrier-deck`）**：
  - 存在舰载机联队时，在底部紧凑展示各联队在空/编制数、停靠数与 CRR 战备率，保留 `[Z] 本舰联队召回/出击` 按钮。

---

## 五、 联机权威、并发及存档影响

- 本次修改仅涉及局内 HUD 呈现层（React 视图结构与 CSS 样式），所有玩家操作（切换武器组、齐射/交替、自动开火、激活系统、召回战机、模块火控接管）100% 沿用既有 `onShipCommand` 权威回调，不影响联机同步、Worker 帧耗时或存档格式。

---

## 六、 实施顺序与验收标准

1. **阶段一（已完成）**：更新 [`src/ui/hud/AuthenticTacticalConsole.tsx`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/hud/AuthenticTacticalConsole.tsx)，将 `.hud-ship-portrait` 调整至 `.combat-console-body` 内部紧邻载荷/结构/航速三行左侧（CSS Grid `78px minmax(132px, 1fr)`，`grid-row: span 3`），并为 `.hud-mount-status` 补充 `data-mount-count` 与挂点项 `data-state`（`ready` / `cooling` / `disabled`），保持所有无障碍属性、测试锚点与回调不变。
2. **阶段二（已完成）**：更新 [`src/ui/combat-presentation.css`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/ui/combat-presentation.css)，去除 `:root[data-ui-theme="vanguard"] .combat-console` 的 95% 不透明深蓝实底色块，应用 `.combat-console::before` 柔和羽化暗角衬底、`1px` 战术垂直细线分栏、左列紧凑并排遥测、左嵌色标的战术系统按钮与状态徽标，以及右列紧凑双列矩阵（单挂点收敛至 `180px`）武器状态布局。
3. **阶段三（最少必要验证，已完成）**：
   - `npm run typecheck:combat`：**0 errors**；
   - `npx oxlint src/ui/hud/AuthenticTacticalConsole.tsx`：**0 warnings, 0 errors**；
   - `node scripts/check-adun-ark-browser.mjs --hud-only`：**PASS**（验证真实 Worker 权威推进航速更新、多模块键盘切换火控、航母联队召回/出击，以及 `1920×1080`、`1280×900`、`820×900`、`560×900` 四档视口布局契约全部通过，无 `pageerror` 或资源缺失）。

---

## 七、 验收结果与状态区分

- **源码核实**：已对照原版 `0.98a-RC8` `decompiled/starfarer_obf/com/fs/starfarer/class/new/return.java` 及本仓 `docs/ui-design-system-2026-09-26.md`、`docs/combat-hud-speed-source-notes-2026-09-28.md`。
- **Web 无头实机验证**：已在独立无头浏览器中验证常规单舰（烛渊·标准配装）与多模块航母（亚顿之矛·方舟）在 `1920×1080`、`1280×900`、`820×900`、`560×900` 下的实际渲染与交互：
  - 左下角深蓝实心矩形黑块已移除（`backgroundColor: rgba(0, 0, 0, 0)`，`boxShadow: none`），由柔和羽化暗角与 `1px` 垂直细线分栏替代；
  - `1920×1080` 与 `1280×900` 下，`78×78` / `70×70` 装甲图位于载荷/结构/航速三行左侧（`portrait.right <= flux.left`），下方紧接系统按钮与状态徽标；`820×900` 与 `560×900` 窄屏自动隐藏装甲图并保持双栏不溢出；
  - 右列“武器状态”采用 2 列紧凑战术矩阵（单挂点自动收敛为 `180px` 宽），彻底消除了武器名称与“就绪/冷却”状态之间的大片空洞。
- **仍未验证**：原版桌面实机同屏对比待后续许可，本次未触碰桌面窗口或键鼠。

