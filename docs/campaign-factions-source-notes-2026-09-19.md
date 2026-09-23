# 生涯势力定义：来源审计与只读模块（2026-09-19）

## 交付边界

本次只新增以下 6 个文件，没有改 shared Types、WorldState、ReferenceRuleset、现有 importer、client、package scripts，也没有提交或发布：

- `scripts/import-campaign-factions.mjs`
- `scripts/check-campaign-factions.mjs`
- `src/campaign/data/reference-factions.json`
- `src/campaign/rules/OriginalFactionDefinitions.mjs`
- `src/campaign/rules/OriginalFactionDefinitions.d.mts`
- 本文

项目根：`C:/Program Files (x86)/Starsector/starsector-web`。
原始内容根：`C:/Program Files (x86)/Starsector/starsector-core`。
源码根：`C:/Program Files (x86)/Starsector/decompiled`。

这是**本机已安装 core 的定义快照**，包含中文文本；源码也有本地加载优化痕迹。不能把这些文件的存在等同于“官方未修改的原版发行包”。导入来源以逐文件 SHA-256 为准，不凭版本标签推断未核实的规则。

## 数据规模

- factions.csv 列出 **21** 个势力，全部保留，不按阵营战斗舰船数量过滤。
- **47** 个输入来源记录：每项包含稳定 source ID、core/decompiled 根类别、相对路径、原始字节数、SHA-256。没有绝对路径、运行时间戳或随机值进入生成物。
- 完整保留 **645** 个 `.faction` 顶层字段及其嵌套原始 JSON 内容。
- 支持 **25** 类展示/基础定义字段，共 **525** 个字段结果：278 个显式声明，247 个有证据的默认值；18 个先前未实现的默认亮色现已全部解析。
- 原始未实现字段按势力列入 `unsupportedFields`，本快照共 **27** 种字段名。保留不等于执行。
- 默认展示表：28 种舰队类型名、39 个军衔、67 个职务。查询按键回退，不把默认表深合并进原始定义。
- 提取 **64** 条 `SectorGen.initFactionRelationships` 的有序调用及源码行号；不是 64 条最终世界关系，更不是完整初始关系矩阵。
- 当前目录没有 manifest 之外的 `.faction`。若将来出现，报告 `unlistedDefinitions`，不擅自加载。
- 生成物 SHA-256：`61f46f30a163e96dd48cc822856cde03534d2419a8146961a04a7839b431821a`。

### 实际势力 ID

按当前 CSV 顺序：

```
neutral, player, pirates, hegemony, independent, tritachyon,
sindrian_diktat, lions_guard, knights_of_ludd, luddic_church,
luddic_path, persean, derelict, remnant, omega, threat, dweller,
scavengers, sleeper, poor, mercenary
```

**文件名不等于 ID**：`persean_league.faction` 的 ID 是 `persean`；`remnants.faction` 的 ID 是 `remnant`。查询必须用内容中的 ID。保留 CSV 顺序只是为了复现输入，不能声称它等于 Java `HashMap` 的势力遍历顺序。

## 原版加载证据

下表路径相对上述源码根；core 文件另有标注。所有引用文件的完整哈希都在生成物 `sources` 中。核心实现源码的 17 份哈希、SectorGen 的哈希，以及用于消除符号歧义的两个 jar 哈希在 importer 内锁定；源码变化立即失败，要求重新审计，不能给旧实现换一个新哈希就宣称等价。

