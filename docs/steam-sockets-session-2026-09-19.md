# Steam Sockets 应用会话与快照协议（2026-09-19，实验路径）

## 本轮状态

完成 `sockets-wire.mjs`、`sockets-session.mjs`：把已经验证的 v012 native 生命周期 ticket 接到应用握手、控制消息、心跳、对局隔离、锚点及可丢弃快照、可靠完整状态回退上。**这是接通实验协议链路，不是已修复默认 Steam 通道或已验证真实联机。**

新增协议专项测试 28/28 通过；完整 `steam:check` 131 项中 130 通过、1 失败、0 跳过，同次输入队列 1470 断言通过。默认九客机共享上行从 8Mbps 降至 256Kbps 时仍在虚拟 20.168 秒触发 `1013 / Steam link stalled`。该测试和原 8 秒保护没有删改。

## 握手与身份边界

- 会话只能建立在生命周期管理器返回的 Connected ticket 上，不初始化 Steam、不替换 SDK callback。
- 首先核对 message 的 native ticket（handle / local lease / remote / scope），再读 wire header，匹配连接双方的随机 128-bit nonce，**最后**才允许分片重组、解压和 JSON 解析。
- 三步握手：guest hello → host welcome（回显 guest nonce）→ guest ready（回显 host nonce）。双方核对大厅 scope、精确 build、游戏 protocol、wire version、必需能力位。host 收到有效 ready 前不暴露应用 ready；guest 必须把 ready 真正提交给 native 后才进入 ready。
- Steam 身份仍以 native 生命周期／消息身份校验为准，nonce 不是身份认证或加密。它阻止旧连接正文／ACK 混入新连接；远端 peer 本身有权限终止自己的会话。
- 首包及后续握手总截止仍为 native-connected 起 8 秒，背压不重置。无 wire 兼容性时明确关闭该实验会话，**尚未实现自动重开 legacy 的混合版本降级**。
- 不记录 nonce、Steam ID、大厅 ID、控制正文或快照。diagnostics 仅提供状态、大小和计数。

## 三条 lane 与统一上行调度接口

| 数据 | native lane / flags | wire 分片正文 |
| --- | --- | --- |
| 握手、游戏控制／输入、ping/pong、stream/ACK | control / 9 | 最多 8192B；握手单片且不可压缩 |
| 完整锚点、超出差分支持范围的完整状态 | anchor / 9 | 最多 8192B |
| 可替换状态（锚点差分或独立完整 envelope） | snapshot / 5 | 最多 1024B |

固定 64B SWS2 header 带 version、op、压缩标志、message ID、fragment index/count、encoded/raw 长度、双方 nonce、对局 epoch，所有保留字段必须为零。native kind 必须与 wire op 一致。

`pump({now,maxBytes,maxPackets,traffic})` 需要调用者显式提供有界预算，每次最多 64KiB、64 包。按需构建单个 native 包，不预构建所有片段。`traffic='control'` 允许未来的房间调度器先遍历所有客机的控制流，再用 `traffic='state'` 发状态；单个会话自己的控制未排空时，state 阶段不绕过它。**这只是调度接口，不是已完成的房主总限速器。**

- 原生 backpressure 保留当前可靠分片，不推进 index 或锚点 baseline；错误显式结束会话。
- snapshot admission 被丢弃时停止该帧剩余发送；新状态替换尚未提交完的旧 snapshot，最多保留一个最新待发状态，不建立历史世界列表。
- 已提交给 SDK 的分片不能由 JS 撤回。NoDelay 可以拒绝新提交，但没有证明它会自动取消已接受消息。跨 lane 不保证顺序，native lane 优先级也不是跨全部连接的共享带宽保证。

## 对局、锚点与完整状态

- 每次新的 matchId 增加单调 epoch，经可靠 stream / streamAck 双向确认后才发状态。旧 epoch 的状态／ACK 在重组前丢弃；streamAck 必须发生在对应 stream 实际 native admission 后。
- guest 收到新 epoch 时清空旧状态片段、锚点和 presentation 序号。matchId 不符合当前 stream 的内容不能送往游戏。
- 已有 `SteamAnchoredSender/Receiver` 现在通过这套 wire 连通：只 ACK 完整、验证通过的 anchor，host 同时核对当前 nonce、epoch、frame ID 和 token 后才换 confirmed anchor。尚未提交完的帧不能被提前 ACK。
- 丢失某个 delta 不会破坏之后的解码链。snapshot 先于其 anchor 到达时可丢弃；后续状态恢复。如果 snapshot 自身为独立 full envelope，则可以先呈现，但晚到旧 anchor 不会让游戏画面序号倒退。
- 保留最多两个锚点。不支持差分的 >512KiB 或深层状态显式走可靠 full 分片，未删减精度、节点、船只或载荷。仍接受原应用约 16MiB 的上限；大 room/start 控制也没有擅自缩成 1MiB。
- session 会逐块发送大 payload，控制消息可抢在**尚未提交的 state**分片之前。已经提交的原生队列仍需下一阶段的全局 admission／指标治理。

