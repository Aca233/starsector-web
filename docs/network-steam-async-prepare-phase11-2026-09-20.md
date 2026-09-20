# Steam 快照异步准备：phase11（2026-09-20）

## 结论与边界

本轮将有界快照准备 Worker 接入生产默认路径。它提高实际接收状态 Hz，不修改渲染计数、模拟精度或战斗规则。还没有证明用户 n2n/Steam 双机稳定 60Hz；未提交、推送、安装、打包或发布，不涉及生涯模式。

本阶段仅将 Steam helper 的快照准备移到 Node Worker；不能将以下 Steam SDK 替身结果宣称为 LAN/n2n 的性能收益。LAN 保留此前改动，本轮进行了网络回归。

## 实现

- 新增 snapshot-prepare-state.mjs、snapshot-prepare-worker.mjs、snapshot-prepare-broker.mjs。主线程继续拥有原生 Steam 发送、精确 ACK 归属、帧/字节/共享上行窗口和 canonical 渲染消费额度。
- 一个正在处理的广播加一个最新待处理广播，不保留历史未发快照。最多九个客机编码器；同广播共享准备缓存和既有差分预算。跨线程传输字节，不 structured-clone 解码后的世界。
- Worker 只提出候选。返回时重新检查全部原有流控；所有原生分片接受后才提交对应客机基线。未通过流控、发送失败及部分接收不得成为下次基线。
- 二进制、JSON、旧客户端、小包/特殊字段等回退经过同一有序事务流。修复 legacy commit 返回 void 被误判失败、legacy-first 混合广播误用前一帧 canonical text 两个候选实现问题。
- 每个本机客机记录使用不含身份的 key/epoch。match/launch/ended/roomClosed、有效 needsFull、关闭、连接替换令未发送旧候选失效。Worker fault/exit/error 隔离并关闭相关连接，不悄悄切换到不同基线；新连接可建立新 Worker。
- 新 Worker 看门狗与原有 8 秒失败界限一致；没有延长原网络/渲染 ACK 超时，也不引入 2 秒短暂卡顿即断开的门槛。退出先同步清除房间状态，再等待 Worker 终止，保留原有生命周期语义。
- snapshotWorker 日志增加 offered/replaced/prepared/accepted/stale/faults、批次工作/排队时间及 maxRetained。原 preparation 在异步模式只统计主线程发送阶段，不能当作 Worker CPU；工作时间见 snapshotWorker.workMs。白名单不记录快照、Steam ID 或异常内容。
- snapshotPreparation:false 是显式同步参考模式，仅用于已有虚拟时钟回归和 ABBA 对照。注入 SDK client 本身不会禁用 Worker。旧同步测试已明确标注参考模式；不能拿它们冒充异步压力验收。

## 双进程、真实 WS/TCP 限速 ABBA

证据：artifacts/network-latency-phase11-20260920/integrated-link-abba.json、.log、probe-integrated-link.mjs。

固定使用发布 v0.2.5 ef043ecef4547321929dd0ffb0eee47074d08b13 的 22 舰完整录制（phase5/frames22），不运行工作区其他任务的引擎改动。60Hz 提供、每轮 12 秒、前 2 秒排除、60ms 模拟传播；顺序为同步/Worker/Worker/同步。

|链路|同步接收 Hz|正式 Worker 接收 Hz|同步状态年龄 P95|Worker P95|
|---|---|---|---|---|
|4Mbps|17.9 / 18.1|18.4 / 18.4|211 / 217ms|230 / 213ms|
|32Mbps|51.7 / 48.8|58.6 / 58.1|75 / 78ms|74 / 76ms|

32Mbps 主线程 capture+relay decode+send 均值约 9.29/10.21ms → 2.78/2.92ms；Worker 另承担编码工作，不能说总 CPU 降到 3ms。每个接收状态均与完整录制 canonical JSON 相等，八轮 errors 均为空；原线上 <=32 帧限制和 active+latest <=2 不变。

限制：这是 SDK/路由替身，不是原生 Steam、n2n、浏览器游戏应用或 input-to-photon；未协商 renderer consumption。这份测试不经过客机本机浏览器 bridge。phase10 的 browser bridge 是另一份独立证据，不能混为一项端到端测量。

此前 worker-link-abba.json 是原型证据，不是生产集成：其 reset/生命周期不完备，不能导入生产；其中 “both phase10 binary bridges” 的范围描述不准确，应按本节更正理解为 host binary descriptor + receiver shim，没有真实 browser bridge。

## 验证

- 新异步测试覆盖真实 Node Worker、新旧客机、混合顺序/格式回退、准备不提交、接收子集、失败不提交、重复/伪造决定、reset/retire、转移所有权、只保留最新、fault/exit/hang、终局失效、needsFull、重连。
- 实际九客机 Worker 测试：二进制/legacy 混合，一个渲染端不发送 consumed，其余正常接收；保持原 canonical 上限。仅是短时功能/隔离测试，不能称作九人实网带宽骤降通过。
- 网络 node:test 回归 151/151；本轮完整枚举见 network-test-files.txt，不与上阶段不同集合的 176 项混算。
- typecheck=0、lint=0；lint 仅其他任务已有 campaign 警告，未改动。
- 首轮完整 Steam 317/322：三项原有压力失败，以及两项本轮引入的退出清理时序失败。后两项已修复，最终定向回归 98/98 通过，包含两个退出清理回归及全部新 Worker 测试；结果见 final-targeted-tests.log。最终修复后没有重跑整套耗时压力测试，不能宣称完整套件全绿。
- 原有未解决压力项：legacy 九人 8Mbps→256Kbps；实验 Sockets 120 秒骤降+3秒停顿恢复；实验 Sockets 九人健康链路吞吐。没有降低其断言。
- write:false 打包图审核：portable 43 个输入、Electron service 42 个输入，均含 Worker 三个模块且无 campaign。source-manifest.json 保存 50 个输入/测试哈希；仅检查依赖图，不是发布包或安装验收。

## 未完成

用户双方 n2n/原生 Steam 实机日志对照，游戏实际应用/显示时延，真实低带宽骤降与多人异步长测，以及稳定端到端 60Hz。带宽受限的 4Mbps 情况仍约 18Hz；这轮没有根治这类瓶颈。不要将本轮完成解释为整体低 Hz/延迟/断线问题已全部解决。
