# 显示解码事务暂存优化：实测与撤回（2026-09-25）

## 结论
**撤回生产候选，不把总耗时的正向波动冒充解码提速。** 解码均值12.292→12.758ms（+3.79%），P95 17.410→17.795ms（+2.21%）；六个连续区间有五个解码更慢。虽然完整交付均值改善1.98%，主要降幅来自未修改的Worker编码阶段，收益归因不明确，不足以支持保留更复杂且目标热段变慢的解码器。

已核对候选hash未漂移，仅将CombatPresentationDecoder精确恢复为本轮之前的字节。前一轮有效的编码身份记录优化仍在，encoder hash与本轮基线完全相同。不能由此断言所有对象池无效；否决的是本次“共享空数组＋既有Entry复用＋引用入队去重”的组合实现，也不声称它在所有机器/阵容都会变慢。

## 候选与原版边界
source-notes文档记录原版WeaponAPI实时读取接口、原有Web协议及主线程profile。本轮不改玩法/UI、模拟/显示频率、Float64、实体或字段，不删完整图/预算/类型校验。候选仅修改Decoder内部：共享冻结的空keys/refs，Plan持有prior，全部校验及分配完成后写值，最终才更新复用Entry链接；typed-array替换仍重绑未更新父引用；图遍历在首次发现时入队，仍检查全部节点和边。

候选保存在artifacts/presentation-decode-plans-20260925/candidate-files/及CombatPresentationDecoder.rejected.ts，不留在生产文件。

## 性能测试
真实production local Worker和nested owner Workers、主线程production decoder，独立无头Edge153、16逻辑CPU、cross-origin isolated。200 Onslaught、seed917、固定dt，150tick预热＋180tick测量，三臂逐tick交替；无profile/stages/计数插桩。之前的主线程CPU采样只用于定位，不作速度比例。

两臂均tick26开始初次owner试跑、tick49因no-measured-benefit回退，测量段freshBatches均为0，最终均串行；本次没有上两轮那样的中途owner重试分歧。

| 指标ms | before均值 | 候选均值 | 均值变化 | before P95 | 候选P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 47.705 | 47.259 | -0.93% | 54.640 | 57.220 | +4.72% |
| 显示编码 | 23.284 | 21.576 | -7.34% | 31.195 | 30.865 | -1.06% |
| Worker往返 | 71.418 | 69.294 | -2.97% | 85.940 | 85.990 | +0.06% |
| 主线程解码 | 12.292 | 12.758 | +3.79% | 17.410 | 17.795 | +2.21% |
| 往返＋解码 | 83.710 | 82.052 | -1.98% | 99.275 | 98.385 | -0.90% |

310模块的源图只变Decoder，且**两臂local-combat.worker静态导入闭包的每个文件名/字节hash完全一致**。这不证明运行代价必须一致；JIT、GC、调度或间接运行时影响仍可能造成差异。因此不能把编码−7.34%和模拟−0.93%直接归为解码算法收益，也不武断断言完整交付改善一定只是噪声。现有证据不足以确定总改善来源，选择撤回，不择优重跑。

| 连续区间 | 解码均值变化 | 完整交付均值变化 |
|---|---:|---:|
| 151–180 | +8.29% | -1.33% |
| 181–210 | +7.85% | -0.43% |
| 211–240 | -3.99% | -2.61% |
| 241–270 | +1.88% | -3.07% |
| 271–300 | +7.17% | -3.09% |
| 301–330 | +3.75% | -1.09% |

连续区间不是独立实验，不宣称统计显著性。交付指标仅为Worker请求往返＋主线程decoder.apply，不含渲染/网络/input-to-photon，不是FPS或TPS结论。

## 验证与实际失败
- 一次类型检查及改动文件oxlint通过。
- 完整既有render-projection命令在新decoder helper中失败，**初次contracts exit1，不写成全套通过**。夹具消费后直接修改了encoder拥有的packet.shapes，令下一帧把原本未变的锚点重新发出；随后同时声明更新/退休该ID，正确触发更早的Invalid presentation identity，而非夹具预想的Unresolved reference。
- 冻结旧decoder复现相同错误，见test-failure-oracle.json。仅修夹具所有权：修改当前decoder消费的独立input副本，不篡改encoder的输出；未放宽生产拒绝逻辑。顺便把拒绝时的Entry/keys/refs/metadata身份断言改为严格identity检查。
- 定向decoder及新helper，加上此前未到达的shape/row检查，共56,975项通过；复用第一次成功构建的同一生产core，生产候选没因测试失败而修改。
- 39个包与旧decoder的完整输出等价；17次坏包拒绝对照，既有显示、Entry身份/字段/links、metadata map、revision/tick不变，随后同revision合法包可被接受。
- 256重复引用扇入、empty/nonempty refs/metadata切换、320个临时节点退场、字段删除与keys消费后篡改隔离、typed长度变化及未更新父对象/数组/Map/Set回绑均通过。
- 6,203次保留条目身份断言包含未更新节点，**不等于测得减少6,203次分配**，不把此计数当性能收益。
- 真实Worker330tick、660次有效帧/witness/audio/results/outcome对照，含init662次完整显示图比较（18,103,234节点访问），11个权威/隐藏火控与RNG检查点一致，invalidated均0。

## 回退与保留
回退前确认四个本轮代码/测试文件hash等于候选，冻结candidate与measured完全一致；仅恢复Decoder。旧代码已作为真实参考臂和同模块旧decoder运行，不再重跑全套。新增helper另在同hash旧decoder上定向运行，49900项通过，证明保留的测试也兼容回退后的实现。

保留：benchmark-real-workers的可选--profile main（要求--decode）、新decoder事务回归helper及其既有场景集成、source-notes/报告/全部工件。没有其它生产净改动。其它任务后续修改的3个依赖另列final-workspace-verification.json，不覆盖也不混入基准。

关键工件：baseline-sources.json、candidate-input-sources.json、measured-sources.json、validation-status.json、contracts.log、test-failure-oracle.json、contracts-followup.json、paired-200/result.json、comparison.json、source-verification.json（包含Worker闭包hash）、rollback.json、restored-helper-compatibility.json。

未暂存、提交、推送、打包发布、改版本、启动子代理或可见窗口。下一步应先进一步拆解解码子阶段或研究更紧凑的数据表示，而不是因对象数量减少就继续堆复用分支。整体优化目标继续active。
