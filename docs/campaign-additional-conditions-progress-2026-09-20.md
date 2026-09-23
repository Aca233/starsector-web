# 市场附加条件与逐条件重应用进展

## 已实现（不是完整市场恢复）

先检查本机 0.98a-RC8 源码、配置和已有 audit，再实现以下文件：

- `src/campaign/rules/OriginalAdditionalConditions.mjs/.d.mts`：12 个条件的单次 apply/unapply；显式上下文，不假设管理员、教会协议、海盗基地或细胞 intel 状态。
- `src/campaign/rules/OriginalMarketConditions.mjs/.d.mts`：原版 Market.reapplyConditions/reapplyCondition 的同步宿主接口。对同一事务草稿中的真实条件对象操作，名单仅复制一次；逐个 unapply 后立即读取当时的勘探/抑制状态并 apply。单对象入口使用 modId，且不检查勘探状态。
- `scripts/import-campaign-additional-conditions.mjs` 与 `reference-additional-conditions.json`：28 份来源哈希、12 个条件绑定、33 个原版产业标签、原版常量、5 档海盗惩罚及原版空 PRODUCTION_OVERRIDES。支持 --check，来源变化须重新核对。
- 显式移民回调支持温和气候与卢德多数派；已注册回调执行时不擅自重新检查多数派资格。

### 保留的原版细节

1. 旧世界类型继承 WorldFarming，apply/unapply 都为空；不还原已失效的旧农业参数。
2. 重力写入 hazard 和 accessibility；unapply 只清其 flat，保留其他通道。
3. 太阳阵列修改抑制集合，农业优先、缺少才水产；不是直接增加食物。不检查产业运作状态。不使用自创的抑制“引用计数”，unapply 直接解除 hot/poor_light。
4. 卢德多数派只检查建设队列第一项；排队农村产业不满足“现有农村产业”要求。原版产业标签决定工业/军事/指挥排斥，玩家击败远征才翻倍。unapply 清全部稳定性通道，但只清产业生产 flat。
5. 潜伏左径细胞的协议覆盖依据 intel 市场派系为 player，不是 playerOwned。直接 sleeping apply 不清历史 -1；外层 unapply 才清。
6. 航运损失按逐步 Java float 和 Math.round 算 penalty；0 结果保留 0.01 最低值。只在玩家市场且产量达到原版恢复阈值时，删除 sh_loss 前缀且四舍五入绝对值非零的 flat，保留其他通道。宿主必须保留临时 modifier 的计时器，不可把输出当成整个 MutableStatWithTempMods 的替换。
7. 条件顺序保留非稳态：hot 先于 solar_array 执行时已有 hazard 不会被追溯重做；solar_array 在前则后续 hot 被抑制。没有“多跑到稳定”为止的隐藏循环。
8. 缺宿主操作、Promise、async 或生成器伪回调均拒绝，不能跳过未知插件后声称执行完市场。调用出错后宿主须丢弃事务草稿。

## 验证

- 定向测试：**15/15 通过**，约 2.2 秒，未跑全量回归或构建。
- 其中 **1035 条原版 Java 对照快照通过**：960 个 apply/apply/unapply/apply 历史状态、45 个浮点惩罚边界、30 个原版 Market 有序/单条件 pass；多数派/温和气候用例还对比移民结果。
- Java 探针抽取原版方法，使用完整 MutableStat/StatBonus/MutableStatWithTempMods；world/intel/产业列表等 getter 使用显式 fixture。CFR 的 Iterator<Object> 错误泛型仅补正确强转，不改 first-only 队列控制流。
- 原版 getAvailable 直接取 available stat，探针使用真实方法。额外检查清除航运 flat 后其原生临时计时器仍在。
- 严格 `tsc -p tsconfig.campaign.json` 通过；新增 7 文件单线程 lint 零诊断。现有 contracts 文件中此前已有的 3 条 lint 警告未改动；其新增类型契约通过严格 tsc。
- 日志：`artifacts/campaign-additional-conditions-targeted.log`、`campaign-additional-conditions-types.log`、`campaign-additional-conditions-lint.log`。

## 尚未接入及下一步

这不是完整 Sector/Market 的恢复或游戏端到端验收；输出 scope 明确限于本地回调或有序宿主调用。原版实机与 Web UI 均未新增验证，不能视为画面已还原。

旧环境/供需/稳定性 pipeline 的 whitelist 和原生存档 readyForAuthority=false 均保留，未凭新增目录把未知条件强行放行。Corvus 仍为 industrySimulation=not-executed。存档、规则版本、交易发布状态未变。

下一步应将这些回调与已有资源/环境/供需回调连接到**同一个有序事务草稿**，先条件再产业，实时共享抑制集合、移民对象身份、产业 supplyBonusFromOther 和 commodity available；不能将数个独立 pass 的最终值拼起来当作原版全市场执行。原生 intel、管理员/技能、构建队列和临时修正计时器还须从真实对象恢复；航运时限推进与特定条件移除、海盗基地退出经济、细胞活动生命周期仍未实现。

本轮仅后台文件和小范围无窗口验证，无桌面/输入操作、无子代理、无暂存/提交/打包/发布。
