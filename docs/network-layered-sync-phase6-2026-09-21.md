# 分层同步 Phase 6：按需抓取、弹体传输与否决的弱网回退

日期：2026-09-21。**目标未完成，实验分层路径仍默认关闭；没有提交、推送、打包或发布，没有修改生涯模式。**

## 原版依据与边界

依照 `network-projectile-stream-source-notes-2026-09-21.md` 中的本机原版 Missile / MissileRenderDataAPI 和现有 identification 源码对照，补齐被动敌我标识所需的 teamId / isPlayer / renderTargetIndicator，接通 WebGLIdentificationPass 和动态纹理闭包。没有修改模拟、碰撞、制导、伤害或玩家操作规则；不是原版实机/像素等价验收。矿雷实际仍由 mineSystem 提供，继续保留在完整世界中。

## 本阶段保留的实现

1. **按需求抓取完整世界**（独立权威服务器）：此前只要有人在线可见，Worker 每次整帧返回都会获准再次抓取，即使所有中转接收窗口都已阻塞。现在保留一个精确的 snapshot IPC tick，检查资源准备、可见性、socket、消费额度、未完成 chunk 任务、分层 detail 间隔与基线引导条件；至少一个接收者能够使用新帧才归还。真实消费回执即时唤醒，一个 16ms 有界检查覆盖普通 socket drain 和间隔到期，不保存旧 payload，不伪造接收额度。
2. 物理/input/motion/visual 独立于上述完整抓取。Worker 专属 IPC motion 的声明 tick 必须与解码 tick 一致，不再绑定到被刻意扣留的旧完整帧 ±120 tick；**网络客机/客户端房主不能选择这个例外**，原来的校验保持。原有进度心跳、卡死超时、恢复时声音丢弃、最终帧和关房释放仍有测试。
3. 完整世界的可选紧凑变体仅省略 projectiles，携带 `projectileVisuals:1`；仅给已经协商、有独立通道且在相同 sync 最近实际消费了弹体流的端点。完整版本仍保留，过期/断线/重同步自动退回；ships/crafts/beams/mineSystem 等不省略。
4. 单独跟踪完整弹体世界 tick，防止一个更晚的、但不包含弹体的 bulk 帧遮蔽独立视觉流。标记过紧凑帧却含非空 projectiles 会被拒绝。
5. 弹体传输在 Node 房间侧每发布压缩一次，不按收件人重复压缩；helper 有界重组/解压，单份未完成基线最多 128KiB。分片传输收据不能授予基线就绪；最终 CRC 解码/消费仍由浏览器负责。错误长度、未知压缩、错误数据、跨头部拼接不得获得消费状态。
6. 修复一次真实 helper 测试暴露的**令牌耗尽后没有后续发布就无法继续基线**的问题：根据令牌恢复/写通道情况有界重新检查，而不是扩大 credit 或伪造 ACK。helper 生命周期/通道终止清理部分基线，普通 primary JSON 不清理。3/4/5 个真实 loopback helper 测试均覆盖大分片基线期间插入普通 JSON。
7. 补足持久日志 allowlist：captureDemand（等待原因、持有时间/tick、归还/扣留次数）、视觉分片/消费/预算/在途指标、紧凑 bulk 次数及接收弹体实体/tick。剥除 payload、身份、nonce、worker 对象与任意文本；此前仅在运行中对象上的视觉指标不能穿过日志规范化，现在有回归测试。

## 性能证据——同时保留负面结果

工件目录：`artifacts/network-stream-20260921/`。

### 实际权威 Worker，22 舰，12 秒短测

同一构建/种子，打开独立 motion，未打开独立弹体流。接收端需求通过延迟归还 IPC 模拟，**不是完整网络、中转或真实渲染压力测量**。

| 抓取需求 | 物理 Hz | 完整抓取 Hz | motion 总帧数 | Worker 报告 CPU ms（含启动） |
|---|---:|---:|---:|---:|
| 每次立即归还 | 60.01 | 59.88 | 710 | 6265 |
| 每次等待 200ms | 60.03 | 4.68 | 717 | 6109 |

`capture-demand-eager.json` / `capture-demand-paced.json`。只证明完整抓取可以随需求减少而不把物理/motion 锁为 5Hz；不是刻意把玩家游戏降到 5Hz。CPU 变化很小且没有重复统计，**不能据此声称 CPU 大幅改善或实际客机 60Hz**。

