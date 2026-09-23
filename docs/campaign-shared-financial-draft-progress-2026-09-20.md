# 共享条件状态接入稳定度与财务

## 实际接入

已移除上轮临时的“conditionPhase不能进入财务”保护，改为真正传递同一次条件执行的结果：

- `OriginalMarketStability.reapplyOriginalMarketStability` 使用条件结束时的stability、hazard、available；只在旧模式才运行独立conditionEffects，避免共享模式重复执行条件。
- 条件前的stability/hazard、完整有序商品缓存、旧free_market/recent_unrest/comm_relay状态捕获均与共享草稿逐项核对。不因两份数字碰巧相同而丢掉不同modifier来源，不接受漏商品、顺序变化或上下文冲突。
- Population的同派系供应维护折扣、各产业稳定性短缺、港口维护短缺均读取**同一份条件后的available**。缓存maxSupply/maxDemand与网络shipping/export值保留捕获时点，不替换成产业全部apply后的最终值。
- 财务诊断新增可选 `marketCommodities/hazardBeforeConditions/hazardAfterConditions`，明确本次实际读取的商品值与危险度变化。
- 各产业仍使用当时读取的incomeMult/upkeepMult；TradeCenter的收入修正对后续产业生效，本体财务取自身重加修正之前的值。upkeep_hazard_mod仍在产业循环结束后更新。
- `OriginalColonyEnvironment.reapplyOriginalEnvironmentalFinancialPass` 的共享分支直接使用这一轮条件结果，再单独执行产业移民注册/注销；不再重跑环境条件。未带conditionPhase的旧入口行为保持。

### 输入/输出时点

共享模式下，稳定性入口的input.stability/input.hazard/marketCommodities表示**条件前**捕获。环境财务wrapper从自身hazard stat派生该scalar，并要求与phase初始stat和移民集合一致。

返回的 `commodityEffects.conditionPhase` 明确是“条件结束快照”，不是完整产业执行结束后的世界状态。最终stability/income/upkeep在localEffects，行业财务在industries，最终hazard和移民注册在environment。下一轮组装须使用对应最终输出，不能把旧阶段快照直接冒充新世界存档。

## 原版行为验收

1. hot先于solar_array执行的首轮hazard=1.25，首轮财务保留它；真正下一轮才变为1。证明没有隐藏的第二次条件回放。
2. 航运恢复同时解除人口food短缺、改变同派系维护折扣、消除港口fuel/supplies/ships短缺，且输入未被改写。
3. 本轮开始保留旧危险度维护倍率2，产业按各自时点读取；循环结束后才写入本轮危险度。不是将最终倍率提前应用给所有产业。
4. 农业/人口/技术挖掘保留原版注册行为，失效港口/贸易中心注销；原有条件移民集合顺序不被再次重放。
5. 捕获矛盾、未知/遗漏数据直接拒绝；全部返回值不可变，未产生权威库存或freshness标记。

## 验证

- 新增6项共享财务测试。
- **30组原版链式对照通过**：30个真实Java条件阶段输出 → 30个真实Java产业稳定度/市场财务阶段 → 90次原版单产业财务刷新。
- 链式对照不是拿待测稳定度/财务输出当期望：前一Java阶段输出送给后一Java阶段；供需需求改写使用已单独对照过原版方法的供需核（既有稳定性探针同样显式stub这部分）。
- 定向回归 **36/36通过**：新共享财务、原有市场财务、原有移民/环境。既有360次产业财务、122个经济组的原版对照也通过。
- 严格 `tsc -p tsconfig.campaign.json` 通过；本轮7个代码文件单线程lint零诊断。未跑全量回归或发布构建。
- 日志：`artifacts/campaign-shared-financial-targeted.log`、`campaign-shared-financial-types.log`、`campaign-shared-financial-lint.log`。

## 剩余范围

本轮证明的是条件—供需—已覆盖的稳定性/财务/环境注册链，不是完整Market/Industry所有效果。人口/军用设施的全部dynamic战斗属性、事件/计时器生命周期、实际管理员/技能/intel恢复、网络构建、月结、可交易库存及服务器权威世界执行仍待完成。

移民computeIncoming/人口成长仍须消费新增条件的真实回调上下文，现有单独旧入口不能仅扩大白名单后忽略它们。原生存档readyForAuthority=false、Corvus industrySimulation=not-executed继续保留；生涯模式整体未完成。

UI和原版/Web实机画面对照仍待用户许可。本轮仅后台文件及短时单线程无窗口测试，无桌面输入、无子代理、无暂存/提交/打包/发布。


### 后续连接（2026-09-20）

共享条件的新增移民注册现已进入 computeOriginalIncoming，并通过 population 增长重应用消费真实最终 access/conditions/available。详见 campaign-extended-incoming-progress-2026-09-20.md；原版实机与全世界恢复状态仍不变。
