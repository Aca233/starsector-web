# 联机延迟第四阶段：LAN 匹配密度、Steam 无效编码与大帧瓶颈（2026-09-20）

## 范围

本轮继续同一个 Steam/LAN 低 Hz、延迟与断线目标，没有把“测试小改动通过”定义为整个目标完成。当前未提交、未推送、未发布、未替换已安装版本；未打包生涯。保留 60Hz 物理、完整状态/数值精度、原 8 秒保护及全部消费/在途窗口限制。

上轮为代码与证据进展。本轮先重新检查当前工作树、AGENTS.md、现存失败门禁和历史实验，避免再次采用已被否决的扩大在途窗口方案。不使用子代理。

## 采用 1：LAN 更密集的字节匹配索引

`src/network/LanBinaryDelta.mjs` 保留 16 字节最短复制片段，但索引步长从 8 改成 4，找回原先遗漏的 offset=4 mod 8 的相同片段。

不变：SLD1 格式、接收端、两个 hash 候选、65536 个槽、最多 2MiB 状态、至少 50% 原始节省才使用 patch 的规则、每次广播最多两次/4ms 的原编码准入预算、5 帧消费额度。不删任何字段，不改变对局玩法。

### 端到端验证

在应用到生产源码**之前**，以独立发送/接收进程、真实压缩 WebSocket 和本机 TCP 字节限速代理做 8→4→4→8 对照。每档四轮各 12 秒；基础 RTT60ms、32 舰完整二进制录制、目标提供 60Hz、消费额度 5。所有实际交付状态逐字节一致，8 轮 measurement errors 为空。

|链路档位|stride8 接收 Hz|stride4 接收 Hz|stride8 状态年龄 P95|stride4 P95|
|---|---:|---:|---:|---:|
|12Mbps|23.4 / 23.4|24.4 / 24.4|176.17 / 176.99ms|170.68 / 170.93ms|
|32Mbps|41.8 / 41.0|41.6 / 41.6|68.75 / 67.93ms|67.62 / 67.92ms|

12Mbps 的接收率提高约 4.3%，平均逐轮 P95 降约 5.8ms（3.3%）；这是受控快照年龄，不是用户真实 ping/input-to-photon。32Mbps Hz 的差异在轮间波动内，**没有证据宣称明显提升 Hz**；总下行字节平均少约 4.7%。

代价不能隐藏：12Mbps 的发送端编码均值约 2.42→2.64ms，32Mbps 约 2.11→2.26ms。索引 CPU 略增，换来受限链路较小的包；不是免费的优化，也不是从 20Hz 一跃到 60Hz。原 per-broadcast 工作准入上限未放宽。

新增测试以 offset=4 mod 8 的 16 字节岛状片段构造字节精确往返，旧实现退回 full，修改后 patch 成功；原随机变长、损坏、跳帧、重连与边界测试保留。离线 matcher 脚本的 production 标签/替代实现生成逻辑已更新，避免以后将 stride4 错标成 stride8。

原始结果：`artifacts/network-latency-phase4-20260920/stride-shaped.json`。旧/新 sender 与 matcher 快照留在同目录；复跑时不再通过已修改的生产导入假扮旧版。

## 采用 2：Steam 只在需要候选时压缩 full

`server/steam/snapshot-delta.mjs` 的 `SteamSnapshotEncoder.prepare` 仍立即完成大小/节点/深度/状态校验、canonical JSON 与 hash，只把 full 信封编码/压缩推迟到第一次读取 target.full，之后各 peer 共享同一缓存。缓存归该 target 所有，不受 encoder.clear 或下一目标替换影响。

为什么有意义：实验 Sockets 的 offerState 会对每个房主状态调用 prepare，即使还在等待 stream/发送机会、该状态随后会被新状态替换。之前被替换的未发送状态也提前完成了一次 full 压缩；这是可避免的 CPU 工作。此次不是更改 ACK 或假装状态已经交付。

边界：**legacy Steam sender 当前会立即选编码候选，所以这项主要改善实验 Sockets 的 offer/coalescing 路径，不能冒充默认 Steam 的已证实提速。** 选中状态的实际 wire 字节、完整信封与 hash 均保持不变；大于现有 codec 限制的 fallback 不因本项改变。

### CPU 验证

`scripts/bench-steam-deferred-state.mjs`：读取三份真实 32 舰完整状态；只有第一份符合当前 codec 限制，另外两份明确计作不适用，未裁剪舰船/字段来凑门槛。以该完整录制构造 120 次 offer、30 次选取，先预热，再 eager→deferred→deferred→eager，所有被选中的完整 payload 逐字节比较。

