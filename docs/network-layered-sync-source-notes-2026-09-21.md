# 分层同步第一阶段：来源、行为边界与验收（2026-09-21）

用户已明确允许重做底层架构，并接受此前提出的高频关键状态与完整世界分开更新方向。

原版来源：本机 `decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java` 的 getLocation/getVelocity/getFacing/getAngularVelocity、isExpired/wasRemoved；`ShipAPI.java` 的舰船生命周期和 Ship 系统接口。此处仅据接口确认位置、速度、朝向与生命周期是独立概念，不臆测原版存在联网实现。原版精确版本本轮未核实；未获准操作桌面，不做原版实机/外观等价声明。

Web 证据：`host.worker.ts` 固定步进后才更新 controls.acknowledged；`MotionPrediction.ts` 已有仅运动预测；`ShipPresentation.ts` 用 WeakMap 保存渲染姿态，不参与模拟或存档。现有 `SnapshotPlayback` 的完整状态端点不能被预测帧或小消息冒充。

最小对照：权威位置/速度/朝向/瞬移代号 → 单独、精确 float64 小包；权威处理后的 input ACK → 随小包发送；完整战场 → 仍走原快照编码与消费验证。只在已协商、已同步、独立通道确实消费的客机上降低完整世界发送频率，主机物理仍 60Hz。绝不以小包 tick 修改完整世界 tick/HZ。

实现阶段一以桌面 LAN 独立控制通道为入口，编码/窗口/呈现模块独立于 transport；Steam 暂不宣告具有独立快状态通道，未经自身背压/压力验证不启用。原版 HUD 布局/玩法不改；网络诊断作为扩展明确区分关键状态、完整状态和 FPS。

验收：编码往返保留全部位、畸形包/重复ID/预算拒绝；权威来源、match/sync epoch 与真实消费校验；快状态不得被旧完整状态回滚；过期/断线/隐藏/重连清理；Worker 两种发布额度各自有界；3/4/5 人真实 socket 与共享限速回放。结果另行记录，以上不是已通过的声明。

结果：第一阶段实现与实验开关、实测失败边界见 `network-layered-sync-phase1-2026-09-21.md`。Steam 未启用，客户端默认不请求 motionState；需显式设置 VITE_LAN_LAYERED_SYNC=true。独立通道 RTT 使用负载前原生 ping，不再以应用 ACK 抬升窗口。

第三阶段继续只改变传输封装和生命周期，不改本机原版物理/玩法/UI：SLD1/SWB1 原字节 → 整体压缩及有界 SWC1 分片 → helper 完整恢复 → 原 decoder/renderer 消费。分片 ACK 只释放实际传输字节；当前输入应用序号、完整世界序号和渲染消费合同保持独立。原版界面/实机验证仍未进行，不做视觉等价声明。实现与真实 socket 回归、吞吐/新鲜度负面结果记录于 `network-layered-sync-phase3-2026-09-21.md`。
