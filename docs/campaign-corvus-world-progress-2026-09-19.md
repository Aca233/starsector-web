# Corvus authored 开发世界装配交付（2026-09-19）

## 本轮状态

已实现独立、可持久化、只读观察用途的 Corvus **手工内容开发世界**。不声称是可正常航行的完整星系，也不声称是原版 new game。

本轮仅新增四个约定文件：

1. `C:/Program Files (x86)/Starsector/starsector-web/server/campaign/CorvusDevelopmentWorld.mjs`
2. `C:/Program Files (x86)/Starsector/starsector-web/server/campaign/CorvusDevelopmentWorld.d.mts`
3. `C:/Program Files (x86)/Starsector/starsector-web/scripts/check-campaign-corvus-world.mjs`
4. `C:/Program Files (x86)/Starsector/starsector-web/docs/campaign-corvus-world-progress-2026-09-19.md`

没有改上轮蓝图/provider/importer，没有改 DevelopmentWorld、Types、ReferenceRuleset、CLI、client、package.json。没有提交、发布或创建新权威存档文件。测试数据库均为 `:memory:`。

## 主线程接口

```js
import {
  createCorvusDevelopmentCampaign,
  CORVUS_DEVELOPMENT_WORLD_ID,
  CORVUS_DEVELOPMENT_SEED,
  CORVUS_DEVELOPMENT_EXTENSION_ID,
} from './CorvusDevelopmentWorld.mjs';

const world = createCorvusDevelopmentCampaign();
// 默认 id = development-corvus-authored
// 默认 seed = web-corvus-authored-v1

const isolated = createCorvusDevelopmentCampaign({
  id: 'qa-corvus-another-instance',
  seed: 'qa-identity-only-v1',
});
```

只支持 `id`、`seed` 两个可选字符串参数；不开放坐标、terrain 清空、规则覆盖、库存、价格、资金、生成器结果等捷径。`id=development-sector` 被拒绝，避免与现有航行 fixture 混淆。返回值经 `validateCampaignWorld` 及当前 `createReferenceRuleset().validateWorld` 验证并递归冻结，声明类型可赋给共享 `ReadonlyWorld`。

主线程自行做 CLI 场景选择与 UI 连接；不要用本模块覆盖原有 DevelopmentWorld。此处没有添加新 renderer/provider 注册。

### 身份与 hash

- 世界身份：`development-corvus-authored`，明确前缀为开发世界。
- 地点身份：`corvus`；只实例化这一个正常空间地点。
- 13 个已知 nativeId 原样保留。
- 源码 null id 的两个 custom 实体 `corvus_loc1`、`corvus_loc3` 使用：

  `web-corvus:entity:` + `SHA256(canonicalJSON(['web-corvus-generated-id/v1', worldId, seed, sourceHandle]))`

  这是明确的 **Web fallback identity**，不是 `Misc.genUID` 的复刻，不是原版 Java RNG。使用完整 hash 并检查实际实例化 ID 冲突。相同 id/seed 重建一致；改变 seed 或 worldId 只影响这些 fallback 身份及内容指纹，不改变原版 nativeId 或轨道初始位置。
- `contentFingerprint` = `dev-corvus:` + 对场景版本、id、seed、蓝图规范 JSON digest、faction/logistics 数据 digest、当前规则锁的规范 JSON hash。
- `blueprintSha256` / extension 中 `blueprint.sha256` 是 **canonical JSON 内容 hash**，不是带缩进 JSON 文件的 raw-byte hash；`digestFormat='sha256-canonical-json'` 明示此区别。原版文件的 raw-byte hashes 仍完整保存在 `blueprint.sources`。
- 后续若改变装配政策，需更新场景 `scenarioVersion`，不能暗改身份/语义却保留相同版本契约。

## 已实例化内容

