# 显示图成对标量写入：否决并撤回（2026-09-26）

## 结论

**不保留本轮候选，没有新的生产提速。** 成对tagged写入保持完整语义，但真实200舰Host配对编码均值 **16.488→16.877ms（+2.36%）**，完整交付 **58.750→59.239ms（+0.83%）**，交付P95 **71.045→72.940ms（+2.67%）**；六个连续区间里五个的编码和交付更慢。不能把源码层少一次闭包调用当成实际更快，也不把原因未经剖析归结为JIT或GC。

已核对候选/工具hash后，按修改前原字节恢复唯一生产文件Encoder、render测试入口和字段审计工具；专项辅助合同移入candidate工件。320模块当前源图与本轮baseline完全一致，上一轮已接受避碰优化hash不变；不是恢复Git HEAD，没有覆盖其他任务工作。

## 候选与保留的不变式

见presentation-tagged-writes-source-notes-2026-09-26.md。与前次owned-scalars不同，本次不跳过任何instanceof或Object.is、不增加Worker资格分支。仅将每个带标签值的scalar(tag)+scalar(payload)融合为tagged(tag,payload)，Vector/Typed保留不带字段跟踪的numeric scalar。

两个半值仍各自执行比较→变更标记/字段去重push→写入，两个变更块有意保留重复代码；不能短路第二次Object.is，也不能把push延后。所有字段、精度、频率、实体、类型/键/预算验证、BFS/ID/别名/环、ObjectPatch格式/选择条件、UI/LAN全行以及失败epoch不变。无对象池/跨帧缓存/GPU变更。

## 一次集中正确性检查

TypeScript退出0（9345ms）、四处改动oxlint退出0（104ms）、既有render-projection退出0（5251ms）。完整场景522564断言；专项159046断言包括已有ObjectPatch/Decoder合同，存在重叠，不包装成独立试验。

专项384包、288次完整有效字节及buffer容量对照；render/UI每帧旧/新诊断计数一致。六类回调合同检查方法/访问器、比较中替换Object.is、同encoder重入、Array.push不执行第一次写入、异常及每次回调见到的半写入历史。ObjectPatch相关场景24帧、112补丁行、12类拒绝；全场景保留增删键、外部修改历史shape.keys、metadata/预算、typed resize别名、失败epoch等。

首次文件变换的泛化正则包含了无标签Vector对，计数assert在文件写入前停止；缩小到value函数的7对后实现。不是测试或测速失败后重跑，记录在setup-repair.json。

## 唯一正式性能配对

既有benchmark-real-workers --host-pipeline --serial-pair：独立无头Edge153、16逻辑CPU、crossOriginIsolated；200 Onslaught、seed917、dt=1/60；150预热+180测量（共5.5秒模拟）。串行参考/旧/新逐tick交替，不并发推进。无CPU/GC/阶段/字段计数插桩，无重测择优或删峰值。正式源图320模块，前后唯一差异Encoder；measured与candidate图完全一致，测量后源和工具均无漂移。

| 指标 | 旧均值ms | 新均值ms | 均值变化 | 旧P95ms | 新P95ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 32.583 | 32.797 | +0.66% | 38.660 | 40.655 | +5.16% |
| 编码 | 16.488 | 16.877 | +2.36% | 20.110 | 20.340 | +1.14% |
| Worker往返 | 49.404 | 50.043 | +1.29% | 59.380 | 60.365 | +1.66% |
| Host呈现处理 | 9.318 | 9.169 | -1.60% | 11.720 | 11.715 | -0.04% |
| Host完整交付 | 58.750 | 59.239 | +0.83% | 71.045 | 72.940 | +2.67% |

| tick区间 | 编码变化 | Host交付变化 |
|---|---:|---:|
| 151–180 | -0.43% | +0.88% |
| 181–210 | +0.80% | -0.42% |
| 211–240 | +3.62% | +0.99% |
| 241–270 | +2.10% | +0.80% |
| 271–300 | +3.68% | +1.38% |
| 301–330 | +3.75% | +1.20% |

未修改的Host呈现均值下降1.60%，不能拿这项波动抵消编码/完整交付退化。模拟P95上升5.16%也保留披露。六段不是独立复现试验；不与此前轮次不同环境/源码的绝对毫秒拼接计算收益。交付不包含网络、渲染/屏幕等待或input-to-photon。

真实Worker660次包/witness/音频/命令回执/胜负对照一致；662次完整显示值/原型/别名对照，共18103234节点；11检查点×两臂完整权威/隐藏火控/RNG一致。语义通过不等于性能合格。两臂测量区间workers/freshBatches/invalidated均0，没有改生产多核选择门。

## 回退和下一步

Encoder恢复为0ad5ef3e354ff9acbc4e54eaf624503b2bb4639f8103a80cbd3a601cfa302f4f；上一接受TacticalNavigation仍为2a8157e968e25d33f63889c9816626a1ee624974c88aa671901f17e01a838562。恢复后三文件原字节hash一致，整320模块图与baseline相同，不重复跑整套检查或再抽一个速度样本。

此结果将成对标量写入也列为已否决方向；下一轮不继续排列这些scalar/typeof/instanceof分支，而应优先找投影/图构建中的重复工作或数据布局层面的成本。没有声称所有成对写入都无效，只否决此完整路径上的候选。

工件根artifacts/presentation-tagged-writes-20260926/：acceptance.json、performance-analysis.json、host-serial-pair-200/result.json、完整源图、candidate.diff.txt、合同/日志、rollback.json与candidate源码均保留。基准退出0，脚本finally清理自有无头浏览器/Worker/临时HTTP服务。本轮未启动子代理、操作可见窗口/键鼠、暂存/提交/推送、打包/发布或修改原版安装内容。总优化目标继续active。
