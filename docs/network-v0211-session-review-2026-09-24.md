# v0.2.11 双端联机日志复核（2026-09-24）

## 结论

**这批日志反映的是三类不同问题，不能合并成“模拟慢/GPU没吃满”：**

1. **多场 LAN 的主要问题是远端状态交付/消费确认滞后**：房主模拟约 60Hz、远端绘制约 60FPS，同时远端完整状态只有 4–7Hz，输入确认的采样 P95 达 521–1082ms。
2. **Steam 是同步可用性问题，不只是低帧率**：10 次重连、随后 1 次断开；两局客机输入序号一直为 0；房主旧确认滞留约 8 秒。
3. **较重场景另有 CPU 开销和 Worker 运行失败**：弱机当房主时快照捕获/编码/应用明显昂贵；3 次 `worker-runtime` 没有异常详情，不能认定根因或声称当前已修好。

本轮只做历史数据复核、新增离线分析脚本及报告；没有修改运行时代码、启动游戏/可见窗口、发布或替换安装版本。日志内容仅作为数据读取。

## 1. 输入与版本

A = 用户提供的 `network23T09-16-02-469Z-f5fb9b78-b6f4-4745-a95f-e45855ba1e54.jsonl`：

- 7,237,852 字节，2,180 条记录，1,300 条战斗 sample；8 个逻辑核、15.42GiB 内存。
- 2 个进程运行段、8 次页面加载、11 个战斗挂载；主要为 guest，A4/A5 为 host。
- SHA-256：`5dda47a0c3dec1af46649fa74f2edfffe457dc8e4a03c41c23fd335c89fd33e4`。

B = 用户提供的 `network-session-2026-09-23T09-08-09-661Z-9bcb5e77-4fd7-40d6-b0e7-dcf164e579db.jsonl`：

- 8,983,169 字节，2,361 条记录，1,352 条战斗 sample；16 个逻辑核、63.79GiB 内存。
- 2 个进程运行段、9 次页面加载、11 个战斗挂载，均为 host。
- SHA-256：`352c987d6945cf0960dbe97dcb4f46bd90058877ee7b56fba015b6f2187e21a1`。

两份均无 JSON 解析错误；appVersion=`0.2.11`，唯一已记录构建为 `2026-09-23T08:55:25.913Z`。诊断写入丢弃计数均为 0，**不等于网络零丢包**。两份均没有 session-end，可能是运行中导出的前缀，不能据此判定程序崩溃。初始 desktop.mode=`local` 不是战斗角色依据，角色取自 battle-start。

字段语义核对使用本地标签 `v0.2.11`（`417a93257cf77abac2b80b80ccf894797e77cfb1`），不切换/回滚当前有未提交改动的工作树。构建时间和 appVersion 不能替代发布二进制的源码哈希证明。

## 2. 统计方法与防误读

- A1…A11、B1…B11 是**本报告按各文件 battle-start 顺序编号**，不是原始日志里可跨页面复用的 battle 数字。
- 常规指标仅取：前台、connected=true、战斗挂载至少 5 秒、首个 ended/battle-failed 之前的 sample。故障分析另外保留启动期及断连样本。没有明确暂停标记，不能声称是纯“未暂停”分组。
- 每个数值字段独立排除 null，记录有效 n；P50/P95 为 nearest-rank 的 **1Hz 遥测采样分布**，不是逐帧或逐次输入的原始尾延迟。各条 flow 窗口独立，心跳转发数据还可能重复，不能把采样条数当独立实验次数。
- HUD RTT 与 input acknowledgementMs 均为 EMA。报告里的“输入确认 P95”特指该 EMA 的采样 P95，不是输入到光子的 P95；也不能从 ACK 中直接减 RTT 得出某一阶段耗时。
- `hud.age` 是距本端上次状态接收的时间，不是包端到端年龄。0.2.11 重同步会 `receivedAt=0, appliedTick=-1`；负 tick 在脱敏时变 null，此时 HUD 的巨型 age 实际近似页面 uptime。脚本只统计有有效 tick 的 age。A1/A2 的常规样本分别有 9/18 条 HUD 无有效 tick，**不把其中数十万毫秒 age 报成真实网络延迟**。
- HUD sim/capture/encode 在重同步时可能是默认 0；Steam 客机这类 0 不证明模拟无成本。`realtimeRatio` 按至少 2 秒的窗口更新，无法排除最后一秒的突然停顿。
- 长任务、Steam worker 统计均做同一作用域内的前后差值，不把累计值当每秒值。若观测到计数回退，脚本返回 null delta，而不跨重置相减。
- 只用同一进程/页面的单调时钟算时长；两台机器 wallTime 仅作标签，不做单向延迟相减。
- `ships` 是 HUD 的舰船实体数组长度，不保证等于初始舰队编成数。独立阶段的中位数不能相加当作单帧总耗时。
- 日志的 GPU 耗时不是 GPU 占用率；Electron CPU 仅保留原值，未据其推算整机占用/单核饱和。旧 allowlist 没保留 multicore 字段，不能推断当时启用的 AI worker 数。

