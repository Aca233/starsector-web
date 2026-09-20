# Phase 7：Steam 复用无损参考增量；客机 60Hz 瓶颈复核（2026-09-20）

## 边界与结论

- 目标仍是实际客机接收/应用 Hz、状态新鲜度和可靠联机，**没有达到或宣称 60Hz 已解决**。
- 仅后台、无头工作；未改变 n2n、网卡/防火墙/路由；未调用 Steam 账户或操纵桌面。
- 没有改引擎物理、展示精度、输入顺序、断线时间、在途窗口上限或测试通过门槛。没有修改、暂存、打包或发布生涯模式。
- 已安装发布基线仍是 v0.2.5。这一阶段没有提交、推送、打包、安装或发布；测试通过不等于用户已拿到新版。

## 先核实 LAN 的 46Hz 证据

前一阶段 `probe-production-link.mjs` 在真实 Windows 定时器/TCP 代理上注入了固定 `recordNetworkRtt(60)`。60ms 只是代理配置的双向传播延时，**不是该运行时实际空闲 native ping RTT**。因此固定 5 帧窗口的结果不能独自证明“游戏的编码/解码性能上限是 46Hz”。

新探针 `artifacts/network-latency-phase7-20260920/probe-credit-clock.mjs` 在发送状态前，按生产同流 ping token 规则测量三次空闲 ping；没有改变生产 `LanStateCredits` 或任何网络门槛。相同已发布版 22 舰录制、32Mbps、四次 ABBA、每次 6 秒：

- 空闲 ping 实测约 74–92ms，初始容量为 6，而不是注入 60ms 所得的 5。
- 关闭参考：46.5 / 56.25Hz；打开参考：54.25 / 54.75Hz。
- 第一轮随后较小的有效 native ping 又令容量下降；没有强行锁住更大窗口来提高结果。
- 这是测试校准与归因修正，不是新的 LAN 性能修复，也不能外推到用户实际 n2n 链路。原始 phase6 数据不覆盖、不删除。

记录：`calibrated-link.json`、`calibrated-link.log`。

## Steam 生产变更

新增 `server/steam/binary-snapshot.mjs`，集成 `packet-codec.mjs`、`gateway.mjs`：

1. **显式双端协商**：guest open 提议 `binaryState:1`，host opened 确认后 guest 才接受；同连接重复 opened 不重置基线。旧端或未确认端继续原 JSON/tree 通路。
2. **限方向**：SWSP 的 flags 位 1 表示 binary-state，只能是 data；不能作为 guest input/control。先检查成员/nonce，旧连接迟到的包不得破坏新连接。
3. **完整状态契约不变**：SSB1 40 字节包头含 canonical JSON 字节数及 SHA256，内部为 SLD1 → SWB1/SWF2。先完整修正、CRC、解码、大小及 SHA256 校验，再把原完整 JSON 发给本地浏览器。
4. **只复用无损参考压缩，不复用 LAN RTT 流控**：预测参考不直接显示或 ACK；双方还原完全相同的浮点/字段值。Steam 原生片大小 32KiB、64KiB peer 字节窗口、shared host budget、8 秒保护、network ACK 与 renderer consumed ACK 的区分都不变。
5. **有界**：完整二进制基线最多 2MiB；wire envelope 为 2MiB + 36 + 40 字节。每广播共享一次 parse/encode/hash、相同基线的 patch 与压缩结果；不同基线沿用每广播 2 次/4ms 启动准入预算。完整回退压缩在同一目标内共享，不因九个不同基线压九次。
6. **只提交成功发送**：SDK 接受全部片后才提交原始目标基线。窗口拒绝、准备后未发送、单片/部分片拒绝、重复/过时 choice 不得改变基线。周期全量最多间隔 10 秒，换 match、修复请求、重连为全量。
7. **兼容回退**：额外/重排 envelope key、孤立代理项、prototype-looking 字段、超大/特殊数据或小状态走旧通路，不删除数据或放宽旧 tree 的 512KiB/节点预算。
8. **诊断**：线上 `format` 区分 binary-full/binary-delta，增加 binaryFullStates/binaryDeltaStates/motionDeltas/budgetFallbacks，继续白名单过滤身份、战场内容。`savedBytes` 仍是旧 tree 的累计统计，不能当作新二进制总节省量。

`binaryState:1` 绑定 phase6 的 motion reference v1 字节定义；改变参考算法需要新的协商版本，不能保持 v1 静默修改。

## 已发布版 22 舰录制：CPU/字节 ABBA

使用 `artifacts/network-latency-phase5-20260920/frames22`，原始录制来自干净的 v0.2.5 `ef043ecef4547321929dd0ffb0eee47074d08b13`；**未使用工作区其他任务修改的引擎**。

