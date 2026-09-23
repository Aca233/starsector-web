# 分层联机第五阶段：共享基线、独立弹体显示链路（2026-09-21）

## 状态与边界

**部分底层实现及验收完成，不是“全部延迟/HZ 已解决”。** `VITE_LAN_LAYERED_SYNC=true` 仍为显式实验开关，默认关闭。本阶段只接入 LAN 独立服务端权威 + 桌面 helper 路径；旧客户端/浏览器直连/Steam 不会被误协商进来。没有提交、推送、打包、发布，也未修改生涯模式。

完整 world 尚未移除 projectiles：矿雷 FX、目标指示、光束、伤害/爆炸/护盾效果还依赖原同步。**此阶段同时发送两条投影，会增加总流量；不能仅用编码/插值测试宣称网络整体更快，更不能默认打开。** 尚需同一共享低带宽链路的完整场景复测和统一调度。

## 先前方案在实录中失败、修正与测量

原固定基线第一次回放在 tick654、191 弹体时失败：原始基线 132259B，超过 128KiB 上限，且每次微小外观改变会重发整块导弹规格，频繁换基线。没有直接提高上限来掩盖放大。

对未上线的 SVP1 使用显式消息体 `visual-columns-a1`，把 appearance 拆成逐字段精确补丁。SPE1 一般精确记录协议未变。补丁严格验证删除、字段、投影和 CRC，错误不得推进基线。浮点 ID 不量化，动态列仅保留既有显示误差边界。

复测：`scripts/benchmark-anchored-projectile-visuals.mjs`，22 舰同一 4 秒录制，**首包及所有周期基线都计入**。数据为 deflate level1 后的协议字节，**不含传输层 JSON/base64/WS/TCP/n2n 开销**，不能当真实链路总速率。

| 路径 | 取样 | 单客机协议压缩 B/s |
|---|---:|---:|
| 逐包有序 SVP1（appearance 改善后） | 20Hz | 41027.25 |
| 共享固定基线、允许丢中间更新 | 20Hz | 68073.50 |
| 逐包有序 SVP1 | 10Hz | 24361.50 |
| 共享固定基线 | 10Hz | 37543.00 |

共享基线方案 20Hz：81 发布、81 prepare、5 基线；解码包含五个健康/跳帧/停顿/晚加入消费者。最大原始包 17219B。编码次数不随人数增长，但字节比最省流量的逐包有序链更高，必须如实保留此取舍。最后一轮编码 P50/P95 约 5.31/8.32ms，解码约 3.08/6.16ms；这些是本机诊断，排除 native capture、压缩 CPU、真实链路与 GPU，且存在并行后台测试影响，不作为发布性能阈值。

结果：`artifacts/network-stream-20260921/anchored-projectile-visuals.json`。

## 已接入的链路

1. 权威 worker：最多 20Hz 视觉发布、一个待消费 IPC 邮箱。与整帧和 motion 信用分开，错误 tick 回执不释放。一次编码服务全房间；不可 transfer/detach 编码器保留的基线，使用 structured clone。超规格失败最多每秒重试一次，保留完整 world 回退。
2. `AnchoredProjectilePublisher/Receiver`：每次更新从只读基线 fork，保留一个基线和最新更新。更新 revision 可重复为 2，真正回执身份为 match/sync/key/tick/kind，不能把 revision 当包序号。新客机可以从缓存基线和最新修正直接恢复。
3. `LanProjectileVisuals`：按房间编码 base64 一次，轮换接收者；每客机最多 2 个精确消费额度。房间在途 JSON 原始字节上限 64KiB、每客机 32KiB、原始 JSON token bucket 512KiB/s。计量保守，**不是测得的线路 BDP 或真实 wire bytes**。因 32KiB 传输限制而无法发出的较大基线记录 oversizeBaseline，继续完整 world，不会放宽边界。
4. 基线经 primary；有基线消费凭证后，小更新经已有 control lane。helper 只转发，不假冒解码、GPU 呈现或用户收到。更新不加入无界队列；慢客机只追最新。不支持/断开的 control lane 继续原世界路径。
5. 消费者区分 `consumed` 与 `discarded`。无监听者、隐藏、旧 sync 或解码失败可丢弃释放已收到包，但不得授予 base-ready。重同步、离房和关房只退休旧额度；真实回执或 socket teardown 才解除在途债务。旧 match/sync/重复/伪造回执不能生成额度。
6. 显示层：独立 WeakMap 层供 WebGL 投射物通道和本地导弹尾迹使用。**从不赋值 CombatEngine.projectiles 的委托 setter，也不在客机运行制导/碰撞/伤害。** 仅两个接收端点之间插值，停在接收端点；超过 500ms 隐藏陈旧流并清尾迹，旧 bulk 不能复活已移除弹体，新 world 赶上后可接管。静态已物化字段只读共享，不每个 RAF 重建整组实体。
7. 核对 LocalContrails 消费者后补入 `collisionDisabled` / `isDisarmed` 精确显示门控。独立视觉流不再被旧 bulk 的 reset 时钟误清尾迹；真正生命周期清理由 clear/reset 处理。
8. 日志：已有诊断 pong 增加视觉发布/发送/消费/丢弃、在途峰值、可写性/预算拒绝、超限基线及 producer 故障；客户端样本增加视觉 tick、实际收到帧数、实体数。它们不是 FPS，也不把插值算收到的 Hz。

