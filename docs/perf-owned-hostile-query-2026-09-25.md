# Worker 敌舰名单复用：验收记录（2026-09-25）

## 结论
保留这项小范围优化。它减少重复成员筛选和临时数组，不改变目标规则、实时距离、模拟频率或校验。尚未使本场景的多核试跑获得稳定收益；不宣称GPU加速或输入到画面延迟改善。
最终完整配对的均值有改善，但存在自动调度差异。**可保守归纳的直接改善仍是约1%的量级，而不是稳定9%的算法提速。** 同串行区间P95没有改善，主线程decode均值还略有增加；需实战长时日志继续核实，不把一次短场景推广到所有阵容。

## 原版及范围
原版来源、稳定域证明和修改前预期见 owned-hostile-query-source-notes-2026-09-25.md。仅保持Web当前选敌算法，不宣称完整原版AI等价；不改UI，没有原版实机或桌面操作。不是对用户0.2.11联机日志的新复测。

- HostileQueryBatch：闭合Worker、完整原生读钩子、整数team、至少64舰，按team复用敌舰和非战机候选；每次读取实时currentTarget、显式目标和距离，保留NaN/Infinity/严格距离平局顺序。
- CombatEngine：验证原型、findHostile和4个名单getter身份及名单顺序，只在已准入的同步原生AI阶段使用；finally关闭清空，不跨帧。
- Protocol：每次publish/matches独立事务，不跨await共享；scalar/derived/metadata/SAB世代/边界和失效检查全部保留。
- OwnershipPool显式注入资格工厂，Protocol对引擎及事务类仅作type import。公开Publisher默认不启用，未知hook和自定义引擎读取回退。
- 未暂存、提交、推送、打包发布或修改游戏版本；保留其他生涯/内容任务改动。

## 集中验证
初版与依赖修正后的typecheck、改动代码oxlint、既有check-combat-ai均通过。49项，其中新增4016次目标身份对照、8种名单场景、14组冻结旧Publisher完整有效packet及metadata对照；派发后位置/队伍/可见性/当前目标/死亡/方法变更继续使matches拒绝，验证公开自定义方法参数次序及getter读取次数不变。

最终55tick真实Worker计数探针，200艘Onslaught，包含19次owner批次，不用于速度结论：

| 路径 | 事务 | 查询 | 敌舰名单 | 筛选成员读取 | 已关闭事务 |
|---|---:|---:|---:|---:|---:|
| serial | 55 | 10945 | 110 | 22000 | 55 |
| parallel | 75 | 14965 | 150 | 30000 | 75 |
| restore | 55 | 10945 | 110 | 22000 | 55 |

恢复入口witness、authority+hidden、完整显示图一致。模拟/视觉RNG及隐藏火控状态检查保留。此处只复用成员筛选，不能把名单读取大幅减少等同于总帧时间同比下降。

## 最终无计时插桩配对
真实production local Worker + nested owner Workers，独立无头Chromium；200艘Onslaught、固定种子917、150tick预热+180tick测量；三个臂串行交替、dt不变。固定baseline和candidate源图，不受其它任务后续改动混入。无stages/profile/query-audit插桩。

单位ms；均值及P95均包含完整测量段，不删掉基线不利的试跑区间。

| 指标 | 修改前均值 | 最终版均值 | 均值变化 | 修改前P95 | 最终版P95 |
|---|---:|---:|---:|---:|---:|
| 模拟 | 48.941 | 44.490 | -9.09% | 73.605 | 53.820 |
| Worker往返+主线程解码 | 83.009 | 78.416 | -5.53% | 113.850 | 97.235 |
| Worker往返 | 71.545 | 66.693 | -6.78% | 101.600 | 84.490 |
| 显示编码 | 22.215 | 21.785 | -1.94% | 29.735 | 28.840 |
| 主线程解码 | 11.464 | 11.723 | +2.25% | 15.315 | 16.425 |

交付指标是Worker请求往返加production decoder.apply，包含编码/传输相关等待，**不含渲染、网络或input-to-photon**。wait含sync/kernel，不能重复相加。

### 必须披露的调度差异
- before：tick27初次owner试跑，tick49回退；tick309再启动，tick310开始再次owner，测量段19个新owner批次，结束时仍处于measuring-workers。
- after：tick26初次试跑，tick49回退；测量段0个新owner批次，保持no-measured-benefit串行。
- 两者测量段均无validation invalidated。这种调度分歧影响均值/P95，不能全归功于名单缓存，更不能证明多核已比串行快。

仅为解释、而非替换全段结论：两边同时no-measured-benefit的tick151–308，共158对：

| 指标 | 修改前均值 | 最终版均值 | 变化 | 修改前P95 | 最终版P95 |
|---|---:|---:|---:|---:|---:|
| 模拟 | 44.380 | 43.892 | -1.10% | 52.060 | 52.595 |
| Worker往返+主线程解码 | 77.977 | 77.196 | -1.00% | 91.610 | 92.100 |

该子区间由运行模式定义，不按耗时筛选；所有180tick仍保留在主表。测试规模有限，未证明统计显著性或长局尾延迟改善。

完整330tick及初始化中：660次跨臂有效帧/witness/audio/results/outcome比较、662次显示图比较（18069472对象节点访问）、11个权威/隐藏状态检查点全部一致。

## 修正过程与可复查证据
第一版测量simulation 43.214→42.249ms，交付75.724→74.740ms，测量段两边均无owner批次。但Protocol的运行时Engine导入使owner静态加载图从2,650,051增至5,677,116字节，故没有直接验收该版。
修正采用工厂注入，不改变查询算法。最终未压缩测试构建owner静态加载图为2,650,470字节，仅比基线增加419字节（约0.016%），已不包含CombatEngine。
加载边界检查曾误将插桩构建与干净构建比较，随后不合理地要求字节完全相等；这两次断言失败不涉及行为错误，也未触发性能择优重跑。最终以相同无插桩构建确认实际419字节增量与Engine依赖已移除，原始说明保存在owner-load-precheck及provenance-and-owner-load中。

工件根目录：artifacts/owned-hostile-query-20260925
- baseline-sources.json：306模块；初版candidate/measured、paired-200保留，不覆写。
- isolated-publisher/candidate-input-sources.json、measured-sources.json：307模块，完全相同且逐项sha256有效。
- 最终生产源图只变Engine、Protocol、OwnershipPool三个既有模块及新增HostileQueryBatch；构建时9个本轮代码/测试文件hash与工作区一致。收尾检查发现CombatEngine随后新增了独立任务的附属模块手操恢复逻辑；其它8个文件仍一致，本轮查询事务相关hunk未变。并发差异完整保留，另存workspace-drift.patch/json。此次类型/合同与性能结论针对冻结候选，不声称覆盖之后追加的模块手操逻辑。
- isolated-publisher/validation-status.json、contracts.log、activation-restore/result.json、paired-200/result.json、comparison-summary.json、provenance-and-owner-load.json。

## 后续
本轮属于重复计算和分配的小优化，不是线程架构突破。先继续削减发布/验证与武器更新的实际成本，再考虑扩大并行范围；不要通过降低模拟频率、实体数、完整校验或盲目提高CPU占用来换取纸面数字。整体性能目标仍在进行中。
