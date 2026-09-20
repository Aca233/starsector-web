# Steam 二进制字节窗口：phase8（2026-09-20）

## 边界与现状

目标是客机真实接收/应用 60Hz，不是插值帧率。尚未完成；本阶段没有提交、推送、打包、安装或发布，没有修改生涯模式。测试使用已发布 v0.2.5 的 22 舰录制，不用工作区其他任务修改的引擎冒充发布版。

## 实现

- 新 `server/steam/snapshot-byte-window.mjs`：仅对协商 binaryState:1 的二进制状态启用。初始 64KiB、上限 224KiB，有真实字节阻塞需求且收到精确匹配的网络 ACK 才能增长。每个至少 100ms/ACK-floor 的观察轮最多增 16KiB，估计排队超过两个包时乘 0.8，最低 64KiB。
- consumed、过期、伪造、重复 ACK 不参与训练；无效数字/时钟回退清理观察；历史最多 256 条。小到 32 帧都能塞进 64KiB 的包不增长。未知 queueBytes 保持 null。
- 大于 64KiB 的帧即使窗口增长也只能单独传输，不允许与前后小帧叠加，也不能靠此阻塞训练增长。
- 原 JSON/fallback 仍使用 64KiB；原 renderer raw-byte/frame 上限、8 秒超时、可靠发送/基线提交规则不变。不增加重试队列或计时器。
- 单个 binary peer 的 host budget 跟随字节控制器；多人保留原共享总预算。成员模式切换清掉旧估计样本，不清在途字节和 FIFO 预留。
- 新诊断 byteLimit、preparation attempts/discarded/totalMs/discardedMs/maxMs。discarded 仅表示编码后被消费/本地/共享窗口拒绝，不把发送前跳过或 SDK 失败混入。

## 已验证的真实双进程 ABBA

证据：`artifacts/network-latency-phase8-20260920/adaptive-link-verified.json` 与同名 log；脚本 `probe-adaptive-link.mjs`。生产 SteamPeer + codec，经实际 WS/TCP 字节整形；两个变体都用 phase7 二进制，固定版本只关闭新字节窗口。每轮 12 秒、头 2 秒排除，提供 60Hz，不做二次 WS 压缩。所有交付 canonical JSON 精确相等，errors=[]。

| 下行 | 固定64KiB接收Hz | 自适应接收Hz | 固定状态年龄P95 | 自适应状态年龄P95 |
|---|---|---|---|---|
|4Mbps|10.3 / 10.2|17.7 / 18.0|168 / 172ms|224 / 207ms|
|32Mbps|16.5 / 16.4|45.9 / 44.2|85 / 84ms|83 / 83ms|

**4Mbps 的吞吐提高伴随约 35–56ms 状态年龄恶化，不能称为全面降延迟。** 32Mbps 编码后拒绝由 714 次准备中 511 次（浪费约4891ms CPU/12s），下降到 704 次中155/170次（约1554/1682ms）。重复转换/无用编码仍是后续重点。

范围：不是原生 Steam SDK/Valve routing，不是 n2n 实网、浏览器或整场游戏；shim 即时消费，包含额外完整状态比对开销。年龄是准备发送到完整还原校验，不是 input-to-photon。最后一次生产修改是成员模式切换的估计样本清理，本探针不涉及切换，单测另行覆盖。

## 大帧虚拟压力测试

正式脚本 `scripts/check-steam-large-byte-window.mjs`：生产 gateway、单 peer、RTT80ms、32Mbps、2200个持续改变的浮点数、40虚拟秒。

- 健康：60Hz，年龄P95 40ms，峰值在途109243B。
- 降至256Kbps：不断连，稳态1.8Hz，P95 1112ms，最长pong3624ms；字节窗口回落64KiB。
- 降至512Kbps并停顿3秒：不断连，3.4Hz，P95 528ms，最长pong3448ms；回落64KiB。
- 无解码错误/预算越界。**这是合成虚拟控制，不是实际战斗60Hz证据。**

## 未采用的候选

- XOR literal spans：精确还原但线包通常增加3–10%，拒绝。
- 全局硬上限：256KiB仍在骤降断连；224KiB避免断连却将健康9人降到约38Hz/人、总346.4，拒绝。
- delta计算预算耗尽时推迟而非full：配224KiB健康约50–53Hz/人，总467.2、骤降通过；仍牺牲新达到的健康60Hz且证据不足，未入生产。
- 共享较旧anchor：健康吞吐约16–48Hz，更差，拒绝。
- 本阶段未修改生产 LAN sender 的基线或预算回退策略；实验只在 artifacts 中。

## 最终回归（终态进程已确认）

- typecheck=0、lint=0（仅既有生涯脚本警告）；网络174/174。
- Steam **281/284**，三个既有失败仍保留：legacy9人8Mbps→256Kbps骤降；实验Sockets120秒骤降+3秒停顿恢复；实验Sockets9人健康吞吐。未放宽>=40Hz/人、总>420或8秒超时门槛。
- 日志：`typecheck.log`、`lint.log`、`network-suite.log`、`steam-suite-final.log`。
- `source-manifest.json` 仅后台入口打包依赖图/源码hash，write:false，无campaign输入，不是发布包。
- 尚缺：实际桌面双方 n2n/Steam 验收、稳定客机真实60Hz、低带宽年龄回归及上述三项压力失败。不能标记完成或正式发布就绪。
