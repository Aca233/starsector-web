# 原版描述模板与继承对照（2026-09-20）

## 修改前最小对照

- 本机参考版本 0.98a-RC8（starsector-core/starsector.log）。本轮只修复目录/改装说明数据的显示，不改变插件、武器战斗效果或生涯规则。
- 原版插件：decompiled/starfarer_obf/com/fs/starfarer/loading/specs/O00O.java 的 getDescription/getSModDescription 使用插件 getDescriptionParam/getSModDescriptionParam(index, hullSize, null) 代入模板；BaseHullMod 默认转发至双参数接口。starsector-core/data/hullmods/AcceleratedShieldEmitter.java 可交叉验证敏捷护盾普通/固化参数均为 100%。不同舰级必须保留不同结果，不能拿主力舰数值冒充通用值。
- 原版武器：CargoTooltipFactory.java:1052-1062、1172-1182 将 customPrimaryHL/customAncillaryHL 按 `|` 分割并 trim 后传入段落格式化；weapon_data.csv 同时提供模板与参数。不能把 {%s} 直接当说明呈现，也不能猜数字。
- 当前差异：原始目录直接显示模板字段，并标“保留占位符”；98 个插件 desc、34 个 sModDesc（合计102条记录）和38个武器记录含占位符。插件摘要优先 short，详细 desc 仅在原始表中可见；舰船说明仅按当前 id 查找，遗漏 descriptionId/基型继承。
- 原版界面证据：已有 artifacts/native-refit/hullmods-reference-v2.png 经查看为 Web 参考画面，不是原版说明悬停证据。原版同状态截图/实机仍待核实；遵守用户不占用桌面要求，仅做后台和无头验证。不以源码推断冒充 UI 完全还原。
- 预期：默认详情提供可读完整说明、可区分舰级的参数及固化说明，原始模板留在明确的原始数据/JSON 查看中；实现状态保持单独提示。缺运行上下文/缺原版参数须明确标记，不能虚构结果。
- 验证：离线调用原版插件描述接口生成参数（配置只读、无桌面/游戏启动）；以原版 CSV 与源码交叉验证；模板单元测试覆盖重复/百分号/缺参数/额外高亮参数、全目录扫描、无头页面详情验证。

## 验收

- 新增离线参数导出器：`node scripts/import-native-description-params.mjs [StarsectorCore]`。需 JDK 和本机原版文件，只读载入原版配置并调用描述接口，使用 TITLE / ship=null 的资料库基础上下文（MilitarizedSubsystems.getBonusPercent 在 TITLE 明确返回0）。运行时不依赖 Java。129 个插件均成功导出；4种舰级分别采样，当前结果相同才去重保存。
- 解析132个含参数模板：98个普通说明、34个 S-mod 说明（合计102个插件记录），以及38个武器记录。参数与原文模板、脚本名绑定，后续导入改动导致不匹配会明确报“参数待核实”，不套用旧数值；原始 native-catalog.json 未改写。
- 特例核实：ioncannon_fighter 的 CSV 缺少 customPrimaryHL。其 .wpn → ioncannon_shot.proj → IonCannonOnHitEffect.onHit 使用 Math.random() > 0.75f，因此命中船体/装甲后的电弧概率为25%。仅对此ID、字段及完全匹配的模板补值，不泛化到其它缺参数武器。
- 自适应相位线圈：原版 PhaseCloakStats.BASE_FLUX_LEVEL_FOR_MIN_SPEED=0.5f；返回50%增幅、50%基础阈值、75%修正阈值。测试早期误写的30%/45%已按源码纠正，未修改游戏机制。
- 舰船背景：按 descriptionId / baseHullId 关联 SHIP 类型说明，并保留 descriptionPrefix；例如攻势XIV显示第十四战斗群前言和攻势基型说明。
- 默认目录详情改为“说明 / 参数”，包含完整说明及 S-mod 段落；字段表使用只读显示投影解析模板。JSON / 定义继续保存原始模板。适配状态及未实现提示保留，原版文案不冒充当前 Web 的战斗承诺。
- 单元与回归：`node --test scripts/check-native-descriptions.mjs scripts/check-lan-deployment.mjs scripts/check-lan-room-workflow.mjs`，32/32通过。描述6项测试遍历129个插件×普通/固化×4舰级及163个武器，覆盖模板漂移、缺值、百分号、额外高亮词和原始数据不被修改。
- 页面：原先全应用 Vite 开发扫描启动超时，未算通过。改为真实 NativeCatalog 组件的隔离生产构建，无头 Chromium 验证敏捷护盾100%、S-mod100%、4舰级、破舱250、织解集群、机载离子炮25%、XIV前言+背景、原始JSON保留、390px无横向溢出、键盘切分类和Esc关闭；pageerror为空。
- 截图已查看：artifacts/native-description-tests/hullmod-desktop.png（1440×900）、hullmod-mobile.png（390×844）。隔离构建只有大分包提示，不包含生涯入口，不覆盖用户dist、不发布。
- 验证边界：原版源码/本机原版描述接口、Web组件页面已验证；原版实机同状态截图仍未验证，不宣称所有 tooltip 完全还原。未修改闪现、游戏数值、存档或当前运行的客户端/房间。

## 再生成与运行

导入原版目录之后可运行上述参数导出器；若原版不可用，不要用默认数值覆盖生成文件。浏览器回归运行 `node scripts/check-native-descriptions-browser.mjs`，可用 PLAYWRIGHT_PACKAGE 指定包路径、BROWSER_PATH 指定已安装的无头浏览器。该脚本只在 artifacts 下生成独立测试构建，端口和浏览器上下文均隔离，结束时关闭。


## 用户指定移除改装侧栏提示（2026-09-20）

- 证据：用户截图顶部橙色“基础模拟 · 13 项适配说明”；对应 NativeRefit.tsx 中 refit-import-warning。该提示由 Web 的适配清单汇总产生，不是原版舰船系统字段。本机原版 ship_systems.csv 的系统名称/状态数据与该汇总无关。
- 预期与范围：按用户要求只移除此条横幅及其悬停内容，保留下面各项“舰船技能…可用/未接入”、实际装配错误、未实现插件提示，以及目录/舰体检查中的适配资料。不改变机制或伪装成已全部实现。
- 验证：静态检查无横幅及死计算；类型检查；无头改装组件截图确认四项技能条目仍在。原版实机不涉及本次 Web 自定义提示删除。
- 验收完成：类型检查和该文件 lint 通过；隔离生产组件无头页面确认汇总横幅不存在，截图中的四项舰船技能及其点击说明仍可用，pageerror 为空。截图 artifacts/refit-banner-tests/system-readiness.png 已查看。未更新或重启现有客户端。
