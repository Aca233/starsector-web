# Corvus 原版蓝图与来源审计（2026-09-19）

## 交付边界

这是一份**已审计原版脚本的 authored blueprint（手工配置蓝图）**，不是已经生成完毕的星系存档，不替代世界构造、轨道求值、外交、市场模拟或渲染器。

本地安装根：`C:/Program Files (x86)/Starsector`。本次安装含中文本地化内容；保留文件中的名字，不换成网上的英文名字。本次只新增约定的六个文件，没有改共享 Types / DevelopmentWorld / ReferenceRuleset / 原有导入器 / client / package.json，也不提交发布。

- 导入器：`C:/Program Files (x86)/Starsector/starsector-web/scripts/import-campaign-corvus.mjs`
- 回归：`C:/Program Files (x86)/Starsector/starsector-web/scripts/check-campaign-corvus.mjs`
- 数据：`C:/Program Files (x86)/Starsector/starsector-web/src/campaign/data/reference-corvus.json`
- 运行时：`C:/Program Files (x86)/Starsector/starsector-web/src/campaign/content/OriginalCorvus.mjs`
- TS 合约：`C:/Program Files (x86)/Starsector/starsector-web/src/campaign/content/OriginalCorvus.d.mts`
- 本说明：`C:/Program Files (x86)/Starsector/starsector-web/docs/campaign-corvus-source-notes-2026-09-19.md`

## 规模与验证

- 65 条有效 `Corvus.generate` 语句逐条保留（源码顺序、行号、原始参数表达式和处理结果）。注释掉的测试天体、Somnus、Mors、Jangala 的旧 submarkets/tariff、Garnir 的 orbitalstation **没有导入**。
- 23 条手工实体/创建 helper 记录：1 恒星、5 行星/月亮、8 自定义实体、1 显式跳点、1 小行星带、3 ring-band helper、4 显式 terrain。
- 18 条显式 circular/point-down 轨道；ring/小行星带 helper 内部生成的附属对象不冒充已实例化实体。
- 3 个经济市场 + 1 个废弃平台 helper 市场。
- 6 种行星 spec、8 种 custom entity spec（继承链包含额外的父定义）。
- 70 个去重来源/hash，其中 16 个 Java 实现快照 hash 锁定、41 个实际图像资源、5 张过程生成依赖 CSV；其他为配置和常量源。
- 5 条显式待执行阶段 + 6 类 helper/后处理依赖。它们不是一个可以盲目串行执行的统一列表：`stages` 有原版语句序号，`postprocessing` 是需要插入相应创建阶段/生命周期的依赖说明。
- 当前数据 SHA-256：`62c5e59073626b1fae24c775e6992a3c46b2c44a4feb29faa24c804e1285bb15`。

在项目目录执行：

```powershell
node scripts/import-campaign-corvus.mjs --check
node scripts/check-campaign-corvus.mjs
```

18 项回归全部通过。包括两次真实导入字节一致、磁盘产物比较、坏 hash/断链/循环轨道/丢生成阶段/假 tariff 拒绝、缺源文件/缺图/Java 漂移/未知市场字段的临时 fixture 拒绝、不可变隔离、内存中的 TypeScript 合约，以及主线程 `originalOrbitOrder` / `advanceOriginalOrbit` 的无侵入兼容测试。测试中的占位坐标与测试 ID 只存在于测试内，**不写入蓝图**。没有启动或调用游戏进程，也没有把 JS RNG 冒充原版 oracle。

## 原版证据

所有路径的根标签及原始字节 SHA-256/长度都在 JSON `sources` 中；`core` 对应 `C:/Program Files (x86)/Starsector/starsector-core`，`decompiled` 对应 `C:/Program Files (x86)/Starsector/decompiled`。以下定位用根标签避免混淆两个反编译树。