### 五玩家、一个共享 4Mbps FIFO、60ms RTT、22 舰录制回放

每客机独立 Node 进程，真实 WS/压缩/TCP 字节；排除 warmup，无丢包。输入是回放 echo，不是原生输入到呈现时间。未计原生 capture/游戏 apply/renderer。

| 方案 | 关键位置 Hz | 弹体 Hz | 完整世界 Hz | 完整世界 age P95 |
|---|---:|---:|---:|---:|
| 原 motion+chunk bulk | 52.7–53.7 | 与 bulk 同步 | 约 1.14 | 867–991ms |
| 压缩独立弹体 + 可选紧凑 bulk | 48.1–49.0 | 9.9–11.0 | 0.29–0.43 | 约 1.9–2.5s |
| 仅把视觉 flight 减半的反例 | 51.0–51.6 | 3.9–5.0 | 0.29–0.43 | 约 1.5–2.4s |

文件 `layered-phase6-before.json`、`layered-phase6-compressed.json`、`layered-phase6-halfvisual.json`。**后两项不合格，不默认启用，也没有采纳简单减半预算作为修复。** 不能把弹体 Hz 单项上升写成整体延迟下降。

`projectile-bulk.json` 单独测得去掉重复弹体后 ordered delta 压缩平均 25434B →13941B，但不包含独立视觉成本，不是总带宽节省率。

### Steam 实验 Sockets 探针

本阶段完整 Steam 初跑 324/326，原有两个失败仍在：120s shared collapse+3s stall 后每端 >6Hz、9 个健康客机每端 >=40Hz 且总和 >420Hz。

尝试 224/192/208KiB 房间上限、拥塞时均分 per-peer flight、把 guest receipt 等待从40ms降到0。这些组合有的修复单项吞吐/公平性，但另一些会在 256Kbps 突降下断开，或低带宽启动/状态年龄回退，见 `steam-flight*-phase6.log`。**全部否决并还原本阶段对 sockets-flight-budget / sockets-session 的试验修改**；没有放宽8秒保护、降低原测试门槛或保留退步补丁。这两个源文件相对本轮开始无改动。

## 最终门禁

- 网络 workflow：**335/335**，`network-gate-phase6-final.log`。
- 原生 capture/renderer 输入：**10/10**，`native-capture-phase6.log`，1915 弹体样本、14629 draw 调用，GPU stub；完整/紧凑回退、纹理闭包与被动标识对照通过。
- 实际无头 WebGL：通过，`visual-renderer-phase6.log`。空场3316阈值像素→弹体4965→移除3316；被动标识像素能量差62863；pageErrors空，权威对象/随机数不改动。不是实际 GPU FPS 或原版像素等价。
- App TSC、focused oxlint：通过（输出日志为空，命令 exit 0）。
- capture demand + 日志专项：36/36，`demand-diagnostics.log`（已包含在完整 workflow 中）。
- Steam完整：**324/326，未全绿**，`steam-gate-phase6.log`；其后否决的实验修改已还原。否决改动还原后 flight/session 专项47/47（steam-session-restored-phase6.log），没有把单项通过冒充完整 Steam 验收。

## 必须继续的根本工作

1. motion、完整 detail、弹体必须有共同房间级预算与可证明的进展保障，而不只是三套各自加额度；完整世界仍包含 HP/flux/护盾/命中等时效信息，不能任其滞后2秒。
2. 优先把上述及时战斗状态与关键位置共同送达，并补齐 beams/矿雷等显示依赖。不能用本地推测命中替代权威结果。
3. 视觉协议还需减少稳定外观重复与每帧动态列开销，否则4Mbps多人无法同时满足所有流。需要测同一录制的总 wire bytes /关键输入年龄 /完整世界年龄，而不是单项包大小。
4. Steam公平性/拥塞切换仍待实质修复，LAN实验还没有Steam对应通道；默认关闭直到全量门禁与同场多流性能成立。
5. 实际多机 n2n/Steam、高负载整局原生模拟+接收apply+真实GPU联测仍未完成。当前不能承诺“所有客机60Hz”或“彻底解决延迟”。
