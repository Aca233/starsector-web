# 正式火控范围索引复用：否决与精确回退（2026-09-26）

## 结论
**不保留这次生产候选。** 正式固定串行200舰配对中，目标阶段模拟均值43.023→43.307ms（**+0.66%**），P95增加0.68%；6个连续30tick块中5块更慢。Host完整交付虽然77.449→77.092ms（−0.46%），主要改善出现在本轮未修改的显示编码（−3.24%），不足以支持把它认定为火控提速。不能以候选数量大幅减少代替目标阶段的实际收益，也不未经复测/剖析把原因归结为JIT、GC或数组排序。

已校验候选文件未漂移，按原始Buffer字节恢复AutofireController.ts、FireControlQueryBatch.ts、check-combat-ai.mjs、benchmark-real-workers.mjs四文件；新合同helper已在工件中完整存档后移出活动scripts/lib，避免留下未使用接口。此前已接受的资格名单、静态Guard、Owner观察字段、显示编码/解码等修改全部保留。回退后完整313模块相对本轮基线漂移0处。

## 候选与来源
修改前说明见 aim-range-reuse-source-notes-2026-09-26.md。本轮重新读本机0.98a-RC8反编译private.java:230–282的AiGrid候选迭代与随后精确资格/射程/射界检查，以及WeaponGroup.java:301–314的advance/shouldFire区别。反编译异常不照搬；未做原版可见实机/UI验收，不声称原版整体等价。

候选只是正式aim复用本事务preAim已经建好的PreAimRangeIndex，不由aim新建索引、不提前准备拦截参数；只有tracker/missile阶段已经得到prepared且名单有有效Worker资格证明时才查询。冷扫描/普通回调、初次全名单资格读取、精确拦截/角色/碰撞/排序/RNG/decide均不变。不跨阶段保存状态，不降频、不降精度、不减实体/字段或校验。

## 集中正确性验证（对应被否决候选）
一次typecheck（16554ms）、5个改动代码/测试文件oxlint（746ms）、完整既有combat-ai的53项（4417ms）均exitCode=0，没有失败后重跑全套。
新增合同：1,389检查、390旧/新对照；194次实际查询、84次缩小候选，9,682→5,668候选；130次冷扫描和130次导弹准备参数场景。包含热tracker、指定目标、密集平局、向内高速目标、展开护盾、NaN/Infinity/极端坐标、未知输入、关闭/名单长度变更；比较完整aim/decide/tracker/RNG。旧preAim数学合同仍有19,363检查、1,152查询、104挂点对照，资格名单等既有合同仍通过。
语义参考使用上一轮冻结的旧Controller（同一Ship/Vector2依赖图），目的是保留既有读取次序与行为合同；下面性能基线则是本轮开始时、已经包含资格名单优化的即时313模块，不混淆两个参考来源。

## 默认自动模式激活/恢复诊断（不作速度证据）
```text
node scripts/benchmark-real-workers.mjs --count 200 --warm 0 --steps 55 --decode --fire-query-audit --candidate artifacts/aim-range-reuse-20260926/candidate-input-sources.json --out artifacts/aim-range-reuse-20260926/activation-restore
```
当时的测试构建在indexedAimTargets入口和返回处插入计数，生产没有计数器。初始化和恢复结果完全一致：
- calls=4,324，reused=3,699；这些实际复用查询的候选合计**99,873→100**，不是全部火控工作减少99.9%。
- 首次资格读取仍完整：registrations=1、rosters=55、maxRoster=200、batches=11,000、rejectedBatches=0、targetLists=10,932、targetReads=2,186,637、targetHits=121,136。
- 已有资格名单路径skipped=1,897,826、fallback=121,373。
- 55次witness、56次显示图比较，独立新Worker恢复的witness、完整权威＋隐藏状态和显示一致。
- 默认自动模式tick25启动、tick27使用4个Owner，19个fresh batch、invalidated=0；tick49因no-measured-benefit回到串行，没有改生产调度策略。
该入口是raw Worker，不能与真实Host正式配对混算速度。

