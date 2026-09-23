# Corvus 常规产业供需推进（2026-09-20）

## 实现内容

- `OriginalIndustryState.mjs`：从已验证资源产业内核抽出的共享具名stat、float、supply/demand、AI/改善更新逻辑。`OriginalResourceIndustries`公开API和JSON状态schema保持不变。
- `OriginalCivicIndustries.mjs`：PopulationAndInfrastructure、Spaceport、MilitaryBase、GroundDefenses、OrbitalStation的commodity写入。由原版industry CSV的真实plugin/tags分派，共18种spec（含升级和空间站技术等级）。不执行它们的非commodity副作用。
- `reference-industry-commodities.json` + 导入脚本：18种常规产业、32种已核实无直接commodity改动的条件、资源产业3种/资源条件24种的真实CSV插件绑定，17份源码/数据hash。不把同名但不同包的Mod plugin当成原版。
- `OriginalIndustryCommodityPass.mjs`：一次条件→有序产业→逐商品maxSupply/maxDemand组合。含既有农业/水产/采矿；已按Corvus三个经济市场的authored行业与条件列表测试。
- `resolveOriginalIndustryCommodityAmounts`：允许已知primary商品的供需聚合，包括ships(meta)。原有`resolveOriginalIndustryAmounts`和价格/库存内核仍拒绝meta、nonecon和变体，不把舰船需求变成可买卖的普通资源。
- 补上对象继承属性名的校验：`toString/hasOwnProperty/valueOf`不能冒充有效行业、资源条件或商品，返回CampaignError而非静默接受/TypeError。

## 原版细节

1. 人口需求中非宜居世界多organics=size-1；改为宜居后原方法没有else删旧modifier。本实现保留实际既有stat，不自行“修正”原版状态。人口apply也不会因functional=false清空supply。
2. 太空港/特大型港口的fuel/supplies/ships需求为size-2/size，crew供应为size-1/size+1。
3. 巡逻总部/军事基地/最高指挥部的需求extra为0/2/3；crew=size，非巡逻总部另有marines=size。
4. 地面防御与重型炮台供需相同：supplies/marines=size，hand_weapons=size-2；防御力等差异不在commodity输出内。
5. 空间站需求固定3/5/7级而非市场size；级别按实际tags。驻军/地面防御的合法性恒true，但空间站继承市场合法性，不能都视作“军事设施一律合法”。
6. Alpha核心：人口继承+1产出/-1需求，其他四类只减需求；上述常规行业的改善不增加commodity供应。资源产业的改善仍按上一轮规则增加产出。
7. FreePort布尔状态直接控制Market.isIllegal的短路分支；不根据有无free_market条件猜测它。habitable则按条件存在判定，与该条件surveyed/suppressed无关。
8. 严格大于才更新最大值和legality；相等时保持较早产业，零供应/需求保留前次legality。组合层保留产业、条件、商品输入顺序和聚合getter创建空stat的行为。

## 组合API与责任边界

```ts
reapplyOriginalIndustryCommodityPass({
  marketSize, freePort, factionIllegalCommodityIds,
  conditions: [{id, modId, surveyed, suppressed}],
  industries: [{state, operating, modifiers}],
  available: {heavy_machinery},
  commodities: [{commodityId, previousSupplyLegal, previousDemandLegal}]
})
// -> {scope:'selected-primary-commodity-effects-only', industries, commodities,
//     conditionIdsWithoutDirectCommodityEffects}
```

- 所有值必须来自同一实际模拟阶段。完整当前产业/条件名单由未来权威经济执行器提供；本纯函数**不能独立证明**调用方没有漏传行业/条件，scope字段也不构成任何世界快照证明。
- commodities明确选定当前要聚合的primary商品，允许ships/meta；非primary的龙虾等变体继续拒绝。本模块不提供它们的需求继承/价格结算。
- 未勘探或压制的资源条件不apply，但原版unapply不清commodity的行为保留。未知条件即便压制也拒绝，因为其unapply副作用未知。已知无直接commodity作用的条件列出ID供诊断，不意味着hazard/稳定度/发展等副作用已执行。
- 产业state、管理员/其他修正、运营状态必须明确输入。旧存档不会凭空新建空产业；已装特殊物品当前拒绝而非漏算。管理员技能、殖民地物品、建设/升级计时、收入/维护、稳定度、流通性与巡逻舰队生成仍待实现。
- 本轮没有默认ruleset/规则锁变化，没有创建权威经济extension或给玩家开放新命令，没有写`asOfTick`、新零售库存、关税或准入，没有向调度器宣称MainWorkTask2完成。
- Corvus测试使用真实authored名单，但可用重型机械99、无技能等是**测试输入**，不是采集到的原版市场实况或实际游戏经济；这些fixture未安装到可玩世界。

## 验证

编码前对照见 `campaign-civic-industries-native-audit-2026-09-20.md`。

- 专项14项：CSV/源码重导入、原版人口需求、各设施等级/合法性、AI与改善、functional差异、Corvus真实名单来源链、有序tie、条件勘探/压制、FreePort、primary/meta边界、JSON重放/不可变/错误路径和对象原型属性边界。
- Java CLI oracle（非原版实机）：抽取五类原版apply的commodity代码块、BaseIndustry的实际供需/bonus/合法性方法、CommodityOnMarket.updateMaxSupplyAndDemand；完整原版MutableStat/StatBonus仅改package/import以便独立编译。非commodity副作用是环境桩，未声称执行。
- 18种spec × 11种规模 × 4步状态变化 = **792个状态快照**，具名修正、有效供需float、合法性一致；每步另比对5种primary商品（含ships）的原版聚合结果，共3960组。
- 共享逻辑重构后，上轮资源产业1296个状态/float oracle继续通过。产业+资源+既有经济专项共45项通过。
- 全项目`tsc -b`、严格campaign类型检查与本轮相关JS的`oxlint --deny-warnings`通过。
- 没有UI改动/新截图/视觉验收，没有操作原版窗口或用户输入，没有使用子代理。

## 下一条关键路径

Corvus本地commodity计算来源已覆盖其已定义产业名单；仍需原版市场稳定度/流通性和完整经济网络、真实任务/时钟编排，再把经过完整模拟的市场状态接给交易与原版市场界面。不能以此组合函数替代完整经济任务，不能为让画面能买卖就手填库存或更新时间戳。

生涯整体仍未完成：还包括地图/航行/传感器、任务与战斗结算、外交/自建势力/殖民地治理、非资源货物和完整多人集成。未提交、推送、打包或发布本轮内容。

### 最终全量后台回归

`node --test --test-concurrency=1 scripts/check-campaign-*.mjs`：**543项，538通过、0失败、5项既有可选原版探针跳过**。日志`artifacts/campaign-civic-industries-regression.log`；产业/资源/经济专项45项日志`artifacts/campaign-civic-industries-targeted.log`。全量测试进程正常退出。所有本轮Java子进程使用windowsHide，不启动可见窗口。
