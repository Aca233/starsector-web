# Web 远行星号：大范围联机方案与 GitHub 源码调研

日期：2026-09-21。**研究文档，不是实现完成或性能提升声明。**

## 0. 结论先行

对当前项目，最值得组合的是：

1. **Riot/Epic Iris + Colyseus/schema**：独立网络状态、主动登记字段变更、共享每 tick 的捕获与编码工作。
2. **Quake III / DDNet**：显式实体 ID、创建/更新/删除、可验证的增量基准、丢失基准时恢复。
3. **GNS / Lightyear / Renet**：按可靠性和时效性分通道，控制字节预算、队列年龄、分片和内存边界。
4. **Mindustry**：大量实体的数据分类、小批次发送、按共享集合复用工作。
5. **Mirror / Gambetta**：分离模拟、网络时间轴和显示预测，不用预测掩盖吞吐问题。

**不建议现在整体改成 Factorio/OpenRA 锁步、GGPO 全世界回滚，或替换整个网络框架。** 当前已有大量协议、安全边界、原版规则和 UI 适配，重写成本与回归风险高。“换 UDP”“加插值”“加专服”都不是单项必胜答案。

保留固定 60Hz 模拟和既定有效状态更新目标；不通过修改目标 Hz、重放旧帧、把 motion Hz 当完整世界 Hz 来宣称成功。若要调整不同类型数据的更新合同，需要单独设计与确认。

## 1. 本轮到底查了什么

- **36 个 GitHub 仓库**：全部获取官方 API 元数据及 README，覆盖传输、Web 框架、复制、回滚、后端运维和实际游戏。
- **19 个仓库进一步读取源码、接口、实现说明或许可证**；不是 19 个都做了完整网络代码审计。
- **12 个重点仓库固定 commit**；成功保存 34 份补充文件，含源码、接口、许可证和说明。
- **17 个外部页面**：15 篇有实质正文的技术文章/文档；Overwatch 和 Halo: Reach 的 GDC 页面只核到演讲信息/概要，未看完整视频或幻灯。
- 对照本项目源码及已有 Phase24–26 报告，区分工作区代码、旧发布版、实验和实际启用路径。
- 没有安装第三方库、执行下载的外部代码、改变网络配置、启动可见窗口或跑游戏压测；没有修改、提交、打包、发布生产代码。

完整名单：[36 仓库对照表](netcode-survey-repositories-2026-09-21.md)。原始证据在本机忽略目录：

```text
C:\Program Files (x86)\Starsector\starsector-web\artifacts\netcode-survey-20260921
```

`repositories.json` 保存元数据，`source-pins.json` 保存 commit，`source-files.json` 保存成功/失败路径，`articles/sources.json` 保存页面响应。部分 raw 域名请求失败后改用 GitHub 官方 raw 路由读取；未绕过登录或权限。FishNet 的 `LICENSE` 是 404，实际 `LICENSE.md` 已读；Geckos 的 `makeReliable.ts` 是 404，实际实现是 `reliableMessage.ts`。失败响应不算证据。

## 2. 对照当前仓库：不能重复包装已经做过的工作

| 已有能力/证据 | 本轮核实 | 尚不能推导的结论 |
|---|---|---|
| P1 呈现快照 | CombatSnapshot 明确不是可恢复模拟检查点；已有 native capture plan、布局、投影、字段省略 | 不能说还在无差别发送整个模拟；不能直接用 P1 做主机迁移或全世界回滚 |
| 本舰预测 | MotionPrediction 与 Phase26 已修正 ACK 后持续输入、同时间校正和有限重放 | 不等于已预测碰撞、伤害、AI 或所有弹体 |
| 二进制/字节 delta | LanBinaryDelta 已有基准、CRC、seq；Steam 也有编码准备路径 | 不等于已经在模拟写入点登记所有字段变化；不能随意跳过依赖包 |
| 发送背压 | RealtimeSendPolicy 已禁止无限排旧实时输入/状态 | 不能撤回已经进入 TCP/底层可靠传输的旧字节 |
| LAN 分层能力 | NetworkFeaturePolicy 默认 auto，协商受保护运动；visual/combat 等仍有实验条件 | 请求 feature 不等于独立通道实际活跃，更不是完整世界 60Hz |
| Steam Sockets | gateway 有 socketRoomFactory 和实验房间，但 electron-service/steam-launcher 普通构造未注入它 | 不能把实验文件存在说成所有玩家已启用；Steam hello 也不提供独立运动能力 |
| 编码 Worker | Phase24 记录真实实现，但配对高负载与稳定性验收未通过，未默认启用 | 序列化再搬一次 Worker 不必然提速，可能增加复制/等待/双份遍历 |

