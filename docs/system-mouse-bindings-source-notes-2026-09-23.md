# 技能鼠标侧键绑定修正 · 2026-09-23

## 原版证据 → 预期 → 当前差异 → 验证

- 本机版本：`../starsector-core/starsector.log:1` 为 Starsector 0.98a-RC8。
- 原版输入：`../decompiled/starfarer_obf/com/fs/starfarer/util/A/A.java:126–145` 的 `Object()` 使用 `Mouse.getEventButton()` 生成 MOUSE_DOWN / MOUSE_UP，保留鼠标按钮编号，并非把鼠标转换成字母键。只能证明底层事件支持鼠标按钮，不能据此声称原版设置页支持技能侧键绑定。
- 原版界面：当前没有用户提供的对应按键设置截图；遵守不操作桌面的约定，原版设置页默认/录入/冲突状态与实体鼠标侧键行为均待核实。本次是已有 Web 多技能快捷键功能的输入补全，不宣称原版等价，不改变技能规则或设置页结构。
- 预期：点击原有键帽后，字母或鼠标两个侧键都能录入；直接槽位与轮选释放共用冲突检查、保存和 HUD 标签；侧键单次按下产生一次已有 system 命令。左键开火、右键技能/Shift 右键护盾、中键、数字武器组不改动；侧键不触发浏览器前进/后退。
- 当前差异：`SystemBindingSettings.tsx` 仅监听 keydown；`SystemBindings.ts` 仅允许 KeyA–KeyZ；`useCombatInput.ts` 的 mousedown 仅处理左/右键。现有 `browserGestureGuard.ts` 已取消侧键 mousedown/mouseup/auxclick 默认导航而保留传播，技能输入不得因这个 defaultPrevented 而丢弃侧键。
- 编码约定：使用 DOM 按钮编号 3/4，对应持久化 Mouse3/Mouse4、显示侧键 1/2；保持原 v1 存储键，旧字母配置无需迁移。录入只接受无修饰键，战斗允许 Shift 操舰时使用侧键，与现有字母技能相同。
- 验证方法：集中运行一次类型检查、改动文件 lint；复用现有无头浏览器战斗/手势场景，覆盖设置录入与保存、刷新保留、重复绑定拒绝、轮选释放、实际战斗侧键命令、失焦/弹窗隔离和导航取消。实体设备驱动直接发送浏览器/系统命令的情况无法用 DOM 注入证明，列为待用户实机复验。

## 实现与验收结果

- 实现范围：`SystemBindings.ts` 接受 Mouse3/Mouse4 并提供侧键标签；`SystemBindingSettings.tsx` 聚焦录入期间在窗口捕获侧键，保留即时保存与装配页「应用更改」两种语义；`CombatCommands.ts` 共用现有槽位/轮选映射；`useCombatInput.ts` 把侧键交给现有 system 命令通道。不改动默认 F/G/H、战斗规则或网络协议。
- `npm run typecheck` 通过；4 个改动 TS/TSX 文件 oxlint 通过。
- 无头 Chromium 回归 15 项通过（`artifacts/system-mouse-bindings-2026-09-23/verification.json`）：两个侧键在键帽外录入、冲突拒绝、删除、轮选、弹窗隔离、装配草稿应用、刷新保留、真实 useCombatInput 直接/轮选命令各一次、Shift 操舰、Ctrl 过滤、浏览器导航取消、战术地图隔离、左/右/中键不覆盖、无运行时错误。
- 测试输入采用 Chromium CDP 的 back/forward mousePressed/mouseReleased（浏览器 trusted 事件），非仅调用设置函数。复用了现有 browser-gestures 场景的 DOM 默认行为/传播断言；轻量场景使用真实设置组件、输入 hook、命令映射与导航 guard，接收端是记录命令的 session 替身，不声称完成完整战斗引擎/联机端到端验证。
- 设置组件截图已检查：两个侧键标签完整显示，原结构、按钮与间距保持。完整战斗页成功加载并打开设置；因完整场景加载/响应较慢，侧键回归在轻量场景完成。原版设置实机、实体设备驱动、完整战斗技能生效与多人回执仍待对应实机复验。
- 未操作用户桌面，未修改原版资源/用户存档，未构建发布版、提交或发布。
