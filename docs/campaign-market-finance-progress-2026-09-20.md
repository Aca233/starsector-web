# 产业财务与市场份额推进（2026-09-20）

## 实际实现

新增 `OriginalMarketFinance.mjs/.d.mts`、`OriginalCommodityFinance.mjs/.d.mts`、33来源哈希的数据导入和原版方法级差分。基于原版源码审计后编码；无新UI、无桌面/键鼠/可见程序、无子代理、无发布操作。

### 产业与本地组合

- `newOriginalIndustryFinances`仅供真实新建，不能代替捕获现有stat。
- `updateOriginalIndustryFinances`覆盖现有21种产业（人口、港口、巡逻/军事、各流派站点、地面防御、农业/水产/采矿）。保留完整有序income/upkeep mutable stats、外部修正、零基础清除、原版float和int转换。
- 原版spec loader先将CSV乘1000 creditsPerCostUnit，再乘收入1/维护0.5。普通产业规模因子max(1,size−2)；apply时巡逻总部固定3、站点按标签3/5/7；**直接income-refresh使用市场规模**，不能复用apply override。
- Alpha/Beta维护×0.75，Gamma不减；停工/新建只去掉基础收入，不免维护，也不清除外部收入。港口根据新需求最大缺口，每单位额外维护乘数0.1；停工unapply不清除此deficit，单独income-refresh也不重新计算它。
- `OriginalMarketStability`增加只读diagnostics.industryFinancialInputs，记录每个产业实际读取的market income/upkeep倍率。此前的数值/规则/公开scope不变。
- `reapplyOriginalColonyFinancialPass`组合此前稳定度+commodity重算与本轮产业财务；按完整一致顺序匹配financial states，港口直接读取新需求与当前可用量，不让调用者伪造deficit。
- 保留原版阶段：人口先改变incomeMult/势力内部维护折扣；其他产业可能位于人口之前；hazard维护倍率在全产业循环后才更新。**最终market倍率不能回填所有产业**，本轮明确保留各读取点。

### 组市场份额和出口收益

`resolveOriginalCommodityFinance`内部执行已有真实商品网络纯函数，不接受随意拼接的已算share。输入仍要求完整实际经济组名单、位置/外交/先前accessibility、产业缓存、availability及真实tradeMod；额外按同顺序输入playerOwned、收入stat和实际玩家商品出口加成。

- 生产权重使用before-core出口运输/available，乘after-core非负accessibility；需求金额使用after-core运输。hidden与非法来源都不从分母中消失。
- 原版按float百分比余数稳定排序，再给正份额分发剩余百分点。生产/需求份额分别处理；包含同余数、超过100个生产者、0权重/0需求、空组。sortedProducers/sortedConsumers是此**余数排序**，不是份额从大到小的排行榜。
- 需求原始总值和分势力总值逐市场float累加；getMarketValue式结果扣除factionId=`player`的需求。需求份额分母仍包括这部分需求。playerOwned与factionId不是一个条件。
- 非法来源出口收益0；其他按调整后的份额×marketValue×(当前市场收入倍率×实际玩家商品加成)，最后Java float-to-int截断/饱和，非玩家市场不读取玩家加成。
- scope=`original-single-player-commodity-financial-effects-only`。这是原版单玩家语义，**不是已经决定联机多个玩家怎样合并/扣除派系需求或分配技能加成**。需未来ownership/玩家上下文适配，不能静默把所有玩家归为一个钱包。

### 收支getter投影

`summarizeOriginalMarketFinances`按实际产业/商品名单顺序float求和。未初始化commodity网络的原版出口getter是0，显式以networkInitialized=false且exportIncome=null表示，不用它掩盖缺失计算；若网络存在，必须提供真实int收入。净额扣除启用时实际捕获的短缺补偿费/移民激励费，不以假定0替代未知费用。禁用时不调用费用getter。

输出scope=`market-financial-getter-projection-only`，不改变玩家余额、不结算月份、不创建价格/库存、不签发completedTask/asOfTick。纯函数不能证明外层名单一定是实际全名单，仍需权威执行器验证。

## 原版对照证据

编码前见 `campaign-market-finance-native-audit-2026-09-20.md`。

- Java探针实际抽取原版spec loader数值块、BaseIndustry财务/AI核心/规模方法、巡逻/站点override调用、Spaceport shortage相关块，使用完整MutableStat/StatBonus。**252组产业财务**的有序stats与原始float输出一致。
- **122组商品经济网络财务**与原版权重/需求/份额调整/出口收入方法块一致。网络运输/可达性来自已有独立原版差分核验的网络层，本轮探针不声称重新独立证明网络构造器的所有副作用。
- CFR只修复adjustMarketShare局部Iterator误类型、Comparator桥方法名、ArrayList泛型；未更改数值/排序/分配算法。
- 扩展此前稳定度探针，**216个连续输入快照**额外逐项核验产业读取财务倍率的阶段；并保留全部原稳定度对照。
- 新专项另核验不可变、结构/名单/缺失数据拒绝、来源差异、旧与新倍率、端到端本地组合、负收益截断/整数饱和、完整净收入投影。

## 尚未完成及下一关键路径

这些模块已彼此组合，但尚未注册为真正全世界经济任务运行器。Corvus仍未拥有可交易的真实新鲜经济状态。还需完整hazard/管理员技能来源、其余产业插件、全sector经济组加载/按商品tier的执行及惰性初始化、短缺/移民费用来源、月度账务，再接权威市场快照与原版交易UI。

生涯整体仍缺完整殖民地/势力与自建势力、任务/战斗结算和多人整合。不能把这轮本地财务/出口计算等同于生涯模式完成。

## 本轮最终验收

- 财务专项 **15/15通过**：252组原版产业财务 + 122组商品市场财务差分在其中。日志 `artifacts/campaign-market-finance-targeted.log`。
- 稳定度回归 **15/15通过**，其216个Java状态快照新增实际产业财务读取点对照。日志 `artifacts/campaign-market-finance-stability-regression.log`。
- 全campaign回归 **587项：582通过、0失败、5项既有可选原版探针跳过**。日志 `artifacts/campaign-market-finance-regression.log`。
- 严格campaign类型契约与全项目tsc -b均退出0；类型日志 `artifacts/campaign-market-finance-types.log`为空。本轮实现/声明/专项脚本oxlint --deny-warnings通过，git diff --check通过，暂存区为空。
- 未改动其他任务的战斗engine、LAN、设计器、装备界面或发布配置，未提交/推送/打包/发布。生涯模式整体仍未完成。
