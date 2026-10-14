# UI/UX 重构执行记录（2026-10-01）

状态：视觉、公共控件、页面样式归属和本轮可复现交互已落地；按用户“快速完成”要求进入交付收尾。**不宣称整个最初计划已全部达标**：全量分层、CSS 行数减少 30% 和全页面对比度仍有差距。此记录替代此前逐轮状态。

## 已确认的范围

- 默认 Vanguard：青色/琥珀色、玻璃底色、角标、细网格与辉光；`?ui=classic` 可回退。
- 桌面保留左列表、中舰体、右属性、底部操作区；600px 以下参数栏抽屉已获批准。
- native-menu 字体为有意删除；文字使用系统字体，不恢复删除的字体文件。
- 主代理独立、后台文件及无头验收；不操作桌面、不启动子代理、不暂存/提交/推送/发布。
- 生涯不在范围内；保留其他任务改动，不改舰船玩法、存档、协议、快捷键；不添加口号或装饰性英文。

## 已交付

1. **视觉与页面**：首页、装配、选择器、设置、HUD 的 Vanguard；公共 palette/语义 token；明亮背景 HUD 的局部深色底。
2. **公共控件**：NativeControls、Button、Modal/ConfirmDialog、Picker、Tooltip/EquipmentTooltip、Stepper、SearchInput、EmptyState、PageState。旧模块路径保留兼容。
3. **交互**：Esc、Tab 循环、背景 inert、焦点归还、嵌套弹窗边界；Picker 的方向键/Home/End 只移动焦点，Enter/点击执行原回调；F2 百科流程保留。
4. **移动装配**：参数栏抽屉复用原控件和业务回调；关闭内层技能弹窗后保留参数抽屉；触屏控件尺寸检查单独记录。
5. **错误/空状态**：空技能目录不崩溃，数量使用实际目录；进度条分母为零时显示 0%；visual-lab 缺少指定舰体时明确说明并提供返回入口，不替换为虚构舰体。
6. **说明卡修复**：选择舰船后抑制指针重入导致的立即重开；重新移入或键盘聚焦仍可查看。模块舰提示卡优先避开当前及邻近挂点。

## 样式归属与层

- `src/ui/core/components.css` 为共享按钮、框架、文字、说明卡、恢复页的实际 owner；按原 theme → motion → context → Vanguard → native → reader 顺序保存级联。旧 theme/motion/outside-interface/original-interface 路径为兼容导入。
- `src/ui/core/modal-layout.css` 在 ds-components 层统一 Modal、header/body/footer 的布局；11 个页面的 154 处布局声明改成 --ds-modal-* 变量，在 ds-pages 层配置。保留尺寸、滚动、隐藏标题及窄屏覆盖。重复的 63 处 layer/rule 包装已合并，媒体条件边界保留。
- `src/studio/refit.css` 统一原五个装配章节，以及参数抽屉、舰体/挂点、武器提示、舰载机小组件；studio.css 与旧小组件 CSS 路径为兼容入口。
- `src/ui/combat-presentation.css` 统一 HUD 基础、部署、控制台、目标、战术地图、通知、状态、暂停菜单。战斗设置对快捷键标题/说明的旧优先级已明确写出，避免加载提前改变文字。
- `src/network/lan.css` 统一入口、角色/AI 说明、房间列表和 AI 编成，保留原入口 → 延迟房间依赖顺序。模块只移除 CSS 导入，不改传输或回执逻辑。
- ds-tokens 已实际承载色板/token；ds-components/pages 已承载公共 Modal 布局与页面配置。其余历史 paint/字体仍有未分层桥接，**ds-theme 和全部旧覆盖尚未全面迁入**。不能用空层声明冒充全量完成。
- 核心保留两处减少动效 !important；业务例外已清零。ShipPaperDoll 的 cssSized 接口移除六处 HUD 尺寸例外，位图及命中坐标换算保留。

## 指标

命令：`node scripts/check-ui-debt.mjs --compare artifacts/uiux-rework/baseline/baseline.json`。排除 src/campaign；统计口径不变，没有改名/压缩格式制造下降。

