# n2n / LAN 延迟排队优化与诊断（2026-09-20，phase 5）

## 状态及边界

本轮**未完全解决低 Hz**，没有提交、推送、升级安装或发布新版本。只修改网络流控与桌面日志，不改生涯、玩法、物理步长、渲染质量、字段精度或超时门槛。与原版玩法/界面无关，无需更改原版规则。其它任务的引擎/配装/生涯改动均保留原状。

既有日志分析见 `network-session-analysis-v025-2026-09-20.md`：接收端高负载可在约 60FPS 下只有 5–7Hz，原生 WS pong 也升至数百毫秒；不能把问题全部归咎于主线程或显示方式。

## 用户补充 n2n 后的实测证据

经官方 n2n Management API 和 3.1.1 `edge_management.c` 核对后，仅向已运行 edge.exe 所属 **127.0.0.1 UDP 管理端口**发送只读请求；没有查询社区、密钥或命令行，没有请求 stop/verbose/订阅，没有改网卡、路由、防火墙或重启 n2n。

- 管理接口报告版本 `iris`。初次 `edges` 返回一个 `pSp` 对端；官方源码将 pending/通过 supernode 转发的对端标为 `pSp`，已知直连对端标为 `p2p`。
- 初次读取：`p2p tx/rx = 0/0`，`super tx/rx = 751995/791915`，`last_p2p = 0`。
- 新诊断器实读的两次脱敏样本见 `artifacts/network-latency-phase5-20260920/n2n-local-observation.json`。约 5 秒间隔新增 relay tx=1，P2P 仍为零。**不是带宽压测**；第一次 peer 列表为空、第二次有一个 relay peer，因此同时保留 peer 分类和流量增量，不能用空列表推断直连。
- TAP IPv4 MTU 实读为 **1290**，IPv6 为 1500；虚拟网卡显示的 1Gbps 不是实际隧道吞吐率。没有盲目更改 MTU。

**证据范围**：这是当前 n2n 进程/整个隧道的观测，不是之前两份日志的历史路由证据，不是某场游戏专属计数，不证明中继容量/丢包率。不能由此声称中继就是唯一瓶颈，也不能保证 P2P 一定快。

官方资料：
- https://github.com/ntop/n2n/blob/dev/doc/ManagementAPI.md
- https://github.com/ntop/n2n/blob/3.1.1/src/edge_management.c

## 已接入的游戏侧改动

### LAN 消费速率反馈窗口

`server/SnapshotDeliveryWindow.mjs` + `server/LanStateCredits.mjs`：

1. 只用通过原有精确 membership 验证的累计消费 ACK 统计交付帧率，不将应用 ACK 冒充线路 RTT。
2. native pong 相对 idle RTT 增加 `max(80ms, 0.75*idleRTT)` 后，根据实际交付速率缩小在途帧窗口；不会超过原有 idle-RTT ceiling。
3. 目标为 `ceil(idleRTT * deliveryHz / 1000) + 2`。两个额外槽覆盖串行化和接收调度；固定两帧方案实测损害 4Mbps 吞吐，已放弃。
4. 已发送帧不丢弃、不伪 ACK；窗口变小后等待旧帧排空，下一次只发最新可发送状态。输入、控制消息、60Hz 物理步长和原超时保护不变。
5. 加入迟滞，避免一个干净 pong 就重新灌满大窗口；交付速率恢复后才逐步恢复原额度。300ms 基础 RTT 的带宽下降/恢复也纳入测试。
6. 诊断增加 `idleCapacity`、`deliveryHz`。观察历史/队列有界；无新 payload 缓存或重传定时器。

**只接入 LAN**。Steam 已有不同的窗口/共享上行机制，不能把本地 WebSocket RTT 当成 Steam 远端 RTT，未盲目套用。

### n2n 自动会话日志

`desktop/n2n-diagnostics.mjs`、`desktop/main.mjs`、`desktop/network-log.mjs`：

- 桌面 LAN 模式每 10 秒追加 `n2n-sample` 到原有单会话 JSONL；非 LAN 不启动新查询。
- Windows 每分钟最多一次隐藏的只读 OS 端口发现，只接受 edge.exe 所属 loopback 端口，最多 3 个。无局域网扫描，无提权，无可见窗口。
- UDP 客户端也仅绑定 loopback。只允许 `info/edges/packetstats/timestamps` 四个 read 命令；超时、响应体积/行数、并发和关闭均有界。
- 保留 peerP2p/peerRelay、收发总计、间隔增量、trafficRoute（unknown/idle/p2p/relay/mixed）。首次采样、超时、计数回绕、重启、过期/倒退时间不制造零丢包或无限带宽。
- 接口不可用记录 unavailable；未发现记录 not-detected。计数不代表游戏流量、吞吐字节或丢包。
- 收包处即丢弃身份字段；写日志再次白名单过滤。没有 IP/MAC、社区、密钥、设备名、端口号或原始错误文本。
- 不替换已有整个启动到退出的日志生命周期，退出时停止/取消采样。

