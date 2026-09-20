# 改装 OP 加号限制与插件状态底色（2026-09-20）

## 修改前最小对照

- 原版版本：本机 `../starsector-core/starsector.log:1`，0.98a-RC8。
- 加号证据：`../decompiled/starfarer_obf/com/fs/starfarer/coreui/refit/oooo_3.java:396-433` 按舰体大小和角色修正设置电容/耗散上限，并在 `computeAvailableOP(...) <= 0` 时禁用两项 getUp()。只检查单项上限不符合原版。
- 插件证据：`.../ModPickerDialogV3.java:499-518` 的 canInstall 检查适用性、船坞、已安装与 OP，519 起 canAfford 检查点数/物资。`.../L.java:123-170` 的 renderImpl 计算最终可操作状态 bl（已安装可卸下，原版固化等另行限制），设置 `showBG = !bl` 并 setEnabled(bl)；265-269 仅 showBG 时绘制 header.getDark()、0.33 强度底色。不是所有未安装行都有蓝底。反编译异常不照搬，只采用前述直接且相互吻合的条件。
- 数据交叉核对：`../starsector-core/data/config/settings.json` 定义 buttonBg=[70,222,255,255]、buttonBgDark=[31,94,112,175]；原生装配 variant 文件保存 fluxCapacitors/fluxVents。Web budget() 已按电容+耗散逐点各计 1 OP，并提供 remaining。
- 原版实机/截图：当前无这两个状态的原版截图，待核实；按用户约束不操作桌面、不启动可见窗口。色值不宣称逐像素等价。
- 当前差异：NativeRefit 的加号和数字框只限制 fluxLimit，导致零/负剩余 OP 仍可增加；SourceModPicker 已提供正确 data-unavailable 和安装动作校验，但 studio.css 无条件给所有未安装行铺蓝色条纹，并给所有 hover 行蓝底。
- 预期：仅当单项未到上限且有至少 1 OP 时加号可用；数字框同用预算上限。旧的超点方案不自动裁剪、不改存档，可以减点/拆除来修复；子模块沿用当前模块自己的预算。插件可装/可卸行无蓝底，不可操作行保留蓝色标记；正常 hover/focus 使用中性轻高亮，不再假装不可操作。保留行内禁用语义、查看说明/键盘入口和已有点击保护。
- 验证方法：生产 NativeRefit 隔离无头夹具，覆盖剩余 1/0/负 OP、单项满点、加号/减号/数字输入/键盘上箭头、释放点数后重新启用、子模块预算；插件足够/恰好/不足/不适用/已安装状态与点击及 hover 的样式一致性；查看说明和关闭不回归。TypeScript、lint、前一轮 AI 预算回归保持通过。只生成 artifacts 测试产物，不更新 dist/客户端、不涉及生涯或闪现。

## 验收结果

- `scripts/check-refit-op-availability-browser.mjs` 通过 5 组真实 NativeRefit 无头测试，pageerror=[]：1 OP 精确消费、0 OP 禁用两项加号、负 OP 不裁剪旧方案且不能增加、减点恢复、手填/原生数字框上箭头无法绕过、单项舰体上限与零下限；插件刚好够点可装、装后 0 OP、键盘卸载返还点数、差 1 OP 禁止按钮/整行单元格/键盘安装、条件不符蓝底；可用/已装行无蓝底，hover/focus 中性高亮；插件 F2 查看与 Esc 关闭；模块 0 OP 独立于母舰剩余点数；localStorage 哨兵字节始终未变。
- 界面截图 `artifacts/refit-op-availability-tests/zero-op.png`、`mod-availability.png`（1440×900）已查看：满 OP 加号变暗，能装插件无蓝底，不适用项保留蓝底和原因。原版实机像素对照仍待核实，没有据此宣称完全原版等价。
- 前一轮 AI/部署/房间 36 项回归全部通过。全工程 TypeScript 与修改文件 oxlint 通过；构建只出现原有大 chunk 提示。测试日志 `artifacts/refit-op-availability-browser.log`。
- 修改仅涉及改装组件、插件 CSS 与本次文档/隔离测试。保留此前移除横幅等已有变更；没有更新 dist、打包发布或替换运行中的客户端，没有操作用户桌面或改动生涯/闪现机制。