| 来源 | 已审计事实 |
|---|---|
| `core:data/scripts/world/corvus/Corvus.java:25-263` | 实际星系脚本，不在 procgen/themes；23 条手工创建记录及所有修改/生成器调用。hash `a41192c4a9a473f6a641fb074822792ae557a7cb6ffc45cba7270c71c416ad2c`。 |
| `core:data/scripts/world/SectorGen.java:55-71,137-155` | 先创建 Corvus、先设 background4、设重生位置 `(-2500,-3500)`，随后执行 Corvus.generate；后续才做全星区超空间星云清理。 |
| `core:data/config/settings.json:1021` | `plugins.newGameCreationEntryPoint=data.scripts.world.SectorGen`；同一文件的 graphics 表解析 glow/interaction/ring/nebula sprite。 |
| `core:data/campaign/starmap.json:10` | Corvus **超空间**位置 `[400,-9400]`，不是重生位置。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/StarSystem.java:249-260` 与 `loading/S.java`、`loading/SpecStore.java:206` | initStar 将恒星放在局部 `(0,0)`，以恒星 id 查 starmap 设置星系位置，并调用 addCorona；不是根据图片猜坐标。 |
| `core:data/config/planets.json` | 6 种 planet type 的原始声明及真实 texture/icon/cloud/corona 路径。不声称补全未审计的 renderer 默认值。 |
| `core:data/config/custom_entities.json`；`decompiled:starfarer_obf/com/fs/starfarer/loading/SpecStore.java:435-474`；`loading/specs/int.java:89-153` | 先载父 spec，再 clone/load 子 spec；本模块只投影已审计的 defaultName/defaultRadius/图像尺寸与路径/pluginClass/tags/layers。存在的标量覆盖继承值，tags/layers 有声明时替换；其它声明完整保存在 chain，并列入 unimplementedDeclaredFields。不是通用 JSON 深合并。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/BaseLocation.java:1070-1102`；`CustomCampaignEntity.java:70-100`；`BaseCampaignEntity.java:142-144` | custom 简写调用传半径 -1，使用 spec 默认半径；null name 使用默认名、null faction 转 neutral；null id 调用 Misc.genUID，不能伪造固定 id。addPlanet 还调用 initConditionMarket。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/JumpPoint.java:57,520` | 显式跳点默认半径 50；标准超空间视觉查 `misc/wormhole_hyper`；该显式跳点此时尚未填入自动生成的目的端。 |
| `core:data/campaign/econ/economy.json` 与 `econ/corvus.json` | 经济 manifest 含一次 corvus.json；3 个市场的实体关联、owner/size/conditions/industries/freePort 来自有效 JSON 字段。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/econ/super.java:115-150,163-225` | 经济市场 id=第一个 entity id，name=主实体名称；所有关联实体绑定市场并改变 faction；设置 surveyed startingConditions；未声明 submarkets 时补 open_market/black_market/storage，有 militarybase 或 highcommand 再加 generic_military。campaign linked mode 的 tariff 来自 faction，不是随便使用 economy.defaultTariff。 |
| `decompiled:starfarer.api/com/fs/starfarer/api/util/Misc.java:3491-3503` | 废弃平台市场 size0、继承平台 faction、abandoned_station condition、storage、FULL survey、storage 已付费解锁；不注册为经济殖民地；设置/清理 memory flags。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/econ/Market.java:501-509` | setPrimaryEntity 自动将主实体加入 connectedEntities；故废弃平台 helper 也有主实体关联，但不代表注册进 sector economy。 |
| `decompiled:starfarer.api/com/fs/starfarer/api/util/Misc.java:2941-2952` | 每个 addPlanet 的初始 condition market 为 neutral size1，同时消费 StarSystemGenerator.random.nextLong 作为 salvage seed；之后经济加载会替换有经济市场的星球绑定。 |
| `decompiled:starfarer.api/com/fs/starfarer/api/impl/campaign/procgen/StarSystemGenerator.java:744-825` | addOrbitingEntities 依赖共享 RNG、star/age/planet specs、类别选择、月亮/地形生成、NameAssigner/已用名字集合；2..4 是请求的轨道数量范围，不是最终实体总数。 |
| 同文件 `:828-900` | OLD 星云类型为 nebula_amber；helper 设系统 age=OLD、hasSystemwideNebula=true；实际星云噪声/裁剪/清理待生成。pickNebulaAndBackground 消费 RNG，但该 helper 并未把背景改成随机 backgroundName。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/StarSystem.java:307-315,512-520` 与 `Misc.java:2434-2439` | 双参数 autojump 隐式传第三参 true；先 updateAllOrbits，再生成超空间锚点/入口/出口/边缘跳点/重力井，最后对符合条件的行星以 **AVERAGE** 生成 conditions。不能因系统已有 OLD 年龄就改成 OLD。 |
| `decompiled:starfarer_obf/com/fs/starfarer/campaign/RingBand.java`；`BaseLocation.java:1031-1034,1120-1137` | RingBand 初始 angle 用 Math.random，独立于 StarSystemGenerator.random；带 terrainType 的 ring helper 还生成 terrain；asteroid-belt helper 生成围绕 focus 的零半径 terrain 轨道和随机小行星内容。 |
| `decompiled:starfarer.api/com/fs/starfarer/api/impl/campaign/CoreLifecyclePluginImpl.java:737-855` | 后续还有 Jangala 赏金、story-critical、luddic_shrine、调查状态和核心星区标签等；列为后处理，不伪造最终状态。 |