## 正式真实Host配对（无额外插桩）
```text
node scripts/benchmark-real-workers.mjs --host-pipeline --serial-pair --count 200 --warm 150 --steps 180 --baseline artifacts/aim-range-reuse-20260926/baseline-sources.json --candidate artifacts/aim-range-reuse-20260926/candidate-input-sources.json --freeze artifacts/aim-range-reuse-20260926/measured-sources.json --out artifacts/aim-range-reuse-20260926/host-serial-pair-200
```
200 Onslaught、seed917、固定dt，150预热＋180测量tick，fresh无头Edge153、16逻辑处理器。serial/before/after三臂逐tick交替、全部固定串行；对比before/after，不跨轮复用数字。两完整313模块图仅2个生产文件变化，measured图与candidate图逐模块一致。不开profile、host-stages或计数；只运行此一次正式速度实验，不择优重测。

| 阶段（ms） | 旧均值 | 候选均值 | 均值变化 | 旧P95 | 候选P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 43.023 | 43.307 | +0.66% | 53.510 | 53.875 | +0.68% |
| 显示编码 | 22.498 | 21.769 | -3.24% | 30.620 | 31.285 | +2.17% |
| Host发起→原始ACK | 65.952 | 65.522 | -0.65% | 83.610 | 82.855 | -0.90% |
| Host呈现处理 | 11.464 | 11.536 | +0.63% | 16.120 | 16.340 | +1.36% |
| Host完整交付 | 77.449 | 77.092 | -0.46% | 95.525 | 94.565 | -1.00% |

P95严格沿用runner的floor((n−1)×0.95)，从samples重算并断言与result.json一致。hostPresentationMs包含decoder.apply与Host地图/部署/字符串处理；deliveredMs从Host.step发起至promise完成，包括输入复制/排队/ACK处理/日志，不包括渲染、网络、rAF节拍或输入到画面的延迟。

| 连续tick | 模拟均值变化 | 编码均值变化 | 完整交付均值变化 |
|---|---:|---:|---:|
| 151–180 | +0.41% | -5.17% | -1.52% |
| 181–210 | -3.43% | -3.15% | -2.53% |
| 211–240 | +0.25% | -3.72% | -0.80% |
| 241–270 | +1.86% | +0.01% | +1.74% |
| 271–300 | +2.98% | -6.61% | -0.70% |
| 301–330 | +1.52% | -0.63% | +0.80% |

正式配对660次witness、662次完整显示图比较、18,103,234个比较节点，11个权威＋隐藏火控/RNG检查点一致。三臂freshBatches=0、invalidated=0；Host结束均ready、pendingTransactions=0、tick=330、journalEntries=1、epoch=1、sequence=331。上述区间不是独立重复实验，不声称跨设备统计显著性。

## 回退验收与工件
- 四个原文件按original-hashes.json及备份逐字节恢复，之前资格名单优化未受影响。
- 回退后只定向执行COMBAT_AI_FROM=52的既有资格名单合同：182检查、130对照、6,330→67查询通过。没有再跑完整类型/AI/性能套件。
- 最终313个生产模块均等于本轮baseline，四个恢复文件hash正确。活动工程没有indexedAimTargets调用/声明或新增helper依赖。
- 工件根：artifacts/aim-range-reuse-20260926。保存original-files、candidate-files、baseline/candidate/measured完整图、validation-status、activation-restore/result.json、host-serial-pair-200/result.json、performance-analysis、post-measure-verification、rollback、rollback-contracts.log和final-verification.json。
- 被否决的测试插桩与完整helper同样在candidate-files内；重现诊断须使用该测试脚本版本，当前活动benchmark已恢复。

本轮新增的是已验证的否决证据，没有生产提速补丁。整体优化目标仍active；不据此断言所有范围索引、多核或对象池都无效。下一候选需要针对剩余真实成本形成新证据，而不是重跑本实现选最好结果。
未暂存、提交、推送、打包或发布；未启动子代理/可见窗口或修改安装游戏。