语义来源（均为标签内行号）：

- `v0.2.11:src/network/LanBattle.tsx:168–194,364–371,746–747,987–1015`：采样、EMA、重同步、HUD 值。
- `v0.2.11:src/network/SnapshotPolicy.ts:29–45`：真实 trailing-second 接收率；初始窗口 null。
- `v0.2.11:src/network/host.worker.ts:43–44,239–251`：LAN AI worker opt-in、2 秒推进窗口与成本诊断。
- `v0.2.11:src/network/protocol.ts:393–405`：心跳往返与 EMA。
- `v0.2.11:desktop/network-diagnostic-record.mjs:15–25,65–80`：allowlist、HUD/管线时效、负值/null。
- `v0.2.11:desktop/network-session.mjs:30–40`：CPU 原值、内存单位。

## 3. LAN：快的是房主计算，慢的是向客机交付

以下按顺序、场景实体数、末尾 tick 和相同中继窗口观测推定为对应战局；脱敏日志没有共享 matchId，**不是时钟校准后的逐包配对**。不同端筛选样本可能略有差异。

| 对应战局 | 房主/客机常规样本 n | 房主完整状态 Hz P50 | 客机完整状态 Hz P50（有效 n） | 客机 FPS P50 | 客机输入确认 EMA P50 / P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| B5 / A3 | 241 / 241 | 60 | 7（231） | 60.0 | 308 / 521ms（n=236） |
| B6 / A6 | 47 / 47 | 60 | 29（45） | 60.0 | 82 / 280ms（n=45） |
| B8 / A8 | 114 / 114 | 60 | 4（113） | 60.0 | 467 / 854ms（n=113） |
| B9 / A9 | 292 / 292 | 60 | 17（289） | 60.0 | 166 / 418ms（n=292） |
| B10 / A10 | 188 / 187 | 60 | 5（160） | 60.0 | 485 / 1082ms（n=166） |
| B11 / A11 | 142 / 142 | 60 | 27（139） | 60.0 | 90 / 347ms（n=141） |

这六场房主 realtimeRatio P50 都是 1.000。完整状态不是 FPS，插值/预测绘制不会使 4Hz 权威状态变成 60Hz 到达。

**A8 是最清楚的一段证据（常规样本 114 条）：**

- 中转入口收到约 **59.971Hz**（P50），给该客机入队 **4.513Hz**，消费回执 **4.461Hz**。
- 消费窗口满导致的未发送状态跳过 **55.454 次/秒**（P50）；socket 忙跳过中位数 0。这里是主动跳过未发送快照，不是丢包计数。
- 接收窗口容量与在途数量 P50 均为 **2**；idle RTT 基线 P50 **54.302ms**，同流测得最新 RTT P50 **206.408ms**。
- 客机解析 P50 **1.953ms**，应用 **7.025ms**，绘制 CPU **2.325ms**，GPU **2.460ms**；定时器额外延迟 P95 **19.090ms**。这些成本值得优化，但不能单独解释数百毫秒确认和仅 4Hz 交付。
- 所有 114 条均为 `motionAdmission.status=fallback`、原因 `whole-state-stalled`。A3 的 237 条可用管线样本、A10 的 167 条可用管线样本也全部如此。`features.motion=true` **不代表运动通道实际还在发送**。
- A8 本端显示缓冲 P50 **246.773ms**、P95 **681.746ms**；它可加重视觉拖后，但不等于全部网络延迟。

