# 显示编码身份记录合并：验收（2026-09-25）

## 结论
**保留生产优化，但不宣传模拟加速或多核突破。** 唯一生产修改为CombatPresentationEncoder：把元数据大小/可达性和快照归入原有WeakMap身份记录，去掉重复快照Map、元数据WeakMap和每帧used/prior Set。数据仍逐帧重新读取，类型/键/预算/变化检查、BFS删除顺序、Float64、对象别名及失败epoch保持。退出显示图时立即清掉snapshot，身份行不包含源对象强引用；UI仍不走metadata字典。

已否决的形状缓存和按记录写出没有恢复。本轮的编码均值及编码P95下降，在相同串行状态区间也存在；整体交付收益仍仅约1.2%，主线程解码有小幅反向波动，不能说卡顿已经解决。

## 原版与范围
修改前证据/稳定性证明见presentation-identity-records-source-notes-2026-09-25.md。原版API确认实时角度/位置/规格接口，但没有此Worker协议；本轮参照旧Web编码器进行逐包等价验证，不改玩法、UI、字段、数量、模拟或显示频率，不宣称新增原版画面验收。

## 一次正式无计时插桩真实Worker测试
200艘Onslaught、seed917、固定dt、150tick预热+180tick测量。全新无头Edge153、16逻辑CPU、SAB/cross-origin isolation；production local Worker及nested owner Workers，三个世界逐tick交替，不并行推进。不开profile/stages/查询计数。测试工具审计在耗时采样外。

单位ms，全段未删掉任何不利tick：

| 指标 | before均值 | after均值 | 均值变化 | before P95 | after P95 |
|---|---:|---:|---:|---:|---:|
| 模拟 | 46.723 | 43.826 | -6.20% | 64.885 | 53.685 |
| 显示编码 | 22.166 | 20.699 | -6.62% | 29.800 | 27.770 |
| Worker往返 | 69.286 | 64.946 | -6.26% | 92.785 | 77.520 |
| 主线程解码 | 11.128 | 11.407 | +2.51% | 15.225 | 15.380 |
| 往返＋解码 | 80.413 | 76.353 | -5.05% | 104.335 | 90.015 |

**自动调度差异必须披露**：before在tick309重新启动owner、310起开始试跑，测量段19个新owner批次；after测量段0批次并维持no-measured-benefit。两边初次试跑均tick49回退，后者并不证明优化令多核获利。模拟代码未改，完整表的模拟均值−6.20%和交付−5.05%不能全当算法收益。

### 相同运行状态的补充诊断
按两臂同时no-measured-benefit定义tick151–308的158对，不按耗时选择，不替代全段结果：

| 指标 | before均值 | after均值 | 均值变化 | before P95 | after P95 |
|---|---:|---:|---:|---:|---:|
| 模拟 | 43.392 | 43.357 | -0.08% | 51.215 | 52.520 |
| 显示编码 | 21.803 | 20.527 | -5.85% | 29.530 | 26.290 |
| 主线程解码 | 10.968 | 11.297 | +3.00% | 15.145 | 15.320 |
| 往返＋解码 | 76.557 | 75.604 | -1.24% | 90.945 | 89.345 |

本区间编码平均节省1.275ms（−5.85%），编码P95−10.97%；交付平均节省0.953ms（−1.24%），交付P95−1.76%。模拟均值基本不变（−0.08%），解码均值增加约0.329ms（+3.00%）。这支持减少编码内部查表成本的判断，不支持新的模拟性能结论。

| 连续区间 | 编码均值变化 | 交付均值变化 |
|---|---:|---:|
| 151–180 | +0.25% | +0.43% |
| 181–210 | -10.66% | -3.02% |
| 211–240 | -10.48% | -2.71% |
| 241–270 | -4.66% | +0.79% |
| 271–300 | -5.52% | -2.03% |
| 301–330 | -7.98% | -18.82% |

六段不是独立重复实验，不声明统计显著性；其中两段交付略慢。deliveredMs只含Worker请求往返＋production decoder.apply，不含渲染/网络/input-to-photon；没有FPS/TPS或真实联机延迟新证据。

## 正确性与失败记录
- 一次TypeScript类型检查、改动文件oxlint通过；测试修正后的两个helper各做了定向lint。
- 完整既有render-projection命令执行原有主部，进入新增身份helper时失败，**该命令exit1，不写作全套exit0**。原因是新测试重复使用同一个UI顶层包；冻结旧encoder和候选均可复现Invalid UI presentation envelope，原有协议消费要求每次提供新的顶层包。只把夹具改为新顶层包，没有放宽生产校验。
- 定向后续又遇到旧shape helper访问已被合并掉的私有snapshots Map。把内部状态检查改成对当前liveEntries（旧版仍用snapshots）的等价可达性检查；字段/二进制/读顺序断言未删除，生产代码未改。
- 随后的定向索引/新身份helper、解码器、形状、行写出检查共16501项通过（15020+196+485+800）；它们复用第一次成功构建的同一生产core。保留两次失败日志及冻结旧版UI失败oracle。
- 共210组新旧encoder有效包逐字节及所有字段对照：索引30、新身份32、形状116、行写出32。包含同tick、环/共享引用、键及类型变化、自定义Object.keys/JSON.stringify/迭代回调、各typed数组、recycled容量及尾部、临时节点退场、ID重用但snapshot重建、metadata间断重入及UI子对象别名。
- 额外预算检查：两个约400万字符metadata各自先缓存合法大小，同时可达时仍拒绝超额，随后epoch仍被poison。普通Object.freeze对象不获得项目的不可变metadata资格。
- 真实Worker330tick：660次有效帧/witness/audio/results/outcome对照，662次完整显示图比较（18103234节点访问），11个检查点完整权威/隐藏火控与RNG一致；两优化臂无validation invalidated。

## 源码与工件
artifacts/presentation-identity-records-20260925/baseline-sources.json、candidate-input-sources.json、measured-sources.json固定308模块，candidate与实测完全相同，源图只有encoder一个生产模块变化。本轮四个代码/测试文件收尾hash匹配候选。并发任务后来修改了10个其它依赖（清单在workspace-source-drift.json）；保留这些改动，没有混入基准或将其收益归给本轮。验证不能冒充对这些后续改动的整体验收。

其它证据：before/、candidate-files/、validation-status.json、contracts.log、ui-test-failure-oracle.json、contracts-followup.log、contracts-followup-fixed.json、contracts-{index,decoder,shapes,rows}.json、paired-200/result.json、comparison.json、source-verification.json。profile源在artifacts/presentation-cost-profile-20260925/，只用于定位，不用于优化比例。

没有提交、暂存、推送、打包发布、改版本、启动子代理或可见窗口。整体优化目标继续active；当前主要剩余成本仍有模拟/火控和主线程解码，不能靠增加占用率或删校验冒充收益。
