# 市场流通性与网络推进（2026-09-20）

## 已实现

- `OriginalMarketAccessibility.mjs`：本地人口/港口/自由港的accessibility具名状态；按给定完整经济组计算原版float质心、距离和敌对惩罚，保留更新前后运输能力。
- `OriginalCommodityNetwork.mjs`：把现有产业最大供需与新accessibility接到原版出口/进口/shortage/low-access/交易eMod计算，返回市场可用量。包含primary ships(meta)的网络需求，但不开放meta普通资源交易或价格结算。
- `reference-market-accessibility.json`、导入脚本：本机原版settings、港口/自由港常量、人口规模bonus，锁定13份源码/数据/Vector2f库hash。
- 从上一轮有序产业commodity结果 → 本地流通性 → 组内出口/进口 → 可用量 → 已有价格内核的**计算链**通过测试。没有把这些测试输入写入开发世界、数据库、零售库存或当前可交易快照。

## 输入/顺序合同

```ts
reapplyOriginalLocalAccessibility({
  accessibility, hasSpaceport, marketSize,
  firstQueuedIndustryHasSpaceportTag,
  conditions: [{id, modId, surveyed, suppressed}],
  freeMarketDaysByModId,
  industries: [{industryId, operating, aiCoreId, improved, specialItemId}]
})
computeOriginalGroupAccessibility({econGroup, roster, markets, hostility})
resolveOriginalCommodityNetwork({econGroup, roster, markets, hostility, commodityId})
```

### 本地阶段

- accessibility是具名有序`{flat,percent,mult}`，其他技能/事件/封锁等已生效修正保留，不自动重建这些未知来源。捕获修正/坐标/自由港天数必须是native float；缺失/超界拒绝，不偷偷补默认值。
- hasSpaceport是**前一状态的真实flag**。人口按顺序读取，太空港先unapply清旧modifier再apply；非functional时最后仍设true。不会把hasSpaceport改为“有正常工作的港口”，也不会循环到看似正确的稳定状态。
- `firstQueuedIndustryHasSpaceportTag`须来自当前建设队列首项的真实spec tag。另有新建产业（排除population、排除升级）时不享受排队港口的临时豁免。原版建设队列本身没有在此实现。
- 自由港daysActive必须明确提供，按当前条件modId一一对应。此处只执行reapply的access部分，不推进计时、不根据缺港删除条件，不设freePort、不处理其稳定度/移民效果。
- 仅支持已核实的21种产业（18种常规+3种资源）和32种无直接commodity修改的条件+24资源条件。在本轮已读代码中，除人口/港口/free_market外其余不直接写accessibility；其其他效果不声称完成。未知插件、产业特殊物品明确拒绝。
- 本地输出scope=`local-accessibility-effects-only`。人口无港/规模，港口普通/大港、Alpha/改善，free_market修正已实现；仍不是完整market.reapplyConditions/reapplyIndustries。

### 组内core阶段

- roster为权威当前经济名单的`{marketId,econGroup}`有序数组。null组只匹配null，命名组精确匹配。markets必须与选定组名单**数量与顺序一致**；缺漏/多余/乱序拒绝。纯函数不能证明roster自身真实完整，未来权威执行器还须从世界状态验证，不能用Corvus局部名单冒充全核心世界。
- markets含marketId/factionId/size/超空间location/accessibility。单位是原版超空间坐标（2000单位/光年），不能传系统内坐标或已经换算的光年。
- hostility必须包含组内每对不同势力的当前**有向**isHostileTo布尔值，不能缺省false或假设对称；自身关系不需要。当前外交/自建势力关系计算和权限仍属于其他模块，不从初始faction定义冒充运行态关系。
- 质心权重max(1,size-1)，敌对权重max(1,size-2)；同组hidden市场没有额外过滤。各市场关系权重以全组总权重为分母。按原名单float逐步累加，质心乘float倒数，不用double合并或最近邻距离。
- core_base总是保留具名条目（即使0）；正敌对惩罚写core_hostile，否则删旧条目。其他flat/mult/percent插入顺序保持。基数0意味着percent不放大flat，mult仍生效。
- 输出scope=`group-core-accessibility-only`，含center、势力/敌对权重、每市场accessibility与before/after shipping。空组返回空结果，不伪造市场。
- 这是CommodityMarketData构造器的组内更新，不是面向组外候选市场的computeBaseAccessibility(market)预览；后者会临时append不在组内的目标，本轮没有擅自实现该接口。

