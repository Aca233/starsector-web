# 多人改装插件面板毛玻璃（2026-09-21）

## 修改前最小对照

- 范围：用户明确指出仅多人模式打开舰船插件时，房间侧栏文字透过插件表格干扰阅读，并要求毛玻璃。不改联机协议、配装规则或单人外观。
- 原版来源：本机 `../starsector-core/starsector.log:1` 为 0.98a-RC8；`../decompiled/starfarer_obf/com/fs/starfarer/coreui/refit/ModPickerDialogV3.java:323-348` 将表格、分类、右侧参数/插件及返回操作布局在同一展开界面，`renderImpl:875-884` 绘制黑色半透明背景（f2 * 0.5f）。`L.java:265-269` 的不可安装行底色是状态提示，不应拿它代替整个面板的背景遮挡。
- 界面证据：已查看 `artifacts/native-refit/hullmods-reference-v2.png`；根据既有 `docs/native-descriptions-source-notes-2026-09-20.md`，这是历史 Web 参考图，不是原版实机截图。当前没有同状态的原版多人画面（原版也无此房间 UI），原版实机视觉待核实；不操作桌面或启动可见窗口。
- 当前差异：`studio.css` 中 `.source-mod-picker` 无背景/模糊，且只对单人 `.refit-roster` 做淡化。多人用 `.lan-room-sidebar` 替换该列表，房间/队伍/玩家等文字仍全亮，直接透过透明表格；原有 z-index:6 不能阻止背景透色。这是背景隔离不足，不是文字真正盖在面板之上。
- 预期：仅 `.lan-room-workbench .source-mod-picker` 使用深色半透明底 + backdrop blur；自身文字保持锐利，不改变插件状态色、表格大小、右侧参数、底部联机操作。无 backdrop-filter 支持时使用不透明深色底，不退回透字。个人/AI 联机改装复用同一作用域；单人样式不变。毛玻璃是用户要求的 Web 扩展，不宣称原版效果。
- 验证：真实 NativeRefit + 房间侧栏/底栏隔离无头夹具，包含多人/AI侧栏、长列表、筛选、安装/卸下、hover/F2、Esc/A/返回、右侧参数和底栏命中；多分辨率检查遮挡范围、背景滤镜、自身无 filter、不改本机存储；截图人工查看。联机协议没有改动，夹具不冒充实机服务器回执验证。

## 验收结果

- 修改前无头复现成功：插件面板 computed background 为 rgba(0,0,0,0)，backdrop-filter 为 none，房间玩家/队伍文字与插件名明显重叠；保存 `artifacts/lan-hullmod-glass-tests/before.png`（1920×1080）。
- 实现仅改 `src/network/lan.css`：利用插件面板已有 z-index stacking context，在 ::before 里绘制 84% 深色底、12px 背景模糊及 65% 饱和度。背景向上/左延伸到外框内边缘，不留侧栏文字碎边，不改变面板内容尺寸、固定定位说明卡或前景字体；不支持滤镜时回退至实色 #061218。
- `node scripts/check-lan-hullmod-glass.mjs` 7组通过：1920×1080、1440×900、1280×720、1024×768，个人/AI多人侧栏、右侧幅能加点、底部按钮、安装/卸下、搜索、说明悬停/F2、Esc/A/返回、无滤镜实色回退、单人无毛玻璃、localStorage不变；pageerror=[]。这里是生产 NativeRefit 配合隔离房间侧栏夹具，不是实际服务器回执验收。
- 已人工查看修改前画面及修改后的 1440 和 1024 截图：重叠文字消失，插件文字、不可操作行底色和右侧参数仍清晰。结果在 `artifacts/lan-hullmod-glass-tests/room-*.png`、`ai.png`。原版同状态实机验证仍待核实。
- 既有 `node scripts/check-refit-op-availability-browser.mjs` 5组通过，覆盖OP预算、可装/不可装状态色、键盘说明与模块预算。构建只报已有大chunk提示。
- 仅源码、文档和独立测试产物；未更新 dist、未打包/发布、未操作用户桌面，也未修改生涯或联机协议。
