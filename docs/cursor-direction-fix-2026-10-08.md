# 鼠标光标方向修正

日期：2026-10-08。用户确认问题是“页面鼠标光标的图案一直朝右”，不是系统指针漂移或舰船瞄准输入。

现状与原因：`generate-original-ui-symbols.mjs` 将 `group === 'cursors'` 与 `ship_arrow.png` 共用向右舰船箭头分支；32×32 的原创 `cursor_green.png` 因而朝右。`CombatView` 静态使用这张图片，且将热点设为中央 16,16，未对齐图形尖端。

原版最小对照：本机 0.98a-RC8 环境的 `starsector-core/graphics/cursors` 图片及 `decompiled/starfarer_obf/com/fs/starfarer/return/OoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO_cfr_47.java` 鼠标管理类已读取。该类 `Object()` 加载 blue/red cursor，`o00000(o)` 创建 32×32、0,31 的 native cursor；软件路径按鼠标位置静态绘制。原版资源箭头朝左上，不随舰船朝向旋转。此次只读取原版证据，不恢复其像素；沿用 [已授权原创 UI](original-ui-redesign-2026-09-26.md) 的几何素材及配色。未操作原版实机或取得新的原版截图，不声称新增界面等价验收。

修正方案：为 cursor 单独生成朝左上的原创箭头，保留 32×32 和逻辑路径；战斗页热点设为尖端 2,2。普通移动/悬停和离开画布沿用浏览器光标，按钮/弹窗及 crosshair fallback 保持原流程；不添加鼠标锁定、软件跟随光标或输入坐标变换。游戏规则、联机消息、并发和存档不涉及变化。

实施顺序：先分开生成器分支，再只重绘 cursor 文件并更新其溯源/manifest 的对应记录，最后改热点。验收集中查看新图片、实际浏览器的图片解码/热点与资源加载、改动文件 lint；不重生成其它 UI 图标或重跑战斗/存档全套。

待决定事项：无新的玩法取舍。尚待用户在正在使用的页面查看实际系统光标；无头页面截图不包含 OS 光标，不冒充其画面验证。

## 实际验收

已只重绘一个 32×32 cursor，独立朝左上，热点为 2,2；ship_arrow 分支保留。该资源及溯源/asset manifest 的对应字节数、hash 已更新，其它资源未重绘。浏览器实际解码宽高 32×32、CSS 热点 2,2、当前 CombatView 开发转换与原创素材溯源门禁通过，改动 JS/TSX lint 通过。原来右侧尖端像素透明，新尖端存在；放大预览已查看。证据：artifacts/cursor-fix-20261008/result.json、preview.png。

未操作用户桌面/浏览器或原版实机，未进行 OS 光标截图；服务继续运行，页面刷新后加载新图。未运行全套测试或提交/发布。
