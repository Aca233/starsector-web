# 本地多核重试的历史亏损门：修改前对照（2026-09-25）

## 原版范围和前轮证据
原版0.98a-RC8，本轮重新读CombatEngineAPI.java的isPaused（81）/getElapsedInLastFrame（129）和settings.json:8–9（vsync/fps=60）。浏览器Worker成本门属于Web运行时调度，不是原版玩法。本轮不改变模拟步长、实体、AI更新次数、瞄准/碰撞精度或界面，不进行原版可见实机操作。

上一轮距离工作区候选已逐hash撤回。其200舰轨迹在测量后段两臂各出现19个fresh owner batches，样本模拟均值80–86ms，同tick串行参考约51ms，之后再因no-measured-benefit退出。可证明存在无收益重试，不足以证明所有重试都应禁用。

## 当前调用链及更正
重新核对CombatMulticore.ts:19，本地使用new CombatWorkerBudget(60000,true)，即60秒冷却；CombatWorkerBudget类默认10000ms且freshSerialProbes=false，LAN的HostAiBudget使用默认语义。前轮报告仅写默认10秒容易误导，本轮更正为本地60秒/类默认10秒，**不修改任一路径冷却时长**。
LocalCombatKernel.stepScheduled记录从applyCombatControlSample之前至authority.advance之后的完整wall cost，包含预阶段、打包等待、校验和其它模拟。整步serial EMA增长25%并不表示可并行AI成本增长了25%。当前门冷却后仅凭这个增长就重新建立pool；是否合算还要付至少12个并行样本和3个新鲜串行探针才能拒绝。

## 候选规则及理由
仅freshSerialProbes本地模式、同舰数、尚未批准新trial且已有历史拒绝时，将重试资格改为：
`serialEMA >= max(lastRejectedSerial * 1.25, lastRejectedParallel)`。
即除了原25%抗抖门，serial新增成本至少应覆盖上次实测亏损（parallel−serial）。即使乐观地假定新增工作全部能免费并行，增长仍不足抵消旧亏损时，不付出另一轮建池/测量成本。历史成本会受争用/GC/JIT影响，这不是未来获益的证明，只是更保守的调度启发式；达到门后仍通过完整真实trial决定去留。

保留首次试运行、60秒最低冷却、变化舰数重新评估、低成本/小舰队屏障、获准trial不被旧门中途打断、每8次一次完整串行探针、12并行+3新串行校准、worker超时/取消/资格与merge/权威校验、reset清除历史。LAN/default fresh=false逐行为不变。无“永久单线程”开关，也不改默认4 owners。

## 证据与验证
本轮先冻结当前305模块（含独立内容工作的新变化）；前后性能都固定此图，仅替换Budget模块。扩展既有check-combat-owner-partitions：上次10/30ms亏损后20ms整步不能触发、30ms边界允许、25%门仍在、舰数变化/冷却/reset/已批准trial/盈利并行/无效数值和默认LAN回归。按需导入冻结旧Budget对照旧/新分歧及默认路径完全一致。
集中一次typecheck、改动文件oxlint和此既有场景。实际200 Onslaught、150预热+360测量（覆盖本地一分钟冷却后的更长战斗）做一次无profile/额外计数配对，记录状态转变时的既有budget状态，核对权威/显示/隐藏火控/RNG、重试真实减少且保留首次试运行。有实际收益才保留；没有则精确撤回，不重测择优。结果不声称GPU收益、60Hz或真实联网/input-to-photon改善。不提交/发布或占用桌面，版本不变。
