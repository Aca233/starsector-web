# LAN 主机火控查询共享：验收与性能（2026-09-25）

## 结论
保留候选。将此前仅在本地 Worker 启用的独占查询域登记接到生产 `src/network/host.worker.ts` 的每次 init。生产增量只有一个 import、一处登记及所有权注释；未改共享算法、100单位阈值、通用反射审计、精确火控/碰撞/发射、部署上限、60Hz目标或流控协议。未实现GPU、并行火控或新对象池，未发布。

修改前来源及生命周期审计见 `lan-fire-query-source-notes-2026-09-25.md`。冻结基线已经包含此前本地 Worker 优化和现有联机 WIP，不以 git HEAD 作为旧版本。

## 正式配对：真实 LAN 主机 Worker
独立无头 Edge 153.0.4234.48，16逻辑CPU，COI=true，seed917；120艘 Dominator，两队各60，battleSize3200/每队1600 DP。真实 deployment.rows 确认120艘全部署、0后备，没有绕过上限。保留真人席位的中立控制，不发输入事件 fixture。

150步预热，随后180步测量；每步1/60，前后版本逐tick交替先后顺序，只有正在调用的 Worker 推进。前330步相当于5.5秒模拟时间，并非长期/任意混编战斗样本。无查询计数器、无 profiler。

测试构建只将主机的 setInterval 启动替换为手动单tick驱动；仍调用真实 init/start/step/CombatAuthority.advance/snapshot/消费回执。没有改其资格判断或权威推进实现。默认LAN AI owners关闭，两臂都明确检查为serial。

| 指标 | 修改前均值 ms | 修改后均值 ms | 变化 | 修改前 P95 ms | 修改后 P95 ms |
|---|---:|---:|---:|---:|---:|
| 模拟（原生 lastStepMs，含控制应用） | 27.8991 | 21.8700 | **−21.61%** | 34.195 | 27.135 |
| 主机 step（含显示快照采集/编码/发送） | 54.1808 | 45.6339 | **−15.77%** | 63.480 | 52.415 |
| 调用往返（含主线程二进制解码） | 62.7021 | 53.4199 | **−14.80%** | 72.470 | 63.915 |
| 其中二进制解码 | 8.3215 | 7.5576 | −9.18% | 12.570 | 11.010 |

模拟 P95 −20.65%，往返 P95 −11.80%。往返已包含解码，不能再加一次。编码/解码实现没有改动，不能把其波动另算成算法收益；解码最大值由16.43升至17.55ms，尾部并非全面改善。6个连续30tick块的模拟与往返均值均下降；它们是同一次运行的相邻块，不是独立重复试验或显著性证明。没有重测主场景挑选好数字。

**范围限制：** 往返不是网络RTT或输入到画面延迟；这里没有socket/relay/真实客机、渲染、实际GUI显示恢复耗时，也没有测普通墙钟计时器的吞吐。正常计时器只做下述功能验收。21.87ms仍高于60Hz的16.67ms模拟预算，不能宣称已达到稳定60帧。

## 正确性与真实可达性
- 集中 typecheck 通过；生产文件和修改脚本 lint 通过。测试依赖复用现有运行时，未安装新包。
- 正式配对 **331个显示包**（初始+330tick）严格递归比较所有非墙钟字段，含音效、ACK、部署、完整显示数据；typed-array/ArrayBuffer逐字节比较。只排除 simulationMs/captureMs/encodeMs/realtimeRatio/combatRate 五个墙钟诊断字段。
- 每tick比较两个权威RNG检查点；**12个完整权威快照+隐藏火控/RNG检查点**（初始及30..330每30tick），均一致。使用既有 real-worker-audit，而不是只凭浅层摘要判断完整状态。
- 单独短计数探针：120舰/3tick，新版登记1、roster3、batch360、targetHits355827；旧版未登记。stop→重新init→推进1tick，新版登记累计2、batch累计480，证明新世界也接入。计数插桩时间不作性能数据。
- 航母短探针：24艘 Legion/Onslaught 主舰，实际168单位、全部主舰已部署；3tick为roster3、拒绝72、batch0，重建后仍回退（累计拒绝96）。完整权威/隐藏/RNG与显示数据前后一致。这仅验证回退正确性，**没有测LAN航母长窗口性能或声称其获益**。
- 修复既有五队场景中过期的接收器导入，改用生产 createLanDisplayWorld/applyLanDisplaySnapshot。正常 setInterval 的真实主机产生0–180tick共181帧，权威/显示/可见均为5、没有页面错误；没有输入事件fixture。
- 最后检查 **309个生产模块**与正式测量后版本哈希相同；相对基线只有 host.worker.ts 不同。宿主最终 SHA256：`94fe6cb5cd7e576ac46cfed255d024b16da15aafe02a248f6b31975ba7cff891`。

## 工具与证据
入口：`scripts/check-multiteam-worker.mjs --fire-query-pair`，配对实现：`scripts/lib/host-fire-query-pair.mjs`。默认入口仍运行原五队场景，接收器已迁移到当前显示协议。

证据位于 `artifacts/lan-fire-query-20260925/`：
- `baseline-sources.json` / `candidate-sources.json`：修改前后冻结图；`host.worker.before.ts`保存原有WIP。
- `target-120/result.json` / `module-hashes.json`：正式逐tick样本、汇总、源图哈希。
- `activation-reinit/result.json` / `carrier-reinit/result.json`：短探针；不把其计时当性能。
- `acceptance.json`：变化率、连续块、计数与最终源图检查。
- `typecheck.log` / `lint*.log` / `normal-timer.log`：验收记录；`.tested`文件保存正式运行所用脚本。

最初 activation 探针的旧字段 `roster.reserve` 实际是内部 reinforcements 数组长度（118，包含已部署舰），不代表118艘未部署；此字段在后续测试脚本修正为 storedReinforcements，并新增真正的 deployed/reserve 状态断言。该首个短探针使用JSON值对照；正式性能与航母检查已使用更严格的递归/字节比较。不要把早期探针描述成其尚未执行的严格比较。

## 下一步
当前收益来自减少主机串行重复查询，而不是提高线程占用率。模拟预算仍超标，且快照采集/编码/接收二进制解码合计仍明显；应先按真实联机场景拆分这些耗时，再决定值得并行的只读批处理。舰载机/模块等未获查询共享收益的情况，需要单独证明更细的安全域，不能简单取消回退。