- full/packed 编码次数从每轮 120 降为 30。
- 每次 offer 平均 CPU：eager **21.74 / 21.67ms**；deferred **10.01 / 10.11ms**。
- 选中帧仍需原来的完整处理成本，P95 仍约 24–25ms；没有声称单个选中帧快了一半。
- 这是 CPU 微基准，不是 Steam/网络更新率，不是连续实际战斗，也不能覆盖两份超过 codec 限制的大状态。

新单测还通过真实 session 验证 100 个等待 stream 准入的状态只对最终选中的那一份做 full 压缩，最终完整状态仍相同；覆盖 target 共享、旧 target、clear 后缓存所有权。

## 新发现：高负载 Steam 退回全量，直接放宽限制并不可取

当前 Steam 结构增量只接受 canonical JSON ≤512KiB、≤65536 节点。

|完整录制|JSON 字节|节点|
|---|---:|---:|
|snapshot-32-0|470837|46139|
|snapshot-32-1|524484|52288|
|snapshot-32-2|833645|84670|
|frames32/600|867980|88258|

91 帧连续的完整 32 舰记录全部不适用当前结构增量，因此走原 full JSON 路径。这个发现解释了一个代码层面的高负载带宽限制，但**不能直接认定为用户那次两舰/13KB 待确认的 Steam 断线原因**。

仅在 data-URL 隔离模块中把处理限制改为 1MiB/131072 节点，做旧→候选→候选→旧的原帧完整 wire 编码/解码/精确 JSON 往返；生产常量未改：

|指标|原限制|放宽候选|
|---|---:|---:|
|91 帧中 eligible/delta|0 / 0|91 / 89|
|平均应用 wire 字节|143976|81380|
|编码均值（两轮）|5.14 / 5.11ms|33.08 / 32.96ms|
|解码均值（两轮）|6.30 / 6.47ms|17.30 / 17.24ms|

候选少约 43.5% 字节，但编码约慢 6.4 倍、解码约慢 2.7 倍；仅编码就超过一个 60Hz 帧预算。**没有上线放宽 codec 限制**，也没有把字节节省偷换成延迟下降。

下一步的大帧实现必须避免重复 JSON 树递归和每帧 full 压缩，并验证与现有 LAN 二进制/字节增量的复用路径、能力协商、边界及 CPU 成本；不能继续单纯放宽阈值。旧的大帧 fallback、当前协议和流量额度仍保持不变。

## 否决的其他候选

同一小状态结构差分，保留全部精度的压缩试验（99 帧）：

- 当前 float-plane + deflate1 约 1279.7B；deflate6 1272.4B，收益不足 1%。
- zstd5 1179.2B，约少 7.9%；需要新 wire/协商，仍不足以单独解决现有吞吐门槛，没有启用。
- 可精确还原的帧内数值预测：固定 stride2 1248.9B、adaptive 1261.7B；收益小且增加 CPU，没有启用。所有候选先验逐字节还原，没有量化坐标。

结果留在 compression-summary.json / prediction-summary.json。它们仅是离线候选，不是交付修复。

## 验证与尚未完成

新实现先红后绿：定向 codec/session/anchor/LAN 测试 **86/86**。

最终第四阶段验证（不含后续会话日志改动）：
- 网络回归 **94/94**（network-final.log）。
- Steam 完整套件 **239/242**（steam-verified.log），仍只有原三项失败：legacy 9人链路骤降、实验 Sockets soak+停顿吞吐、实验 Sockets 健康9人每端40Hz。
- 最初 steam-final.log 的4项失败包含“prepare立即压缩”的旧观察时点断言；已改为真正选择发送时检查共享候选只压缩一次，未放宽任何吞吐门槛。
- 共享 cache 独立回归 **19/19**。
- 8文件 oxlint **0 diagnostics**；TypeScript 检查 exit 0。
- 隔离 Vite 主入口构建 exit 0，55.57秒；不复制 public、不含 campaign 入口、不覆盖 dist，不是发布包。原资源 URL 与大 chunk 提示仍保留。

原 3 项 Steam 门禁和用户双端真实实测仍需继续处理；当前改动不授权稳定发布。没有以局部通过缩小总目标，也没有操作 Steam 账号、邀请、真实路由或防火墙。所有基准只使用本机临时 loopback socket/子进程，结束后清理自己创建的句柄。
