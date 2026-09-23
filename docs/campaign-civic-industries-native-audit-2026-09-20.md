# Corvus 常规产业 commodity 供需：编码前对照（2026-09-20）

版本：本机 Starsector 0.98a-RC8。后台源码工作，无原版窗口操作。原版产业界面相关截图仍缺失；本轮只实现供需内核和有序组合，不改 UI、不作视觉还原声明。

## 证据 → 行为

- `starsector-core/data/campaign/industries.csv`：必须按真实 plugin/tag 分类，不从ID包含 military/starfortress 字符串猜级别。同类升级、空间站三级/三技术等级使用共同方法。
- API `impl/campaign/econ/impl/PopulationAndInfrastructure.java:62–79`：food=size；非habitable才写 organics=size-1；domestic=size-1,luxury=size-3,drugs=size-2,organs=size-3,supplies=min(size,3)；supply crew=size-3,drugs=size-4,organs=size-5。habitable分支**没有else删除旧organics修正**；整个apply没有非functional时清supply分支。不能套统一停工归零。
- `Spaceport.java:33–70,170–172`：megaport多2级需求/crew；fuel/supplies/ships=size-2+extra，crew=size-1+extra。alpha只减需求不加产出，非functional清supply。
- `MilitaryBase.java:53–76,118–124,151–154,237–243,515–517`：patrol/military/command tags决定extraDemand=0/2/3；supplies/fuel/ships=size-1+extra；crew=size；非patrol额外marines=size；始终合法的供需（即使市场禁售武器/陆战队），alpha只减需求。
- `GroundDefenses.java:26–45,66–73,111–113`：supplies/marines=size、hand_weapons=size-2，两类grounddefenses/heavybatteries同一供需公式；始终合法；alpha只减需求。
- `OrbitalStation.java:53–86,487–489`：本地 size=3/5/7按battlestation/starfortress tags选择，**不随市场size**；crew/supplies=size。alpha只减需求，供需合法性继承Base而不是军事基地例外。
- 上述非资源类没有覆写 canImproveToIncreaseProduction，改善不加commodity产出；人口仍继承Base的alpha产出+1。BaseIndustry的具名状态和bonus更新语义沿用上一轮已对照内核。
- `campaign/econ/Market.java:313–321,1101–1107,1142–1154`：条件先unapply再按surveyed/suppressed判断apply；行业按市场列表顺序unapply/apply；freePort时commodity不是非法，否则问势力。资源条件unapply不清commodity modifier（上一轮证据）。
- `econ/Population.java` 的 apply/unapply为空。`BaseHazardCondition`、`LCAttractorLow/Medium`、`Habitable`、`FreeMarket`已读：无直接commodity修改；仍有hazard、发展、稳定度/流通性副作用，**本轮不声称执行这些副作用**。habitable对人口需求通过hasCondition的实际存在性判断，而非条件是否已surveyed。

## 当前差异 → 本轮代码计划

仅资源产业可提供有效产需。先将已验证的MutableStat/具名supply-demand/bonus逻辑抽成共享内部模块，保留资源API合同；新增其余五类原版commodity方法及行业CSV/plugin/tags数据导入。组合层按真实行业顺序应用资源条件与全体已支持产业，并给每个指定商品计算现有maxSupply/maxDemand和合法性。明确输入名单来自当前市场，不从Corvus蓝图偷偷生成可交易市场。

未知行业/条件plugin、产业物品、缺失状态/字段一律拒绝，防止悄悄漏算。只认证commodity部分完成；不会给经济调度器回报MainWorkTask2完成，不更新时间戳、不生成库存/价格、不开新市场交易。

## 验证

- CSV数据/源码hash重导入一致。
- 抽取上述原版commodity代码块与Base方法，原版完整MutableStat/StatBonus在Java CLI内对照；说明非commodity部分是环境桩而非实机。
- Corvus三市场实际有序行业和条件来源链、非宜居人口、有机物遗留、空间站固定级别、军事合法性、自由港、AI例外、改善、停工升级与错误输入测试。
- 原有资源1296状态oracle继续通过；全campaign回归、严格类型与lint。

### 聚合范围补证（编码前）

`CommodityOnMarket.java:404–416` 的 maxSupply/maxDemand 也服务 ships(meta)；先前价格内核入口刻意拒绝meta。新增仅限primary商品的通用行业聚合入口，允许已知primary meta ships，既有价格入口仍保留拒绝meta/nonecon边界；不借机给ships开放资源交易。非primary的需求分支跳过，暂不开放变体商品。原版聚合getter会创建空commodity stat，组合层保留这一状态变化。`Market.java:1077–1079` 以条件存在判断habitable，与勘探/压制状态无关。
