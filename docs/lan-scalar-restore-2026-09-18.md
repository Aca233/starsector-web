# 联机快照标量还原优化（2026-09-18）

## 实际改动

本轮正式运行时代码仅修改 src/network/CombatSnapshot.ts 的还原路径。

- 单条记录、批量记录、数组和普通对象里的标量直接回填，不为每个数字、字符串、布尔值或 null 再调用通用递归解码器。
- Vector2、Ship 引用、typed array、Map、Set、特殊数值标记和嵌套对象继续走原路径。
- 保留已有目标对象/容器和组件原型；目标字段仍按原顺序读取后赋值。
- 标量也继续计入原来的 64 层深度限制，不能因为快速路径绕过深度检查；空记录/空数组的边界行为不变。
- 不修改采集字段、传输格式、协议 21、同步频率、网络预算、物理 dt、AI/伤害规则、过载恢复预算或 SnapshotPlayback / MotionPrediction。没有减少舰船或可见特效。

这项优化作用于房主和客机的**显示世界还原**，不是房主权威物理加速，也不降低快照字节数。

## 采样热点确认

对上一轮已保存的 32 舰 profile，检查固定生产构建的函数文本，确认：

| 构建内函数 | 源码对应 | 累计 self 采样时间 |
| --- | --- | ---: |
| Worker Ws | CombatSnapshot.pack | 1298 ms |
| Worker hi | BinarySnapshot.compatible | 1073 ms |
| Worker B0 | ThreatAssessment.assessThreats | 1230 ms |
| 显示 Se | CombatSnapshot.unpack | 1881 ms（房主显示线程） |

这些是约 36 秒采样中的累计时间，不是单次调用耗时。该场32舰没有复现持续过载，堆内存也多次回落；不能据此认定先前长停顿已经消失、来自内存泄漏或来自某一个函数。

证据沿用 artifacts/lan-stall-recording.json、lan-stall-worker.cpuprofile、lan-stall-display-0.cpuprofile。没有将不同计时坐标的 CPU 时间与 Worker performance.now 直接对齐，也没有把日志末步和稍后采集的最终状态当作同一截点的确定性重放验收。

## 同帧还原对照

在同一个浏览器中载入修改前/后两个内存模块，使用同一依赖图、同一快照、两个独立显示世界。两个候选的快照模块均经 esbuild minify；预热各 80 次，再做 6 轮，每轮各 200 个交替先后顺序样本。每 20 次让出事件循环。

| 已保存的真实快照 | 原均值 | 新均值 | 降幅 | 原 P95 | 新 P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 32 舰，tick 2168 | 4.364 ms | 3.885 ms | 10.97% | 6.7 ms | 6.1 ms |
| 8 舰，tick 3606 | 1.213 ms | 1.103 ms | 9.13% | 1.5 ms | 1.3 ms |

六轮均获得同方向收益。初步非压缩模块采样的 32 舰均值为 3.413 → 3.189 ms，约 6.57%；不把不同运行环境的绝对耗时混合统计。

这是 applyCombatSnapshot 整段的耗时，不含物理、网络、二进制解码或绘制。**不能解读为整体 FPS 提升 11%，也不能与此前尾焰优化百分比直接相加。** 工作区其他任务在验证期间也有编辑；前后快照模块冻结在内存，共用已载入依赖，没有用两个变化中的整版作为性能归因。

证据：
- artifacts/lan-scalar-restore-source.json（修改前和候选源码）
- artifacts/lan-scalar-restore-exploration.json
- artifacts/lan-scalar-restore-validation.json

## 正确性和边界

使用 stdin / 内存 Vite 模块 / Playwright，没有新增测试文件或运行器。

- 2000 个固定种子随机对象：含嵌套记录、混合数组、特殊数值、Unicode、Vector2、typed array、Map、Set 和 Ship 引用；旧/新还原后再次投影完全相等。
- 92 个边界对照：空/稀疏/循环对象投影、单条/批量记录、深度 62～65、非法布局号、错误 values、错误行长度、未知舰船、非法 vector/typed 标记；返回结果或错误信息一致。
- 危险布局键拒绝行为不变。
- 检查已有 Vector2、typed array、Map、Set、数组对象复用，以及数组缩短、Map 旧键移除和舰船引用身份。
- 真实 8 舰和 32 舰帧分别应用后重新采集，前后世界完全相等。
- 两艘苍鹭运行 90 步，12 艘动态舰载机的还原/再采集一致，Ship 和 Vector2 原型保留。

## 隔离生产构建双端运行

构建：artifacts/lan-scalar-preview，build ID **2026-09-18T01:43:55.766Z**。

两个独立浏览器 context，1600×1000，2 真人守护者加每队 15 艘锤头。使用上轮记录的 seed **1584042333**；只在这次临时服务的房间 match 赋值处固定种子，两端收到相同 match。未修改正式服务器源码或模拟规则。

- 使用真实导入/应用配装流程。创建和加入房间通过界面；准备及开战用原协议，不能作为开始按钮全流程验收。
- tick 0 → 3654，首尾 Worker 快照墙钟 60954.5 ms，推进比 **0.99911×**。
- 739 个 Worker 快照；0 pageerror，0 Worker error，0 recovered。
- 约 31 秒刷新客机，loaded=true 且 syncId 改变，重新同步成功。刷新后发送过 W 输入，但此探针没有记录其权威位移/输入确认，不能将其记作操控响应验收。
- 末段两端 HUD 约 55～57 FPS、12～19 Hz 状态、1.00× 战斗速度。这是单次运行观察值，不是 FPS 前后对照。
- 已查看 artifacts/lan-scalar-live.png，显示正常舰船、场景和 HUD，而非空画面。
- 服务端最终采样 tick 3651，随后取客户端记录时 Worker 已到 3654；上面的推进比仅使用同一 Worker 快照列表的首尾点，不混用截点。

证据：artifacts/lan-scalar-live.json、lan-scalar-live-summary.json、lan-scalar-live-log.txt。

本次与上轮只有 seed/配置保持可比，加载、输入和系统负载不完全相同，且新构建包含其他任务的改动。没有把本次成功归因于这一个补丁，也没有将其称作先前停顿的确定性重放。本轮没有重新做百舰物理通过验收；此前百舰超过 60 Hz 预算的问题仍未解决。

## 交付边界

- npm run typecheck、npm run lint、隔离 vite build 均通过，仍有已有的大 chunk 提示。
- 3005 和已有服务均未由本轮重启、替换或关闭；普通 dist 未覆盖。
- 临时 Vite、随机端口联机服务和本任务测试浏览器已关闭，没有新增常驻服务。
- 未修改其他任务的 AI、配装、UI 改动；未做资源 hash/size 人工审计。

下一步仍应分别处理房主快照投影/兼容扫描成本与百舰物理预算，保持固定 match/输入/采样截点，避免用高 FPS 或低 ping 代替端到端时钟验收。