| 指标 | 基线 | 当前 | 状态 |
| --- | --- | --- | --- |
| CSS 文件 / 行数 | 47 / 7,233 | 56 / 6,820 | 行数 -5.7%；未达 -30% |
| 颜色字面量 | 1,521 | 64 | ≤100 达成；主要为色板 |
| 字面量 ≤10px 字号 | 69 | 0 | 达成 |
| !important | 43 | 2 | 仅减少动效例外 |
| 在 ≥3 文件出现的样式类 | 94 | 20 | ≤20 达成；仍含祖先/状态作用域 |
| 内联 style={{ | 46 | 45 | 保留动态/初始呈现参数 |
| TS CSS imports | 49 | 24 | 减少 25 处 |

57 个 JSX style 属性已逐项记录用途，包含 style={变量/函数}，口径大于上表字面量：`artifacts/uiux-rework/audit/inline-styles-reviewed.json`。保留舰体/模块/挂点坐标、缩放、预算/仪表、阵营配色、退出时长和首次挂载隐藏；固定底层容器及旧存档窗口布局也如实记录，没有称其全部动态。

## 验证与证据

### 源码核实

原版区域/画面依据既有审计及 `artifacts/ui-unified/refit-style-design.png`、`after-combat.png`；资源/反编译依据见历史 `docs/native-ui-system.md`。Vanguard 为用户要求的视觉扩展，不称原版等价皮肤。所有 UI 回调继续连接既有业务，未修改存档、协议及舰船规则。

### Web 验证

- modal-layout / modal-layers / shared-owner：每轮 19 个状态，错误 0、阻塞 0；所检查的几何、字体和计算样式差异为 0。
- readers-owner-extra：武器组、方案、舰载机、390px 设置、390px 嵌套技能弹窗，5 个状态错误/阻塞/样式差异均为 0。
- owner-final：18 个状态无几何/字体/计算样式差异；战斗设置发现的加载顺序回归随后定向修正。
- combat-order-fixed：战斗设置、战术地图、战斗、暂停、装配的字体/计算样式差异为 0。部署截图有 4 处框宽变化，来源为右上实际 FPS 数字从两位变一位（57px→51px）；原始差异保留，没有改快照假装归零。
- lan-owners-final 对照保存的迁移前源码：房间列表与 AI 编成 2 个状态，几何/字体/计算样式差异均为 0，运行错误/阻塞 0。此为无 socket 的呈现夹具，不代表真实联机回执。
- check-drawer / check-mount-tooltip 既有场景：参数增减、Tab/Esc/inert/焦点归还、桌面 resize、列表方向键；Gloriana 12 挂点避让及 F2 通过。
- 类型检查及改动文件 oxlint 通过；/verify-change、/verify-quality 本环境不可用，没有虚称执行。
- 亮背景旧场景：34 处可见非禁用文字最低计算对比度 5.74:1；不代表全页面 AA。
- touch-controls-final：390×844、粗指针，首页、音频、画面、战斗设置、百科、技能、LAN 入口、装配、参数抽屉、嵌套技能弹窗共 10 状态，错误/阻塞 0；117 处当前可见启用控件/关联 label 的尺寸检查通过（跨状态统计，非去重）。密集图面挂点作为明确例外，不混入通过数。声音/画面滑杆已扩大到 44px。
- 最新 ui-vanguard/check：两主题首页、设置、装配与控制台几何一致；错误 0。

逐元素快照/截图：`artifacts/uiux-rework/owner-final/`、`combat-order-fixed/`、`readers-owner-extra/`、`lan-owners-final/`。最新债务：`audit/debt-final.json`。迁移前文件仅保存在 artifacts，不还原或覆盖工作区其他改动。

### 未验证及未达目标

未操作原版桌面，真实多人回执、全页面文字对比度、所有触控/嵌套状态仍不能称全部通过；准确状态见覆盖清单。密集舰体挂点的触控保留图面位置，使用缩放/装配列表，不能把它们称作全部 44px。visual-lab 的指定舰体缺失及已知安装数据问题由内容任务处理，UI 不掩盖。EULA/原版资源状态未解决。

工程剩余目标为：全部 paint/字体/按钮覆盖迁入完整层并变量化、CSS 行数 -30%、完整对比度覆盖。此轮没有为了快速结束而压缩 CSS 或取消这些目标；如需继续，沿当前 owner/变量契约完成。