- 15 个 spaceEntities：1 恒星、5 行星/月亮、8 custom、1 显式跳点。
- 14 条 circular / point-down 轨道。
- 4 个 faction 定义身份：hegemony / independent / neutral / pirates，名称来自既有 OriginalFactionDefinitions。没有执行外交初始化；`playerRoles={}`，来源元数据明确 governance/relationships 未初始化。此处不是四个完整运行中的势力模拟器。
- 4 个 market 身份/关联记录；3 个经济市场源定义和 1 个废弃平台 helper 定义。
- 2 个开发玩家、2 个 Wolf 舰队/舰船，无虚构原版玩家账户余额、殖民地、Hermes 残骸成员或市场库存。

### 实体 DTO 扩展字段

`presentation` 恰好按主线程约定输出：

```js
presentation: {
  kind: 'star' | 'planet' | 'custom',
  nativeType: 'star_yellow' /* 或 desert/jungle/gas_giant/.../station_jangala_type/... */,
  sourceHandle: 'star' /* 原始 Corvus 变量名 */,
}
```

显式 `jangala_jump` 不伪装成上述三类，无 `presentation`；它保留 `jump: {anchor:null,destinations:[]}`，供主线程自己的 jump 类型显示使用。没有生成恒星重力井、超空间锚点、外围跳点或虚假的 hyper 地点。

其它附加字段：

- `source`：blueprint id/digest、原 nativeId、identity policy、sourceHandle、原版 source id/行号、原始未 normalize 的 initialOrbit、properties（glow、description、interaction image 等）、定义期 faction、condition market 说明。
- `factionId`：有经济市场者用已知 market owner；custom 用原定义 owner；无经济市场行星保留 helper 的 neutral condition-market 来源；恒星未声明 faction，保留 `null` 而不是猜测。
- `marketId`：与已知原版市场关联；比如 Jangala 本体和 station 都是 `jangala`，Garnir 本体和 pirate station 都是 `corvus_IIIa`。
- custom `tags` 来自蓝图已审计的 tags 字段；不编造行星行为标签。

本模块使用主线程新增的 generic DTO 字段，但自身不再修改共享 DTO；来源/市场关联字段是局部 JS/声明契约。主线程可以让后续 generic presentation provider 读取 `presentation`，但必须继续区分 planet/custom/jump，而不是所有 spaceEntities 都画成跳点。

### 背景、初始相位与光源（本轮追加要求）

- 地点持久化 `location.presentation.background=blueprint.system.background.path`，即 `graphics/backgrounds/background2.jpg`。
- 所有6个恒星/行星实体显式持久化 `surfacePhase:0` 与 `cloudPhase:0`。surface 0 是 **Web 开发固定相位**，不冒充 CampaignPlanet 的 Math.random 初始 angle；cloud 0 对应原版初始 cloudAngle。
- 这一区分记录在实体 `source.phasePolicy` 和场景 `renderPhasePolicy` 中；renderer 不必也不应临时随机补值。
- 5个行星/月亮全部保存 `lightSourceId:'corvus'`；builder 沿源码 orbit focus 链找到所属 star。Garnir/Warion 的轨道中心虽然是 Barad，光源仍是 Corvus。
- 恒星自身没有伪造的 lightSourceId。custom/jump 不附加星球相位字段。

### 轨道初始化

严格由 source handle 映射到真实/显式 Web runtime id，再映射为现有 provider 的：

```js
{ schemaVersion:1, kind, focusId, radius, periodDays, angleDegrees }
```

使用 `originalOrbitOrder(world)` 排序；逐个调用 `advanceOriginalOrbit(entity, initializedFocus, 0)`。临时 `[0,0]` 仅是函数内部构建缓冲，所有非恒星轨道均在返回前完成求值。空间实体版本保持 0，世界 clock/revision 不变。不会假装这个 Web focus-first 顺序就是原版集合迭代顺序。

可复核值：

