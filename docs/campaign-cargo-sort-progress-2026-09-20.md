# 货舱商品排序修正 — 2026-09-20

状态：已先记录证据后完成窄范围实现及定向测试；仅修正持有货物区的排序，不改 draft/transfer、存档或权威状态。

## 证据 → 行为 → 测试

- 已读 `AGENTS.md`、`docs/campaign-cargo-ui-native-audit-2026-09-20.md`；已用 `view_image` 实际查看用户截图 `C:/Users/Aca/AppData/Local/Temp/codex-clipboard-91465db3-6e23-469c-a97a-f1325a0a33bf.png`（1922×1112，标题 Starsector 0.98a-RC8）。持有货物区右上是单个“排序”，不是三态选择器。截图不能证明点击前后顺序。
- `../decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/o0OO.java:79,193-197`、`campaign/ui/G.java:97,387-399`：按钮调用 cargo sort，没有名称/数量/声明顺序轮换。`G.java:376` 另有初始化视图排序，但附近反编译变量异常，不逐句移植。
- `../decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java:296-318,359-365`：无市场的 sort 不执行违禁品分组；整理 stack 后资源同 ID 按 size 降序，不同 ID 用 `Float(order).compareTo(...)` 升序。相同 order 没有名称/ID 次级比较，`Collections.sort` 稳定。当前协议是 commodity 数量字典，不支持空格、武器、战机、特殊物品堆栈，因此不移植原生 stack 合并/拆分，不改变数量。
- `../decompiled/starfarer_obf/com/fs/starfarer/loading/SpecStore.java:1005-1031`：从 `data/campaign/commodities.csv` 读取 commodity，`setOrder((float)jSONObject.getDouble("order"))`；order 必填，无行号回退。commodity spec 继承的 `loading/while.java:131-136` 直接存取 float order。
- 本机 `../starsector-core/data/campaign/commodities.csv` 共 33 个商品；order 示例：supplies=0.5、fuel=0.75、crew=0.8、marines=0.9、heavy_machinery=0.95、luxury_goods=1、lobster=1.1、food=13。heavy_machinery 的声明位置晚于 food，却必须排在它前面；alpha/beta/gamma 声明序同样不等于 order 序。本机中文数据不声称是未经修改的发行文件。

预期行为：删除自创三态和对应提示，单个“排序”只按已导入的原版 order 整理本地显示；重复点击不反转、不换规则。导入使用 float32 精度，缺失/非有限 order 拒绝导入，禁止由 CSV 行序猜 order。不同商品同 order 保持输入相对顺序。未知/无有效 order 商品保留数量与 ID，稳定置于已知商品之后（这是 Web 缺失元数据的兼容回退，不声称是原版行为）。分类过滤、选择、draft/transfer、onJettison 与服务器权威库存保持原样。

验证计划：新增独立 `scripts/check-campaign-cargo-sort.mjs`，检查真实导入顺序、乱序/同序/未知商品、重复排序、冻结输入不变及源比较器对照；覆盖 importer `--check` 与 order 缺失/坏值 fail-closed；检查 CargoPanel 单按钮、非循环排序及草稿/回调不受影响。跑现有 cargo/market 定向回归、前端类型检查，并尽可能用实际 React 浏览器点击验证。只编辑用户许可文件，不提交、推送、发布，不碰 LAN/Steam。

## 待验证边界

- 未做原版实机点击前后对比，不声称完整货舱原版等价。
- 下方抛弃栏、拿起/放下、Shift/Ctrl、关闭确认和其它已知 UI 差异不在本次范围。
- 仅 commodity 字典；不支持原版多类型 stack 整理或市场违禁品排序。

## 实施及结果

### 改动范围（仅 7 个文件）

1. `src/campaign/client/CargoPanel.tsx`：去掉 source/name/quantity 状态、CSV 行序索引、中文 Collator 和轮换提示；单按钮只启用 order 排序。点击前保留收到的库存枚举顺序（不声称是原版初始化视图顺序），点击后新快照仍通过同一个纯 helper 呈现；沿用已有 fleet/receipt key 的重置边界。排序不触发 onJettison，也不排序或清空 draft。
2. `src/campaign/client/CargoSort.mjs`：纯稳定排序，返回新数组，保持 row 对象、ID、数量不变；未知元数据稳定后置。
3. `src/campaign/client/CargoSort.d.mts`：只读输入与泛型返回声明。
4. `scripts/import-campaign-market-reference.mjs`：必填有限 float32 order（允许 signed order）；记录 CargoData 来源哈希，检查 loader 的必填读取方式。
5. `src/campaign/data/reference-market.json`：33 个显式 order 字段与排序 provenance；对照编辑前基线，去除上述增量后其余 JSON 完全一致（包括价格、经济参数、原有来源哈希）。
6. `scripts/check-campaign-cargo-sort.mjs`：独立排序、导入与原版资源比较器对照回归。
7. 本文档。未改 FleetPanel、OriginalLogistics*、ReferenceRuleset、其它 docs 或 LAN/Steam；未提交、推送或发布。

### 验证结果

