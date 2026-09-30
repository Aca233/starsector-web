# Starsector Web — EULA 合规风险审计

审计日期：2026-09-25（Asia/Shanghai）。对象：当前工作区、导入与打包流程、本地 v0.2.11 标签、GitHub 当前可见元数据。

## 结论与计数口径

**发现 6 类需要处理的高风险事项：5 类涉及 Starsector 游戏 EULA（其中 1 类为 Mod 授权适用边界），另 1 类涉及汉化包用户协议。**

这不是“违反 6 个不同条款”或“6 个违法文件”的结论。前几类大量落在同一个 §4(a) 上，按不同整改对象分开列出；资源逐件、每个版本、每个分发渠道不重复累计。Mod 边界是前面风险无法直接援引 Mod 许可的原因，不是又一项独立侵权行为。第 2、6 类内容重叠，但涉及不同权利人及不同授权。

以下判断以**没有另行有效授权**为前提。审计未获提供开发商/汉化组对本项目的授权文件；代码事实不等于法院对合同效力、著作权、法定例外的裁判。纯机制、数值、接口的可保护性不能与美术、文本、具体代码一概而论。本记录是技术合规排查，不是正式法律意见。

## 依据

- 本机游戏许可：C:/Program Files (x86)/Starsector/starsector-core/LICENSE.txt，Starsector User License v1.0，更新于 2024-03-07。
- §1（20–22 行）：Mod 不包含游戏，并且使用时需要游戏。
- §3（40–45 行）：购买后授予受限制、不可转让的个人安装和使用许可，并非任意再分发授权。
- §4(a)（58–60 行）：限制复制、翻译、逆向、提取源码、修改、反汇编、反编译以及基于游戏创作衍生作品，须结合许可例外阅读。
- §4(b)（61–62 行）：未经明确许可不得商业利用。
- §4(c)/(d)（63–67 行）：未经明确授权的原版文件修改、游戏副本/权利转让限制。
- §4 的 Mod 段（69–77 行）：受前述限制约束的免费 Mod 创作、分发许可；免费并非对独立移植或任意资源转发的普遍授权。
- 本机汉化协议：C:/Program Files (x86)/Starsector/starsector-core/localization_license.txt，更新于 2022-03-18。
- 官方网站请求返回 403，未能在线核实是否存在较新的许可或覆盖本项目的公开特别授权。因此本次明确以本机文本为依据。

## 6 类事项

### 1. 原版图像、音频等资源被复制进自包含项目【明确复制链，高风险】

- scripts/import-game-assets.ps1:9 定义 public/game-assets 目标；26–35 行从原版目录复制文件。
- scripts/import-native-catalog.mjs:17–19 定义原版源目录和项目目标；471–479 行复制资源。
- 当前 public/game-assets 有 3,188 个文件，均为 Git 已跟踪文件；包含 2,272 PNG、140 JPG、757 OGG、2 CSV、9 FNT、4 TTF、2 WOFF2、1 BIN、1 JSON。
- scripts/import-native-catalog.mjs:465–483 还明确保留原版 sounds/music/music.bin 容器。无需能播放它，复制本身就需要授权依据。
- scripts/webp-assets-plugin.ts:13–19 将转换后的资源作为构建 publicDir；scripts/package-windows.mjs:70–71 将 dist 整体装入便携包。
- 对应：§4(a)，向其他人传递时还涉及 §3/§4(d) 的许可范围。

范围说明：3,188 是目录清点数，**不是逐个确认侵权的资产数**。目录可能混有原创、第三方单独许可、转换后或生成的资源；本次没有逐文件做权属和许可证核验。导入链和现存资源足以说明大量原版资源被随项目内置，不能据此把所有文件都认定为 Fractal Softworks 独占作品。

### 2. 原版完整文本、内容定义和配置被抽取并内置【明确提取链，高风险】

- scripts/import-game-content.mjs:6–7 从本机原版读入，输出到 src/engine/data/generated；66 行读取舰船及武器 CSV。
- scripts/import-native-catalog.mjs:19 指向生成的 native-catalog.json；其 report.csvSources 指明 data/strings/descriptions.csv、ship_data.csv、weapon_data.csv、wing_data.csv、hull_mods.csv、ship_systems.csv 等来源。
- 当前 native-catalog.json 含 269 条舰船、163 条武器、31 条联队、129 条船插、63 条系统、447 条变体、110 条弹丸、736 条描述、179 条配置记录。
- 例如 descriptions 中 abandoned_station 含完整中文叙事段落，并非只是抽象玩法参数。
- 对应：§1 对 Game 文件的定义和 §4(a) 的复制限制。

