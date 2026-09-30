# 依赖组增量火控区间：结果（2026-09-28）

## 裁决：否决并精确撤回

实现了真实私有 Worker 的增量资格审核及每舰发射前 batch，并完成正确性与唯一完整步 ABBA。**热态两配对分别回退 6.8894% / 2.8024%，不保留候选。** 第二冷态配对还回退 4.9947%。本轮没有新增默认提速，不能把上一轮影子资格行数减少约 87% 当游戏提速。

没有降低 60Hz、精度、实体数、画质或联机保护；所有既有实验保持关闭。未运行浏览器/桌面，未暂存、提交、打包或发布；不宣称真实联机延迟通过，也不宣称原版实机/UI 等价。

## 本轮实际实现（仅留在 artifacts 的 rejected-source）

- 独立默认关闭 VITE_LAN_DIRTY_FIRE_PHASE，初始纯度/描述符审核，五个注册定义独立身份许可，不能伪造 ID 或借用更宽 AI/stats 集。
- parent/sourceCarrier 整个连通组在 native module AI、Ship.update 前及 emission 后标脏。只缓存资格，目标、命中几何和挡线仍每舰新事务，motion/repair 后开始、发射前关闭。
- 检查有序 roster、关系、world 身份、未知 writer、重复/重入事务，finally 关闭。保持严格空 runtime，未知 budget 方法与 canOmitUncontestedPenalty getter 不执行而回退。
- 初始描述符审核发现 ArmorGrid.cells 是合法原生访问器。cellMutationRevision 还包含“存储曾暴露”状态，快照采集会令其为 null，不适合证明此处只读纯度；最终使用 Ship 构造时记录的原生 cells getter/setter 身份，**不读 cells、不缓存装甲数值**，未知访问器继续拒绝。

## 构建与验收

固定 Node C:/Program Files/nodejs/node.exe v24.13.0。最终冻结 778 源码模块，源 SHA256 01dff8d18a856d8b059ef2945ea6d075888274818d6ce85b575f01aa77843a66；3489 资源及依赖有 SHA 门闩。before/after/disabled 同一冻结图，before 仅覆盖本轮精确写集。2 玩家 + 20 AI、三舰循环、seed917、3200DP，初始176实体734挂点。

开发期间其他任务更新了 7 个非写集源码文件（含新增 GlorianaAviation）；最终三臂一起纳入同一新图，完整名单见 concurrent-source-changes.json。未覆盖这些改动，不能将本轮绝对计时与旧冻结图直接相减。唯一 ABBA 保护输入和当时实时源全无漂移。

类型检查与改动文件 lint 通过；cells 身份修正后定向复查。6 组合同：
- host init/reinit, default disabled, actual batch coverage：通过。
- dependency groups and strict live admission：通过。
- ordered roster, relationships, world identity, reentry and overlap：通过。
- unknown definitions/readers/writers/budget callbacks never admitted：通过。
- unknown module AI and engine writers; exception closes phase：通过。
- 60 complete perturbed steps authority, RNG, trackers and live oracle：通过。

首完整步：1 区间、78 query /78有效batch，13,728 行 oracle 对照，disabled 不进入新区间。60 步扰动（tick8 技能、20 近距交火、30 排散、38 模块低HP）：60区间全部关闭，3,052个有效区间内query、2,890 batch、162严格拒绝；**537,152行增量/实时资格一致**。每步完整 authority、隐藏随机数/autofire tracker 一致。60步末SHA dc34375e751d5d5abbfe518f20a56adcbfc65c32748a396569693d20bac3d8e4。

前置失败只属于实现/合同修复，不是计时：两次 no-hit（访问器及快照暴露状态）、测试夹具错误（陌生 Ship 构造签名、恢复 update 时应删除临时 own 属性）。通过的同图合同复用，来源和旧脚本保留。ABBA runner 的输入文件名拼接第一次在启动任何 arm 之前失败；修复后只有以下一次完整计时，未重挑成绩。

## 唯一 ABBA（150 冷/热身步 + 120 热计时步）

|臂|init ms|冷150步 ms|热120步 ms|热步均值 ms|
|--|--:|--:|--:|--:|
|A0|101.533|7928.459|6853.938|57.1162|
|B1|97.416|7943.263|7326.136|61.0511|
|B2|102.340|8171.362|6751.671|56.2639|
|A3|100.368|7782.646|6567.618|54.7302|

事前门槛：热态两配对各至少改善3%；冷态回退各≤3%；init 增量≤max(10ms,10%)。实际热改善 -6.8894% / -2.8024%；冷回退 0.1867% / 4.9947%。init通过，热/冷门槛失败。20步SHA 63927a01c410f1e947ca299fac8c0f832bd1be5db38bed6d0c2691b1f4fcf32b；270步SHA f3be7af437a117ceb1b5426f25604d2fdfa09a047b7f0825d83d6f3d73bbe6e3，四臂完整见证均一致，末态171实体。

减少全舰审核行数不足以抵消本实现的整体成本；本轮未加 profiler，所以不能把回退精确归因给某一分配/审核/索引。性能未通过，故不消耗浏览器验收，也不启用此候选。后续必须定位更实质的热计算或快照成本，不能原样复活此候选或放宽门槛重测。

## 撤回与边界

6 个现有文件逐 SHA 恢复到本轮前；新增 OwnedFireControlPhase.ts 仅在确认候选 SHA 未变化后移出生产（副本保留）。ShipSystem.ts 恢复前后始终为 5a38de44f46a27d5f26ca973fc32eb0b9988aa5735ef05eff29335e1a1a7854b；ContentValidation.ts 的 arkFighter 白名单保留，其他任务更新均保留。

final-state.json = rejected-restored。活动源码不包含新开关或新guard/phase。没有活测试需要等待，目标仍未完成。关键证据：contracts.json、validation/static.json、preregistration.json、abba-once/abba.json、abba-once/input-manifest.json、rejected-source、final-state.json。
