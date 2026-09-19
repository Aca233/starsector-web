# Steam Sockets 原生队列指标与房间级发送准入（2026-09-19，实验路径）

## 当前状态与用户问题

目标仍是桌面 Steam 联机高延迟后断开连接。本轮把 v012 原生实时指标接入连接所有者，再实现所有客机共享的发送准入器，并修复持续 60Hz 更新导致多分片快照永远发不完的风险。**默认 SteamGateway 还未接入实验路径，不能宣称玩家掉线已经解决。**

完整回归 **152 项：151 通过、1 失败、0 跳过**；同次输入队列 1470 断言通过。原有九客机、300ms RTT、共享 FIFO 上行在虚拟 12s 从 8Mbps 降到 256Kbps 的用例仍在 **20.168s** 以 `1013 / Steam link stalled` 关闭客机。没有删除该测试、降低断言、延长 8 秒超时或替换冻结发布包。

## 原生实时指标：不能误用连接级 queue time

新增 `server/steam/sockets-status-v012.mjs`，固定只绑定 `SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus`，绑定不调用接口／初始化 Steam。`sockets-lifecycle-v012.mjs` 可注入此 reader，通过 `sample(ticket)` 使用：

1. 检查 session 仍 open、ticket 是当前 lease、连接已 ready、peer 仍是当前房间成员。
2. 重新读 native connection info，比对当前 tag、Steam 身份、listener、Connected 状态和认证／加密标志。
3. 只有仍归当前 owner 的句柄才允许读取指标。原生 tag 改变时只 forget 本地关联，不查询／关闭外来复用句柄；原生读取异常不变成“零积压”。

固定 SDK v1.63（`494c2d680b9e47bbc369496b57568f44ef2f6796`）的 C++ static_assert 证明：

| 布局 | 大小 / 偏移 |
| --- | --- |
| SteamNetConnectionRealTimeStatus_t | 120B |
| state / ping | 0 / 4 |
| quality local / remote | 8 / 12 |
| outgoing / incoming bytes per second | 20 / 28 |
| send-rate estimate | 32 |
| pending unreliable / reliable / sent-unacked reliable | 36 / 40 / 44 |
| connection queue microseconds | 48（多 lane 时不可用于调度） |
| SteamNetConnectionRealTimeLaneStatus_t | 64B × 3 |
| lane pending unreliable / reliable / unacked | 0 / 4 / 8 |
| lane queue microseconds | 16 |

SDK 明确说明：**多 lane 时连接级 `m_usecQueueTime` 无效，必须读取各 lane 的估计排队时间**。测试故意把 aggregate 字段设为 int64 最大值，证明实现没有误用它。

- pending 是未上网的消息，也可能包含重新排队的可靠重传；sent-unacked reliable 是已发送但未确认的可靠数据，两者不能简单混为一个“未发送队列”。
- 返回值失败、坏 buffer、负计数、非 Connected 状态都返回 unavailable，不伪造空队列。
- 未知 ping、零容量估计、无效 float、负／无法精确表示的 lane 时间用 `null` 表示；不会把未知值变成无限容量或零延迟。
- connection 总数与 lane 计数不同时采用较大者作为保守 pending bound。没有把 per-connection capacity 相加当成房主总带宽。
- 只解码大小、速率、质量和时间等标量；没有读取 IP、原生 debug 字符串、Steam 身份到 diagnostics。

## 房间级准入器

新增 `server/steam/sockets-room-pacer.mjs`：`SteamSocketRoomPacer({sample}).tick(sessions, now)`，最多九个 peer。

| 约束 | 当前实验值 |
| --- | --- |
| 每个 peer 原生采样间隔 | 至少 25ms |
| 房间待发 state 准入上限（包含已有 control 占用） | 32KiB |
| 房间总准入上限（给控制预留空间） | 48KiB |
| 单 peer state / total 准入上限 | 16KiB / 32KiB |
| 指标未知时单 peer 累计 bootstrap control | 最多 16KiB，不能无限续填 |
| state 的 lane 延迟准入门槛 | 两条 state lane 都已知且 ≤250ms |
| 单次 peer grant / native 包 | 最大 8256B / 一个包 |

关键行为：