本机入口：[CombatSnapshot](../src/network/CombatSnapshot.ts)、[FeaturePolicy](../src/network/NetworkFeaturePolicy.mjs)、[发送策略](../src/network/RealtimeSendPolicy.mjs)、[Steam gateway](../server/steam/gateway.mjs)、[编码 Worker 报告](network-serialization-phase24-2026-09-21.md)。

**旧线上证据和较新实验必须分开：**

- [v0.2.6 会话分析](network-multiplayer-session-v026-2026-09-21.md)：主机接近 60Hz，部分客机约 1–3Hz，原始大快照约 177–225KB。该批证据指向分发/交付问题，但未证明每条连接的实际路由、线上带宽、丢包。
- [Phase26 无头报告](network-motion-prediction-phase26-2026-09-21.md)：3 人 22 舰完整状态中位数约 57Hz、运动 60Hz；5 人 22 舰完整状态约 25–26Hz、运动约 51–54Hz。是同机 Chromium/回环，不是新版跨网实测，也不是本次重新跑出的数据。
- 所以当前同时要查 **CPU/捕获/编码/发布/应用** 与 **真实链路/拥塞/积压**，不能只凭旧日志断言今天瓶颈仍只有网络。

## 3. 商业游戏和公开文章：学什么，不学什么

### 3.1 VALORANT：复制成本单独测量，减少无变化轮询

