# 生产产业接入进度（2026-09-20）

本轮继续目标“完成生涯模式”，不使用子代理，不操作桌面/窗口/键鼠，不提交、推送、打包或发布。

## 已落地

- 新增 OriginalProductionIndustries 显式输入规则：LightIndustry、Refining、HeavyIndustry（heavyindustry/orbitalworks）、FuelProduction，共5个产业ID。
- 使用原版 demand/supply modifier 槽位、int短缺读取、保留neutral与旧bonus的行为、核心/改进/管理员/外部modifier顺序，运行状态区分建设/升级/中断。
- 生物胚胎、催化核心、同步加速器、两种纳米锻炉的生产/品质效果与条件检查。条件存在性不等于调查/抑制状态。重工业停产执行原版unapply；品质是共享StatBonus，不和数量混在一起。
- 原版有序产业pass逐项unapply/apply并传递共享品质；数据不足或错误物品/插件拒绝，未引入“默认充足原料”。旧资源/民用入口继续兼容。
- 产业计数、当地稳定性/财务流程和环境/移民登记支持这5个插件。新增商品可用量与前次稳定性的交叉校验，防止两份矛盾输入混算。已核对这些插件/物品没有额外收入、维护或移民回调，使用继承的原版财务处理；不意味着没有污染生命周期。
- 原版数据导入器新增12份源码/配置哈希及5个物品匹配。稳定性/财务/移民/人口的来源链同步更新为35/41/46/47份。
- 保存态诊断按产业ID+实际插件类识别新规则，仍不将保存前省略的供应/需求图当成零。

## 原版对照与验证

先写 audit 再实现；直接读取本机0.98a-RC8原版4个apply、HeavyIndustry.unapply、supply/demand/getMaxDeficit辅助方法、Boost/锻炉物品方法与完整MutableStat/StatBonus，在无窗口Java进程运行。

- 1320组生产历史快照通过：5个ID×11个规模×6个修饰器/物品场景×4次状态变化。比较全modifier与有效供需、float、品质、合法性；包括直接重复apply与显式unapply的区别。
- 扩大既有财务原版对照到312次产业更新+122个经济组；稳定性216次、移民198次与环境118次对照覆盖扩充后的产业集合。
- 联合专项：62项全通过，artifacts/campaign-production-targeted.log。
- 全campaign：658项，653通过，0失败，5项既有可选探针跳过，artifacts/campaign-production-regression.log。
- 严格campaign类型及全tsc-b均exit 0，artifacts/campaign-production-types.log。新增生产接口正/负类型契约。
- 19个本轮相关实现/声明/测试文件定向oxlint：0 diagnostics，exit 0，artifacts/campaign-production-lint.log。未声称整个仓库lint结果。

## 本地保存态复核

只读重新采集：65个注册市场、346个产业。其中新增对应规则的实例41个（lightindustry 16、refining 12、orbitalworks 8、fuelprod 5）。剩余缺失商品插件实例7个：commerce 4、cryosanctum 1、lionsguard 1、techmining 1。还存在13种尚未分类的环境条件。

capture/report仍在git忽略的artifacts中；命令对输入文件前后校验，另行哈希复核确认源文件未改动。不复制私人存档到测试或发布。readyForAuthority仍为false，346个产业仍需要post-save恢复。

## 未完成和下一步

**这不是完整生涯或已运行的星区经济。** 此处仍使用显式已解析的可用量，而非逐getter执行的真实网络；原版getter惰性初始化引发的副作用须由生产世界runtime承接。原版污染生成/90日永久化/移除、物品安装命令、管理员/监听器、余下四种产业、未知条件、post-save恢复、全市场组经济和月账/交易发布仍未完成。品质效果也尚未消费到实际舰船生产。

没有改默认权威规则版本（reference.cooperative 0.15.0），没有给Corvus标记执行了产业模拟。下一步从剩余产业与污染/环境条件原版证据继续，随后接真实恢复与有序runtime；禁止仅修改白名单宣称完成。

UI本轮未改；原版实机与Web同分辨率/同状态验收仍待许可。完整目标还含原版UI与交互、势力/自创势力、殖民地、任务/战斗，以及可各自游玩/加入合作的联机端到端体验，均不能用这些规则测试替代。
