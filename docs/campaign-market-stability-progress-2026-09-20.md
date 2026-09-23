# 市场稳定度与殖民地本地经济推进（2026-09-20）

## 本轮实际落地

新增 `OriginalMarketStability.mjs/.d.mts`、原版数据导入及方法级差分探针。不是自创界面，也没有占用桌面。规则函数依然可替换，未更改默认ruleset、存档锁或authority指令。

`reapplyOriginalMarketStability` 内部复用已核验的产业商品pass，并计算：

- 人口基础稳定度、生活/奢侈品满足度、食物/非宜居有机物缺口、改善。
- 巡逻/军事/高级指挥部、地面防御、各流派轨道站/战斗站/星堡的稳定度及停工移除。
- 自由港实际daysActive惩罚、捕获的近期动乱penalty、法外之地、通讯中继实际当前列表选择与modifier重置。
- 完整单原版玩家经济名单的亲自管理数量/上限奖惩；当前工业、structure升级到industry和建设队列工业计数/超限惩罚。
- 人口收入使用prevStability的因子、势力内部供需维护费折扣、危险度维护费因子。
- 保留raw稳定度，面向原版getter时先截0..10再Math.round。保留具名stat各通道顺序与外部modifier，输出深度只读。

## 不能省略的阶段和输入

1. `commodityPass.industries` 是重算**之前**真实产业状态。空间站稳定度在写新需求前读取旧需求；军用基地、地面防御、人口在各自需求更新后读取。本层保留两份阶段状态，不能给两者都传最终商品量。
2. `marketCommodities` 是实际完整有序市场名单，必须与本次commodityPass选择列表一一对应。maxSupply/maxDemand为原版此阶段**已有缓存**；available、shippingFaction、maxExportFaction是实际当前getter结果。不得从新输出或猜测运输能力反填。名单外缺失必要商品availability报错，而不是默认0。
3. 输入stability/incomeMult/upkeepMult/maxIndustries保留当前完整有序modifiers；管理员技能等外部效果必须已经真实刷新。这里只保留它们，未实现技能刷新器。未知插件、产业物品、未知建设队列工业、变体/插件商品拒绝。
4. `previousStability` 可含原版初值-1，不会偷偷改成新稳定度；也不负责调用updatePrevStability。hazard须已从原版条件/技能等得到，本层不冒充计算全套危险度。
5. governance的markets必须来自完整真实当前经济名单。纯函数不能证明调用者没有漏写市场。原版单玩家函数尚**不决定联机多个玩家如何划分ownership/adminIsPlayer**；未来服务端适配需按实际独立玩家治理上下文接入，不能合并额度。
6. comm_relay的存在与有效中继不同：condition还存在但无有效中继时，人口不会写无中继-1。relay列表是插件此刻拥有的实际列表，不擅自模拟advance阶段死亡/跨位置清理。free_market、recent_unrest不在本层推进时钟或删除condition。
7. 本层输出scope=`local-stability-and-population-financial-factors-only`；没有asOfTick、inventory、completedTask或总收入。纯函数不把蓝图/测试fixture发布为可交易市场。

## 验证

- 编码前原版证据与阶段风险见 `campaign-market-stability-native-audit-2026-09-20.md`。
- 72组案例×3次连续状态输入，**216个Java方法级快照**逐项一致：稳定度、收入/维护费stat、工业上限，具名modifier顺序、native float值及getter。涵盖原版18种民用/军事设施、核心/改善、停工/建设/升级、条件状态、外部修正、治理、旧需求。
- 本探针不独立重算需求：需求量由已有产业原版差分验证的pass供给；本轮重点核验原版在何时读取哪个量及稳定度/财务因子。没有原版游戏实机或新UI验收。
- 专项另覆盖严禁缺数据、native ID边界、不可变、下一轮状态、市场缓存与新聚合不同、同势力进口不足时不获进口维护费优惠等。

## 尚未完成 / 下一步

需要继续补完整market hazard来源、产业收入/维护费与商品市场份额，再将这些阶段连接到实际经济任务执行器及完整星域加载。Corvus仍是元数据蓝图，不是一个新鲜真实经济快照。生涯模式仍缺权威经济闭环、原版市场UI实机对照、完整殖民地治理/自创势力、任务战斗结算及多人流程；本轮不是生涯模式完成。

未暂存、提交、推送、打包或发布；未使用子代理、键鼠、可见窗口或桌面截图。

## 本轮最终验收结果

- 专项 **15/15通过**（含216个原版Java方法/代码块状态快照），日志 `artifacts/campaign-market-stability-targeted.log`。
- 全campaign回归 **572项：567通过、0失败、5项既有可选原版探针跳过**，日志 `artifacts/campaign-market-stability-regression.log`。
- 严格campaign类型契约及全项目 `tsc -b` 均退出0，`artifacts/campaign-market-stability-types.log`为空。
- 本轮实现/类型声明/专项脚本的oxlint --deny-warnings通过；全git diff --check通过，暂存区为空。未改动其他任务的engine/LAN/designer/refit等文件。
- 生涯整体仍未完成，本轮没有市场可交易性、完整经济运行或UI等价的完成声明。

## 后续财务层

`campaign-market-finance-progress-2026-09-20.md`记录了以本层实际每产业财务倍率读取点为输入的21产业收入/维护重算，以及接商品网络的份额/出口收入。新增diagnostics.industryFinancialInputs并已纳入原版Java方法差分；没有把最终hazard倍率回填早先产业。