## 手工内容摘要

轨道参数按原版调用保留为 `(focusHandle, angleDegrees, radius, periodDays)`。`point-down` 与 `circular` 分开；负角度如稳定点 `-80` 原样保存，不提前 normalize 或求浮点坐标。

| 本地化/源码名 | nativeId | 本体半径 | 初始轨道 |
|---|---|---:|---|
| Corvus | corvus | 775 | 星系局部原点 |
| Asharu | asharu | 150 | star,55,2800,100 |
| Jangala | jangala | 200 | star,245,4500,200 |
| Barad | barad | 300 | star,100,7800,400；baradAngle=100 是源码常量 |
| Garnir | corvus_IIIa | 100 | corvusIII,135,790,20 |
| Warion | corvus_IIIb | 70 | corvusIII,235,1300,60 |
| 废弃的地貌改造平台 | corvus_abandoned_station | 50 | point-down: corvusI,45,300,30 |
| Jangala 空间站 | corvus_hegemony_station | 90 | point-down: corvusII,225,360,30 |
| Garnir Extraction Depot | corvus_pirate_station | 60 | point-down: corvusIIIA,45,180,20 |
| Jangala 通讯中继站 | corvus_relay | 75 | point-down: star,185,4500,200 |
| Jangala 跳跃点 | jangala_jump | 50 | circular: star,305,4500,200 |
| Corvus 之门 | jangala_gate | 120 | circular: star,0,6000,350 |

其他有 Asharu 恒星罩、临时传感器阵列、稳定点、Nemo 小行星带、3 条 ring、Barad 磁场、L4/L5 小行星团和 6×6 手工星云。Asharu glow 为本地设置实际引用的 **asharu_sparse_glow.png**，不是猜测的 asharu_glow.png。Barad L4/L5 的源码角度分别是 40/160；即使注释容易产生方向联想，也不修改源码参数。

市场：

| 市场 id | 所属势力 | size | 子市场 |
|---|---|---:|---|
| asharu | independent | 4 | open_market, black_market, storage |
| jangala | hegemony | 6 | open_market, black_market, storage, generic_military |
| corvus_IIIa | pirates | 3 | open_market, black_market, storage；freePort=true |
| corvus_abandoned_station_market | neutral | 0 | storage；helper 不注册经济市场 |

`conditions` 是 authored 起始数组，不是经济 warmup/industry plugins/freePort 后的最终全部 conditions。`industries:[]` 对废弃平台表示 helper 未添加产业，不是代替引擎治理逻辑。平台 Hermès 内容只记录 `addMothballedShip(SHIP,"hermes_d_Hull",null)` 请求，不创建假舰船 id/货仓/船员/舰名。

## 状态语义与失败策略