原始定位例：A 文件第 **1078** 行，B 文件第 **1261** 行。两端均可看到相同中继 flow 窗口（入口60.506Hz、入队4.322Hz、消费3.458Hz），不需要跨机相减 wallTime。

### 中继证据与边界

B 的 n2n 有 190 个 available 样本：187 个 tunnel 报告 `relay`、3 个 `unknown`，未见 p2p/mixed。A 的 224 个 n2n 样本全为 unavailable，**不是“已证实 A 直连”**。这些是隧道聚合采样，不能逐包断定游戏全部流量的路由，也不证明中继服务器 CPU 满载。其 route 来自 packetstats 增量（`v0.2.11:desktop/n2n-diagnostics.mjs:111–127`），不是带宽测量。

**能确定**：状态生产→远端确认之间有显著落差，窗口和旧自动降级策略参与了限制。**不能仅凭日志确定**：n2n 中继带宽、TCP 队首阻塞、压缩排队、ACK 调度各自贡献多少。不要简单放大队列/在途窗口来“提高占用”，这可能让尾延迟更高。

## 4. Steam：主机仍在跑，客机没有进入持续可控状态

- A 的两个 Steam 战斗共有 **10 次 reconnecting**，随后 1 次 disconnected；另一次 LAN reconnecting 不混入 Steam。
- A1 共51条 sample、28条 disconnected；A2 共75条、40条 disconnected。两局所有有输入遥测的样本 `sentSequence=0`，`acknowledgementMs=null`。
- `receivedStates` 从0→4，再从4→11；按挂载区间差值分别 **4 / 7**，不能把第二局累计11当作该局11帧。
- B3/B4 的完整状态中位数均60Hz、realtimeRatio约1.0；对应 Steam peer 的 `oldestAckMs` 峰值 **8106 / 8397ms**，存在 frame-window / wire-byte-window 阻塞。
- B3 快照准备 Worker：prepared 增量205、accepted增量9；B4：prepared增量635、accepted增量10。accepted 是本地准备管线的接纳计数，**不是远端到达率**，但它说明继续猛算准备任务并不自然变成有效交付。
- Valve 原生连接统计显示 interface-unavailable，不能证明 Steam 实际走直连还是中继；LAN 的 n2n 数据也不能移植成 Steam 路由结论。

这应优先按同步批次重置/超时与确认链路问题处理，而不是上 GPU。

## 5. CPU 开销与三个 Worker 故障单独看

### A5：8核机自己当房主，29–36个舰船实体

常规样本 n=89，realtimeRatio P50=1.000，但本端完整状态 P50=18Hz、FPS P50=48.384。

| HUD阶段 | P50 | P95 |
| --- | ---: | ---: |
| 模拟 sim | 7.912ms | 10.307ms |
| 捕获 capture | 13.370ms | 16.323ms |
| 编码 encode | 7.297ms | 10.633ms |
| 状态应用 apply | 16.180ms | 19.313ms |
| GPU绘制 | 7.264ms | 16.993ms（n=88） |

这里支持继续优化捕获、编码、传递和客户端应用；不能只优化物理/AI。GPU 尾部接近16.67ms也不能忽略，但不同阶段/窗口不能简单相加。该场次缺另一个已提供文件中的对应客机战斗，不把它当作WAN对照。

### 故障（初始5秒也保留）