- Corvus 本体半径 775，局部位置 `[0,0]`。
- Asharu 初始化位置 `[1606.0140380859375,2293.625732421875]`，按原始 55° / 2800 / 100 days 经当前 float provider 得出。
- Garnir 初始化位置 `[-1913.0703125,8240.115234375]`，先初始化 Barad，再求月球位置。
- Jangala station `point-down` facing=225°。
- 稳定点 source angle=-80°，初始化 orbit/facing normalize 成280°；原始值仍留在 source.initialOrbit。

## 不完整内容：保留闸门，不清空绕过

`world.locations.corvus.navigation`：

- `space='normal'`
- `jumpTopology='unavailable'`
- `terrain` 包含 9 个有原版来源的**待实现标记 ID**，不是已经生成的 native terrain 对象 ID：
  - Nemo 小行星带 helper `@operation:38`
  - Barad 磁场 `barad_field`
  - 带真实 ring terrain 的 ring helper `@operation:51`
  - `baradL4`、`baradL5`
  - 手工 `nebula`
  - initStar 隐含 corona
  - `outer-orbits` 的未知生成覆盖（并不宣称某个随机地形已存在）
  - 未生成的 systemwide-nebula

每项在场景 extension 的 `unimplementedTerrain` 有 nativeType/null、sourceHandle/null、source id/行号、原因和 required-not-executed 状态。原版 null terrain ids 不冒充固定 id。两条不创建 terrain 的装饰 ring-band 仍在 omittedAuthoredRecords，而不冒充碰撞地形。

8 条未装配 authored terrain/ring/belt 记录、5 条显式生成阶段和6类 helper/后处理原样保留为待实现来源。没有 terrain 的零半径假实体、随机外圈行星、空安全区、噪声星云、原版新开局预演或暗中 skip 掉的过程生成。

当前现有规则的真实拒绝行为已测：

| 操作 | 结果 |
|---|---|
| fleet.set-course | UNSUPPORTED_TRAVEL，terrain 未移植 |
| fleet.approach 到 jangala_jump | UNSUPPORTED_INTERACTION，因为 destinations 为空 |
| fleet.jump | UNSUPPORTED_TRAVEL；即便测试单独清空 terrain，也因无目的端 NOT_FOUND |
| system world.advance（1 tick 或60 ticks） | UNSUPPORTED_TRAVEL，整个权威事务回滚，clock/orbits/fuel/cargo/revision/outbox 不变 |
| market validateState | MARKET_UNAVAILABLE，没有受支持快照 |
| market buy/sell | 实际开发世界无账户时先拒绝 NOT_FOUND；测试另加合法账户后仍被 MARKET_UNAVAILABLE 拒绝，证明不是仅靠缺钱阻止交易 |

因此**主线程应冻结场景供观察**。不要持续自动重试 world.advance，也不要为了让演示船动起来而删 terrain 或标 topology complete。纯 orbit provider 可以独立求值/返回计划，但这不代表整个 authority simulation 已可推进。

## 市场仅为元数据

市场记录核心字段为 id/version/owner/locationId，额外 `metadata.definition` 是上轮完整 `OriginalCorvusMarket` 描述：名称、size、关联实体、conditions、industries、submarkets、freePort、source 等。

`metadata.status='authored-definition-only-not-economic-snapshot'`；`tradeState='unavailable'`。**不创建任何 `reference.market:<id>` extension**，不填价格、库存、税率、准入、资金、贸易影响等结构来蒙混市场 provider 校验。

废弃平台虽有 `size=0` 等定义和空间实体关联，但标明 `native-helper-not-economy-registered`。未执行 storage plugin / unlock / cargo 工厂；不会凭空生成 Hermes。蓝图 pending stage 仍 required-not-executed 是正确的，因为装配了一份定义元数据不等于执行原版 helper。

## 非正式开发舰队与日历

两支玩家舰队均精确使用源码 SectorGen 的 **respawn** `[-2500,-3500]`，没有添加未经来源确认的偏移。这不是当前 NGC 流程的正式出生点，也不是 starmap 的 `[400,-9400]`。后者只存在于地点 source metadata。

