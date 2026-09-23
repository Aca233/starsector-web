# Population 动态统计 live helper — 原版证据与接入边界（2026-09-22）

## 范围与先行结论

版本：本机 Starsector 0.98a-RC8（与现有 `reference-market-stability.json`、`reference-fleet-composition.json` 的 originalReference 一致）。只补 `PopulationAndInfrastructure.apply()` 的动态统计片段及对应精确 unapply；不实现完整 population 生命周期。按本任务授权，仅新增本说明与 `OriginalPopulationIndustryEffects.mjs` / `.d.mts`，不修改 Runtime、其他规则、测试或总进度。

这是数值/共享状态移植，不涉及界面布局。未操作原版桌面、未启动窗口；原版实机与 Web 验证均未进行。按要求不运行任何检查，下面的验证项交主代理集中执行，不能视为已经通过。

## 原版证据 → 行为 → 当前差异 → 验证方法（编码前记录）

下列源码路径均相对于本项目目录的 `../decompiled/`；配置位于 `../starsector-core/`。

| 证据 | 应保持的行为 | 原有 live 差异 / 后续验收 |
| --- | --- | --- |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/PopulationAndInfrastructure.java:120–151` | accessibility 写入后，读取一次 prevStability；依次质量、防御、max_industries、舰队规模、招募概率；之后才 modifyStability2 和 transient immigration | `OriginalLiveIndustryEffects.mjs` 原有 population 分支只含部分 stability 和 max_industries，漏掉其余动态统计。需在真正的 apply 顺序接入，而非事务结束时补写。 |
| 同文件 `120–131,175–185` | 质量 flat `_0` = `(prevStability - 5f) * .05f`，flat `_1` 来自实际 doctrine.getShipQualityContribution；防御 mult 无后缀 id = `.25f + prevStability/10f*.75f`，flat 无后缀 id = 10/20/50/`(size-3)*100` | prevStability 不能用当前 stability 代替；doctrine contribution 不能由历史/固定 0 冒充。验证服务缺失时拒绝、质量零值 Always 仍有记录、共享 defense 引用不变。 |
| 同文件 `55,129–130,200–202` | 源码开关 `HAZARD_INCREASES_DEFENSE = false`；只有打开时才使用防御 mult `_1` / hazard getter | 本实现保留原版 false，apply 不读取 hazard，unapply 不删除 hazard 的 `_1`。不得清理该 stat 全部前缀。 |
| 同文件 `132,499–524`；`starfarer.api/com/fs/starfarer/api/util/Misc.java:4387–4388` | 10 元素 maxIndustries 按 size-1 夹到 0..9 后写 flat `ind_population`；其他 modifier 不动。Misc 读的是整个 bonus.computeEffective(0)，再 Math.round，不是裸表项 | 不能把 maxIndustries bonus 替换为表项或在本 helper 里算超上限 stability。验证外来 flat/percent/mult 仍保留，modifyStability2 在本片段后执行。 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/fleets/FleetFactoryV3.java:117–160,1478–1496` | quality、stability 舰队倍率、size 分段、doctrine ships 公式；获取同一 ships CommodityOnMarket 后，先 getAvailable 再 getMaxDemand；需求 > 0 才计算 ratio 下限 .25，结果夹到 0..1 | 不能先取 ships 快照/最大需求，再修改 quality/defense/max。需以可观测 getter 顺序验证；demand=0 仍必须先调用 getAvailable；舰队规模的 `_0..3` 在两个 getter 都完成后才写。 |
| `starfarer_obf/com/fs/starfarer/campaign/econ/Market.java:804–813`；`CommodityOnMarket.java:262–263,392–393,404+` | getCommodityData 在缺失时创建并登记真实 commodity；getAvailable 是 max(0, Math.round(available stat))，getMaxDemand 读取 commodity 缓存；max demand 更新是另一流程 | helper 不自行刷新网络/计算全市场最大需求、不以人口 demand 替代它；服务必须返回真实共享 commodity 的惰性句柄，而非提前计算的 DTO。 |
| Population 文件 `48–53,146–151`；`data/config/settings.json:772–777` | officer base .1 + 每超出 size3 的 .05；additional officer .1；merc .25；admin base .05 + 每超出 size3 的 .05 | 普通 modifyFlat 首次 0 不创建记录，但已有记录改到 0 必须保留；检验缩小市场后旧 bonus 不残留非零。 |
| Population 文件 `189–215` | Base.unapply、stability、accessibility 清理之后，动态统计逐 channel/exact id 删除；之后 unmodifyStability 与移除 transient immigration | 验证来自 port/military/item/任意外部 id，以及相同 id 的其他 channel 均不丢失；不整体清空 bonus。 |
| `starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:149–154,248–253` | 本插件 id = `ind_population`；索引 id = `ind_population_0` 等 | 不接受任意行业前缀，不触碰其他行业。 |
| `starfarer.api/com/fs/starfarer/api/combat/StatBonus.java:145–160,187–214` | modify*Always 必须写入中性值；普通 modify* 的首次中性值不写，但已有键回到中性仍在 | 使用原地数组更新，不替换共享 bonus 或 channel 数组；按 Java float 运算次序逐步 fround。 |

## 常量来源（不使用推测值）