区别：单个事实、数值、机制不当然受著作权保护；这里的风险依据是整体提取、完整文本和原版内容集合，不能用“JSON 化/改了文件格式”代替授权。与事项 1 分列是因为清理媒体文件并不会移除打进 JS/JSON 的内容。

### 3. 实际使用了原版非公开实现的反编译结果【证据明确，高风险】

- C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/combat/systems/int.java:1–2 明示 Decompiled with CFR 0.152。
- 同目录 campaign/CampaignClock.java:1–2 也有 CFR 反编译标识。
- src/engine/extensions/ship-systems/PhaseTeleporter.ts:7–10 明确将上述非公开战斗系统实现列作来源。
- scripts/lib/campaign-native-clock.mjs:24 将反编译 CampaignClock.java 及原版 JAR 列为输入。
- 对应：§4(a) 的 reverse engineer / derive source code / decompile。

此项**不以所有 API 源码都属于反编译为前提**：官方提供的 API/示例源码应按其授权另看；目录名包含 decompiled 也不足以单独定性。本项选用的是 obfuscated 实现中的 CFR 明示证据及项目实际引用。谁、何时执行反编译及是否存在特别许可，本次未作认定。互操作等法定例外是否适用需具体法律分析，不默认存在也不默认排除。

### 4. 非公开实现被作为 Web 规则移植依据【来源联系明确，衍生作品认定仍需评估】

- PhaseTeleporter.ts:7–10 标记原版控制器；32–46 行说明并实现来源中的 10 圈 / 30 度搜索结构；52–66 行继续实现原版选向逻辑。
- docs/campaign-cargo-special-actions-source-notes-2026-09-24.md:5–7、14–15 对照原版 CargoDataGridView、F、Blueprint/ModSpec；src/campaign/rules/OriginalCargoSpecialItems.mjs:1、49–61 实现对应流程。
- 对应：§4(a) 的 translate / create derivative works 等限制。

反编译行为与后续移植产物是两种整改对象，不按每个移植模块再增加数量。仅实现相同功能、使用相同公式或公开接口，不足以证明代码版权侵权；但这里存在主动参照非公开实现的明确来源链，不能仅因改写成 TypeScript/JavaScript 就认定为完全独立创作。没有进行逐行代码相似度或可保护表达的法律鉴定。

生涯相关例子来自当前工作区，包含未提交内容；不据此声称这些新增实现已经进入 v0.2.11 发布包。

### 5. 不依赖游戏的独立运行方式不符合 EULA 的 Mod 定义【明确授权边界问题】

- README.md:3 明示 self-contained，运行所需图片、音频和内容全部由本仓库提供。
- README.md:46 明示不需要安装原版即可 build、preview、play，只在开发者重新导入时需要原版。
- scripts/package-windows.mjs:140 同样承诺不需要原版游戏。
- 本地 v0.2.11 标签的 README 也保留这些声明，不只是当前未发布的开发目标。
- 对应：§1 的 Mod 定义与 §4 的 Mod 授权段。

这不是说所有不依赖原版的原创游戏都违规；而是**当前承载原版内容的独立移植无法仅凭“免费 Mod”主张该许可例外**。改名字、加免责声明、“仅供学习”、加一个安装目录勾选框或检测都不能自动解决前述复制和移植授权问题。

### 6. 汉化安装版的中文文本被抽取另用【单独权利人的协议风险】

- 汉化协议第 1 条（17–18 行）限制转载、发布主体；第 2a/2b 条（21–22 行）将许可范围限定在原版安装使用，明确不包括提取、修改及其他用途；第 3 条（23–24 行）要求汉化组授权。
- native-catalog.json 的描述、船插名、配装等包含来自本机中文安装版的内容；其 report.csvSources 指向本机 CSV，导入器确定了提取来源。
- docs/campaign-cargo-special-actions-source-notes-2026-09-24.md:7、15 明示消息与安装本地化源码对齐；OriginalCargoSpecialItems.mjs:55 等含对应中文消息。
- 汉化协议第 4 条说明汉化组自身获开发商授权，**不等于该授权自动转授本项目**；第 5 条允许公开访问源码，也不等于自由再许可。

