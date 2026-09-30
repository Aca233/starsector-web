# 本地多核历史亏损重试门：否决记录（2026-09-25）

## 决定：撤回规则，不继续靠整步阈值调参

候选将同舰数、freshSerialProbes模式的冷却后重试条件从serialEMA≥上次serial×1.25改为serialEMA≥max(上次serial×1.25,上次parallel)，保留其余调度/校验。2642项合同通过，但真实长程配对没有减少重试，也没有改善整体延迟，所以不保留该规则。更保守的整步门依然不能识别增长来自AI、其它模拟工作还是机器负载；后两者的具体成因本轮未作OS级测量，不冒充已查明。

不改模拟步长、计算精度、角色或发射行为；不通过永久禁用多核消除其公平首次试运行机会。下一方向应先采集可并行AI阶段和同步/校验开销的可比证据，而不是再抬整步EMA倍数。该后续尚未实现。

## 当前链路与冷却更正

LocalCombatKernel.stepScheduled从输入预阶段之前开始，到authority.advance结束后记录全步wall cost；CombatMulticore使用new CombatWorkerBudget(60000,true)，本地为60秒冷却，LAN默认构造器为10秒/fresh=false。前轮报告只写类默认10秒不够准确，已原位更正。候选没有改任何冷却时长。

## 一次无头实际 Worker 长程配对

Edge153、200 Onslaught、seed917、dt1/60、150tick预热+360tick测量，合计510tick；使用生产local Worker、实际owner Workers、传输/ACK和主线程解码。无profile/stage/query插桩；测试脚本仅在已有reason转变时保存已有budget状态（位于计时之外）。前后固定到同一305模块图，仅Budget模块变化。

|指标|before均值 ms|after均值 ms|均值变化|before P95 ms|after P95 ms|P95变化|
|---|---:|---:|---:|---:|---:|---:|
|simulation|65.528|65.979|+0.69%|134.405|133.260|-0.85%|
|encode|31.137|30.953|-0.59%|59.385|58.150|-2.08%|
|roundTrip|97.222|97.571|+0.36%|192.580|192.715|+0.07%|
|decode|13.602|13.988|+2.83%|19.735|19.915|+0.91%|
|往返+解码|110.825|111.559|+0.66%|205.500|208.945|+1.68%|

这不是输入到画面或实际联网延迟；不含渲染/网络/帧节拍。只是一条配对轨迹，不证明候选在所有机器上更慢，但不足以支持保留；没有反复运行相同源码择优，也没有删掉不利测量区间。

|连续tick区间|模拟均值变化|交付均值变化|
|---|---:|---:|
|151–210|-2.41%|-2.20%|
|211–270|-0.25%|+0.10%|
|271–330|+3.82%|+2.50%|
|331–390|+1.36%|-1.19%|
|391–450|+3.47%|+4.35%|
|451–510|+4.23%|+4.22%|

这些连续块不是独立实验。测量前段两边成本均明显高于后段，不推断为特定应用/GC/JIT或系统负载原因。

## 重试没有减少的直接证据

- before首次在tick25 starting、27进入4 workers、49退出；after为25/26/49。首次公平试运行保留。
- 首次拒绝before为serial46.18ms/parallel72.06ms，after为49.19/72.87ms。
- 两边均在tick191再次starting；此时before整步EMA198.88ms，after132.41ms。after明显超过新72.87ms门，所以规则没有挡住这次无收益重试。
- before在193进入4 workers、214退出；after192进入、214退出。测量期间分别18和19个fresh batches，并非候选真正减少了并行测量。
- 第二次拒绝before为serial101.36/parallel169.20ms，after115.29/155.24ms；随后到510tick都保持串行。候选只在合成的中等增长合同中区别于旧规则，真实轨迹未体现预期作用。

## 正确性及回归

- 一次应用类型检查、三个改动代码文件oxlint和既有check-combat-owner-partitions全部2642项检查通过。
- 冻结旧Budget与候选的720步LAN/default完整准入/退休/状态/reset轨迹一致；本地覆盖首次测量、冷却、边界、25%迟滞、变化舰数、已批准trial、获利路径、低成本门、无效样本等。新规则10/30历史亏损后20ms不重试、30ms可重试等合同通过，仅代表策略如设计实现，不代表实际性能改善。
- 实际510tick、1020包、含init1022次完整显示值/原型/别名对照、17检查点×两臂完整权威/隐藏火控/RNG一致。

## 撤回与当前状态

撤回前逐hash确认Budget和其修改后的合同文件仍是本轮候选，没有覆盖别的改动；先把候选源代码/合同保存到工件candidate目录，再按before字节恢复这两个文件。普通合同仍匹配恢复后的原调度策略。保留benchmark状态转变时的budget记录，便于后续不再凭猜测调参。

性能源图只有Budget一个模块不同，其余304完全相同。收尾工作区另有独立变动：`src/engine/simulation/ShipSystem.ts`, `src/engine/extensions/ship-systems/Registry.ts`, `src/engine/extensions/ship-systems/GlorianaEdict.ts`；均未写回，也未纳入本轮完整工作区验收。此前火控、导航优化和距离池撤回状态均保留。

工件目录：artifacts/owned-worker-retry-debt-20260925。包含before/candidate代码、baseline/candidate-input/measured源图、validation、2642项合同结果及bundle hash、完整paired-200-long/result、comparison、transition-summary、source-graph-comparison、restoration及acceptance。

本轮不更改版本、不暂存/提交/推送/打包/发布、不修改安装游戏、不开可见窗口；总体继续优化目标保持活动。
