# Web 右键与浏览器手势冲突 · 2026-09-30

## 原版证据 → 预期 → 差异 → 验证

- 原版版本：`../starsector-core/starsector.log:1` 为 Starsector 0.98a-RC8。`../decompiled/starfarer_obf/com/fs/starfarer/util/A/A.java:126–145` 从 `Mouse.getEventButton()` 和 `Mouse.getEventButtonState()` 生成 MOUSE_DOWN / MOUSE_UP，保留鼠标按钮；这是本机桌面输入证据，不是浏览器手势行为证据。
- 原版界面：本次只补 Web 输入事件默认行为的取消，不变更右键技能、护盾、Shift 修饰键、UI 布局或网络命令；不操作用户桌面。没有对应原版右键实机复验，待核实，不宣称原版等价。
- 预期：在游戏、工作台及 body 下的弹窗内，尽早取消右键按下、松开、auxclick 和按住右键移动的浏览器默认行为，同时让事件继续到达原有游戏处理器；文字编辑区域保留原生编辑菜单，普通左键、滚轮及链接中键不受影响。
- 当前差异：`browserGestureGuard.ts` 仅拦截 contextmenu、侧键导航和中键自动滚动，未覆盖右键按下/松开/拖动；监听在 body 上，晚于 document 捕获监听。单机右键按下在游戏 hook 中取消默认行为，但联机 `LanBattle.tsx` 主要取消 contextmenu，页面其它右键动作依赖全局保护。
- 实现边界：在 Window 捕获阶段做游戏区域默认行为取消，不使用 stopPropagation / stopImmediatePropagation，不取消 pointerdown（否则会抑制游戏依赖的兼容 mousedown/mouseup）。浏览器内置手势、提前注册或不尊重 defaultPrevented 的扩展、鼠标驱动动作可能不受网页控制；这部分必须由浏览器站点排除或关闭手势处理，不虚构网页可彻底禁用它们。
- 验证：集中执行一次类型检查和改动文件 lint；用独立无头 Chromium 重放现有右键/手势输入场景，核实捕获时机、右键传播、按住移动、弹窗、输入框、普通滚轮、链接中键及卸载。另核对真实页面启动入口加载了保护。无头环境不带用户扩展，不能据此宣称实际浏览器手势问题已完全消除。未提交、打包或发布。

## 实现与验收结果

- `src/ui/browserGestureGuard.ts` 改为 Window 捕获、按 root 作用域过滤；补齐非文字区域的右键 down/up/auxclick 与右键按住移动默认行为取消。保留传播，未改技能、护盾和联机命令；未取消 pointerdown，保留原有鼠标兼容事件。
- 独立无头 Microsoft Edge（Chromium 154.0.4258.48，无用户配置/扩展）验证：trusted 右键按下与松开各一次到达 document 捕获和游戏 Window 冒泡层，且 document 捕获阶段已 defaultPrevented；4 次按住右键移动继续传播并取消默认行为，pointerdown 未被取消。52 条 DOM 回归通过，覆盖弹窗、文字编辑及 role=textbox 子元素、左右中/侧键、滚轮/捏合、拖放、限定 root 与卸载。
- 真实 `http://127.0.0.1:5173/` 入口已挂载，四种右键事件取消默认行为，页面没有捕获到运行时错误。结果存于 `artifacts/browser-right-click-gesture-20260930/verification.json`。
- `npm run typecheck` 未通过：除本轮 Window/HTMLElement 联合监听器的 3 个事件推断错误（已补显式 WheelEvent/MouseEvent 注解并修复）外，当前引力字段、CombatHudView/ShipSystem 类型另有错误，未修改那些文件、未因此重跑全套。修复后本次文件单独 tsc、oxlint 与 diff 空白检查通过。
- 以上只能证明 Web 默认行为取消、事件传播及真实入口安装，不能证明用户的浏览器内置手势或扩展已被禁用，也不是完整战斗技能/联机回执验收。用户实际浏览器仍需刷新复验；如浏览器/扩展忽略取消标志，需要由用户按站点排除或禁用手势。未操作桌面、修改浏览器设置、改存档、构建发布版、提交或发布。