|来源/位置|观察到的行为|本模块处理|
|---|---|---|
|`starfarer_obf/com/fs/starfarer/loading/SpecStore.java:1190–1239`|从 factions.csv 取得路径，逐个读取对象中的 id；另加载三个 default JSON；设置局部 shipRoles/fleetTypeNames/ranks|只导入单 core 根的清单，默认文件保留；不推断父势力|
|同文件 `:1252–1295`|读取名称、logo/crest、颜色、关税等；`names` 对象是必需输入|实现下列明确字段；其余原始字段保留并标注|
|`starfarer_obf/com/fs/starfarer/loading/LoadingUtils.java:286–403`|同路径跨资源来源合并、mod fullOverrides；不是势力继承链|未实现 mod 层叠，明确标注，不尝试普通 deep merge|
|`starfarer_obf/com/fs/starfarer/loading/String.java:180–220`|缺失主 color 返回白色；显式颜色按 RGBA 读取|RGBA 保留 alpha；此严格子集只接受恰好 4 个 0..255 整数|
|`fs.common_obf/com/fs/graphics/util/B.java:259–282`|暗化 RGB 的 float 运算与转 int；替换 alpha|用 `Math.fround` 对应 float32，截断正数 RGB，再设 alpha|
|`starfarer_obf/com/fs/starfarer/loading/o0oo_0.java:291–300`|默认 brightUIColor 混合 baseUIColor 与 `O0OO.cfr_renamed_22`，比例 .35|CFR 别名不一致；现由 jar 字节码定位真实字段 `void.super`，从 settings 解析真实混合目标并经 native oracle 验证（见下节）|
|`starfarer_obf/com/fs/starfarer/campaign/Faction.java:1015–1045`|舰队类型、军衔、职务先局部查询，缺失再查默认表|实现 `name(id, kind, key)`；无两级匹配则 missing，不返回伪造译名|
|`starfarer_obf/com/fs/starfarer/loading/R.java`、`oo0o_0.java`|舰队类型表直接读取 string；军衔/职务读取条目的 name|对支持的名称结构进行类型校验|
|`starfarer_obf/com/fs/starfarer/loading/o0oo.java:44–111`|shipRoles 的 includeDefault 复制角色条目，并有 fallback/fallback2 的继承逻辑|仅保留这些池，不将其当成政权继承，也不实现选船或 doctrine|

### 没有实现也没有编造通用 `.faction` 继承

当前清单、21 个 `.faction` 和审计过的加载器，没有给出 `extends/baseFaction` 的父势力链协议。也不存在一个可直接套用的 `default.faction` 文件。

严格拒绝 `extends`、`inherits`、`baseFaction`、`parentFaction` 这类未证实指令。不能因字段像“继承”就替它设计一个游戏规则。未识别的普通字段保留为 raw，查询时明确 unimplemented，不执行。

**三种不同机制不可混淆：**

1. SpecStore 的逐字段 `opt*` 默认值。
2. Faction 的名称表逐键回退，以及 shipRoles 独立的 includeDefault/fallback 行为。
3. LoadingUtils 对**同路径** core/mod 资源的合并：对象递归；数组通常附加；长度为 4 的 color/button 数组和 music_ 数组有特殊替换；存在 `core_clearArray` 与 fullOverrides 分支。现有反编译显示 clear 标记还进入数组复制循环，不能未经确认改写为自定义语义。

本次只支持机制 1 和机制 2 的名称查询。机制 3 没有执行，尤其不枚举 mod 目录、不假定资源优先级。若以后支持 mod，需要单独实现和测试整个资源来源协议。

### 实现的字段与默认值

|字段|缺失时|
|---|---|
|id / displayName / displayNameWithArticle / logo|导入失败；names 也必须是对象，但加权人名选择未实现|
|displayNameLong / displayNameLongWithArticle|对应短名称|
|entityNamePrefix / personNamePrefix|displayName / entityNamePrefix|
|personNamePrefixAOrAn / displayNameIsOrAre|`a` / `is`（安装本体显式空字符串不会被替换）|
|showInIntelTab / shipNamePrefix / barSound|true / ISS / bar_ambience|
|crest / internalComms|已证实的 null 默认值；不等于未实现字段的缺失|
|tariffFraction|economy.json 的 defaultTariff（若该键缺失，SpecStore 默认 0）；保留来源说明|
|tollFraction / fineFraction|0.1 / 0.25|
|color|[255,255,255,255]|
|baseUIColor|color|
|secondaryUIColor / secondarySegments|null / 8|
|darkUIColor|color 的 RGB 乘 float32(.4) 后截断，alpha=175；**不是** baseUIColor 暗化|
|gridUIColor|color 的 RGB，alpha=75|
|brightUIColor|显式 RGBA 直接保留；否则将 baseUIColor 与 settings 的 tooltipTitleAndLightHighlightColor（目标 alpha 强制 255）以 float32(.35) 混合，逐分量截断为整数|