### 商品网络阶段

- market额外输入：hidden、当前产业amounts(maxSupply/maxDemand及合法性)、`availableBeforeCore`、`otherAvailableFlat`、`eventModBeforeCore`、真实tradeMod的both/plus/minus。
- exports用**本地reapply之后、组core更新之前**的shipping和available；进口/available用core更新后的shipping。不得将after shipping回填为before。不同商品按原版顺序计算时，外层执行器必须把真实已更新全局accessibility带给下一商品，不能每个商品都重用整轮开始的旧副本。
- 本轮组合复用已验证的availability/eMod纯内核：otherAvailableFlat只代表排除四个core及eMod后的其他有序flat之和，要求可用量stat base=0、无percent/mult；不是任意原版MutableStatWithTempMods的完整采集器。外层不能遗漏未知modifier或按名义截止时间重建它们。
- 保留early-continue不重新apply eMod分支；可用量按原版`max(0,Math.round(statValue))`输出，同时保留raw float。没有把trade影响每天衰减或变成瞬时库存。
- scope=`primary-commodity-network-effects-only`，不输出asOfTick、inventory、admission或completedTask。市场份额、income/upkeep、稳定度、真正MainWorkTask2/后续task执行，以及全sector加载和最终市场发布仍待接入。ruleset/存档锁未改。

## 原版核验与测试

编码前证据：`campaign-market-accessibility-native-audit-2026-09-20.md`。

- 专项14项，覆盖本地行业顺序、排队港口与升级差异、Alpha/改善、停工后hasSpaceport、自由港时长、两种权重、非对称外交、命名经济组、具名stat顺序、前后运输阶段、hidden、eMod、端到端计算链及输入错误/不可变。
- Java CLI oracle：原版computeCenterOfMass、computeBaseAccessibility、getShippingCapacity、敌对计权类、core modifier代码块；原版人口/港口access代码块、FreeMarket.getAccessBonus与完整StatBonus/MutableStat；Vector2f直接使用本机`lwjgl_util.jar`。仅修复反编译擦除的泛型声明与独立编译包路径；非accessibility副作用为桩。
- **180组经济网络**的float质心、core修改、更新前后运输/有效值，与Java一致；**288个连续本地状态快照**（96组×3次reapply）的modifier插入顺序、hasSpaceport、float值一致。
- 产业/旧经济/本轮专项共45项通过。不是原版实机/完整经济运行验证。
- 本轮没有界面改动、桌面操作、可见窗口、子代理或发布操作。

## 下一条关键路径

补原版稳定度/治理与收入等必要市场状态来源，推进真实经济任务编排、完整组市场加载/版本依赖，然后才能发布一致的价格与库存。保留“未完成经济”状态，不通过更新时间戳或捏造市场数值绕过缺失步骤。生涯整体目标仍包含全部原版交互、殖民地/势力、任务战斗及独立舰队多人集成，尚未完成。

## 回归收尾核对（2026-09-20）

已重新读取 artifacts/campaign-market-accessibility-regression.log：557项，552通过、0失败、5项既有可选原版探针跳过。上一执行回合最终专项严格类型、全量 tsc -b、专项lint及diff检查退出0；类型日志为空。未提交或发布。

## 后续：稳定度/治理（2026-09-20）

已新增本地稳定度与人口财务因子组合层，见 `campaign-market-stability-progress-2026-09-20.md`。原版commodity catalogue新增已核实无直接商品写入的通讯中继、近期动乱、法外之地三类条件。下一阶段仍需实际经济任务编排，而非把本地scope结果直接标记为市场新鲜快照。
