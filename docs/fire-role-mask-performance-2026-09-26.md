# 单扫描角色掩码：无可重复收益，已撤回（2026-09-26）

## 结论

**未保留生产候选。** 第一次逻辑配对模拟均值−1.396%、交付均值−0.800%；预先固定的角色互换后，模拟+1.651%、交付+0.664%。两次交付P95分别+2.038%、+1.163%。原生角色判断确实被复用，但没有可重复整步收益，不用操作数或某一个Worker实例的好结果冒充提速。

生产AutofireController、两处测试入口已按候选SHA核验后逐字恢复；新增helper已归档并移出活动scripts。完整320模块与本轮baseline一致，无无关漂移；之前接受的导航、协议15、显示/解码、火控读取优化和基准六排列修复保留。未提交、推送、发布、操作桌面或启动子代理。

## 实验与边界

只在现有私有Worker资格名单的活动租约中，为单个挂点的一次preAim/aim扫描懒计算FIGHTER/FRIGATE/其它三类角色mask；public/generic/复制名单、tracker/显式currentTarget/MISSILE维持原路径，close/名单长度变化立即回退。没有跨扫描/tick缓存；存活、可见性、阵营、完整live guard、精确射程/射界/几何、发射许可、排序/RNG保持。不改变玩法、频率、精度、字段或实体数；原版来源与范围见fire-role-mask-source-notes-2026-09-26.md。

## 正确性

TypeScript exit0（18846ms），四文件lint exit0（122ms）。完整既有combat-ai前52项通过；新增第53项的两个夹具问题分别为Onslaught舰装构造fighter冲突、copied-list假batch缺queryBlockers。仅修夹具并定向运行第53项，最终通过，未重跑前52项或typecheck；首次完整命令仍记exit1，不能声称一次整条命令全绿。

新专项41,097断言、40,960角色矩阵比较、36份完整preAim/aim/decide/跟踪器/RNG状态一致。覆盖hint组合、弹药0/有限/Infinity/NaN、穿战机/点防御、三类以上船体、跨扫描修改、全拒绝mask=0、关闭/名单长度变更及普通动态getter读序。测试构建43,477次mask查询、4,160次编译；部分矩阵新端重复查询，不能把两端不同计数直接相除当同工作量收益。生产测速没有计数插桩。

## 预定两次角色互换，而非择优重测

都使用200 Onslaught、seed917、dt1/60、150预热+180测量，真实LocalWorkerHost串行完整路径，无头Edge153、16逻辑CPU、COI。每臂首/中/尾各60次。第一次before/serial为旧代码，after为新代码；第二次before/serial为新代码，after为旧代码，逻辑比较始终还原为旧→新。

serial和before各为独立的同码Worker，充当运行内控制。汇总包含旧3实例与新3实例的全部样本，不取最好实例。两个测量在实现前写入performance-gate.json，即使第一次指标不利也按计划完成第二次；没有第三次重抽样。

| 角色分配 | 模拟均值变化 | 交付均值变化 | 交付P95变化 | 模拟改善段 | 交付改善段 |
|---|---:|---:|---:|---:|---:|
| forward（已换回旧→新方向） | -1.396% | -0.800% | +2.038% | 4/6 | 4/6 |
| swapped（已换回旧→新方向） | +1.651% | +0.664% | +1.163% | 1/6 | 2/6 |

各代码3个独立Worker实例、每实例180样本的完整汇总：

| 指标 | 旧均值 ms | 新均值 ms | 均值变化 | 汇总P95变化 |
|---|---:|---:|---:|---:|
| simulationMs | 33.424 | 33.242 | -0.545% | -1.031% |
| encodeMs | 17.211 | 16.910 | -1.747% | -1.615% |
| roundTripMs | 51.003 | 50.520 | -0.947% | -1.013% |
| hostPresentationMs | 9.539 | 9.401 | -1.449% | -3.139% |
| deliveredMs | 60.572 | 59.950 | -1.028% | -2.767% |

同码运行内控制的最大绝对均值差异：模拟0.757%、交付0.824%。汇总模拟−0.545%/交付−1.028%，既未达到预写5%最低收益，也未超过同码控制最大绝对差异再加1个百分点。角色配对方向与尾延迟门槛也失败；不选择汇总P95下降覆盖它们。未修改的编码均值也波动，不能归因给候选。

两次各660次有效包/witness、662份完整显示图（每次18,103,234节点）、11个权威/隐藏火控/RNG检查点一致；三臂测量期间均serial、workers/freshBatches/invalidated为0。两次实际冻结图和各自候选输入匹配，正式生产仅AutofireController一份不同，工具/源码漂移为空。

## 对下一步的影响

这轮排除“单挂点角色条件折叠足以带来明显整步收益”的假设；不再继续同一方向的布尔写法/对象池/小缓存微调。已有定位数据中，显示图captureGraph及其value遍历仍占明显时间，应研究能减少整个反射遍历/中间投影链路的专用批量表示，而不只是换Map或缓存键数组。此前键布局、标量写入和字典登记微调已否决，不原样重试。此更大改造尚未实施，更没有GPU/多核或大规模60Hz完成声明。

本次仍是一个固定确定性负载的有限重复，不能给出跨硬件统计结论，也未测网络RTT、渲染、帧节奏或输入到显示延迟。整体优化目标继续active。

工件：artifacts/fire-role-mask-20260926下performance-gate.json、baseline-sources.json、candidate-sources.json、candidate/、candidate.diff.txt、validation.json、repair*.json、contracts.json、forward/result.json、swapped/result.json、analysis.json、acceptance.json。最终状态：rejected-and-reverted。