关税三个字段按 Java float 保存，例如 .3 为 `0.30000001192092896`。这只是定义值，不代表已经实现殖民地收入、动态关税修正或交易结算。

对于显式 null、错误类型、非有限数字、重复 JSON 键，严格拒绝而不是照搬 org.json 的宽松强制转换。颜色大于 4 项也拒绝；这是明确声明的受支持输入子集，不声称复刻所有非法/边缘输入的 Java 容错行为。

## 默认亮色收尾：反编译别名已用原始字节码消歧

### 可复查的证据链

1. 本机 `starfarer_obf.jar` 中实际类是 `com.fs.starfarer.loading.O0oO`。JDK `javap -c -p` 的 `getBrightUIColor()` 指令序列明确是：

   `getBaseUIColor → getstatic O0OO."void.super" → sipush 255 → B.Ò00000(Color,int) → ldc 0.35f → B.o00000(Color,Color,float)`。

2. `O0OO` 的静态初始化与刷新方法都把 `StarfarerSettings.OO0000("tooltipTitleAndLightHighlightColor")` 写入同一个 `void.super` 字段。因此原 CFR 的 `cfr_renamed_22` 只是本文件与引用方的重命名不一致，**不是**一个应猜成纯白的新常量。
3. `StarfarerSettings.OO0000(String)` 通过其根 settings JSON 和真实颜色解析函数读取颜色；原始 root 字段的字节码名为 `õØ0000`。本机 settings 第 1092 行的活动值是 **[203,245,255,255]**；下一行 [181,230,255,255] 是注释，不能误当输入。
4. `fs.common_obf.jar` 中的 `B.o00000` 使用独立 float 减/乘/加，clamp 0..255，再转 int。JS 对每个浮点运算执行 `Math.fround`，而不是把整个表达式当 double 或替换成四舍五入。

新增生成物证据：

|source ID|源文件|SHA-256|
|---|---|---|
|settingsAccess|decompiled 下的 starfarer_obf/com/fs/starfarer/settings/StarfarerSettings.java|5400ae43a3d69689bb3f144ca1abec1e8e8921b566dfef94b7be0ceef266d26c|
|engineJar|core 下的 starfarer_obf.jar|8ae5516bf879ec068d206714fd67b90ebfa113c990f9e473357a5923b9700d6a|
|colorMathJar|core 下的 fs.common_obf.jar|864124c5c6ea34fc182a750f29505f2b6d53141d2e2098f421401c6f9c5af66c|

导入器从 settings 读取 `defaults.brightUIColorTarget.rgba`，记录常量 owner/field、设置键、alphaOverride=255 和 float32 权重；没有把目标色硬编码进规则。缺失、重复、畸形设置或来源 jar 漂移均失败，不能悄悄退回白色。

本机结果示例：

|势力|baseUIColor|默认 brightUIColor|
|---|---|---|
|player|[170,222,255,255]|[181,230,255,255]|
|hegemony|[245,150,30,255]|[230,183,108,255]|
|neutral|[155,155,155,255]|[171,186,190,255]|
|tritachyon|[135,206,255,255]|[158,219,255,255]|

18 个默认值现全部 resolved/default；原先 3 个显式亮色保持 resolved/declared。这个改动没有修改世界、外交、provider、validateWorld 或规则锁。

### Native oracle 的范围与安全边界

运行 `node scripts/check-campaign-factions.mjs --native`：