- `maxIndustries`: 直接复用 `src/campaign/data/reference-market-stability.json`，已与本机 `data/config/settings.json:286` 的 `[1,1,1,2,3,4,4,4,4,4]` 对照。
- `MIN_NUM_SHIPS_DEFICIT_MULT`: 直接复用 `reference-fleet-composition.json.constants`；源码 `FleetFactoryV3.java:56` 为 `.25f`。
- `maxDoctrineNumShipsMult`: 本机 settings.json:711 为 `1.5`。既有 reference 尚不含此配置键，因此仅在本次获授权的新模块中摘录，并标明配置行号；不修改 reference 文件。
- `officerBaseProb=.1`、`officerProbPerColonySize=.05`、`officerAdditionalBaseProb=.1`、`officerBaseMercProb=.25`、`adminBaseProb=.05`、`adminProbPerColonySize=.05`：摘自 settings.json:772–777，声明处对应 Population 文件48–53；同样在新模块中有来源注释。
- `.05f`、`.25f`、`.75f`、size 阈值/分段、`4f` divisor 是以上 Java 方法体里的源码常量，不是另行调参。
- doctrine ship-quality contribution 与 doctrine numShips 是实际 faction 当前 getter，不是配置常量；必须由同步 runtime 服务提供。历史 stability 同理。

## 接口设计 / 主代理接入点

新模块采用 `(market, runtime)` 的真实共享状态写法。`market.groundDefenses`、`market.maxIndustries`、`market.economyBonuses[statId]` 为权威事务的原对象；不 structuredClone、不返回替代市场。若 economyBonuses 同时暴露 defense/max 的别名，必须指向相同对象。

`runtime` 服务按需要提供 `readPreviousStability()`、`readMarketSize()`、`readDoctrineShipQualityContribution()`、`readDoctrineNumShips()` 和 `getCommodityData('ships')`。最后一项只获取句柄，该句柄的 `getAvailable()` / `getMaxDemand()` 到各自真正调用时才读取当前值；不得在构造句柄时预读、缓存或额外刷新。缺失服务/非同步或非法值必须显式失败，没有 fallback。

已实现以下导出（完整参数类型见同名 `.d.mts`）：

```ts
applyOriginalPopulationQualityAndDefenseEffects(market, runtime): number
applyOriginalPopulationMaxIndustriesEffects(market, runtime): void
applyOriginalPopulationFleetSizeEffects(market, runtime, previousStability): void
applyOriginalPopulationRecruitmentEffects(market, runtime): void
applyOriginalPopulationDynamicEffects(market, runtime): void
unapplyOriginalPopulationDynamicEffects(market): void
```

quality+defense 返回该次读取的 prevStability，fleetSize 使用它，而不是再次读取历史值。四段导出的 runtime 分别用 `Pick<OriginalPopulationIndustryEffectsRuntime, ...>` 限定实际所需方法；组合调用接受完整服务。固定数据另导出只读 `ORIGINAL_POPULATION_INDUSTRY_EFFECTS`。

最小接入片段（调用者已完成真实 accessibility 片段后）：

```ts
const previousStability = applyOriginalPopulationQualityAndDefenseEffects(market, services);
applyOriginalPopulationMaxIndustriesEffects(market, services);
applyOriginalPopulationFleetSizeEffects(market, services, previousStability);
applyOriginalPopulationRecruitmentEffects(market, services);
// 接着由调用者执行原版 modifyStability2、transient immigration。
```

以上四行也可替换为一次 `applyOriginalPopulationDynamicEffects(market, services)`，不要两种都调。无返回 DTO，所有 effect 是对原权威对象的直接写入；唯一返回的数值只是 Java apply 方法内需要跨片段保留的局部变量。helper 既不自行执行 unapply，也不为缺失 bonus 创建临时副本。

`EconomyBonus` 不携带 desc，因此原版仅用于描述字符串的第二次 getSize / faction prefix / commodity 名称读取不在数值 helper 内复刻；不会因此省略真实 ships 句柄与 available/maxDemand 的读取。相同 modifier channel 数组保持原引用，普通写入遇到已有相同值时保留条目对象，Always 按原版替换该条目；不承诺 StatMod 单条目的引用永远不变。

### 主流程必须保留的外部顺序

1. 真正的 Population unapply 中：Base.unapply → stability `_0..2` → accessibility `_0..1` → **本 helper 的 dynamic unapply** → unmodifyStability(`ind_population_3`) → 移除 transient immigration。
2. 真正的 Population apply 中：modifyStability → Base.apply(true)（含财务/core/improvement/item）→ 供需与短缺 stability → accessibility → **本 helper 的 dynamic apply** → modifyStability2（含超上限）→ 加入 transient immigration。
3. 如果分段接入，必须保持 quality+defense → maxIndustries → fleetSize → recruitment。不要在 ships getters 前写 recruitment，也不要在 dynamic apply 后再运行旧 population maxIndustries/stability 分支而造成双重/错序执行。
4. 该片段没有 isFunctional 分支，不能因 population disrupted/building 自行跳过。

## 明确未覆盖

完整 Base/Population apply/unapply、stability / modifyStability2 / 超上限惩罚、供需、accessibility、灯光/heat condition、immigration、财务、产业对象事件、fleet spawning 与实际 officer/admin 生成均不属于此 helper。原有 `EconomyBonus` 只记录 `{id,value}`，不储存 Java StatMod.desc；因此本 helper 不声称移植 tooltip 描述或 faction/commodity 名称本地化。开关开启时的 hazard-defense 扩展不启用；需要开放该源码开关时必须同时扩展真实 hazard 服务和对应 unapply 行为。

当前交付：源码核对及三份授权新增文件已完成；导出签名已提前通知主代理。未修改或接入 Runtime/其他规则，未运行类型检查、lint、场景或测试；无原版实机/Web 等价结论。现有市政帧/港口/地防的主线验收结果不代表本 helper 或完整人口逻辑已验收。


主代理已审阅并在既有 shared scheduled economy 场景加入共享引用/调用顺序/中性修饰器/精确撤销断言，随 tsc 与改动lint通过（日志 C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-parallel-industry-integration-1790074811838.log）。本 helper 仍未插入完整人口 apply；验收不代表完整人口或世界帧。
