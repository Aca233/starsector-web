# 舰队掩护局部标量复用：未通过尾延迟门槛（2026-09-26）

## 结论

**未保留，已精确撤回本轮生产及测试入口，候选归档。** 模拟均值改善3.977%，完整Host交付均值改善0.989%；不能描述为“没有平均收益”。但交付P95从70.090ms升至70.140ms，增加0.050ms（0.07134%），未通过测试前写入的“P95不增加”门槛。差异很小，不足以单独证明稳定尾延迟回退；仍不能事后放宽规则、重新采样择优或宣称本轮全面优化成功。

## 候选与验证

Worker私有舰队规划仅在原生/只读hook准入时，局部懒复用目标距离和当前最佳掩护距离两个标量；公开planner保留逐次live读取。无舰对矩阵/Map、对象池、跨plan缓存；不降频、不删字段/实体、不降低精度、不减少真实校验。

初始TypeScript、改动lint、完整combat-ai均exit0，53个foundation场景。专项354断言、126份完整FleetPlan一致、117份准入；distance helper调用1,621,471→1,290,747，只证明操作数减少。含NaN/Infinity、重复ID、动态公共getter/回调、数学与运动替换回退、两处生产入口。

测速前发现9份并发更新时preflight即停止，未产生性能样本。保留它们并重冻两臂V2完整320模块，唯一差异为FleetTactics/CombatEngine；针对V2仅重做两工具lint和完整既有combat-ai，通过，**未重做整图typecheck**。

## 唯一正式配对

200 Onslaught，seed917，dt=1/60，预热150tick+测量180tick，16逻辑CPU、无头Edge153、COI。现有真实LocalWorkerHost串行配对，逐tick交替臂顺序，无profiler/阶段/距离计数。完整显示、隐藏火控、权威/RNG等审计在计时外，未省略。

| 指标 | before均值 ms | after均值 ms | 均值变化 | before P95 ms | after P95 ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| simulationMs | 33.588 | 32.252 | -3.977% | 39.150 | 39.545 | +1.009% |
| encodeMs | 16.602 | 17.370 | +4.621% | 19.640 | 20.640 | +5.092% |
| roundTripMs | 50.548 | 50.008 | -1.069% | 59.245 | 59.615 | +0.625% |
| hostPresentationMs | 9.391 | 9.339 | -0.558% | 11.775 | 12.065 | +2.463% |
| deliveredMs | 59.969 | 59.376 | -0.989% | 70.090 | 70.140 | +0.071% |

六个连续30tick区间：模拟6/6改善；交付5/6改善；未改动的encode阶段6/6更慢（均值+4.621%）。尚无证据把编码差异归因于GC/JIT或基准缺陷；应以独立同图A/A对照诊断，不能拿未来诊断改写本候选的失败结论。

660次witness/packet对照、662份完整显示图（18,103,234节点）一致，11检查点×两臂权威/隐藏火控/RNG一致。测量段全为serial，workers/freshBatches/invalidated均0。测量构建与candidate-current完整一致，工具及生产漂移为空。

## 回退与边界

四份修改文件回退前核验其候选SHA与归档，逐字恢复before-files.json；新增专项helper移出活动scripts并保留候选归档。回退后完整320模块与baseline-current-sources.json一致，无无关漂移。保留9份并发改动和已接受的避碰扫掠边界优化；未用git reset/checkout、未暂存/提交/推送/发布，也未操作桌面。

旧candidate.diff.txt是V1；candidate-final.diff.txt包含四份V2修改，新增helper完整代码在candidate/fleet-cover-contracts.mjs。逐字回退不重复整套验证/测速。

这些是一个确定性压力场景的Worker模拟、编码和Host交付耗时，不代表网络RTT、渲染、帧节奏或输入到画面延迟。未做原版实机/截图，不宣称AI启发式达到原版完整等价。

工件：artifacts/fleet-cover-scalars-20260926 下的acceptance.json、performance-analysis.json、rollback.json、performance-gate.json、host-serial-pair-200/result.json及两份V2冻结源图。