- 先核验 6 个 game jar 和 1 个 LWJGL 计时器 DLL 的固定 SHA，再执行本地 JDK 编译器和本机捆绑的 Zulu Java 17 JRE。可用 FACTIONS_JAVAC / FACTIONS_JAVAP 指定 JDK 工具；不安装或下载依赖。
- 探针源码、class 文件和去注释后的 settings JSON 只写入新建 OS 临时目录；完成后校验绝对目录边界并删除。没有修改原版 jar 或 Java 类字节码。
- 原始混淆字段名包含点，例如 `new.super`。普通验证模式会得到 ClassFormatError；探针沿用原版 vmparams 已使用的 `-noverify`，仅对这个短命、已核验 jar 的本地进程生效。
- 禁用 log4j 自动磁盘配置。Java 层 SecurityManager 拒绝文件写入/删除/执行和网络权限；不调用 StarfarerLauncher、完整设置加载器、mod/asset 扫描、Display 或 GL 方法，不创建游戏窗口。
- 真实 `B.<clinit>` 仅执行 `Sys.getTimerResolution()`（已查看字节码），因此允许加载已核验的 lwjgl64.dll 用于计时器。**这不是一个不加载任何 native DLL 的测试，也不把 Java 层权限控制宣称为对 native 代码的完整隔离。**
- 反射仅在新进程中向原版 StarfarerSettings 的根字段注入解析后的原始设置；真实 O0OO 初始化决定常量色，真实 O0oO/B 方法产生结果。不是手写一个 Java 同公式来冒充原版 oracle。
- 校验实际常量，全部 21 个势力（含 18 个默认和 3 个显式），以及 **65,536 个完整 8-bit 基础/目标通道组合**，总计 **65,557 组 RGBA** 与 JS 完全一致。组合测试临时改变该进程中的常量，以验证 float32、目标 alpha 强制 255、base alpha 混合及截断。
- 一项临时副本导入测试还将实际 settings 值改为 [7,13,17,0]，验证导入产物随源数据变化，玩家亮色得到 [112,148,171,255]；删除此键会明确失败。

旧快照没有新增 `brightUIColorTarget` 时，仍保留此前未实现状态，避免为其伪造缺少的映射证据；API 与 schema/profile 标识未改变。新导入必须具备映射与对应来源，且本次 JSON 的内容哈希已变化，主线程需使用新生成物的 fingerprint。

## player 与非 player、定义与治理的分离

`Faction.java:955` 的 `isPlayerFaction()` 比较的是 **spec ID 是否为 `player`**。

因此 `nativeKind` 只有 `player` 和 `non-player`。`neutral/poor/scavengers/mercenary/omega` 都会导入，但 **non-player 不是“有主权领土的 NPC 政权”标志**。不能据此自动建立领土、市场、领导人或外交 AI。

原版 Faction 还具有 displayName/color/known technology 等运行时覆盖；原版玩家自定义名称/旗帜不等同于出现一个新的静态 `.faction`。本模块保存的是不可变的定义层，不改变当前项目的 owner/controller/factionId 约束。多人自创势力的身份、权限、继承、成员、殖民地所有权应由主线程的世界状态/命令规则负责。

## 默认关系到底从哪里来

1. core `data/config/settings.json:1021` 的 `newGameCreationEntryPoint` 指向 `data.scripts.world.SectorGen`。导入时核对这一入口，缺失、重复或不支持的入口都会失败。
2. core `data/scripts/world/SectorGen.java:63` 调用 `initFactionRelationships`；该方法在 `:186–298`。
3. 提取的 64 条语句保留 from/to、数字或 RepLevel 表达式、源码行号、原始顺序。注释掉的调用不能进入结果。例如玩家与海盗/卢德左径的 -0.65，以及教会与骑士团的 COOPERATIVE。
4. `starfarer_obf/com/fs/starfarer/campaign/Faction.java:1474–1483` 说明 RepLevel 重载并不是枚举序号：NEUTRAL 设 0，正向用 min+.01，负向用 -min-.01；`RepLevel.java` 有对应阈值。**本模块保留符号，不执行该外交规则**。
5. `starfarer.api/com/fs/starfarer/api/impl/campaign/CoreLifecyclePluginImpl.java:635–640` 在缺少 FactionHostilityManager 时开始三组战争：霸主–速子、霸主–英仙、速子–教会。不能仅看 SectorGen 里被注释掉的语句就认为这些势力中立。
6. `.../intel/FactionHostilityManager.java:107–115` 创建 FactionHostilityIntel；后者 `:38–57` 存储此前关系、设为 HOSTILE，在事件结束后恢复。这是带生命周期的状态，不是永久定义默认值。本次只记载其来源，没有实现管理器。
7. `FactionManager.java:51–77` 的底层懒创建 relation 确实是自身 1、不同 ID 为 0，并将两个方向映射到同一个 Relation。但它只是**未建记录的底层分配行为**，不是完成初始化后的初始外交局势。生成物只将其记为 evidence，并设置 `applied:false`。