| 场次 | 原始文件行 | 挂载后失败时间 | 最后观测 |
| --- | ---: | ---: | --- |
| A4 | A:723 | 2.616s | 78实体；捕获27.543ms、编码16.957ms；authority窗口maxStep192.980ms |
| B2 | B:225 | 63.728s | 约52–53实体；最后tick3622→3626→3632，HUD模拟升到123.760/124.034ms；窗口maxStep238.330ms |
| B7 | B:1144 | 4.041s | 75实体；realtimeRatio最后0.759；模拟最后22.223ms |

都是 `failureStage=worker-runtime`。没有 Error 种类/具体堆栈，不能区分具体逻辑异常、超载保护或其他原因。尤其 B2 的 realtimeRatio 最后仍1.002，是至少2秒窗口的旧结果，不能否认最后两秒tick推进已骤降。故障结束后的停留样本不参加常规性能统计。

## 6. 与当前工作树的关系，避免重复修旧问题

本轮检查了当前实现，以下内容已存在，并非本次新增：

| 旧日志对应问题 | 当前状态 | 仍需证明 |
| --- | --- | --- |
| Steam重复launch重置快照/同步基线 | gateway 已按 matchId+syncId+minTick 幂等处理 | 实际Steam链路的恢复情况 |
| motion一旦降级整局不恢复 | AutoMotionAdmission已有受限真实消费回执恢复路径 | 旧日志不能验证新路径恢复成功 |
| 低速消费窗口自限 | SnapshotDeliveryWindow已恢复额外流水槽，保留原count/raw-byte/idle-RTT上限 | 不能用专服loopback短测代替这些玩家房主WAN局 |
| 错误只有worker-runtime | 当前已传递白名单故障分类和有限数字堆栈 | 需要新构建实际异常位置，不能回填旧日志 |
| 大场景捕获/应用成本 | 已有显示投影、不可变元数据等本地优化 | 当前完整链路/真实线路净收益未由旧日志证明 |

可参阅已有 `docs/network-regression-fix-2026-09-23.md`。其中38Hz短测是专服/本机场景，不是这次WAN重新测试。最近的多核预算调整针对 **local combat**，未将LAN默认预算一起切换；`VITE_LAN_DISPLAY_DEFINITIONS` 仍需显式 true，不能当作已默认部署。

**下一轮优先级：**

1. 用包含既有修复的同一构建核对 Steam 同步恢复、LAN实际消费Hz/确认尾延迟，以及3类Worker失败的具体位置；不为此擅自打包未完成生涯。
2. 网络方向先针对中继交付、确认触发和恢复闭环，并坚持有限队列；必须分别测“玩家房主”和“专用权威Worker”，不能借一条路径的收益宣称另一条已修复。
3. CPU方向继续减少重复捕获/编码/应用，优先在数据驻留处批量处理；只有端到端时间下降才扩大并行，不以更高CPU总占用作验收。
4. GPU计算是较后续的有条件实验：适合可批处理、可驻留数据、少量回读的算子；这批日志不支持它作为几百毫秒联机延迟/重连的首要修复。保持舰船规模、规则精度、物理频率和安全校验不变。

## 7. 复现与本轮验证

新增：`scripts/analyze-network-sessions.mjs`；机器可读结果：`artifacts/network-v0211-review-20260924/summary.json`（原始日志未复制进仓库）。

在项目根目录执行：

```powershell
node scripts/analyze-network-sessions.mjs `
  'C:\Users\Aca\Downloads\network23T09-16-02-469Z-f5fb9b78-b6f4-4745-a95f-e45855ba1e54.jsonl' `
  'C:\Users\Aca\Downloads\network-session-2026-09-23T09-08-09-661Z-9bcb5e77-4fd7-40d6-b0e7-dcf164e579db.jsonl' `
  --out artifacts/network-v0211-review-20260924/summary.json
```

本轮仅做脚本 `node --check`、该脚本 scoped oxlint 和两份真实输入分析；通过。未改运行时，未重跑全工程类型检查或游戏基准。分析结果与交互式逐战局复核一致；没有对现有优化增益做新的实测声明。