Riot 官方 [128-Tick Servers](https://www.riotgames.com/en/news/valorants-128-tick-servers) 描述对 replication、网络、动画、物理分别计时；旧属性复制逐字段、逐客户端轮询，无变化也有成本；部分场景改成变更驱动。

适用：明确舰船网络字段，变化时登记，避免每客机从头遍历相同投影。但位置、角速度本来每 tick 变化，dirty 标记不能消灭它们，设计不当反而增加写入成本。必须做 CPU 与字节双 A/B。

[Peeking into VALORANT’s Netcode](https://www.riotgames.com/en/news/peeking-valorants-netcode) 可核实权威、预测、缓冲延迟之间的关系。它不是“三角洲用了同一套”的证据，也不是要求本项目照搬 128 tick。

### 3.2 Fortnite / Replication Graph / Iris：共享工作比盲加线程更关键

[Epic Replication Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/replication-graph-in-unreal-engine) 用跨帧持久化分组减少对象×客户端的重复相关性检查。Fortnite 人数/Actor 数是文档示例，不是本项目容量保证。

[Iris 概述](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-iris-in-unreal-engine) 明确维护独立复制状态，按类型共享描述/协议，按连接维护复制进度，进行过滤/优先级处理。它的 quantized 状态不能成为我们未经评估降低原版精度的理由。

适用：一个 tick 生成一次共享 NetworkView/字段记录，每连接主要保留基准、确认和投影差异。跨线程共享要有不可变发布或明确所有权，不能下一 tick 修改正在发送的缓冲。

### 3.3 Factorio / OpenRA：低流量有确定性和客户端计算的代价

Factorio [FFF-76](https://factorio.com/blog/post/fff-76) 解释锁步发送输入而非整个状态，但参与方必须一致模拟。[FFF-147](https://factorio.com/blog/post/fff-147) 描述从全互联向服务端归并命令重写的历史过程；不能当作其所有最新实现。

对本项目：每个客机都跑 AI、弹体、碰撞，还要保证 RNG、迭代顺序、时间步、跨 JS/原生路径、mod 一致。客机现在只呈现，不是加一个随机种子就能变锁步。

更直接的借鉴是 [FFF-302](https://factorio.com/blog/post/fff-302)：断线追赶时输入/延迟队列边界错误会制造巨大包，并向全体放大。应验证恢复不重复堆积 held 输入，不重复执行离散动作；动作有 ID、去重、执行回执，而不是无条件丢掉。

### 3.4 Source / Overwatch / Halo：不能把瞬时射击回溯套到全场弹体

Source SDK 的 `player_lagcompensation.cpp` 有 StartLagCompensation、BacktrackPlayer、FinishLagCompensation（具体源码链接见文末）。这是旧 Source 游戏代码，不是 CS2 当前 subtick，也没有公开全部底层网络引擎。

远行星号飞行弹体、护盾、相位、碰撞、光束有不同历史一致性要求。不能为补偿一个开火时间随意回滚全场，再与当前护盾混用。保持伤害权威，客户端预测先限于可撤销表现；改变命中公平性是玩法取舍，需要另行确认。

[Overwatch GDC 2017](https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and) 只核到 ECS/确定性/响应性的概要；[Halo: Reach GDC 2011](https://www.gdcvault.com/play/1014345/I-Shot-You-First-Networking) 只核到演讲页面。未读完整材料，不写它们的具体发包率或回滚范围。三角洲行动本轮也未取得可核实的服务端/协议实现。

## 4. 重点源码：可具体借鉴的机制

以下仓库完整 URL、固定 commit 和本轮获取文件见附表及文末源码索引。

### 4.1 Colyseus/schema：主动登记变化

`ChangeTree.change()` 记录字段操作并安排编码队列；`Encoder` 区分共享和 view 编码。所读版本还存在 unreliable 字段流，因此必须固定版本审协议，不能套旧教程，也不能假设任意 patch 可跳过。

建议选一种舰船做独立 NetworkView，比较自研固定字段表与固定版本 schema 两条候选。保留已有 double 精度、实体生命周期、未知/自定义字段 fallback。**不要把整个模拟对象硬改 Schema，也不需要为了试编码器迁移整个 Room 框架。**

正确送达同一 tick 的完整变更集合，可以物化该 tick 的完整网络视图；前提是批次边界、基准和依赖都验证了。缺一部分时不能把 motion tick 当成完整世界消费。

补充对照 **nengi**：`compare.js` 仍遍历协议字段比较新旧值，`Instance.js` 缓存每 tick 的代理；所读 `chooseOptimization.js` 的 batch 路径明确被关闭。可以借鉴实体边界与缓存，但不能把它说成无扫描的变更日志系统，也不能把未启用的优化算进预期收益。

### 4.2 Quake III / DDNet：基准、删除、恢复是一等协议

Quake `sv_snapshot.c`：同 ID 实体做 delta，新实体从 baseline 建立，删除独立表示；旧基准超出保留范围时不再引用它。DDNet `CreateDelta` 明确删除/更新，`UnpackDelta` 检查结构；`server.cpp` 用已确认快照作基准，缺失时进入恢复。

适用：
- entityId + generation，避免 ID 复用后旧消息打到新实体。
- match/sync epoch + tick + baseline ID/revision，只引用确实重建且仍保留的基准。
- A→B→C 的链式 patch，不能丢 B 却要求 C 正常应用；须累计至已确认基准或恢复关键帧。
- 配置模板与动态字段分离，删除记录、基准、重连都有界。

DDNet 自己的恢复降频是其选择，不照搬来降低本项目目标。现有字节 delta 的基准和校验值得复用，不必全部废弃；对象级方案收益取决于变化比例、元数据成本及客户端能否真正增量应用。

### 4.3 Lightyear / Renet：可靠性、顺序、限额是不同维度

Lightyear `ChannelMode` 区分无序不可靠、带 ACK 的不可靠、有序/无序可靠等；`priority_manager` 组合通道/消息优先级并考虑包填充。

Renet `SendChannelUnreliable` 有字节/内存上限，预算不足时丢弃不可靠消息，有分片机制。这证明的是“预算有界”，不是自动“每实体只保留最新”；仍需上层语义策略。

Gaffer [State Synchronization](https://gafferongames.com/post/state_synchronization/) 用优先级累积避免长期饿死；它的示例两端都模拟，不能整体套给只呈现的 P1 客机。可借鉴调度，但只有实际发送才更新对应状态，不能悄悄裁掉战术信息。

### 4.4 Valve GNS：最贴近桌面路径，但不是完整 netcode

`ConfigureConnectionLanes` 有独立 lane、严格优先级和同优先级带宽权重。跨 lane **不保证接收顺序**；可靠消息仅在同 lane 内有序。

持续高优先级会饿死低优先级。给输入/控制限额，为恢复/生命周期保留进展预算，而不是全设最高优先级。多 lane 仍共用物理上行，不会增加带宽。

[GNS README](https://github.com/ValveSoftware/GameNetworkingSockets) 明确不提供实体序列化、字段 delta、压缩。[Steam SDR 官方文档](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay) 与 README 区分开源库和平台服务；下载 GNS 不等于获得免费官方中转资格。

先核实已有 sockets-session 的实际入口/协商再完善。大消息不可靠分片中丢一个分片可能让整条消息失效，不能把 200KB 快照原样改成 UDP 后就称完成。

补充对照 **ENet**：官方 `docs/design.dox` 明确同一 channel 的可靠包等待可能挡住后续包，包括不可靠包；独立 channel 才隔离这类排序等待。故不能只设置 unreliable 标志，却仍把所有消息放同一通道。它同样不会自动解决实体编码或应用成本。

### 4.5 Geckos/WebRTC/WebTransport：浏览器路线可行，确认合同要看源码

Geckos `ServerChannel.emit()` 调用 `makeReliable`；`reliableMessage.ts` 默认 interval=150、runs=10，重复发送同 ID。**它的 reliable:true 不是持续等待 ACK 的可靠有序通道，更不等于关键操作已执行。**

选它做 adapter 时：实时状态可丢弃；部署/结算等需要真正可靠通道或经过验证的应用层确认、重试、幂等和超时失败，不能有限重发后静默丢失。

[MDN createDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel) 说明 ordered、maxRetransmits、maxPacketLifeTime；后两项不能同时设置。默认 DataChannel 不自动就是所需不可靠模式。不同通道共享底层拥塞/资源，仍须控制大消息和发送队列。

Pion README 明确支持 TURN UDP/TCP/TLS，最终路径可能中转，不能保证所有玩家直连 UDP；还要信令、认证、STUN/TURN、端口与路由遥测。

[WebTransport 文档](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport) 支持 HTTP/3 stream/datagram。**本轮所读 MDN 已标 Baseline 2026 / Newly available**，不能沿用“主流浏览器都不支持”的旧印象。但目标 Electron/浏览器、datagram 能力、HTTPS/证书、代理网络仍要验证；当前 Node ws 后台不会自动变为 HTTP/3 服务。

### 4.6 Mindustry：大量实体不必每次重发完整世界

`NetServer.writeEntitySnapshotsAll()` 遍历专门 sync 集合，以小批次发送，还有 team 共享/隐藏路径；`NetClient.entitySnapshot()` 标记不可靠，按实体读取。

适用：区分实体、全局战况、静态设计、特效事件，共享真正相同的编码工作。不是未经消费者审计删除所有弹体或屏幕外舰船；战术地图、锁定、远距离威胁、舰队列表必须保持正确。

### 4.7 Mirror：播放时轴优化不是链路提速

`SnapshotInterpolation.cs` 有抖动估计、缓冲上限、时轴夹紧、快慢播放调整。可对照 SnapshotPlayback/MotionReplica 的异常边界，但不能无限加缓冲或牺牲响应后只展示 FPS。当前已有插值/预测，建议是审计，不是重造。

### 4.8 GGPO / OpenRA：接口直接说明采用门槛

GGPO 明确要求 save_game_state、load_game_state、free_buffer、advance_frame；当前 P1 呈现快照不满足。OpenRA `OrderManager` 判断命令帧是否就绪，并有 sync hash/desync 报告。可研究诊断与重放，不代表应该立刻让每个客户端跑完整 AI 战斗。

## 5. 推荐协议形态：保留权威模拟，演进网络视图

这是建议，**本轮没有实现，不能据此报告已启用**。

```text
权威模拟：固定 60Hz，原版移动/碰撞/AI/伤害不变
 └─ NetworkView：字段、类型模板、entity generation、变更日志
     ├─ 输入/确认：held 有 seq/tick；离散 action 有 ID/执行回执
     ├─ 关键状态：位置/速度/方向及经审核的实时战斗字段
     ├─ 生命周期/配置：创建、删除、设计 revision、权限/幂等
     ├─ 视觉事件：出生/结束/必要校正；可推导表现本地生成
     └─ 恢复基准：完整网络视图、epoch、缺失基准恢复
         ↓ 每连接基准/预算，共享捕获编码，有界队列/重组
     adapter：桌面 GNS / 浏览器 RTC 或 WebTransport / WS 兼容
         ↓ decode + 增量应用 + 一致性批次确认
     显示副本 → 有界插值 / 本舰预测 → 渲染
```

1. **关键状态不只位置。** 护盾、相位、炮塔朝向、幅能、死亡直接影响可见战况，不能一律当低频 UI。
2. **通道不是互不相干。** 创建必须先于对应 generation 的运动；缺依赖只能有界等待/拒绝/请求恢复，不能指望跨通道顺序。
3. **可替代状态不等于可丢事件。** held 可换最新值；一次部署/交易不能简单被新值覆盖。入队、包接收、状态重建、renderer 消费、权威操作执行是不同回执。
4. **全局 tick 不代表完整批次已到。** motion tick、combat revision、完整网络视图 tick、input applied seq 分开统计。
5. **不损害精度/mod 兼容。** 先做无损分类；可执行 hook 不跨网，未知扩展走有界兼容/显式不支持，不静默丢字段。
6. **不默认屏外不发。** 先优化共享工作/不变字段。视野或战术信息裁剪要另做玩法审计。
7. **安全预算完整。** 版本、epoch、ID、深度、展开大小、分片数/总量/超时、重放防护、身份和权限；压缩后小不表示解压成本小。
8. **专服是部署选择，不是协议修复。** 可减少住宅房主上行 fan-out，但有成本/地域/运维，每客机数据量与应用成本仍在。普通浏览器不能直接使用原生 UDP。

## 6. 实施优先级和验收门槛

### P0：先建立实际启用与成本账本

不加框架。核实双方 build、transport、LAN helper/controlLane、motion consumed、Steam socketRoomFactory、完整世界接收/应用。压缩前字节不是线上带宽，不同机器单调时钟不能直接相减作单程延迟。

按链记录 capture/encode/compress/queue/send/decode/apply/render，CPU P50/P95、输入应用确认、状态年龄、线上字节、队列最旧年龄、基准恢复次数。应用 ACK 不冒充原生 RTT。

### P1：一个 NetworkView 纵向试点，不全场重写

同一真实舰船与依赖，比较：
- 对照：当前 P1 capture + 原二进制/字节 delta。
- 候选 A：显式字段/类型布局 + 变更登记 + 原 transport。
- 候选 B：固定版本 Colyseus/schema 承载独立网络视图 + 原 transport。

验证字段、创建删除、重连、精度、战术/UI 消费者；比较生产者和接收端总成本。不能只统计 encoder 微测，也不能把 delta 展开为完整对象树却漏算 restore。

通过门槛：语义一致、资源有界、真实场景 CPU/字节/状态年龄有可重复收益，且不让关键指标恶化；具体阈值在实验前确定。本轮没有承诺收益百分比。位置等持续变化字段可能几乎没有 dirty 节省，应保留负结果。

### P2：相同协议内容，对照真实传输

完善已有桌面 Steam Sockets/GNS 实际入口，或做浏览器 WebRTC adapter。不要同时换编码、模拟、传输，以免无法归因；不支持能力时明确回退。

验收丢包、乱序、重复、突发中断、跨通道创建依赖、大恢复包与输入竞争、恶意分片。底层收到了但 renderer 不消费，仍应背压；高优先级不应无限饿死恢复流。

### P3：呈现与部署

前两阶段成立后，再评估更多本地特效、武器表现推导、相关性调度、专服。Nakama、Open Match、Agones 到账号/匹配/大量专服运维成为真实需求时再选，不塞入当前战斗热路径。

### 实验矩阵（待执行，不是已测）

| 维度 | 建议覆盖 |
|---|---|
| 规模 | 固定源码/种子：3/4/5 玩家，相同 22 舰；再加原用户高弹体场景 |
| 网络 | 回环 → 两台正常 LAN → 真实跨网；模型 RTT 0/50/150/300ms 与独立抖动 |
| 异常 | 丢包 0/1/5%、突发丢包、乱序/重复、限带宽、重连；单项与组合 |
| 拓扑 | LAN 直连/真实中转；Steam 路由只依据可用遥测，不从房间类型猜 |
| 调度 | 房主显示线程暂停、权威负载、慢客机、隐藏/恢复；不放宽保护伪造通过 |
| 指标 | simulation/capture/publication/receive/apply/motion/FPS 分开；state age/input ack P50/P95，线上字节及 CPU |
| 一致性 | 生命周期、设计版本、护盾/伤害可见状态、弹体、UI、未知字段、陈旧 ACK |

保持目标，不降 Hz 过关。motion 60Hz、完整世界 2Hz 不能称“60Hz 联机完成”。带宽不够要如实报告，不用无限排队掩盖。

总流量近似“每接收端每次实际发送字节 × 实际次数 × 接收端数”，还要加协议/重传/控制开销。README 的人数、Riot 局部加速、KCP 宣传数字都不能当我们的收益。

## 7. 许可证与依赖风险

这是初步筛查，不代替法律意见和全部第三方审计。

- GNS/ENet/Colyseus 等主许可较宽松，但仍要按要求保留声明，审第三方依赖。
- DDNet `license.txt` 是 zlib 风格；API 的 NOASSERTION 不表示无许可，不能仅凭 API 下结论。
- Quake III、OpenRA、Mindustry、Warzone、Veloren 含 GPL 条款。可研究设计；复制/链接/分发前按使用方式审兼容性，不当作 MIT 工具箱。
- **Source SDK** 的实际 LICENSE 是非商业许可。
- **Unity NGO** 的 LICENSE 明确 Unity-dependent projects，不直接搬进独立 TS 项目。
- **FishNet** 的 LICENSE 对同类网络解决方案有排除条款，具体用途需逐项核实。
- **SpacetimeDB** 本轮读取的 2.10.1 是 BSL 1.1；Additional Use Grant 对生产实例数量/数据库服务有条件，转换日期与许可证也写在文件内，不是当前无条件 MIT/Apache。README 和实际 LICENSE 细节应以后者为准。
- 原版远行星号资源授权是另一问题，不因采用宽松网络库而改变，本轮不下资源许可结论。

## 8. 暂时不做什么

- 不从三角洲客户端复制 DLL 以为能获得完整服务端架构。
- 不把加 Socket.IO/普通可靠 WebSocket 当成新鲜度机制，项目本来已有 WebSocket。
- 不把 TCP 全换 KCP 就承诺解决队头阻塞：`ikcp.c` 仍按 rcv_nxt 顺序推进交付。
- 不把显示快照当存档/checkpoint，不立刻切全世界锁步或回滚。
- 不盲加 Worker，保留 Phase24 的负结果。
- 不隐藏完整世界掉队、提前发消费 ACK、减精度、删屏外威胁或放宽超时。

**最终建议：先验证“显式实体网络视图 + 变更日志 + 有界基准恢复”，再接实际 GNS/浏览器可丢弃通道。复用现有权限、epoch、ACK 和适配边界，不整体推倒重写。**

## 9. 其他实质资料

- [Gaffer Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/)：丢包、快照时轴、显示缓冲，非本项目实测。
- [Gaffer Snapshot Compression](https://gafferongames.com/post/snapshot_compression/)：基准 delta、字段编码；量化误差预算不能直接套原版。
- [Gambetta Prediction / Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)：输入序号、确认、重演，当前项目已有同类机制。
- [Gambetta Lag Compensation](https://www.gabrielgambetta.com/lag-compensation.html)：命中时间/历史状态的公平性取舍。

GDC 概要、未深读源码的 B 级仓库、README 宣传和 API 更新时间都不作为性能或实施证明。

## 10. 本轮实际获取的源码/接口/许可入口

链接尽量固定在 commit；标为分支快照的项目仍可从本机证据目录恢复本次读取内容。获取文件不表示逐行完整审计。

| 仓库 | 文件 | 引用范围 |
|---|---|---|
| lsalzman/enet | [docs/design.dox](https://github.com/lsalzman/enet/blob/master/docs/design.dox) | 获取时分支快照 |
| ValveSoftware/GameNetworkingSockets | [README_P2P.md](https://github.com/ValveSoftware/GameNetworkingSockets/blob/a424b7db649438acafb60c99cae6667587c42732/README_P2P.md) | 固定 commit a424b7db6494 |
| ValveSoftware/GameNetworkingSockets | [include/steam/isteamnetworkingsockets.h](https://github.com/ValveSoftware/GameNetworkingSockets/blob/a424b7db649438acafb60c99cae6667587c42732/include/steam/isteamnetworkingsockets.h) | 固定 commit a424b7db6494 |
| lsalzman/enet | [include/enet/enet.h](https://github.com/lsalzman/enet/blob/master/include/enet/enet.h) | 获取时分支快照 |
| ValveSoftware/GameNetworkingSockets | [include/steam/steamnetworkingtypes.h](https://github.com/ValveSoftware/GameNetworkingSockets/blob/a424b7db649438acafb60c99cae6667587c42732/include/steam/steamnetworkingtypes.h) | 固定 commit a424b7db6494 |
| colyseus/schema | [src/encoder/Encoder.ts](https://github.com/colyseus/schema/blob/67e849f7c590c9b5af417044e3c0d90b693adc29/src/encoder/Encoder.ts) | 固定 commit 67e849f7c590 |
| colyseus/schema | [src/encoder/ChangeTree.ts](https://github.com/colyseus/schema/blob/67e849f7c590c9b5af417044e3c0d90b693adc29/src/encoder/ChangeTree.ts) | 固定 commit 67e849f7c590 |
| cBournhonesque/lightyear | [crates/transport/transport/src/channel/builder.rs](https://github.com/cBournhonesque/lightyear/blob/125f454bf49adf922b245938e33ca3470a82233b/crates/transport/transport/src/channel/builder.rs) | 固定 commit 125f454bf49a |
| cBournhonesque/lightyear | [crates/transport/transport/src/packet/priority_manager.rs](https://github.com/cBournhonesque/lightyear/blob/125f454bf49adf922b245938e33ca3470a82233b/crates/transport/transport/src/packet/priority_manager.rs) | 固定 commit 125f454bf49a |
| cBournhonesque/lightyear | [examples/priority/README.md](https://github.com/cBournhonesque/lightyear/blob/125f454bf49adf922b245938e33ca3470a82233b/examples/priority/README.md) | 固定 commit 125f454bf49a |
| colyseus/colyseus | [packages/core/src/Room.ts](https://github.com/colyseus/colyseus/blob/23f8d9180bce683fb29b199005bfb00568da4d3f/packages/core/src/Room.ts) | 固定 commit 23f8d9180bce |
| MirrorNetworking/Mirror | [Assets/Mirror/Core/SnapshotInterpolation/SnapshotInterpolation.cs](https://github.com/MirrorNetworking/Mirror/blob/c4f3739966e151f405be1762d33502794fd034ff/Assets/Mirror/Core/SnapshotInterpolation/SnapshotInterpolation.cs) | 固定 commit c4f3739966e1 |
| lucaspoffo/renet | [renet/src/channel/unreliable.rs](https://github.com/lucaspoffo/renet/blob/2a5080d78d9ea4c3868c3efc80487573906a0eb1/renet/src/channel/unreliable.rs) | 固定 commit 2a5080d78d9e |
| ddnet/ddnet | [src/engine/shared/snapshot.cpp](https://github.com/ddnet/ddnet/blob/f78b2663982f8cd76fb6df635782d9c8cd199f12/src/engine/shared/snapshot.cpp) | 固定 commit f78b2663982f |
| ddnet/ddnet | [src/engine/server/server.cpp](https://github.com/ddnet/ddnet/blob/f78b2663982f8cd76fb6df635782d9c8cd199f12/src/engine/server/server.cpp) | 固定 commit f78b2663982f |
| ddnet/ddnet | [license.txt](https://github.com/ddnet/ddnet/blob/f78b2663982f8cd76fb6df635782d9c8cd199f12/license.txt) | 固定 commit f78b2663982f |
| id-Software/Quake-III-Arena | [code/server/sv_snapshot.c](https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/server/sv_snapshot.c) | 固定 commit dbe4ddb10315 |
| id-Software/Quake-III-Arena | [code/qcommon/msg.c](https://github.com/id-Software/Quake-III-Arena/blob/dbe4ddb10315479fc00086f08e25d968b4b43c49/code/qcommon/msg.c) | 固定 commit dbe4ddb10315 |
| Anuken/Mindustry | [core/src/mindustry/core/NetClient.java](https://github.com/Anuken/Mindustry/blob/3a5481351355735bfe1a2e7e48a5baaa81d214d0/core/src/mindustry/core/NetClient.java) | 固定 commit 3a5481351355 |
| OpenRA/OpenRA | [OpenRA.Game/Network/OrderManager.cs](https://github.com/OpenRA/OpenRA/blob/f3ec7f8e1593b482f85fd101652deb740c33dee6/OpenRA.Game/Network/OrderManager.cs) | 固定 commit f3ec7f8e1593 |
| Anuken/Mindustry | [core/src/mindustry/core/NetServer.java](https://github.com/Anuken/Mindustry/blob/3a5481351355735bfe1a2e7e48a5baaa81d214d0/core/src/mindustry/core/NetServer.java) | 固定 commit 3a5481351355 |
| pond3r/ggpo | [src/include/ggponet.h](https://github.com/pond3r/ggpo/blob/7ddadef8546a7d99ff0b3530c6056bc8ee4b9c0a/src/include/ggponet.h) | 固定 commit 7ddadef8546a |
| timetocode/nengi | [core/snapshot/entityUpdate/chooseOptimization.js](https://github.com/timetocode/nengi/blob/763ef4b8b93829540da06d9c47d174f014dd47a2/core/snapshot/entityUpdate/chooseOptimization.js) | 固定 commit 763ef4b8b938 |
| timetocode/nengi | [core/protocol/compare.js](https://github.com/timetocode/nengi/blob/763ef4b8b93829540da06d9c47d174f014dd47a2/core/protocol/compare.js) | 固定 commit 763ef4b8b938 |
| skywind3000/kcp | [ikcp.c](https://github.com/skywind3000/kcp/blob/master/ikcp.c) | 获取时分支快照 |
| timetocode/nengi | [core/instance/Instance.js](https://github.com/timetocode/nengi/blob/763ef4b8b93829540da06d9c47d174f014dd47a2/core/instance/Instance.js) | 固定 commit 763ef4b8b938 |
| clockworklabs/SpacetimeDB | [LICENSE.txt](https://github.com/clockworklabs/SpacetimeDB/blob/master/LICENSE.txt) | 获取时分支快照 |
| FirstGearGames/FishNet | [LICENSE.md](https://github.com/FirstGearGames/FishNet/blob/main/LICENSE.md) | 获取时分支快照 |
| Unity-Technologies/com.unity.netcode.gameobjects | [LICENSE.md](https://github.com/Unity-Technologies/com.unity.netcode.gameobjects/blob/develop-2.0.0/LICENSE.md) | 获取时分支快照 |
| ValveSoftware/source-sdk-2013 | [LICENSE](https://github.com/ValveSoftware/source-sdk-2013/blob/master/LICENSE) | 获取时分支快照 |
| geckosio/geckos.io | [packages/server/src/geckos/channel.ts](https://github.com/geckosio/geckos.io/blob/master/packages/server/src/geckos/channel.ts) | 获取时分支快照 |
| ValveSoftware/source-sdk-2013 | [src/game/server/player_lagcompensation.cpp](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/player_lagcompensation.cpp) | 获取时分支快照 |
| geckosio/geckos.io | [packages/common/src/reliableMessage.ts](https://github.com/geckosio/geckos.io/blob/master/packages/common/src/reliableMessage.ts) | 获取时分支快照 |
| geckosio/geckos.io | [packages/server/src/deps.ts](https://github.com/geckosio/geckos.io/blob/master/packages/server/src/deps.ts) | 获取时分支快照 |
