# LAN 显示流水线共用化：实现前对照（2026-09-25）

目标是把上一轮已验证的Worker接收/渲染能力接到现有联机播放和预测逻辑，不维护一个省略特效/预测的第二实现。先将LanBattle正在使用的端点恢复、分流合成、预测与本地特效整理为无DOM流水线，并让默认LanBattle和LanPresentationRuntime共用同一代码；默认网络、同步状态机、HUD、音频和输入仍由现有组件负责。此步骤不能冒充完成Worker联机切换。

原版0.98a-RC8依据沿用已核实的network-motion-prediction-phase26和network-local-fire-prediction源记录。本轮重新读damage/OOoO.java:160–168的整数热光通道和damage/String.java:169–188的alpha/stencil规则，不修改这些公式或资源。MotionPrediction是明确标注的Web联机显示扩展，不是原版的第二份权威模拟。没有新原版桌面验证；用户未允许桌面操作。

当前顺序证据：LanBattle.tsx的accept先保留播放端点再接收每个muzzle窗口；RAF采样后，对每个恢复端点依次记录应用tick、弹道/粒子/开火/炮塔预测、关键状态与运动基线；之后critical→motion→projectile visuals→局部预测→摄像机→尾迹/炮口/粒子/弹道/开火效果→WebGL。同步检查位于端点恢复和姿态预测之间，不能为了抽类跨过这条边界。相机仍在姿态预测之后、本地效果之前。

预期不变：逐端点ACK使用对应端点玩家姿态；确认时间提前量不丢失；critical的武器写入仍按到达/恢复去重；运动分流最新姿态不被暂停预测擦除；炮口事件按接收顺序保留，不随播放端点淘汰丢掉。保留所有质量/频率/安全检查。不在抽取时改算法。

验证：修改前冻结652模块（e6356fa5bebd51a1e4a5752137a7e02e95bb97e6ab76d56e698ee8fd53c1e2a2）。实现后集中typecheck、定向lint、现有无头普通联机场景（不启用任何输入事件夹具）；扩展现有Offscreen场景对照原顺序与共用流水线的真实快照/像素。只针对具体失败修复。不暂存/提交/推送/打包/发布。