## 基于已发布 0.2.5 的真实数据验证

使用干净 detached v0.2.5（`ef043ecef4547321929dd0ffb0eee47074d08b13`）的真实引擎录制，而不是工作树中其它任务修改的引擎：22 舰、固定 1/60、生产 HostSnapshot / projectile columns / puff recipes / muzzle events，241 个连续完整帧，平均原始 SWB1 约 197KB。

独立 Node sender/receiver，通过本机限速+延迟 TCP 代理运行真实 WS/permessage-deflate，native ping 与消费 ACK 同样经过代理；完整快照逐字节校验。60ms 基础 RTT、60Hz offered，ABBA 四次/速率，各 10 秒，前 2 秒不计 steadyHz。**这不是实际 n2n、物理双机、游戏 FPS 或输入到显示测试。**

最终结果：`artifacts/network-latency-phase5-20260920/n2n-feedback-final.json`。

| 整形链路 | 原策略接收 Hz | 新策略接收 Hz | 原状态到达年龄 P95 | 新 P95 |
|---|---:|---:|---:|---:|
| 2Mbps | 5.875 / 5.875 | 6 / 6 | 984 / 983ms | 576 / 580ms |
| 4Mbps | 12.5 / 12.5 | 12.625 / 12.75 | 455 / 470ms | 253 / 254ms |
| 32Mbps | 46 / 46.5 | 46.375 / 46.875 | 53 / 53ms | 52 / 54ms |

这是慢链路下约 **41–45% 排队状态年龄改善**，不是把低 Hz 修到 60。32Mbps 两种方案均未达 60Hz，也不能宣称“正常链路已满帧”。一次约 10 秒网络回归在该 ABBA 期间并行执行，可能有 CPU 噪声，尤其不能把健康链路小幅差异当确定增益。

虚拟时钟模型另测 60/300ms 路由、2/4Mbps 降速及恢复，后续恢复原窗口并达到 >=58Hz；仅为机制验证。300ms/2Mbps 由大窗口突降时，旧积压排空仍可能很慢，不能宣传即时消除延迟。

## 未采用的编码试验

- 通用树差分 + 稳定 ID 匹配 + float64 XOR 残差预测：连续帧压缩从约 35.8KB 降到 22.5KB，但低 Hz 对应跳 12 tick 时仅 42.8KB→41.5KB；还增加约 4–5ms 恢复成本（未含所有入口/重编码成本）。对当前拥堵症状收益不足，**不接入、不发布**。
- 更高 deflate 压缩级别/上下文/zstd：当前数据只获得微小改善或变大，不作为解决方案。
- 固定两帧窗口：减少队列但 4Mbps 吞吐 12.2→10.5Hz，拒绝。
- 录制中单帧的 projectile 和 FX 都有大量动态值；当前每秒 60 个完整精度端点在该高负载样本下仅压缩状态就需要十几 Mbps。因此单改 timeout、Hz 显示、TCP_NODELAY 或压缩级别不能保证慢中继上的 60Hz。下一阶段需要可验证的状态/事件重建或发送结构改进，而不是丢精度/视觉内容来刷数值。

## 验证结果与未完成项

- 最终网络 gate：**151/151 通过**，含新流控、旧 LAN 二进制/Worker/relay/heartbeat/log 测试及 12 个 n2n 检查。
- n2n 测试含真实本机 UDP 回应、错误/部分回复、超时、身份脱敏、隐藏端口发现契约、重启/计数重置、关闭取消与写入会话日志。实际已运行 n2n 的只读发现/采样也验证成功。
- `npm run lint` 成功；4 条现有生涯脚本警告未修改。网络修改的语法与 diff whitespace 检查通过。
- esbuild 依赖图验证 backend 自动包含新流控模块且不包含 campaign；desktop 入口解析通过，原打包 glob 自动包含 n2n 模块。**没有实际打包**。
- 重跑完整 `steam:check`：**252/255 通过，3 个既有失败仍在**：9 客户端骤降到 256Kbps 导致8秒保护触发；实验 Sockets 的骤降+停顿恢复吞吐、9 客户端健康吞吐未达门槛。没有降低门槛、延长断线超时或冒充 Steam 已修好。
- 仍需实际两台桌面 n2n / Steam 验收。安装中的 0.2.5 不会因源码修改自动更新。

## n2n 实机下一步

优先让双方确认 **活跃流量确实从 pSp/super 变为 p2p**，而不是只测虚拟 IP ping 或看虚拟网卡速率。检查 NAT/双重 NAT、两端 n2n UDP 的针对性防火墙/映射；CGNAT/对称 NAT 等环境不一定能直接打洞。不能直连时再比较可控、距离合适且上行充足的中继。必须按实际 n2n/路由器配置操作，不自动开放宽泛防火墙、不任意改社区/密钥、不把换中继说成必然解决。
