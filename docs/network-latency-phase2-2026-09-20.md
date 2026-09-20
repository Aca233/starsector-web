# 联机降延迟：第二阶段验证（2026-09-20）

状态：仍在优化，**未达到“Steam/LAN 在所有测试场景稳定联机”**。以下是源码修改和可复现测试，不是已经安装到双方电脑的修复版。未提交、推送、打包或发布；没有加入生涯、配装或房间工作流改动。

第一阶段方案和附件分析见 `network-latency-fixes-2026-09-20.md`。新增的两份 15:23 附件已分析，是 Steam legacy-p2p，不是 LAN；16:30 两份日志当前保留部分则全部是 LAN。它们不能合并成一个网络样本，也不能通过不同机器墙钟相减推导单向延迟。

## 本轮保留的生产改动：Steam 输入确认合并

修改 `server/steam/gateway.mjs`、`server/steam/reliable-queue.mjs`：

- 客机在 `open` 明确声明 `cumulativeInputAck: 1`，房主才启用；没有协商的旧端保持逐包精确 ACK。
- 连续移动/瞄准输入仍在收到时立即执行。只合并回执，目标等待不超过首条待回执的 32ms，实际在到期后的收包/轮询时发送；不推迟输入应用，不给开火/离散动作去重。
- 带离散动作的输入和控制消息立即确认，同时覆盖同一可靠 FIFO 上更早的输入。后续输入不会延长首条回执的 deadline。
- 仅输入发送窗口支持累计释放；必须先匹配当前窗口中确实存在的 ID，再依 Map 插入顺序释放。因此可处理 uint32 回绕、跳号、先前精确 ACK 留下的空洞。
- 旧 nonce、旧连接、非房主、重复/未知/未来 ID 均不能释放当前信用。状态 ACK 和 renderer 消费 ACK 仍是相互隔离的精确 ID 窗口。
- 房主输入 ACK 仍只走 Reliable，不恢复之前产生多人窄带回退的“双向不可靠副本”。8 秒保护、状态/消费窗口、60Hz 物理步长均未改变。

### 效果及边界

真实 `SteamGateway` 在确定性共享上行模型中，9 客机、RTT 300ms、8Mbps 的前 12 秒，房主 ACK 封包字节从 **310,932 B 降到 145,507 B，约减少 53%**。这是 ACK 流量，不是全部网络流量，更不是用户现场延迟下降 53%。A/B 使用第二阶段前的 `gateway.mjs.before` / `reliable-queue.mjs.before`，两组均包含第一阶段修复。

原门槛仍通过：3 人健康链路每端 60Hz、9 人健康链路每端至少 40Hz、9 人从开始就处于 512Kbps 的公平性。动作和输入顺序不变。

**9 人从 8Mbps 突降到 256Kbps 仍会断开。** 模型中的共享可靠队列峰值约 360KB，下降前已获准的在途状态和随后返回的旧信用仍进入同一 FIFO；32KB/s 排空这些字节就可能超过 8 秒。减少回执不能撤销已经提交给 SDK 的可靠状态。该复现不是用户“两艘船、一个朋友”现场根因的证明；不能因此擅自延长超时或强制启用未通过门禁的实验 Sockets。

## LAN：从离线字节大小转向真实压缩 WS 限速回放

新增 `scripts/bench-lan-shaped-link.mjs`：

- 发送端与接收端是两个 Node 进程，各有独立事件循环/压缩池；每轮结束只清理该轮的 socket 和子进程。
- 使用真实 `ws`、生产 RFC7692 设置、生产增量 sender/receiver、完整 SWB1 解码和逐字节相等检查。
- 重放相同的 32 舰 91 帧录制；外层 seq 递增，但录制内容循环，不是连续运行的游戏模拟。
- TCP 字节限速代理各方向加入 30ms；接收 ACK 也走代理，不走 IPC 捷径。消费额度固定为原有的 5 帧，目标提供 60Hz。
- 下行分别 1,500,000 和 4,000,000 B/s，上行 1,000,000 B/s。每档旧→新→新→旧，各 12 秒，丢弃前 2 秒统计。
- 记录实际压缩字节、发送阻塞/消费额度跳过、编码/恢复/解析耗时和接收状态年龄。状态年龄来自同一台机器跨进程的高精度时间，不是用户两机墙钟。

