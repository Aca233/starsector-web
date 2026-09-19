# LAN / Steam 降低延迟：资料调查与项目适配（2026-09-19）

本轮仅查阅公开资料、读取代码并检查旧录制结构；没有修改生产代码、切换默认传输、打包或安装。以下是改造建议，不是已经测得的延迟收益。

## 结论与优先级

当前应优先减少必须高频复制的状态，再消除实时状态等待旧消息重传的依赖。不能用增加超时、扩大窗口、提高压缩级别替代这两项；也不能把显示 FPS、快照接收 Hz、网络 RTT、状态年龄和输入到画面的延迟混为一谈。

### P1：进一步将纯视觉效果事件化

来源：Valve Source SDK 的 `TE_DispatchEffect` 按名称和参数派发特效，并使用接收者过滤器，而不是要求每个粒子每帧复制。

项目已有 `HostMuzzleEvents` / `LocalMuzzleEffects` 和 `LocalContrails`，不是从零开始。下一步逐类审计 `CombatFXSystem` 中爆炸、碎屑、命中光效、漂浮文字等：对于纯展示数据，发送事件 ID、发生时间、类型、位置、初速度、随机种子及版本等必要信息，客机依据权威展示时间播放。

约束：不改变伤害、碰撞、AI、战斗 RNG 消耗顺序或舰船数量；事件要去重，过期事件不能重播，暂停/断线恢复不能突然播放积压效果；有持续可见效果时需有有限重放窗口或重连检查点。自定义/无法保证确定性的效果保留旧路径。不能直接删除 `fxSystem`，也不能把物理碎片错当纯视觉粒子。

LAN 和 Steam 可共享同一套事件内容层，再各自编码和输送。

### P1：对象/字段级增量，不只做整帧字节差分

来源：Gaffer 的 Snapshot Compression 讨论使用接收端已确认的基准，以及按对象变化情况编码。

目前 LAN SLD1 在完整二进制状态已采集/编码后做字节差分，因而不消除前面的全树遍历和后面的全树解码/还原。后续可建立明确网络模型：对象 ID + generation、字段 dirty mask/revision、出生/删除、已确认基准；动态位置和关键战斗状态高频传，确实未变化的装甲格/配置/低频状态只发变化。先选一个稳定对象类型试点，保持数值无损，不默认量化。

项目已存在 metadata 引用、字段字典和 Steam 差分，不能把“再次加字典”当作新方案。必须先测各类别真实压缩后费用与采集/还原耗时；不能用未压缩 JSON 字节占比当最终流量占比。

风险：现有 `restoreCombatSnapshot` 按完整快照恢复，缺失对象可能涉及删除/回收，不能直接塞部分对象数组进去。需要独立的 partial-update 应用规则、版本协商、删除 tombstone、重连完整检查点和旧端回退。

### P2：实时状态与可靠控制拆开，移除跨类别队头阻塞

来源：Valve GameNetworkingSockets 的可靠/不可靠消息、ConfigureConnectionLanes；ENet 的独立 channel 序列；Yojimbo 的 unreliable-unordered 与 reliable-ordered 两种消息。

建议分类：
- 房间、创建/删除对象、装备变化、离散动作、终局等必须到达的信息：可靠、序号/幂等保护。
- 可替换的连续状态和连续输入：允许乱序/过期丢弃，保留最新有效序号；输入可携带最近少量冗余样本，不能把一次性动作一起任意丢弃。
- 配置/大检查点：独立低优先级可靠通道，避免挡住当前战斗控制。

桌面 LAN 可评估原生 GNS/IP UDP 或 ENet；普通网页不能直接开原始 UDP socket，应评估 WebRTC DataChannel。WebRTC `ordered:false` 只关闭顺序要求，本身不关闭重传；需同时按用途选 `maxRetransmits` 或 `maxPacketLifeTime`（二者不能一起指定），并考虑 SCTP 共享拥塞和大消息分片问题。

Steam 已有 `sockets-v012.mjs` 的三 lane、ReliableNoNagle/UnreliableNoDelay 实验实现；不要再另写同一套，也不能把其存在说成默认已经启用。默认 gateway 仍是旧 P2P Reliable=2；该值并不是 ReliableWithBuffering=3。

关键限制：**目前 LAN SLD1 依赖可靠有序链路与两 anchor 保留模型，不能原样搬到不可靠/乱序通道。** 需要新的 capability 和基准协议，保证精确确认、基准保留、丢失恢复、过期包判定；不可靠链路不能因为确认了更高序号就假定更低序号 anchor 已到达。控制/状态跨通道后还需要 epoch、对象 generation 和生效 tick 协調。

也不能把几十 KB 完整快照直接当不可靠 UDP 消息发送。Valve 明确说明一个不可靠大消息的任意分片丢失会导致整个消息丢弃。要先缩包，按 MTU/库的分片预算设计独立可应用更新，再评估重传策略。举例仅作独立丢包模型：60 KB 分成约50片、每片丢失1%，全消息缺片概率约39.5%；不是现场丢包率结论。

