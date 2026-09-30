# LAN 原始二进制呈现入口：实现前记录（2026-09-25）

## 原版与现有实现证据
已查看本机原版0.98a-RC8 `../starsector-core/data/config/settings.json:8-12`（vsync / 60fps），以及 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatUIAPI.java:12-27`（呈现/操控读取API）。本轮仅移动 Web 联机状态数据的所有权，不改原版玩法、模拟频率/精度、界面布局或输入。没有原版实机或新的截图对照，不声称原版网络实现等价；原版API也不能证明Web多线程收益。

现状：`protocol.ts` 的 onmessage 先运行 LanDeltaReceiver / decodeBinaryState，再交出完整frame；`LanBattle.accept` 将离散事件保留到实际 `LanPresentationRuntime`，随后完成消费回执。若独立解码Worker仍传回frame，会多一次完整图遍历。已有 `PresentationReceipts` 能等真正消费，但尚无原始网络包直接进入呈现所有者的通道。

## 预期与范围
增加显式、独占、按会话撤销的二进制原包入口。主线程只读取有界头部（SWB1最多1024字节元信息或SLD1固定头部），保留本地ACK身份和解码后字节预算。头部检查不是CRC/帧内容验证；这些仍须所有者用原有完整decoder验证，实际Runtime保留离散事件后才完成回执。原包可直接transfer，恢复后的frame不得再跨线程。

保留未认领时现有主线程路径；不得默认启用尚缺飞行输入/完整音频/组件信用的Worker模式。二进制入口只覆盖完整state/SLD1，不冒充JSON、motion/combat、视觉组件、本地主机或完整联机迁移。JSON fallback仍走原路径且撤销增量基线；切换/撤销活动所有者须重建基线，不得从缺失anchor继续。过期会话不能污染新世界。现有端到端同步、音频和动作消费仍由未来完整控制器衔接。

## 验证计划
冻结非生涯源码；实现后一次typecheck、scoped lint、扩展既有无头Offscreen场景，使用实际LanConnection准入、生产原包decoder、实际Runtime/Worker和transfer，检查完整包/delta一致、旧回执/坏CRC/缺失基线/错误身份/背压/取消/终局顺序。保留无关WIP；不启动可见窗口、不注入键鼠、不用子代理、不提交/发布。无配对性能测量则不声称FPS或延迟提升。
## 实现后记录
- 新增 `LanBinaryStateIngress.ts`：有界SWB1/SLD1头部准入及所有者侧完整decode。复用原有 `LanDeltaReceiver`、CRC、motion-reference纠正和 `decodeBinaryState`；未改wire格式/数值精度。`BinarySnapshot` 只抽取公用的头部读取函数。
- `LanConnection.claimBinaryState()` 是显式、独占能力，只能在第一包binary之前认领。未认领时原路径不变；默认LanBattle没有自动认领或启用Worker。认领后原包直接交所有者，可transfer；ACK身份仍由本地头部/已绑定match决定，不允许远端回复选择服务器seq。
- 实际Runtime新增显式会话reset与receiveBinaryState，完整解码、bootstrap恢复、播放队列/离散muzzle保留都在该realm内。额外声音/输入事件需同步onRetained完成后才允许调用方完成网络回执；不返回frame给跨线程运输层。
- 审查补上：raw owner必须显式defer/complete/reject，不能因空回调自动按discarded授予信用；Promise返回被拒绝且不会遗留未处理拒绝；关闭清除owner引用；投影能力改变撤销代际，并在活动流请求resync；过期/换owner的同步重入不能返回retained成功。
- JSON回退只在没有待消费raw工作时交回既有订阅通道。若尚有未完成消费，明确重连恢复，不能取消旧事件后若无其事继续JSON。活动流释放owner也重连重建基线；不声称动态无缝切换。
- 首轮探针使用旧encodeBinaryFrame对SWF3数值块再编码，返回null导致测试失败；已改用支持该投影的encoder做测试内CRC对照，未放宽生产验证。后续28项专项通过、首帧像素差异0。
- 首次全工作区typecheck受并行生涯 `CampaignClient.ts` TS2345影响；未修改它。最终冻结before/candidate对照两路诊断均0（其他任务期间已修复共享源码）；不把最初失败说成全工作区成功运行。
- 完整跨线程启用仍须主控制器接入raw owner、所有组件/输入/音频和回退；本轮无正式LAN配对性能结论。回执账本限制的是当前代际准入，不是所有跨代际浏览器message queue的堆内存硬上限；reset撤销token不等于立即回收已transfer的远端消息，完整控制器仍需代际就绪/调度约束。
