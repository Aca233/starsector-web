# 原生 AI 阶段复用舰船名单（2026-09-18）

## 已落地的运行时修改

仅修改 src/engine/simulation/CombatEngine.ts。

原来的每次 updateShipAI 都会让 findHostile 和 TacticalWorld 分别读取 this.ships；它们会再次展开主力舰、模块树、舰载机和无人机，再过滤撤退对象。百舰情况下，这部分主要是在反复构造相同成员/顺序的数组。

现在只在经过现有 nativeThreatPhase 检查的**同步、串行原生 AI 阶段**内，共用一次读取的名单，并作为可选参数传入 updateShipAI / findHostile。

- 只共享成员和顺序；每次查敌仍重新读取存活、可见性、阵营、当前目标与距离。没有缓存目标、射界、幅能或 AI 决策。
- 每步重新生成，舰队计划生成之后才捕获；生成/部署、撤退、舰载机和模块状态在下一次阶段读取时可见。
- 不修改公开 ships getter 的“新数组”行为，也不增加持续缓存或需要异常清理的实例字段。
- 非原生 AI/系统钩子、替换的查敌或舰队计划方法、派生引擎或覆盖的舰队 getter 使用原路径。
- 现有多 Worker batch 路径不共享该名单，保留其原有提交与回退逻辑。
- 未修改 dt、战斗速度、数量、AI 策略、伤害规则、可见特效、网络协议、SnapshotPlayback / MotionPrediction 或恢复预算。

## 最新百舰采样与否决实验

首先在当前源码中，用 seed 2232494901、2 真人守护者 + 98 锤头、真人空闲输入，确认初始 100 艘全部部署。900 个真实固定步的 CPU 采样均值约 26.94 ms/步（含 profiler 开销，不能与以下无 profiler 对照直接比较）。

热点包括 distanceTo、武器更新、signedAngle、ThreatAssessment，以及 updateShipAI / findHostile 下的 combatShips / assemblyShips 重建。对应证据为 artifacts/lan-hundred-current-physics.json 和 .cpuprofile。

试过对 combatProfile 的重复角度缓存纯 score/offset，并保留每个候选的顺序与容差取舍。2000 个变化场景结果相同，但冻结百舰状态、六轮各 70 组的均值为 1.271 → 1.287 ms/100 次 profile，未得到可靠收益。因此**未合入**，ShipCombatProfile.ts 保持该实验之前内容。不要把这项实验描述成已完成的加速。

证据：artifacts/lan-arc-score-source.json、lan-arc-score-exploration.json。

## 同源码、同输入的完整模拟对照

将当时 src 下的脚本/JSON 依赖冻结到内存，不覆盖其他任务的源码；前后仅切换 CombatEngine 的本次片段。watch 关闭，每轮使用独立浏览器上下文。每场 1200 步，无渲染/网络；每步为两个真人应用相同空闲控制，然后执行 fixedUpdate(1/60)。计时包含这两个控制调用，汇总剔除前 60 步。

| 顺序 | 平均 ms/步 | P95 ms/步 |
| --- | ---: | ---: |
| 前 | 22.741 | 33.6 |
| 后 | 20.277 | 30.1 |
| 后 | 21.009 | 32.0 |
| 前 | 22.540 | 33.6 |

合并均值 **22.640 → 20.643 ms/步，减少约 8.82%**。两次候选均在 1200 步内使用了阶段内名单，不是因为优化门槛没命中而“正确”。

四轮均初始部署 100 舰；tick 60、300、600、900、1200 的完整序列化投影相同，共 20 个记录检查点。这不是每个私有字段/每一步的形式证明，也不是实时联机通过。20.64 ms 仍高于 60 Hz 的 16.67 ms 预算。

证据：artifacts/lan-phase-roster-source.json、lan-phase-roster-frozen-sources.json、lan-phase-roster-differential.json。

## 边界对照

仍使用 stdin / 内存模块，没有新建测试文件或测试运行器。

- 替换 findHostile：180 步、1080 次调用与原版一致，均维持原来的两个参数调用；阶段共享关闭。
- 自定义 ships getter：180 步、4683 次读取相同；阶段共享关闭。
- 替换 planFleetAI：180 次调用相同；阶段共享关闭。
- 额外六组各 240 步、每组七个快照检查点，前后完全相同：
  - 三队 14 舰。
  - 两艘苍鹭与 12 艘动态舰载机。
  - remnant_station2，15 个附属模块和 26 艘舰载机。
  - 初始 2 舰/8 艘后备，tick 30 部署；共享从部署后才启用。
  - AI 回调覆盖（阶段共享关闭，回调次数保持 240）。
  - 原生阶段内部主动抛出异常，恢复调用后状态仍一致，无跨步名单遗留。
- 上述六组还在 tick 90 撤出一艘、tick 120 新增一艘；未使用旧成员列表跨步缓存。

这些覆盖的是列出的扩展入口与场景，不能宣称穷举了所有任意对象猴子补丁。

证据：artifacts/lan-phase-roster-boundaries.json。

## 生产构建真实双端：百舰仍失败

用同一冻结脚本依赖构建前/后版本，Worker 也通过单独的 worker.plugins 注入冻结源码；额外检查两个 host Worker 分别不含/含新的名单门槛，防止只替换主线程而误把两个相同 Worker 当 A/B。