### P3：按重要性分配对象更新预算

来源：Gaffer State Synchronization 的 priority accumulator；每次只清空实际发出的对象优先级，避免低优先级对象长期饿死。

玩家本舰、近距离威胁、碰撞/命中相关对象优先；远处对象、低频状态、纯视觉数据排后，并给最大陈旧时间。不是关闭房主模拟或删除远处舰船。会改变不同对象收到新状态的频率，属于更大的语义改动，应先实现对象级协议并明确战术视图/雷达/全图观察所需数据。

Gaffer 示例在双端运行模拟，而当前客机主要做权威快照展示；不能照抄其物理状态同步/量化设置。可借鉴预算调度思想，不照搬一致性假设。

### P3：展示和操作延迟单独优化

来源：Gaffer Snapshot Interpolation 说明缓冲是在平滑与附加延迟之间取舍。

项目已有 `MotionPrediction` 和 `SnapshotPlayback`，已有输入回放/纠偏及自适应播放缓冲，因此“加预测/加插值”并非新发现。可以测量确认后进一步优化自舰响应、离散动作表现和回调调度，但不冒充降低实际 RTT；暴力放大插值缓冲会让画面更平滑却更晚。

## 不应优先重复尝试

- `ws` 已在 `node_modules/ws/lib/websocket.js` 调用 `socket.setNoDelay()`；旧 Steam Reliable=2 也不是带缓冲的模式。不能宣传关 Nagle 能解决当前数秒积压。
- Valve 的 UnreliableNoDelay 不是“必定零排队”保证，其文档描述的丢弃门槛也不能当应用低延迟预算。仍需应用级有界准入。
- 增大可靠发送队列、延长断线时间、提高 zlib 级别不是默认解决办法；可能加重排队或 CPU 压力。
- 完全确定性 lockstep / 全战场 rollback 不是本项目低成本捷径：目前物理、AI、随机数和扩展系统不具备已经验证的跨机确定性，回放成本与弱机拖慢风险都需要单独评估。

## 录制证据的新增限定

本轮核查发现，旧 `artifacts/lan-delta-20260919/capture32.ts` 确实执行真实引擎和 `captureCombat`，但没有像正式 `host.worker.ts` 那样安装 `HostMuzzleEvents` 并写入事件快照。因此旧录制含本可被正式枪口事件路径替代的粒子状态，不能把该录制的 FX 费用或22～44%压缩收益直接当作当前正式联机收益。

这不否定已保存字节的无损编解码一致性和该数据集上的压缩测量；限制的是生产代表性。后续基准需要录制正式 host 发包路径，覆盖 muzzle sink 成功和回退、大爆炸/碎屑、舰载机、多接收端，并保留 capture/encode/queue/consume/display 的独立时间信息。

## 建议执行顺序与验收

1. 先补正式发送路径录制和按类型/阶段剖析，避免继续优化错对象。
2. 用同一录制验证更多纯视觉事件化和对象级无损增量，先保留现有可靠传输。
3. 数据足够小后，再推进已存在 Steam Sockets 分通道实现及 LAN 对应方案，而非直接改 send flag。
4. 分别测真实双机 LAN/Steam，在同负载下对照实际已发/已收字节、接收 Hz、状态年龄 P50/P95、应用/原生 RTT、输入到可见响应、丢包/重连一致性。用限制带宽、抖动、乱序、短时丢包进行压力验证，不只跑健康网络。

本轮没有得到新的双机性能数值，不承诺固定节省多少 ms。

## 查阅来源

- Valve GNS README（功能/不负责上层实体序列化）：https://github.com/ValveSoftware/GameNetworkingSockets
- Valve lanes（独立可靠顺序、优先级/权重）：https://github.com/ValveSoftware/GameNetworkingSockets/blob/master/include/steam/isteamnetworkingsockets.h
- Valve send flags、大不可靠消息分片风险：https://github.com/ValveSoftware/GameNetworkingSockets/blob/master/include/steam/steamnetworkingtypes.h
- Valve 特效事件实现：https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/te_effect_dispatch.cpp
- ENet 独立 channels 设计：https://github.com/lsalzman/enet/blob/master/docs/design.dox
- Yojimbo：https://github.com/mas-bandwidth/yojimbo
- Gaffer Snapshot Compression：https://gafferongames.com/post/snapshot_compression/
- Gaffer State Synchronization：https://gafferongames.com/post/state_synchronization/
- Gaffer Snapshot Interpolation：https://gafferongames.com/post/snapshot_interpolation/
- MDN WebRTC createDataChannel：https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel

访问说明：以上 GitHub 文件通过连接器读取；Gaffer/MDN 页面直接读取。搜索浏览器不可用、Google请求失败，Valve Developer Wiki 返回验证页，均未把失败页面当技术证据。