- `node --test scripts/check-campaign-cargo-sort.mjs`：**7/7 通过**。涵盖所有 33 个真实商品的显式顺序、同 order 稳定性、未知/无效元数据、不变输入/数量、重复排序、同 ID 数量分支、单按钮静态契约、实际 importer `--check`、CSV 行序翻转不影响元数据、负 order、缺失/NaN/Infinity/float32 溢出拒绝导入且不覆盖结果。从已哈希确认的 `CargoData.java` 提取资源比较器分支，仅改反编译类型名后编译 Java，**64 组排列对照通过**（含同 order 和重复 ID）。这是源码提取 oracle，不是启动原版游戏做的实机测试。
- `node scripts/import-campaign-market-reference.mjs --check`：**通过**，33 商品、19 个来源。
- `node --test scripts/check-campaign-cargo.mjs scripts/check-campaign-cargo-gateway.mjs scripts/check-campaign-market.mjs`：**58/58 通过**；仅出现现有 Node SQLite experimental 提示。
- `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`：**通过**。
- `node node_modules/typescript/bin/tsc -p tsconfig.campaign.json --pretty false`：**通过**。
- 额外基线核对：`readCargo`、`CargoIcon`、draft/confirmJettison、选择/详情、整个 discard 区块与编辑前一致；纯排序不写库存、version、receipt 或命令。
- 在收到主代理“无需重复浏览器”指示之前，已做真实 CargoPanel 的独立 React 浏览器点击测试：按 order 输出；重复鼠标点击/Enter/Space 不切规则；食品 12.5 与草稿 2.5 不变且保持选中；资源分类保持顺序；空武器分类禁用排序；返回全部保留顺序；未知 ID 稳定后置。调试检查冻结夹具库存/版本 17 不变，onJettison 调用数组仍为空。夹具只在内存构建和 localhost 运行，没有连接真实 campaign/gateway；已关闭本任务临时浏览器及服务。

### 明确不支持 / 交接主代理验证

- 原版实机排序前后、初始化货舱视图顺序、完整关闭/重开/收据流程未做原版操作对照。
- 不支持武器/战机/特殊物品、原生 stack 合并/拆分、市场违禁品优先级；没有据此新增库存或交互。
- 未知元数据后置仅为保留服务器内容的 Web 回退；不称为原版分支。
- 独立夹具不是完整 Campaign 外壳；未完成同状态同分辨率整页叠图验收。完整浏览器/合并构建由主代理继续，按其最新指示不再重复浏览器验证。本次不修改或重置主代理的 rules/logistics 版本。


## 审核收尾（2026-09-20，编码前补充）

- 证据：`CargoData.java:365` 使用 `Float.compareTo`，其有符号零全序为 `-0 < +0`；普通减法无法区分。只修正有限 order 比较的零边界，保留原版同 ID 数量优先分支及未知元数据回退；加纯排序边界测试和显式 native Java 对照。
- 环境边界：与 calendar/factions/orbits 的既有探针一致，读取本机原版目录或启动 Java 的排序检查改为 `--native` 显式启用，默认 skip；显式请求探针后不吞掉源漂移、路径或 Java 错误。CSV importer 的坏值/行序测试改为临时自包含合成夹具，不读取授权原版文件，不要求 JDK。此夹具只验证导入契约，不作为原版证据。
- 本轮限定原 7 文件范围内，实际计划仅修改 helper、排序检查和本文；仅运行排序定向测试（普通无原版环境与本机 `--native`），不做浏览器或全套回归。

### 审核收尾结果

- 仅改动原范围内的 `src/campaign/client/CargoSort.mjs`、`scripts/check-campaign-cargo-sort.mjs` 与本文；其余 4 文件未再改动。
- helper 现在显式比较零的符号，保证不同 ID 的 `-0 < +0`，同号零稳定；同 ID 仍先按数量比较。新增正反排列、同号稳定、重复排序、冻结输入及同 ID 优先级边界测试。
- 两个依赖本机文件/Java 的检查改为 `--native` 可选探针，默认明确 skip。`CARGO_SORT_CORE`、`CARGO_SORT_DECOMPILED`、`CARGO_SORT_JAVA`、`CARGO_SORT_JAVAC` 可覆盖各自位置；显式 `--native` 时环境错误或源哈希不符仍失败，不能静默伪装通过。
- importer 行序/坏值检查已完全使用临时合成 CSV、settings 和最小 source 文本，不读取安装目录，不启动 Java；仍验证正数、0、负数、行序反转、`--check`、缺失/NaN/Infinity/float32 溢出拒绝及不覆盖旧产物。
- 本轮只运行排序定向脚本：
  - `node --test scripts/check-campaign-cargo-sort.mjs`：**6 通过、2 可选 native 跳过、0 失败**。
  - 把上述四个 `CARGO_SORT_*` 环境变量全部指向确认不存在的目录/可执行文件后，再执行同一普通命令：**6 通过、2 跳过、0 失败**。证明默认路径不依赖本机授权目录/JDK；无源环境下 pure/fixture 检查仍实际运行。
  - `node scripts/check-campaign-cargo-sort.mjs --native`：本机显式执行，**8 通过、0 跳过、0 失败**；包含真实 importer `--check`/源哈希检查，以及提取原版资源比较器的 Java oracle **64 组商品排列 + 4 组有符号零边界**（传入 Java 时保留文本 `-0`，不被 JS 字符串化为 `0`）。
- 上文 7/7 和 64 组为审核前历史结果，以本节收尾结果为准。未重跑其它 campaign 套件、独立 UI 脚本或浏览器；不改主代理现有全套回归/失败日志。未提交、推送、发布。