最终输出：`artifacts/network-latency-phase2-20260920/shaped-lan-isolated-final.json`，8 轮 exit 0、逐字节验证通过、measurement errors 全为空、峰值在途数始终不超过 5。

|配置|旧版接收 Hz（两轮）|ordered 接收 Hz（两轮）|旧状态年龄 P95|ordered P95|
|---|---:|---:|---:|---:|
|12Mbps / 基础 RTT60ms|19.7 / 19.7|23.4 / 23.4|224.9 / 223.8ms|183.3 / 176.3ms|
|32Mbps / 基础 RTT60ms|41.4 / 41.1|40.8 / 41.3|74.6 / 75.0ms|70.9 / 70.4ms|

12Mbps 档平均接收率约提高 **18.8%**，平均逐轮 P95 约降低 **19.9%**。32Mbps 档接收率基本相同，**没有证据声称达到 60Hz 或 Hz 提升**；总下行字节约少 14%，状态年龄略低。统计的毫秒是快照到达年龄，不是 input-to-photon 或实际 LAN ping。

第一版 benchmark 共用一个进程，在 32Mbps 档 ordered 约低 2%；拆进程后此差别没有稳定复现，不能把它当成已确认的生产回退。最初拆进程日志还有测试退出时主动 terminate 引发的压缩取消记录；已将 measurement errors 与清理阶段分离，最终 8 轮重新运行并保留旧记录，不篡改旧结果。

## 下一步方向的实测，而非盲目修改参数

增加 `scripts/bench-lan-byte-matchers.mjs`，在不修改生产算法、不改变 SLD1 的情况下，比较 16/8 字节最小匹配与 8/4 字节基准索引步长：

- 当前 16-byte/stride8：压缩均值 58,804 B。
- 8-byte/stride8：58,459 B，大小收益很小且恢复多约 0.16ms。
- 8-byte/stride4：55,556 B，恢复多约 0.13ms。
- 16-byte/stride4：55,617 B，编码多约 0.16ms，恢复近似不变。

所有候选在该录制上无损恢复，stride4 约少 5.4–5.5% 字节，但**尚未证明实际 Hz/排队收益，也没有默认启用**。这为下一轮优化提供具体候选，而不是降低物理频率、删实体或扩大窗口。仍需其它规模/随机数据和端到端验证，防止为省带宽增加高负载 CPU 压力。

## 验证和复现

- `scripts/check-steam-cumulative-ack.mjs` 从 5 项扩展至 **20/20**，覆盖协商、旧端、32ms期限、动作屏障、重连nonce/ID碰撞、回绕、重复、字节上限以及状态/消费ACK隔离。
- `scripts/check-steam-input-queue.mjs` 现在显式拒绝可选 fast ACK，验证可靠 fallback；不再依靠抛断言被可选发送的 catch 吞掉。
- 新累计 ACK 测试已加入 `package.json` 的 `steam:check`，Windows 发布 CI 沿用该命令，未降低任何已有门槛。
- 首次第二阶段完整 Steam 回归 **214/217**（当时累计ACK文件为5项），3失败与v0.2.4及第一阶段相同。20项边界版本全量复跑为 **229/232，仍仅这3项失败**，日志为 `artifacts/network-latency-phase2-20260920/steam-final.log`，没有新增失败，也没有跳过或降低门槛。
- 当前 Windows CI 同组网络/诊断/发布/LAN回归 **88/88**，日志为 `artifacts/network-latency-phase2-20260920/network-final.log`（没有把第一阶段额外选取的98项混报为本次命令结果）。
- 改动的生产/测试/benchmark 文件 oxlint JSON 输出 0 diagnostics；第一阶段 app tsc 与隔离主入口构建已通过，本阶段没有修改前端 TS 或资源。

```powershell
node --test scripts/check-steam-cumulative-ack.mjs scripts/check-steam-fast-ack.mjs scripts/check-steam-input-queue.mjs
npm.cmd run steam:check
node scripts/bench-lan-shaped-link.mjs artifacts/lan-delta-20260919/frames32 artifacts/network-latency-phase2-20260920/shaped-lan-isolated-final.json
node scripts/bench-lan-byte-matchers.mjs
```

尚需：解决骤降可靠队列与实验 Sockets 的既有失败，完成双方相同新 build 的真实 Steam/LAN 战斗回测（包括低/高负载）。当前已安装的 0.2.4 不会因工作区源码改变而自动获得这些优化。
