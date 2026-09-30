# 密集视觉对象池目录：否决与回退（2026-09-26）

## 结论
**不保留候选，本轮没有生产提速。** 把固定schema的Map目录改成槽位数组后，200舰显示编码均值18.684→19.291ms（+3.25%），解码10.386→10.651ms（+2.55%）。两项合计也退化，不能用更少Map查询推导必然更快。
完整交付均值69.521→69.288ms（−0.34%）但P95 81.775→85.055ms（+4.01%）；模拟源码未变，模拟均值下降不直接归因于这个候选。整体小幅均值变化既不能证明已突破延迟，也不能掩盖两个目标阶段的退化。因此按hash精确恢复唯一生产文件，不择优重跑，不猜测必然由JIT或数组空槽导致。

## 来源与范围
[修改前对照](C:/Program Files (x86)/Starsector/starsector-web/docs/packed-visual-slots-source-notes-2026-09-26.md)记录原版0.98a-RC8位置/速度接口、Web源码和此前CPU采样。PackedVisualState与那份采样冻结文件hash一致；record约130.564ms self/405.732ms inclusive只说明值得检查，不能全归于池目录查找。
内部实际共有10个固定schema。候选仅增加私有slot并用数组代替编码/解码外层Map目录；内部身份WeakMap/Map仍在，ID及字段协议不变，全部读取和校验保留。解码仍构造本帧存活池，不是扩大池的保留期，也不是复活先前的Entry复用、shape缓存或标量分派组合。
未修改原版玩法、UI、实体/字段/粒子数量、频率、精度、预算或拒绝条件。没有原版可见实机/截图的新验收，未占用桌面。

## 正式配对
全新无头Edge153、16逻辑CPU、cross-origin isolated；真实local Worker、主线程production decoder；200艘Onslaught、seed917、固定dt。150tick预热＋180tick测量，serial/before/after逐tick交替。完整311模块冻结，仅PackedVisualState.ts改变，measured图与candidate完全相同。
两臂由测试选项固定串行，freshBatches=0、invalidated=0；不把调度差异混作收益。生产调度不变。速度实验不开profile、stages或诊断插桩。

| 指标 ms | before均值 | 候选均值 | 均值变化 | before P95 | 候选P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 完整模拟 | 40.043 | 38.929 | -2.78% | 48.635 | 47.520 | -2.29% |
| 显示编码 | 18.684 | 19.291 | +3.25% | 25.755 | 26.480 | +2.81% |
| Worker往返 | 59.135 | 58.637 | -0.84% | 70.885 | 70.760 | -0.18% |
| 主线程解码 | 10.386 | 10.651 | +2.55% | 13.855 | 15.820 | +14.18% |
| Worker往返＋解码 | 69.521 | 69.288 | -0.34% | 81.775 | 85.055 | +4.01% |

P95统一使用既有runner的floor((n−1)×0.95)下标；汇总初算曾使用另一种分位数下标，已按原始samples修正，并逐项断言与result.json一致。没有重跑或选择样本。

六个连续30tick区间编码变化：+3.89%、+2.28%、+3.48%、-0.03%、+6.89%、+3.14%；五块退化。解码四块退化，交付四块退化。这些区间相关，不当作六次独立实验或统计显著结论。
交付只表示Worker往返＋decoder.apply，不包含渲染、网络、Host后续UI快照复制或input-to-photon；不将其换算实际FPS/TPS。

## 一致性和回退
- 一次集中类型检查、4个改动代码/测试文件oxlint通过；完整既有render-projection通过68,501项检查。此轮对照的是冻结旧PackedVisual实现，其余未修改Encoder/Decoder合同照常运行，不沿用上一轮83,629项的数字。
- 新增PackedVisual合同：54个包、27次精确有效字节/字段/字符串对照、27次完整解码对照、24次拒绝（前后各12）。覆盖10种schema、缺省/undefined/null、特殊浮点、重复ID别名、跨schema同对象独立身份、退场重入、未知键/访问器/坏Vector/稀疏颜色兼容回退，以及错误后池不被污染。
- 真实Worker总计330tick、660次有效帧对照、662个完整显示图、18,103,234次对象节点访问；11个权威/隐藏火控/RNG检查点一致。
- 否决后PackedVisualState.ts逐字节恢复原文件。回退后只定向运行新合同：305项通过，仍为54包/27精确包/27解码对照/24拒绝，没有重跑全套。
- 最终核对：相对本轮baseline的311模块漂移0处；火控Guard、Owner观察字段、此前Encoder/Decoder生产优化均未因本轮回退被更改。详见最终核对工件，不对核对时点以后的并发修改作验收声明。
- 保留的仅是[PackedVisual回归helper](C:/Program Files (x86)/Starsector/starsector-web/scripts/lib/packed-visual-slot-contracts.mjs)、既有测试的冻结旧实现和RENDER_PROJECTION_PACKED_ONLY入口，以及证据文档/工件。

## 工件
[正式结果](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/serial-pair-200/result.json)、[指标/连续区间](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/comparison.json)、[源码核对](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/source-verification.json)、[集中验证](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/validation-status.json)、[回退后合同](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/rollback-contracts/contracts.json)、[回退记录](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/rollback.json)、[最终工作区核对](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/final-workspace-verification.json)。
被否决源码留在[实验存档](C:/Program Files (x86)/Starsector/starsector-web/artifacts/packed-visual-slots-20260926/PackedVisualState.rejected.ts)，不进入生产构建。恢复SHA-256：`ed34d64b8d7d5caf82112f8eb5223d34c290e02da5d462b9ab4eac1a528a6381`。

## 后续判断
连续两次局部显示实现实验没有净收益，不继续在同一池目录上堆分支。源码已确认LocalWorkerHost是在完整decode、UI快照复制和journal记录之后才resolve并pump下一事务；现有基准只计decoder.apply，尚未覆盖这段真实Host交付成本。下一步应先量化真实Host/Session流水线及其中重复复制，而不是直接取消单事务屏障、预采样未来输入或跳过校验；这些屏障与故障、回放、命令顺序有关，不能以更高占用率为由破坏。

本轮没有提交、暂存、推送、打包、发布或修改安装游戏，没有子代理或可见窗口。整体优化目标继续active。
