# 条件阶段接入产业供需进展

## 已接入的实际路径

上一轮12类条件不再只是单独的回调核：

1. 新增 `OriginalConditionPhase.mjs/.d.mts`，将原有60种资源/环境条件和新增12种条件放在**同一份可变草稿、同一个原版条件顺序**内执行。
2. `OriginalIndustryCommodityPass` 新增显式 `conditionPhase: {state, contextByModId}` 入口：先执行条件，再把修改后的产业供给/fromOther传入原有产业回调。未提供此入口的旧调用保持行为不变，仍拒绝不能独立处理的新条件。
3. 草稿同时承载hazard、accessibility、stability、佣兵军官概率、永久/瞬态移民集合、抑制集合及实际商品available统计。返回更新后的条件勘探/抑制记录，不凭旧suppressed布尔值覆盖本轮动态变化。
4. 航运恢复现在确实影响随后产业的原料可用量；传入的预条件available必须与对应捕获stat一致。只读取原版getAvailable的clamp/round结果，不伪造网络重算或刷新缓存maxSupply。
5. 分离附加条件核对财务层的反向运行时依赖，避免接入CommodityPass后产生循环初始化。
6. 自由港额外修改原版dynamic `officer_is_merc_prob`；不再仅拼装其界面可见稳定性/流通性数字。

来源：`reference-condition-phase.json` 记录 **73份来源哈希、72种原版条件绑定**，新导入器支持--check。

## 关键行为核对

- 太阳阵列、卢德多数派本轮修改产业supplyBonusFromOther；资源条件仍读取既有supplyBonus。产业阶段才重建supplyBonus，所以农业的资源基础产量可在下一次条件轮次才体现，而轻工业自己写出的产量可以本轮体现。没有为“数字立即好看”重跑到稳态。
- 6级农业+优质耕地，在初始无旧bonus、太阳阵列+2、多数派+1的测试中，本轮产出7，下一轮10；这一行为与原版资源和BaseIndustry的读取时点一致。
- 同一阶段混合solar/hot先后、压制、资源遗留flat、永久/瞬态移民对象顺序、通讯中继共享core_comm_relay来源均保留。
- conditionPhase输入错误、缓存不一致、缺上下文/未知插件/丢失移民对象都拒绝；输出不可变，输入不被修改。

## 验证证据

- 新条件阶段 **12项测试**通过，含 **252条原版Java共享条件快照**：180条混合条件连续状态、72种绑定各一条，验证实际原版资源/legacy/additional回调和MutableStat/StatBonus/Market条件循环。
- 最终定向回归 **56/56通过**：附加条件、共享阶段、既有民用产业、既有稳定性。旧附加回调1035条、旧稳定性216条Java对照也重新通过。
- 另已跑资源产业定向回归，1296条原版资源/农业/采矿状态快照通过（早先三文件合计40/40）。
- 严格 `tsc -p tsconfig.campaign.json` 通过；本轮10文件单线程lint零诊断。
- 日志：`artifacts/campaign-condition-phase-targeted.log`、`campaign-condition-phase-types.log`、`campaign-condition-phase-lint.log`。
- 本轮未跑全量生涯测试或发布构建。Java是原版方法块+真实stats的无窗口探针，不是原版游戏进程或完整Sector模拟。

## 未完成与接入边界

**这是现有供需内核中的实际接入，不是服务器已经开始执行整个世界。**

- 旧稳定性/财务组合器仍拥有独立condition/stat/availability输入，尚未共用此草稿；现在显式拒绝携带conditionPhase的调用，避免静默丢掉新的稳定度、hazard和航运恢复结果。该保护必须在财务组合正确接入后移除，而不是作为最终功能留白。
- 下一步应把同一草稿延伸到有序产业稳定性/财务/环境回调，避免第二次条件回放。对应入口是OriginalMarketStability.reapplyOriginalMarketStability和OriginalColonyEnvironment.reapplyOriginalEnvironmentalFinancialPass。
- 原生存档管理员、技能、intel、完整对象恢复、计时器/条件生命周期、网络初始化、月结及权威交易库存仍未完成。
- 保存适配器旧unknown-condition判定、readyForAuthority=false、Corvus industrySimulation=not-executed、规则版本均未放开；没有把目录支持当作存档和世界已经恢复。
- UI本轮不改动、原版/Web画面及交互验收仍待许可。未占用用户键鼠/窗口，无子代理，无暂存/提交/打包/发布。


### 后续进展（同日）

上文当时阻止财务入口的临时保护已由真实共享状态接入替代，见campaign-shared-financial-draft-progress-2026-09-20.md。条件结果现在能进入稳定度、内部维护折扣、港口财务及环境注册，仍不等于权威世界或原生存档完整恢复。