导入器不执行 Java；不会把任意脚本当可运行数据。关系证据提取器只接受核实的常量绑定和 setRelationship 语句，遇到新分支、循环、无法解析语句直接失败。还锁定了整个 SectorGen 文件的审核哈希，不能静默忽略新脚本内容。

**没有导出初始关系矩阵、没有“全部中立”的兜底、没有替代治理逻辑。** 原版开局、任务、派系冲突与玩家选择等后续阶段仍需独立实现。

## 主线程集成接口

模块不自动读取 JSON、不依赖 Node 文件系统，不引用 shared Types / WorldState / ruleset / client。调用端显式传入生成物：

```ts
import reference from '../data/reference-factions.json' with { type: 'json' };
import {
  createOriginalFactionDefinitions,
  createFactionRelationshipView,
} from './OriginalFactionDefinitions.mjs';

const definitions = createOriginalFactionDefinitions(reference);
const hegemony = definitions.get('hegemony');       // 未知 ID 抛 RangeError
const optional = definitions.find('custom:aurora'); // undefined，不回退 neutral
const all = definitions.list();                     // 深冻结，返回 manifest 顺序
const label = definitions.field('hegemony', 'displayName');
if (label.status === 'resolved') {
  // value + origin(declared/default) + sourceId + evidence
}
const rank = definitions.name('hegemony', 'rank', 'spaceCaptain');
// rank / post / fleetType，按局部 -> 默认表回退；结果带 origin/sourceId
```

`field()` 状态：

- `resolved`: 明确声明或已核实默认值，带 value。
- `unimplemented, presence:present`: raw 中存在但未执行语义，带 raw。
- `unimplemented, presence:absent`: 仅兼容旧快照中缺少新增字节码映射的默认 brightUIColor，不提供 value；新导入物的 21 个 brightUIColor 均为 resolved。
- `missing`: 原始定义没有该字段，且不在已支持默认字段中；不可自动解释为 false、0 或空集合。

`validateOriginalFactionData(data)` 校验 JSON、schema、来源元数据、唯一性、类型与关系证据边界，并从 raw 重算所有支持字段来核对缓存投影。来源 SHA 的格式在运行时校验；对实际文件字节的核验是 importer/check 的工作，运行时并不把 SHA 文本当作签名认证。

`createOriginalFactionDefinitions()` 再克隆并递归冻结，调用者之后修改输入不会改变查询结果。

### 自创势力的关系快照，独立于静态定义

```ts
const relations = createFactionRelationshipView({
  factionIds: ['hegemony', 'custom:aurora', 'player:alice'],
  entries: [
    { from: 'hegemony', to: 'custom:aurora', value: -0.65, source: 'world-event:123' },
  ],
});
relations.get('custom:aurora', 'hegemony'); // known -0.65，对称查询
relations.get('custom:aurora', 'player:alice'); // uninitialized，不是 0
relations.get('custom:aurora', 'custom:aurora'); // 同样不擅自创建默认状态
```

这个 API 不要求自创 ID 出现在静态 native 定义清单。只接受显式登记的 ID、有限的 [-1,1] 值；重复/相反方向重复的 pair 都拒绝，不采用 last-wins 或悄悄 clamp。pair key 用结构化双 ID 防止拼接歧义。未知 ID 报错。没有 setter、外交 tick、敌对阈值、宣战、组队关系传播或殖民地控制功能。