- **明确声明**：数值、名称、nativeId、轨道及市场配置有源码/data 行定位。
- **已证实默认值/继承**：custom spec 的选定字段、neutral/null faction、跳点半径、市场默认 submarkets，分别标明来源。
- **声明缺失**：如 stable_location 无 sprite，字段为 `absent-in-chain`；不自动填别的图标当 sprite。缺少 Java 语义审计时也不把“文件没写”说成“引擎无值”。
- **待实现/待执行**：动态 id、terrain 边界半径、随机构造和后处理为 `runtime-unimplemented` / `required-not-executed` / `parameters-only`。没有默认猜测坐标。
- **不支持的配置**：custom 原始字段保留并逐项列出未实现字段；新增市场字段、未知 Java 语句/表达式或未审计代码 hash 均报错，而不是忽略或兼容性回退。
- **缺失/歧义输入**：源文件、图像、继承父节点、实体关联缺失，重复 key、循环继承/轨道、重复 nativeId 等失败。源路径 realpath 必须在所选源根内。
- 不执行 Java，也不使用 eval；仅安全扫描审计版本的方法语句，解析字符串、数字、常量与有限算术。原始 expressions 同时保留。这里的有限算术没有取代主线程的逐步 Java-float 轨道运算。
- 导入输出无绝对路径、无时间戳、无 RNG；按源 id 排序，SHA 为原始文件字节。`--check` 只比较不写文件。hash 锁意味着升级/修改原版 Java 需要重新审计，不是只能“随便更新 hash”。
- 运行时 `validateOriginalCorvusData` 是结构/语义校验，**不是**给任意客户端送来的 hash 背书；源真实性由导入器重新读取并验证。

## 主线程 API / 集成契约

```js
import reference from '../data/reference-corvus.json' with { type: 'json' };
import {
  buildOriginalCorvusBlueprint,
  createOriginalCorvusProvider,
  validateOriginalCorvusData,
} from './OriginalCorvus.mjs';

const validation = validateOriginalCorvusData(reference); // { valid, errors }
const blueprint = buildOriginalCorvusBlueprint(reference); // 校验、隔离复制、递归 freeze
const provider = createOriginalCorvusProvider(reference);
provider.getBlueprint();
provider.listEntities();
provider.getEntity('corvusIIIA');                 // 按源码 handle 查
provider.getEntityByNativeId('corvus_IIIa');      // 按明确 nativeId 查
provider.getMarket('jangala');
provider.listMarkets();
provider.listRequiredStages();
```

未知查询返回 `null`；所有结果（含嵌套 spec/arrays）不可变。provider 不修改传入对象，不依赖磁盘、JSON 模块自动导入、共享世界类型、UI 或随机全局变量。

**轨道桥接**只需主线程做字段映射：

```js
// resolveId 必须由世界 builder 明确提供；不能把源码 handle 冒充原版实体 id。
const orbit = {
  schemaVersion: 1,
  kind: source.orbit.mode,
  focusId: resolveId(source.orbit.focusHandle),
  radius: source.orbit.radius,
  periodDays: source.orbit.periodDays,
  angleDegrees: source.orbit.angleDegrees,
};
```

兼容测试已使用主线程的 focus-first `originalOrbitOrder`，再用 `advanceOriginalOrbit(...,0)` 初始化位置；没有把 Web 的 focus-first 排序宣称成原版集合遍历顺序。sourceHandle `@operation:N` 只是没有源码变量的 helper 的本地引用，不是运行时 id。

**后续世界 builder 必须决定/提供：**

1. 明确 nativeId 和 generated-id 的身份策略、星系/实体类型和 market 引用装配。
2. 主线程轨道 provider、10 秒/天时钟、浮点运算、零半径分支、面对方向和 focus-first 调度；本蓝图不重复实现这些。
3. 能保留调用顺序和 RNG 消费的 procgen 上下文。不仅是“给 Corvus 随便一个 seed”：前面其他星系生成、initConditionMarket.nextLong、NameAssigner/used names，以及独立 Math.random 视觉流都会影响结果。
4. planet/spec、custom plugin、corona、rings、asteroids、nebula/aurora 等生成支持。outer-orbits 结果可能增加月亮/地形/跳点，不能把 min/max 2..4 当完整实体数。
5. 待外圈与所有轨道完成后生成 hyperspace anchor/jump destinations/wells，再执行适用的 planet conditions；保留 OLD nebula 与 AVERAGE conditions 的区别。
6. 根据对应阶段建市场/设 owner，处理行业与子市场插件、faction tariff、free-port 效果及 warmup；废弃平台 cargo factory 单独处理。
7. 后续 core lifecycle / sector hyperspace cleanup，不假定这一份蓝图包含了全部剧情状态。
8. UI/renderer 先学会区分 star/planet/custom/terrain/jump-point，再选择把主场景替换成 Corvus。**本交付不改 UI。主线程本轮已将 points 投影限制为真正的 jump 实体，防止天体被误画为传送门；其他实体的渲染仍未实现。**