- 在同一 tick 中遍历**所有 peer 的 control 机会**后，才允许任何 state；不是先让第一位玩家把自己的状态额度花完，再处理后面的玩家输入。
- 在两次 native sample 之间，把实际 native 接受的 bytes 记到 shadow debit，避免反复使用同一个“零 pending”样本给九个连接各放一次完整额度。
- fresh metrics 恢复后按当前 native pending 校正 debit。读取失败则保留上次已知队列和之后的新发送，不重置为零；未知时只允许有限控制启动，不发状态。
- 每 tick 轮转起始 peer，state 用有界 deficit 累积，让大可靠分片与小快照都有机会。backpressure 不扣准入额度，也不阻塞其他 peer。
- 即使没有发送额度，也调用会话的零预算 tick，执行已有心跳／握手／可靠分片／ACK 截止，不能通过暂停发送把 8 秒截止冻结。
- 重入、session 返回越预算结果、不可判断是否已发送的异常使 pacer 隔离；不能重试并假定 native 没有接收。调用方仍负责结束该房间的 owned transport。

### 必须保留的限制

这不是已经完成的端到端带宽拥塞控制器：当前准入约束的是**SDK 待发队列**。它不能撤回已被 SDK 接受的分片，也不能测量／限制已经进入操作系统或外部路由器 FIFO 的所有不可靠包。可靠 unacked 不计为“未发队列”是语义正确，但也意味着还不能据此证明带宽骤降时外部在途积压有界。

准入测试中的模拟 drain 是有界调度／公平性的单元测试，不是真实 Valve 线路，也不是九客机带宽骤降测试的替代。只有后续包含 native 队列、已上网包、RTT、可靠重传、丢包／乱序、共享瓶颈的模型和真实双端测试通过，才能把它当作解决原问题的证据。

## 修复多分片快照被持续更新饿死

在把 session 接入每 peer 每 tick 一个包的准入器时，发现先前的 `offerState()` 会取消任何未完成 snapshot。若一次快照需要 5 个分片，8ms 才发送一片，而画面每 16ms 更新一次，就会不断取消发了一半的快照，导致一帧也完成不了。

现改为：

- 未提交首片的旧 snapshot 可以直接被最新状态替换。
- 首片已经被 native 接受的 snapshot 只保留**这一帧**，尝试在固定 500ms 限制内完成；期间仍只 coalesce 一份 latest state，不累积历史列表。
- 原生拒绝或固定过期仍可丢弃剩余片段；不会把每次新画面当作续期。
- 新增真实 session + room pacer 的持续更新用例：每 16ms 提供多分片新状态、每 8ms 最多准入一片，验证持续有完整画面到达、presentation 不长期落后、片段内存有界。不是只看 mock send 计数。

## 验证与证据

- 专项：生命周期 21、状态读取 6、房间准入 12、应用会话 29，合计 **68/68 通过**。
- 全量：`npm run steam:check`，**152 / 151 pass / 1 fail / 0 skip**。输入队列 1470 个断言仍在同次执行中通过。
- 原生：`npm run steam:check:sockets-native -- --verified-headers`，**1055 个计数断言通过**。
  - 实际 C++ 固定 SDK 结构体／方法类型断言通过；8 次专门的 status 场景读取，旧 ticket／离开成员／foreign native handle 的额外指标调用 0。
  - C++ fixture host + JS peer 的既有 handshake / control / anchored snapshot / 丢帧恢复仍通过。
  - 同一 native-backed session 再接入 room pacer：原生指标正常时提交 snapshot；注入坏 native counter 后阻止 state，但保留有界紧急 control；恢复有效 sample 后发送保留的 latest state。
  - 整个 native fixture 共 26 条 SendMessages、44 次消息释放，结束后消息分配／listener／connection／poll group attachment／wire 片段预算均为 0。
  - 实际安装的 Steam DLL **只绑定 21 个不同导出（23 次绑定），没有初始化 SDK 或进行真实 connect/send/receive**。
- lint / typecheck 均退出 0，另存退出码文件，避免只凭空日志判断通过。
- `artifacts/steam-sockets-pacing-progress.json` 记录当前代码、日志、native result 和隔离检查的散列。之前 session / lifecycle 报告保留为历史证据，不能把旧的 995 / 884 计数混作本轮结果。

## 发布与下一步

默认 desktop main / service / Steam launcher 的依赖图当前为 5 / 28 / 26 项，不含任何 `sockets-*` 或 `anchored-snapshots` 实验模块。相较上一份历史图增加的 `server/LanStateCredits.mjs` 是工作区其他既有开发变化，本轮没有改写它。

冻结 v3 ZIP 仍为 338,243,922 字节，SHA256 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482`。未重新打包或发布。

下一关键工作：room/session/lifecycle 适配到网关；带能力协商的显式 legacy 选择与失败处理；把新的实际 wire / 队列指标 / 准入器放进包含外部共享 FIFO 的带宽骤降模型，不能只证明 native queue 小；在原默认失败门槛或其等价完整新路径门槛通过后，再做真实两账号跨网络游戏验证。目标仍未完成。
