# Phase30：保留有效的字节处理替换，拒绝无收益捕获管线（2026-09-21）

## 结论
**已落地并默认启用的是接收/编码基础设施的字节处理优化，不是“全员稳定60Hz”或弹丸事件流完成。** 保留客机预测+主机权威；不降低目标Hz、不减少战术信息、不改精度/伤害/轨迹/AI规则。

## 默认路径实际改变
- BinarySnapshot预检改为有界显式栈、局部剩余计数和固定tag宽度表，仍先验证后分配世界对象图；常用字典key和标量数组减少通用分派。
- SnapshotMotionReference跳过非相关子树时内联标量叶子，仍检查每个map key、字节/节点/深度预算；严格二元vector不用每次建立回调/Set；运动span使用固定对象形状和共享模板key列表，算式/顺序不变。
- LanBinaryDelta CRC从slice-by-4改为slice-by-8，保留尾部和原CRC校验、错误重置。只多4KB模块级固定表，没有跨帧缓存。
- LAN和Steam共用BinarySnapshot的修改自动生效。CRC/运动参考的量化收益来自下述LAN管线；不能把它照搬成Steam实测收益。

## 明确拒绝的工作
原计划先替换弹丸逐行捕获+再压列：v1/v2均未过事先门槛。**已从生产CombatSnapshot删除实验imports、开关、options、逐字段判断，不是留下一个关闭的热路径。** 实验仅由测试plugin注入，9项正确性检查仍可复现；负结果、bundle、轨迹均保留。

扫描v1..v6也保留FAIL；v5/v6某对只减少14.93%/14.87%，没有四舍五入当成15%。v7和去除实验hook后的最终源码均通过既定门槛。没有放宽门槛或只保留最快的一轮。

## 配对性能：最终冻结bundle
原生22舰、seed917、132–185个真实弹丸；每对同一权威状态，A/B→B/A→A/B。每对30帧预热+120测量；物理推进在计时之外。链路为完整capture→binary→可靠有序motion delta→deflate6→每副本inflate/decode/apply。逐帧完整binary、delta和压缩字节完全相同，并对还原后的世界做字节对照。

| 离线接收副本数 | 接收恢复+decode P50降低（三对比率中位） | 完整管线总CPU P50降低 | 最差单对总P95比率 | wire比率 |
|---|---:|---:|---:|---:|
| 3 | 20.1% | 8.7% | 0.969 | 1.000 |
| 4 | 20.2% | 11.5% | 0.916 | 1.000 |
| 5 | 20.1% | 11.4% | 0.913 | 1.000 |

门槛：每对decode P50比率≤.85；每副本数3对总P50比率中位≤.95；每对总P95≤1.10；wire≤1。最终全部通过。P99/max并非处处改善，原始分布保留，不作“所有卡顿消失”推断。完整管线是**房主生产+多个离线接收副本CPU之和**，不是一台客机的帧耗时，更不是RTT或Hz。

## 实际默认入口验收（不冒充性能A/B）
无头Chromium、同一电脑loopback、RTX5060 / D3D11、1280×720、22舰、15秒测量；测试不操作用户桌面。3人与5人均通过现有预测/开火/联机检查、800ms房主主线程阻塞期间持续发布和客机ACK推进、同房间重连；无page error或battle failure，清理完成。

| 实际浏览器客户端 | 主机权威物理Hz | 完整状态Hz | 客机关键运动Hz | 画面FPS |
|---|---:|---:|---:|---:|
| 3 | 59.523 | 18 | 58–59 | 约60 |
| 5 | 59.459 | 29–33 | 54–55 | 37.5–39.4 |

**完整状态Hz仍未达到60；5个浏览器共用一台机器时画面也未达到60。** 这些数字不能与Phase29不同时间/源码的52Hz直接作A/B，也不能说优化让18Hz变成60Hz。关键运动频率、物理Hz、画面FPS、完整状态Hz必须分开。下一步真正移除持续全量状态复制仍未完成；也没有证明真实Steam/n2n或5台电脑的延迟改善。

## 正确性与回归
- scanner新增6组差分测试：全部256tags和截断长度、2500轮确定性畸形/随机输入、depth/node/长度预算、危险key、UTF-8、所有截断前缀、buffer/view所有权、CRC与Node zlib及旧实现对照。
- 冻结旧scanner实现与测试plugin还原源码SHA完全一致（3模块），不以手写近似实现当基准。
- TypeScript、network:check、network:check:shared、Steam342项回归通过；hook清除后再次TypeScript、默认capture7项和实验9项通过；定向lint exit0。
- 新命令：npm run network:check:scanner；npm run network:benchmark:scanner。benchmark门槛失败退出非零，不只打印FAIL。

## 并行修改与边界
浏览器冻结584个非生涯源码文件。测试期间以下非本轮AI/舰船文件发生变化，未覆盖，也不能把冻结测试当作它们最新内容已验收：
- src/engine/ai/multicore/AuditedCombatMulticore.ts
- src/engine/ai/multicore/CombatMulticore.ts
- src/engine/ai/multicore/CombatWorkerBudget.ts
- src/engine/simulation/Ship.ts

本轮4个生产codec文件没有漂移。全部报告以冻结bundle/浏览器源码为证；最终工作区混合了其他任务新改动。没有修改生涯模式，没有提交、推送、打包或发布。未新增依赖、未启用GNS、未声称主机不再模拟弹丸。

## 证据位置
- 源码依据与预设门槛：docs/network-native-projectiles-phase30-source-notes-2026-09-21.md
- 机器可读总报告：artifacts/network-stream-20260921/phase30/validation.json
- 最终性能/每帧明细/同源bundle：artifacts/network-stream-20260921/phase30/scanner-benchmark-final/
- 真实浏览器结果：artifacts/network-stream-20260921/phase30/browser-3/result.json、browser-5/result.json
- 每轮负结果、CPU profile、冻结源码、源文件漂移及reference-integrity均在同目录保留。
