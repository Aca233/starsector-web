# 人口推进与规模增长进展（2026-09-20）

## 本轮推进

此前只有incoming/激励投影，现新增现有人口的原版advance算法及同步增长重算接口。编码前已核对本机原版来源，见`campaign-population-native-audit-2026-09-20.md`。没有修改UI、操作桌面、使用子代理或提交/发布。

### 算法与可替换结构

- `OriginalPopulation.mjs/.d.mts`：保留null人口/未设置incoming的差别；按Market.getPopulation惰性创建人口；原版一次incoming计算、首次100次权重迭代、之后days/30推进、最小人口、严格大于阈值才增长、新游戏推进、转化及海盗/穷人比例、删除不存在派系、最终归一均已接入。
- `MutableStat`状态不被人口数字覆盖；`core_set`具名flat、外部base/percent/mult与原版float计算顺序保持。非玩家/规模上限时，保留原版“先设min归一，再由advance写max”的实际顺序，不擅自修复成不同规则。
- UI-only仍计算并保存incoming，但不创建人口/不收激励费用；因此会消耗首次incoming初始化标记。首次非UI即使days=0仍迭代100次；激励只按实际本次days计一次。
- 真正跨过增长阈值时必须有**同步、可信规则层增长驱动**。驱动在当前事务草稿上替换条件、触发规模监听器、执行条件/管理员/产业重算后返回实际getter输入；人口循环再读取新稳定度、动态上限、所有权和新游戏状态。缺驱动/异步Promise/旧规模/条件实例未更新/改变时间片/重复扣激励费用均拒绝。不是把一个“待增长事件”发出就当作已增长。
- 驱动是可替换的代码依赖，不是客户端可上传的函数；尚未安装到全世界权威经济任务。算法自身只操作克隆状态，外层驱动必须使用可回滚的事务草稿，不能提前写真实账户/存档。
- `OriginalPopulationGrowth.mjs/.d.mts`提供已支持原版范围的条件替换及本地重算助手：用显式分配的新modId删除旧population条件、保留其他条件，再把已解析的新规模状态接至环境→供需/稳定度/产业财务以及本地流通性。重算后的getter输入供同轮人口转换使用。外部管理员技能、监听器、全市场网络读取必须显式供给，没有用旧快照默认为“已刷新”。
- 通知只返回有序“殖民地规模增长”语义数据，尚未绘制原版消息UI或验证点击/声音。

### 原版来源与验证范围

- `reference-population.json`固定**39个原版来源哈希**，增补MarketCondition身份生成源码；Population空apply/unapply等来源已由之前导入链包含。`scripts/import-campaign-population.mjs --check`通过。
- Java探针运行原版完整`advance`、实例/静态`increaseMarketSize`、Market人口/incoming惰性getter/setter、条件删除/添加、`setSize`，并复用真实PopulationComposition/MutableStat/StatBonus和computeIncoming。UI、监听器及产业重算后的getter以显式测试适配器提供；不是原版游戏实机，也不是全经济执行已核验。
- **192组人口状态**逐项比对有序组成、stat、incoming、费用/激励开关、增长规模/新稳定度、条件ID列表、remove/add/setSize/reapply调用顺序与通知次数。样例强制包含真实增长（不少于16次），而非全是不增长状态。
- **24条连续历史，每条31次更新**（744次调用）比较UI/非UI切换、人口长期演化、缺失派系清除及激励float累加；不把多次小步合成一次大步。
- 专项还覆盖实际本地环境/财务/流通性组合到人口后半轮、严格阈值、没有驱动时失败、不可变及错误输入拒绝。

## 验收状态

专项13/13通过，日志`artifacts/campaign-population-targeted.log`。严格campaign类型契约通过；本轮新增同步驱动和只读输出的编译期反例。全campaign与最终全项目构建/lint结果记录在本轮末尾。

## 仍未完成

- 增长驱动尚未接入真正全世界/全sector的权威经济任务；完整技能、事件监听、其他产业与物品、惰性网络的阶段执行、月度账务仍须实现和验证。条件identity由外层真实分配，测试里的固定名字不进入正式世界。
- `reduceMarketSize`（脚本/事件显式降级，不是普通负增长）尚未接入。不能把新增advance说成所有人口事件已完成。
- Corvus仍只有定义数据，不改`industrySimulation:'not-executed'`，未加入伪造库存或经济freshness；规则锁和用户存档未迁移。
- 原版市场/殖民地UI、势力与自建势力、完整任务/战斗回流、多人独立及自愿合作的端到端仍未完成。生涯总目标保持进行中。

## 本轮最终验收

- 人口专项 **13/13通过**，包含192组完整原版方法状态差分和24条31次连续推进历史。`artifacts/campaign-population-targeted.log`。
- 全campaign回归 **615项：610通过、0失败、5项既有可选原版探针跳过**，旧移民/环境、稳定度、财务、网络和产业对照均包含其中。`artifacts/campaign-population-regression.log`。
- 严格campaign契约、全项目`tsc -b`、本轮实现/声明/脚本的`oxlint --deny-warnings`均退出0。日志`artifacts/campaign-population-types.log`和`artifacts/campaign-population-lint.log`为空。
- `git diff --check`通过，暂存区为空。本轮没有提交、推送、打包或发布；没有改动并行任务的桌面/LAN/战斗/装备编辑器文件。所有本轮后台验证进程均已结束。