`probe-steam-binary.mjs`，实际 SteamPacketCodec 分片/压缩与原/新 snapshot sender/receiver；每个结果与原 canonical JSON 完全相等。stride 1/3/10 分别保留原录制每 1/3/10 帧，非量化或删字段。

| 录制采样 | 原平均线包 bytes | 新平均线包 bytes | 原 encode 均值 | 新 encode 均值 |
|---|---:|---:|---:|---:|
| stride 1 | 60,982 | 21,934 | 13.6–14.1ms | 9.6–10.0ms |
| stride 3 | 66,732 | 26,743 | 13.6–13.9ms | 9.5–9.7ms |
| stride 10 | 77,031 | 31,612 | 13.4–13.8ms | 9.6–9.9ms |

stride 1 平均接收还原（含分片、解压、完整状态校验及 canonical 输出）：7.9–8.2ms → 6.7–6.9ms。
原 stride 1 有 32/241 帧走 legacy full，新路径为 1 full + 240 delta，无数据差异。
这些是 CPU/应用层字节测试，不是实际 Steam 网络 Hz，线包不含 Valve/IP 开销。

记录：`steam-binary-codec.json`、`steam-binary-codec.log`。

## 两个进程 + 实际字节整形：生产 SteamPeer 发送窗口 ABBA

`probe-steam-link.mjs` 使用生产 SteamPeer admission/ACK/window/budget、真实 codec 和实际 WS/TCP 字节传输，两个 Node 进程，各轮 8 秒，offered 60Hz，前 2 秒不计 steady。WS 不再做二次压缩；SDK 替身承载 SWSP，配置传播 RTT 为 60ms，不硬注入 ACK RTT。

| 整形下行 | 原接收 Hz | 新接收 Hz | 原状态年龄 P95 | 新状态年龄 P95 |
|---|---:|---:|---:|---:|
| 4Mbps | 3.5 / 3.5 | 10.67 / 10.33 | 290 / 290ms | 165 / 157ms |
| 32Mbps | 7.0 / 6.83 | 16.17 / 16.67 | 101 / 101ms | 92 / 87ms |

所有交付 canonical JSON 与录制完全一致，errors=[]。没有将更大的 offer 数或插值计成接收帧。

**限制**：不是原生 Steam SDK/poll/Valve routing，不是 n2n/浏览器/整场游戏；renderer 消费在这个探针中即时完成，但包含额外完整状态比对成本。年龄来自同一台机器各进程的单调时钟映射，是准备发送到接收还原/校验，不是 input-to-photon。单 peer 结果不是九人实测；时间与字节数据不替代压力门槛。

### 这次定位到的下一处阻塞

32Mbps 下仍只有约 16–17Hz，不能归因成物理带宽不足：新包在跳帧后约 25–30KiB，现有 64KiB gate 通常只容纳两帧，而完整确认环路约 100ms。即使 frame window 尚有名额，也会在 wire-byte-window 拒绝。网关为了判断当前包能不能放下，会先进行编码，因此还有大量“准备后因字节被拒”的 CPU 工作。

这给出下一步的明确方向：将准备成本和字节准入分开归因、继续减少状态重复处理/每包字节，并研究有证据支撑的 pipeline 方案；**不能直接把 64KiB 改大、延长 8 秒保护或把 16Hz 插值冒充 60Hz**。共享链路骤降已有失败，贸然扩大可靠队列会使它更严重。

## 验证与仍未完成

- 新单测覆盖校验、协商/旧端、顺序、特殊数据 fallback、missing-base、nonce、native refusal、network/renderer ACK 分离、共享缓存和广播计算预算。
- 原 input queue 回归现通过实际 sender 类型读取“已提交”基线/计数，保留原先全部断言；没有把 prepared cache 当作已提交基线。VM 补充 Node 标准 TextEncoder/TextDecoder 以运行共享二进制模块。
- `npm run typecheck` / `npm run lint` 已通过；lint 只有既有生涯脚本警告，未修改这些文件。
- 网络 gate **174/174**，`network-suite.log`。
- 最终 Steam 全量 gate **270/273**：新增加的 18 项全部通过；仍失败的是同三项：9 人共享上行 8Mbps→256Kbps 骤降、实验 Sockets 120 秒骤降+停顿恢复、实验 Sockets 9 人健康吞吐。详见 `steam-suite-final.log`。没有放宽测试门槛，也不把 targeted green 当作全量通过。
- `source-manifest.json` 记录源码 hash 及后台打包依赖图：包含新模块、无 campaign 输入；只是检查，没有生成发布包。
- 未完成：稳定客机实际 60Hz、已有三项 Steam 共享骤降/实验 sockets 门槛、双方桌面 n2n/Steam 实战验收、符合边界的正式发布。目标保持 active。
