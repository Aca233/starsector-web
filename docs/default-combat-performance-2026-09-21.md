# 默认战斗路径性能优化（2026-09-21，第二轮）

## 编码前对照

- 范围：普通 CombatSession.fixedUpdateControlled → fixedUpdateScheduled → CombatEngine.fixedUpdate，现有 AI Workers 与串行路径共用的查询热点。不是 LocalWorkerHost 显示编码测试；不改 UI、不降低模拟/AI 频率、不减舰船、弹丸或特效，不改 RNG、命中数学或顺序。
- 原版证据：本地 0.98a-RC8 反编译 BasicShipAI.java（advance），entities/ship/trackers/oooo_0.java:106–130 的逐步目标/炮塔更新。本次只优化当前 Web 候选的有序恢复；不声称 Web AI 已完整等价原版。没有原版实机 UI 新证据，本轮不碰 UI、不操作桌面。
- 新鲜剖析：100 Onslaught、默认会话入口、60 步预热+180 步，在无 Worker 的 Node 环境采集（不是 FPS/净收益测量）：fleetAI 39.87ms、shipsWeapons 38.53ms、projectilesBeams 16.33ms；ProjectileThreatIndex.query、候选恢复与资格反射是可见热点。以真实浏览器默认会话复验，不能以这些剖析耗时直接充当对照结果。
- 当前差异：ProjectileThreatIndex 对每船查询建立 Set→数组→数字排序；SpatialShipIndex 根据命中密度排序或逐舰回扫；FireControlBlockerIndex 同样排序。实际上候选的顺序号已是有界非负整数。
- 预期：用按来源顺序号置位/按低位扫描恢复的 bitset 替代去重排序，结果仍是相同候选、相同来源顺序；同一对象位于不同数组下标时仍保留多次。每查询独立输出，不返回可被下一次查询改写的共享结果。close/rebuild/异常退回语义不变。
- 验证：候选身份与下标逐项对照（跨 31/32 位、重复对象、空/稠密/稀疏、异常 horizon、导引弹不在直线路径内、rebuild/close）；同 seed 完整模拟与 autofire 跟踪状态对照；同场景交替顺序的完整默认会话步进、画面及渲染耗时。没有整场净收益的试验不落地。

## 默认多核成本守卫（先于修改）

真实 Chromium 默认会话复测发现：24 舰总步进+视觉+绘制约 23–24ms，100 舰约 127ms；候选 bitset 改动没有可确认整场收益，撤回三个文件，不落地。更重要的是 CombatMulticore.record 明确排除了 legacy-native，prepare 的 allowAudited 也只控制 generic lane：100 Onslaught 使用四个 Workers 到第 240 步仍 serialSamples=0/parallelSamples=0/warming-up，无法停止负收益并行。

本次将**本地单人所有资格层级**统一纳入成本守卫，而不改变 LAN 主机策略、模拟 dt/顺序/资格或预测的权威校验。以相邻的真实串行/并行完整 tick 成对采样，避免旧 EMA 在逐渐加剧的战斗中跨几十步比较。每个样本仍只执行一次完整权威步；暖机后交替试用，只有测得明确收益才保留 Workers，运行中周期性串行校验，负收益池在当前事务完成后销毁并冷却。该调度只改变谁计算相同 AI 结果，不改变游戏频率和规则；完整模拟状态与默认会话浏览器验收必须通过。

## 串/并行一致性前置缺陷（先于 codec 修改）

切换测试在 50 舰第 210 步暴露旧 Worker 判断与串行不同：ship_j 护盾方向 0.24943 vs 0.44940，来袭伤害 2700 vs 3300。并非成本策略应改变的规则，不能放宽成“浮点误差”。检查发现旧 23 列弹丸 read model 没有 SourceMissileLifecycle 的熄火后寿命输入、isDisarmed 和 collisionDisabled；Owner 的 remainingProjectileLifetime 因没有 isRocket/lifecycle 元数据而走了另一分支，低估了仍可接触的熄火弹丸。

原版证据：0.98a-RC8 combat/entities/Missile.java:136–138、181、306、379–381、525–536（fizzleTime/fadeTime、armedWhileFizzling、flameout 参数与 armed 判定）；本地 harpoon_mrm.proj 为 missile spec。Web 主路径 SourceMissileLifecycle.ts:49–58 已包含该寿命规则。本次不改它、不复制整枚弹丸或新造玩法，而是在发布时用**同一函数**计算 Float64 剩余寿命，并传递两个失效标志；只读 Owner 的空间索引和 narrow phase 都消费该值，提交前重新验证。串行主路径保持原公式。

验收参考需明确：旧 Worker 本身有该一致性错误，不能把错误判断当作应保留的玩法。先用修正 codec、保留旧成本策略的控制构建作为性能对照，并与串行权威逐步核对；再比较新成本守卫。测试必须保留完整状态差异失败，不能靠忽略盾面/伤害字段过关。

## 成本守卫复测修正（编码前）

修正 codec 后第一轮 50/100 舰总耗时分别为 56.29→58.66ms、123.04→126.14ms，无净收益。新策略首次12对采样包含刚启动 Worker 的 JIT 暖机，可能过早拒绝。下一试验仅在每次池启动后增加24次真实 Worker tick 暖机，再做相邻对照，不重放、不改变模拟时间；暖机也计入整场成本。若复测仍无收益，不保留该策略作为优化。

## 默认路径计算削减试验（编码前）