- 前：artifacts/lan-phase-roster-baseline-preview，build 2026-09-18T02:12:10.602Z，host.worker-Ce4uF7rH.js。
- 后：artifacts/lan-phase-roster-preview，build 2026-09-18T02:12:41.887Z，host.worker-CNPXtE3_.js。

两个独立浏览器 context、每端 1600×1000，实际创建/加入房间、导入/应用配装；准备/开战通过原协议触发，不能作为开始按钮的界面验收。临时服务固定 seed 2232494901，两端接收同一 match；没有改正式服务器随机数逻辑。

四场前/后/后/前均从二进制初帧确认 **100 舰全部 deployed**，结果：

| 版本/次序 | 过载失败时权威 tick | 当时 simulationMs |
| --- | ---: | ---: |
| 前 1 | 73 | 31.13 |
| 后 1 | 192 | 21.51 |
| 后 2 | 156 | 22.15 |
| 前 2 | 156 | 22.43 |

四场都触发两次恢复后中止，只产生 tick 0 初始快照，没有连续显示帧；0 pageerror。不能把后版本“多撑了几个 tick”称为实时通过，也不能用不同截点/冷热状态下的 diagnostics 计算一个新的提速百分比。百舰权威计算仍无法持续满足 60 Hz，这仍是未完成项。

## 32 舰生产回归及观测限制

候选构建、seed 1584042333，2 真人 + 30 AI；初始 32 艘全部部署。

- 同一 Worker 快照列表从 tick 0 到 3646，用时 60968.7 ms，推进比 0.99669×。
- 745 个快照，0 Worker error，0 recovered，0 pageerror；末段 HUD 两端约 56 FPS、12～16 Hz 状态、1.00× 战斗速度。
- 约 30 秒刷新客机，服务器 loaded 恢复，syncId 更新。
- 尝试发送 W，但房主探针未记录到非零 W 输入；只能确认刷新同步和后续空闲输入确认号推进，**不能记作操控恢复验收**。下一次应显式核实页面焦点、前台状态与 controls-ready 后再验证位移。
- 性能采样结束后的大 ArrayBuffer 导出还在运行中继续推进了模拟：服务器末次记录 tick 3634，较后导出的最后帧为 3712。上述速度只使用同一快照列表首尾时间，不混用这些截点。
- 已查看截图，舰船/场景正常，但截图是在大数据导出之后，出现“客机离线/AI 接管”提示。这可能是采集干扰或再次同步，现有日志不足以确认；不能宣称提示正确或已经定位成正式运行时 bug。下轮用轻量事件和焦点记录复现，避免大数组导出扰动页面/临时服务。

证据：artifacts/lan-phase-roster-live-0.json 至 -4.json、lan-phase-roster-live.json、lan-phase-roster-live-summary.json、lan-phase-roster-live.png。

## 构建、服务与剩余工作

- typecheck、lint 通过；修正冻结构建工具对 ?raw 的加载处理后，两份隔离生产构建成功，既有大 chunk 警告仍在。首次失败来自诊断 loader，不是游戏源码构建故障。
- 当前工作区 CombatEngine 与经过对照的候选一致；未覆盖其他任务的改动。普通 dist 未覆盖，3005 及现有服务未被本轮重启或关闭。
- 临时 Vite、随机端口 LAN 服务和本轮浏览器均已关闭；没有新常驻入口。
- 未执行资源 hash/size 人工审计。

剩余：百舰热路径继续降成本；刷新后的实际焦点/操控及离线提示轻量复现；真实跨机/高延迟/多玩家长时验证。未将总目标标记完成。

## 后续轻量 UI / 刷新操控核对

额外用同一候选构建运行 2 真人 + 6 锤头的轻量场景，不导出大数组、不依赖服务器 loaded 就立即按键。

- 真实点击客机“准备”和房主“开始战斗”按钮，成功进入对局；该场的开始按钮流程得到直接验收。AI 数量仍通过原 options 协议设置，不能扩展为整套房间编辑界面验收。
- 刷新后等待服务器新 syncId/loaded，并额外等待客机 HUD 从“同步中”变为“网络”（本地 controls-ready）；显式前置页面、在画布上取得操作焦点。
- 刷新前 W 按住 1 秒：权威 throttle=1，有 keys=1 的客机输入，位移约 114.17 单位；松开后 throttle=0。
- 刷新后重复：权威 throttle=1，确认序号推进，有新的 keys=1 输入，位移约 51.11 单位；松开后 throttle=0。
- 两端保持 connected/loaded，0 pageerror，无 Worker 恢复/错误；轻量采样中同步完成后没有遗留“离线 / AI 接管”提示。

前一次探针只等服务器 loaded，没有等客户端 controls-ready，也未明确获得输入焦点，因此不能用其零输入记录判定游戏操控故障。此次按完整用户流程通过，**不等于确定复现了前一次 32 舰末尾的离线提示原因**；原规模/采集干扰仍需分别排查。这里未为尚未证明的 bug 修改输入门禁。

证据：artifacts/lan-focus-reconnect-probe.json、lan-focus-reconnect-probe-log.txt。