提取和 Web 再利用的授权风险已经有依据；第 1 条的“对外发布”是否实际发生还需结合传播事实。汉化包各字体等是否另有更宽的独立许可证，需要逐项区分。取得开发商授权不应被理解为自动取得汉化组授权，反之亦然。

## 实际分发状态：哪些已核实，哪些不能推断

- 通过已登录 GitHub CLI 只读查询，Aca233/starsector-web 当前 visibility=PRIVATE、isPrivate=true。
- 匿名 GitHub 仓库/Release API 返回 404；README 所列 https://aca233.github.io/starsector-web/ 也返回 404。不能认定当前有公开试玩站，更不能从 404 推断历史上从未公开。
- 已登录查询确认 v0.2.11 为非草稿 Release，publishedAt=2026-09-23T09:02:05Z，附有桌面安装器、桌面 ZIP、联机 ZIP、Steam ZIP 等。
- 该版本安装器的 downloadCount=5；**下载计数不代表 5 个不同用户，也不能区分作者自测、自动更新或他人下载**。
- 本地 v0.2.11 标签有 3,179 个 public/game-assets 文件和 23 个 src/engine/data/generated 文件，说明上述内容不只是当前新增文件。
- 本次没有下载、解包远程 Release 二进制；包内实际字节未逐项核对。打包内容判断依据为构建脚本、标签内容及发布元数据。
- 私有仓库降低公开传播暴露面，但不会自动取得反编译、移植、资源抽取或向有访问权的他人转交内容的授权。
- 对外转交需要另核实收件人、用途和许可，故没有将 §4(d) 再列为一个“已确认违规”凑数。

## 未计入 6 类的事项

1. **商业收费**：在 README、包元数据、发布配置及桌面入口的定向检查中未发现收费/赞助入口证据，不能据此认定违反 §4(b)。这不证明外部从未收费；也不把游戏内市场交易文案误认成现实商业化。
2. **字体/其他第三方许可**：现有 TTF、WOFF2、FNT 与子集转换脚本值得逐项核验原始许可、保留声明和修改条件；本次没有足够证据认定全部不可分发。
3. **署名和项目 license 字段**：package.json 的 private=true / license=UNLICENSED 不是 Starsector 授权，也不是单独认定违规的依据。不能把“未附原版 LICENSE”自动当作 EULA 中不存在的一条要求；补署名也不能补足实质权限。
4. **修改原版安装、破解激活、上传原版 JAR**：本次未以充分证据建立独立问题，未额外计数。开发桥接引用本机 JAR 不等于发布包包含 JAR。
5. **Steam SDK、开源依赖、商标及其他合同**：不在本次完整审计范围内，未给出合规保证，也未混入 Starsector EULA 的数字。

## 建议的处理顺序

1. 在授权确认前继续保持私有，避免新增对外发包、公开站点和商业化。对现有发布是否下架由用户决定，本次未更改仓库、Release 或站点状态。
2. 最直接的路径是向 Fractal Softworks 说明独立 Web/Electron 运行、原版媒体/数据再分发、源码参考与规则移植、联机形式，请求清楚覆盖这些行为的书面授权；汉化文本另外向汉化组确认。
3. 如果希望走 Mod 路线，需要在授权范围内真正依赖原版，发布物不再内置不获许可的原版内容。让用户本地导入可以减少再分发问题，但不能单独治愈既有反编译、移植或汉化提取风险；不能保证改成“要求安装原版”就整体合规。
4. 如果保留独立运行，则应采用有权使用的原创/授权媒体和文本、独立设计数据，并审查非公开源码派生实现；不要把保留照搬的文本/美术而仅改名当作整改。
5. 根据选择更新开发规范，停止把强制参照非公开反编译实现当作默认要求。已有来源记录应保留用于权属审查，不应为掩盖来源而删除。
6. 涉及公开发布、收费或争议处理前，由熟悉软件许可与当地法律的律师确认合同效力、权利链及法定例外。

## 本次操作边界

仅做本地文件/目录与 Git 只读检查、官方站点及 GitHub 只读请求，并新增本审计文档。未改游戏功能、未重建或运行游戏、未启动可见窗口、未提交/推送、未新增发布、未删除历史内容或改仓库可见性；未访问私人存档，未输出认证令牌。未创建子代理。