补充 Worker 暖机后，50 舰78.47→77.58ms，100 舰171.14→172.78ms，模拟部分均无改善。成本守卫两版撤回，保留文件于 artifacts。下一试验仅优化已审核的 weaponThreatEnvelope 内的精确威胁 ETA：先求炮塔转向时间，若它独自已使现有 ETA 超出同一个 horizon，则不再算船体转向三角函数；alwaysFire 导引武器原公式 turnTime=0，避免计算最终被丢弃的角度。没有降低精度、缩小扫描窗口、跳帧或修改目标顺序。未知/非 envelope 路径保留原读序。对照仍是同 codec 的旧默认路径，并做逐步全状态核对。原版逐步炮塔转向来源已复查 oooo_0.java:106–130 / BasicShipAI.advance:289，本轮不更换 Web 既有预测规则。

## 威胁转向下界试验：未保留

首轮24舰总耗时27.83→27.82ms、100舰128.52→124.71ms、24混编33.85→33.60ms。100舰模拟约2.3%差异，24舰模拟反而略慢；单轮结果不足以证明稳定整场收益，而且提前求值还需要额外证明可变 mount/spec 的读取纯度。未将此试验留在产品代码，源码保留于 retired-staged-threat.txt。最终保留范围只有弹丸 owner read-set 一致性修复，不声称本轮已提速。

## 最终保留与验收

### 已接入普通游戏的改动

只保留5个已有文件的修复：Protocol.ts（25个原始字段+1个Float64派生寿命）、Owner.ts（两处预测使用同一寿命）、TacticalWorld.ts、ThreatAssessment.ts、ProjectileThreatIndex.ts。默认 CombatSession → CombatMulticore → OwnershipPool → Publisher/Owner 已调用，不需要启用 LocalWorkerHost。LAN 共用 codec 同样得到修正，但没有更改 LAN 调度。未改变权威弹丸运动、模拟 dt、AI 频率、RNG、实体或特效数。CombatMulticore、两个舰船/火控候选索引均恢复到本轮开始的源码；LocalCombatWorkerBudget 未保留。

### 测试记录

- 全项目 npm run typecheck：通过。5个保留文件 scoped oxlint：通过；git diff --check：无空白错误。
- codec-contracts.json：13项通过，包括导弹熄火余量、Infinity/NaN/-0、失效标志、索引与窄相位一致，以及提交前生命周期/标志变化失效校验。
- scripts/check-lan-projectile-visuals.mjs + scripts/check-server-authority-lifecycle.mjs：30项通过。
- 追加 scripts/check-projectile-lifecycle.mjs：17/18通过，渲染测试夹具缺少当前CombatRenderView.localMuzzles，读取length失败。将本轮5文件替换为修改前再构建，仍然同一项失败（lifecycle-before.log / lifecycle-current.log），不是本次codec引入；未擅改其他任务的渲染器，也未称全部回归通过。
- final-default-parity.json：旧串行权威对修正后的**默认**会话。50/100 Onslaught及24 Odyssey/Paragon，每组300步、每30步精确对照，共30个检查点通过，诊断放宽列表为空。50/100舰真实4 Workers、正常提交（最终49/99个AI提交）；混编24舰走现有串行路径。不是 LocalWorkerHost 的桥接吞吐测试。
- 对照内容：engine、playerAI与全部武器autofire跟踪器的可枚举状态，含物理/伤害/护盾/弹丸/FX和RNG；函数身份、kernelMs计时归一化，忽略历史候选索引scratch字段。并非序列化所有私有WeakMap的完整存档，也不证明所有未测场景。
- final-parity-checks.json：1280×720截图比较，50/100舰分别只有8/9个像素不同，单通道最大差1；混编24舰54像素不同、最大差12。50舰两图已查看并作视觉核对。**不宣称像素完全相同，也不宣称原版实机等价。**
- default-worker-teardown.json：直接用当前工作区源码（非冻结包）的60舰默认会话，4 Workers、59次AI提交；在下一待提交tick调用dispose，该tick被丢弃、不多推进，重复dispose安全，CDP确认剩余Worker=0。WebGL错误=0。
- ui-smoke.json：当前工作区普通 /?view=combat 入口加载到tick31；暂停不推进，盾开关、战术图开关、清空输入检查通过，无pageerror。本轮全为无头浏览器，不占用桌面输入。

### 性能结论与未完成项

本轮没有可报告的稳定整场性能提升。bitset恢复、两版自动成本切换、转向下界均撤回，不把它们写成已落地优化；之前的47.55→32.29ms、274.71→133.62ms不是本轮普通游戏测量，不能据此声称帧率翻倍。当前默认legacy-native层仍未被旧成本守卫覆盖，这是已确认但本轮未交付有效替代策略的架构问题。

冻结成对构建用于隔离本轮变量；当前工作区与最终修正对照的270模块图仅WebGLShipPass.ts不同（其他任务修改，本轮未覆盖），因此性能数据不冒充最新渲染器性能。最后一轮含串行控制的数值只作状态一致性验收，不作优化前后收益；当前根目录UI及退出测试另行通过。

多船瓶颈仍有AI/武器多目标扫描、Worker打包/校验/合并与绘制，100舰流畅/完整单Worker权威架构迁移仍未完成。下一步应针对这些默认路径的整场剖析推进，而非继续美化未接入的桥接基准。没有暂存、提交、推送或发布。全部试验/测量脚本与原始结果在 artifacts/default-combat-perf-20260921/。
