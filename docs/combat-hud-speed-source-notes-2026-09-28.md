# 战斗 HUD：移除侧边舰名、航速并入状态区（2026-09-28）

## 编码前对照
- 用户明确要求删除截图中的舰名块，并把航速放到更合适的位置；这是用户授权的 Web 布局调整，不以原版像素复刻为名改变布局。
- 原版来源：本机 `starsector-core/starsector.log:1` 为 0.98a-RC8。`decompiled/starfarer_obf/com/fs/starfarer/class/new/return.java:103-132,144-151,495-499` 在左下 HUD 分别创建舰名/型号、幅能/结构标签、进度条和右对齐数值；`decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8-9` 提供实时位置/速度。此轮保留状态值的真实来源，不修改航速规则。
- 画面证据：用户的 Web 裁图显示“航速 26.0”和换行舰名独占一列；不是原版截图。当前 `AuthenticTacticalConsole.tsx` 的 `combat-paperdoll` 已只剩航速和身份，装甲图实际位于核心状态区；CSS 仍给旧列预留 92/80px，并在窄屏隐藏整列、另显示重复舰名。
- 预期：删除身份列和窄屏重复舰名；航速以一行左标签、右实时数字放在结构条下方、技能列表上方，沿用一位小数，附 SU/s 单位说明。控制台改为状态/武器两列，同时回收旧列宽度，不扩大遮挡；装甲图及模块选择回调、技能与联队按钮保持不动。
- 验证：一次类型检查、改动文件 lint，复用 `check-adun-ark-browser.mjs` 增加 `--hud-only` 定向场景。真实改装→战斗 Worker，静止/推进值与只读 HUD 投影一致，宽/中/窄窗口无旧身份列、速度不溢出，装甲模块键盘选择及联队召回仍有效；截图目视检查。只用独立无头浏览器，不操作桌面，不修改存档或发布。
- 边界：当前无原版同分辨率画面对照，原版实机仍待许可；不声称此自选新位置就是原版航速位置。

## 验收结果
- 已删除桌面身份列与窄屏重复舰名，航速移到结构条下方，读数仍取 `player.vel.length().toFixed(1)`。回收旧 92/80px 列及间隔；不改舰船名称数据、敌舰信息、暂停菜单、装甲图或输入回调。
- `tsc -b --pretty false` 和三份改动 TSX/JS 的 oxlint 通过；CSS 随真实 Vite 页面加载并由浏览器布局断言验证。
- `node scripts/check-adun-ark-browser.mjs --hud-only` 通过：真实独立 Worker 推进使航速从静止增加，显示值与根舰 HUD 投影一致；模块键盘切换后仍显示根舰速度；召回/出击按钮正常。
- 1920×1080、1280×900、820×900、560×900 均验证只有一处航速、无身份列/空槽、两列布局、航速位于结构条与技能列表之间且不越界。已目视检查 1920 与 560 宽的控制台截图，数值和单位未截断。浏览器 pageerror/资源错误均为空。
- 记录在 `artifacts/adun-ark/speed-hud.json`；截图为 `speed-hud-full.png` 和 `speed-hud-{1920,1280,820,560}.png`。修改前备份保存在 `artifacts/combat-hud-speed-20260928/before/`。
- 本轮只改 HUD 呈现和定向验收，不改之前舰载机 AI，不操作桌面、提交、打包或发布；未新增原版实机或多人联机验收。