开发 Wolf 配置沿用已有 QA fixture 的意图：supplies30、fuel20、crew15、CR0.7、完整舰体；全部在场景 metadata 标注开发 loadout，不宣传为原版初始舰队。两名玩家 `factionId=null`，并未冒充已经建立两个玩家势力。

日历使用现有 `development-no-time-pass` epoch，tick0。调用 calendar 的 epoch 构造函数不是启动 Java new game，没有推进原版序幕、经济预演或时间。

## 场景 extension

`cooperative.simulation:corvus-development`，schemaVersion1，是**场景装配说明**，使用已选 cooperative simulation namespace；不是新服务、外交状态或 market snapshot。包括：

- scenarioVersion / worldId / seed 与使用范围
- officialNewGame=false / newGamePreludeExecuted=false
- blueprint digest+来源证据
- identityByHandle / initializationOrder / orderingPolicy
- spawn 依据与开发标识
- unimplementedTerrain / omittedAuthoredRecords / pendingStages / pendingPostprocessing
- 完成度与下一步限制

## 测试

在项目目录执行：

```powershell
node scripts/check-campaign-corvus-world.mjs
```

15 项全部通过：

1. 通用 world 与所有 selected provider hook，内存 repository 创建/读回。
2. 相同 id/seed 规范字节一致；不同 seed 不改变原版事实/坐标。
3. 13 原生 ID + 2 Web fallback ID 的来源与稳定性。
4. presentation/nativeType 与显式空 destinations。
5. sourceFocus 映射、父先子后、float位置、facing 与原角度保留。
6. 真实 faction/market 关联，未初始化外交，市场不可交易。
7. 9 个地形/生成标记与未装配记录。
8. 真实 respawn 依据、开发舰队、未跑 new-game 预演。
9. 冻结、隔离、蓝图/provider/JSON 不被修改。
10. 航行/交互/跳跃/推进失败与事务回滚、无 outbox 副作用。
11. 反事实测试：清空 terrain 仍无法凭空跳跃。
12. 反事实测试：注入合法测试账户仍无法交易。
13. 坏轨道/循环/规则锁/断裂 faction 引用及非法参数拒绝。
14. 内存 TypeScript 合约：ReadonlyWorld 兼容、局部 presentation 结构、嵌套 readonly、拒绝额外选项。
15. 背景与相位已显式持久化；月球从所属 star 取 lightSourceId，而非从轨道中心取光。

本轮不执行整套仓库全量/构建；由主线程统一运行。SQLite 实验性 warning 来自 Node 内置模块，不影响测试结果。

### 已回报主线程的共享 TS 边界

主线程增加 generic presentation 后，当前共享 `ReadonlyWorld` 单独执行下列类型访问也会产生 TS2589（无需引用本 builder）：

```ts
import type { ReadonlyWorld } from '../src/campaign/Types.js';
declare const w: ReadonlyWorld;
const kind = w.spaceEntities.corvus.presentation?.kind;
```

属于共享 `DeepReadonly<JsonObject>` 的递归展开问题，本轮没有越界修改 Types。自身 .d.mts 复用共享 readonly 类型，避免再次窄化/深展开 generic presentation；局部 `CorvusDevelopmentSpaceEntity` 仍描述精确的 presentation 结构。15项测试验证赋值兼容与本模块约束，但**没有宣称修复共享 generic presentation 的上述访问问题**。运行时背景/相位/光源与冻结性均有单独测试；主线程应在自身共享类型工作中处理这一最小复现。

### 主线程后续修正

共享Types的DeepReadonly已经加入独立ReadonlyJson类型与递归字典分支，保留精确loadout类型；generic presentation读取和嵌套禁止修改的合约已补充。严格campaign和完整tsc -b均通过；上面的TS2589是代理交接时发现的问题，不是当前仍然失败的状态。