主线程下一步需要：

- 在组合根创建一个 definitions 查询对象，将导入物哈希纳入已有 content fingerprint 策略。
- UI 名称/颜色只消费 resolved 值；对 unimplemented 明确显示/禁用或先补齐来源，不把不可知伪装成原版默认。
- 明确区分 nativeDefinitionId、运行时 faction ID、玩家控制与市场所有权；这里不替主线程更改字段协议。
- 世界存档保存关系**状态**和版本/事件来源，规则系统验证并修改；只读 view 在查询时生成。
- 将来实现原版开局关系时逐阶段执行并验证 SectorGen、RepLevel、生命周期冲突和玩家开局覆盖，不能直接把当前证据列表当完成世界状态。

## 与沙盒 refit importer 的区别

现有 `scripts/import-refit-factions.mjs` 输入是 native-catalog，目标是船体/武器可选阵营索引，并排除了 player/neutral/poor。它保留原状。

本次直接读取 factions.csv 与 .faction，保留全部定义、默认表、来源与缺口，不做沙盒成员推断。解析语法参考现有 `import-native-catalog.mjs` / `StarsectorTextParsers.ts`，但现有脚本有导入时副作用且解析器不拒绝重复键，所以没有直接执行/修改它们。测试用现有纯 TS 文本解析器独立交叉核对了全部 21 个原始对象。

## 复现、失败边界与验证

在项目目录使用 Node 24：

```powershell
node scripts/import-campaign-factions.mjs
node scripts/import-campaign-factions.mjs --check
node --test scripts/check-campaign-factions.mjs
node scripts/check-campaign-factions.mjs --native
npx tsc -p tsconfig.campaign.json --pretty false
npx oxlint scripts/import-campaign-factions.mjs scripts/check-campaign-factions.mjs src/campaign/rules/OriginalFactionDefinitions.mjs
```

可指定另一个安装根与源码根：

```powershell
node scripts/import-campaign-factions.mjs "C:/path/starsector-core" --source-root "C:/path/decompiled" --check
```

- `--check` 不写文件，比较实际生成字节，过期返回非零。
- 正常导入在完整校验成功之后才用临时文件/rename 替换唯一 JSON 生成物；不复制资产、不写原版目录。
- 路径读取检查 realpath 是否仍在所选来源根内，不接受跨根链接或清单路径穿越。
- 必须存在所有 manifest 文件、默认文件与审核源码；重复路径/ID/JSON 键、不支持的 CSV 格式、错误字段、源码漂移均显式失败。
- 未支持的普通字段完整保留并列明，不因不认识而丢弃。没有宣称完整校验所有未实现字段的 Java 语义。
- 不支持的继承指令、审核源码变动需要人工复核，不设置忽略开关。

当前专项测试（含 `--native`）**24/24** 通过；不启用 native 时为 23 通过、1 个明确跳过。覆盖：逐文件 SHA/字节数核验、两次导入逐字节相同、生成物一致、CLI check、临时副本中缺失文件/重复 ID/源码漂移/未列出文件、真实中文名称与颜色 alpha、原版默认值/float32、逐键回退、缺失与未实现区别、深层不可变和输入隔离、关系证据真实源码行号、自创 ID 与对称关系、缺失关系不补 0、非法输入及 TypeScript 只读约束。TypeScript 检查的虚拟测试文件仅在内存中，不写 shared 契约文件。

专项 lint 与已有 campaign TypeScript 契约也通过。首轮定义模块与既有 foundation/encounters/logistics/simulation/travel/transitions/interaction/gateway/launcher 的合跑记录为 **172/172**；本次亮色收尾仅重跑专项与 TypeScript/lint，全量由主线程集成后重跑，不能将历史数量当成本次全量结果。上述测试只证明本次定义/查询模块边界，不证明外交、势力治理、殖民地或整个生涯模式已经完成。