## 有界资源与不放宽超时

- 每条 lane 仅一个重组槽。lossy 新帧淘汰旧半帧，重复片不更新截止时间。固定重组截止：snapshot 500ms、可靠片 8s。
- 可共享 `SocketWireBudget`，约 32MiB 的预算约束**保留的压缩片段**，不是声称所有解析对象／短暂拼接副本／完整呈现状态加起来只有 32MiB。complete 后释放分片预算，解压输出仍受已验证 raw 上限约束。
- 控制出队列至多 64 项，应用控制事件至多 32 项，均同时受字节预算约束；latest state／待发 state job 各一个。溢出明确关闭，不能静默丢可靠控制。
- 清理释放自己的重组预算、锚点、待发送 payload 与默认私有 encoder/codec cache；传入的共享 encoder/codec 不在某一个 peer close 时误清空。
- ping 仅在真正 native admission 后才可由匹配 serial 的 pong 满足；旧 pong、猜测的未发 ping 的 pong、单向控制流不能续命。
- 心跳、stream ACK、可靠 state ACK 均保留 8 秒硬边界；有效 pong 不能让丢失的 stream/anchor ACK 无限等待；可靠长分片的发送及 ACK 截止均从首个已提交片开始，不逐片重置，也不因完成末片额外增加 8 秒；没有 state 发送预算时也检查截止。

## 证据

1. `node --test scripts/check-steam-sockets-session.mjs`：28 项，通过范围包括握手不兼容、旧 nonce／ticket、epoch 重放、8 秒边界、乱序／丢帧／重复分片、序号 wrap、预算溢出、畸形 header／zip bomb、600KB 完整状态、1.1MB room/start 控制、上行控制优先接口等。
2. `npm run steam:check:sockets-native -- --verified-headers`：**995 个计数断言通过**。本轮扩展的是**实际 C++ 测试 DLL 的 host + JS 模拟应用 peer**，不是两端真实 Steam：
   - native host session 15 次消息提交，模拟客机消息 9 次进入真正 native allocation/receive/release。
   - host 发给模拟客机的字节从 C++ SendMessages 捕获内存拷回，逐包核对 native lane/flags/handle 和字节，不只让 JS 旁路自证。
   - 刻意丢失一帧已经 native 接受的 snapshot，下一帧恢复；可靠控制负返回背压后成功重发；执行对局 epoch 切换与双向 ping。
   - 总计 native fixture SendMessages 23 条、消息释放 41 次；结束时 native 消息分配、listener、connection、poll group association、wire 片段预算均为 0。
   - 生命周期既有原生线程回调测试仍执行：154 次（该子阶段计数），5 次 worker 回调，1 个 trampoline，raw callback 内 native SDK 调用 0。
   - 实际 Steam DLL 仅绑定 20 个不同导出（22 次绑定）；SDK initialization、实际 connect/send/receive/callback registration 均未调用。
3. `npm run steam:check`：131 项，130 pass / 1 fail / 0 skipped；不是全绿。日志保留默认共享 FIFO 路径的已知失败。
4. lint / typecheck：均退出 0。
5. `artifacts/steam-sockets-session-progress.json`、`steam-sockets-session-isolation.json` 和对应日志：当前散列与结果快照。默认桌面 main / service / Steam launcher 依赖图仍分别 5 / 27 / 25 项，不含任何 sockets-* 或 anchored-snapshots 实验模块。

两次远端固定 SDK 头文件下载遭遇 ECONNRESET 后，增加显式 `--verified-headers` 离线模式。它使用之前已验证的 v1.63 固定提交缓存，**每个文件必须匹配已落库 SHA256 清单**；在线模式同样核对清单，不接受任意本地头文件，也不换到最新 v013。测试启动前及结束后校验源码散列，防止把运行中变更后的源码散列误写为已测版本。

## 发布约束及下一项关键工作

冻结 v3（338,243,922 字节、SHA256 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482`）未变，未创建／发布新包。下一项关键工作是 v012 实时连接／lane queue 指标与房间级公平 admission 调度，将本会话接入网关适配器，再用原生边界支持的共享上行模型重跑带宽骤降、可靠停顿和混合 RTT 测试。还需处理 capability 选择／legacy 回退、完整游戏链路及真实双账号跨网络验证。不能用本轮的单会话协议通过替代默认网关掉线门槛，更不能据此宣称可以稳定联机。