## 验证范围

- 新协议、fork、3/4/5 人慢客机/跳帧、真实 WebSocket + 每客机独立 helper + 控制通道、重同步、生产 LanConnection ACK、渲染 setter 隔离均有自动测试。
- socket 集成使用合成弹体和测试权威生产者；真实 authority worker 另测独立 mailbox、精确 ACK、整帧被扣留仍发布。不能把两项分开测试写成真实 5 人大规模游戏已验收。
- 原生投射物验证维持 1915 样本、14629 draw 调用，涵盖 MISSILE/BALLISTIC/BALLISTIC_AS_BEAM，并实际把只读层接到原 renderer 比较量化后调用参数、验证权威对象/随机数未修改。GPU/纹理尺寸仍是 stub，**不是像素等价或跨机性能验收**。
- 最终门禁结果以本文末尾记录为准。测试日志在 `artifacts/network-stream-20260921/`。

## 未完成、下一步

1. 同一 3/4/5 人共享 4Mbps/高 RTT 场景中，把新视觉流、motion、输入、完整 world **一起**测量并统一预算；不得单独加通道导致总排队回退。
2. 及时生命/flux/护盾/命中以及 beams/矿雷等完整显示依赖；验证后才从 bulk 省略重复投影。还没有解决之前 1Hz 左右完整世界带来的状态陈旧问题。
3. Steam 仍缺这套优先流适配；既有实验性 Sockets 压力失败也需修正，不能用 LAN 测试覆盖 Steam。
4. 真实多机 n2n/Steam、重负载整场 renderer/最终真实 GPU 性能验收待做。独立无头 WebGL 接入烟测已通过（见下），但不代表实际游戏 FPS、跨机器延迟或原版画面等价。

## 本阶段最终门禁

- 网络 workflow：**327/327**，日志 network-gate-phase5.log。包含独立 worker、协议、生产连接、3/4/5 台模拟桌面 helper 的真实 loopback socket 测试；不是实际多机器/真实共享弱网测试。
- 原生 capture/receiver/draw：**9/9**，日志 native-capture-phase5.log。
- App TSC 和本阶段所改文件 focused oxlint：通过。
- 新增后台无头真实 WebGL 烟测：scripts/check-projectile-visual-renderer.mjs，自启临时 Vite listener 并关闭、全新无头 Chromium profile、不操作用户桌面。空场 3316 个阈值像素，接收合成 TPC 视觉流后 4965，移除后精确回到 3316；WebGL 无错误、pageErrors 空；engine.projectiles 引用/内容与权威随机数保持不变。采用本地真实 shader/纹理。**只证明显示链路接入，不证明原版像素等价、网络性能或物理 GPU FPS。** 日志 visual-renderer-phase5.log。
- Steam 全量初跑：**323/326**。其中 duplicate ACK 测试用了两次不同 Date.now 样本，oldestAckMs 0/1ms 变化导致偶发失败，现改成同一采样时间（没有放松队列/回执断言），该组重新运行 **4/4**，日志 steam-fast-ack-phase5.log。全套修复后尚未重跑，不把这写成全量324/326通过。另两项与前阶段一致的真实未解决项是实验 Sockets 的 120s shared collapse+3s stall 恢复、9 healthy guests 各 >=40Hz，日志 steam-gate-phase5.log。

没有启用默认实验功能或发布版本；本阶段不能标记整个延迟优化目标完成。
