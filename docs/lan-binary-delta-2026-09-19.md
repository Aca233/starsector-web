# LAN 高负载：无损增量传输（2026-09-19）

## 为什么不再只改窗口

用户确认高负载截图来自 LAN：完整快照约 328.2 KB、实收约 2 Hz、应用 RTT 2114 ms，而模拟约 3.56 ms/步、绘制约 3.9 ms，不能把它当作 Steam 的测量。上一轮 `LanStateCredits` 修正的是同一 TCP FIFO 中拥塞心跳反向扩大窗口的问题，只能阻止继续积压；它不减少每帧字节，也不能把带宽不足变成 60 Hz。

这次改变远端 LAN 的实际状态传输：用已被客机消费确认的完整二进制状态作为基准，只传必要的复制指令和新字节。客机逐字节恢复原 SWB1/SWF2 后才执行原来的完整解码和消费流程。不是量化、删实体、降低物理/模拟/目标快照频率，也没有延长断线超时。

**这是有实测字节收益的传输改造，但不是“用户现场已根治”的验收结论。** 目前没有用户两台设备上的新包实战数据。

## 接入范围

- `server/LanDeltaTransport.mjs`：接收端独立的已确认/待确认基准、广播内补丁共享、软计算预算。
- `src/network/LanBinaryDelta.mjs`：Node/浏览器共用的 SLD1 无损编码与恢复、CRC32、长度/序号/基准校验。
- `server/lan-server.mjs`：远端 WebSocket 转发前选择增量，原快照背压和消费窗口继续有效。
- `src/network/protocol.ts`：hello/welcome 能力协商、原生 socket 路径恢复、无效增量不消费/不确认。
- `src/network/lan-socket.worker.ts`：已有桌面 LAN I/O Worker 可用时，在 Worker 内恢复，再转移完整 ArrayBuffer 给主线程。主线程仍承担原来的完整状态解码/还原。
- LAN 诊断追加增量是否协商、全量/增量包数、前后应用字节、CPU 预算回退数。该字节数不是压缩后的 TCP 流量，HUD 快照大小仍是恢复后的完整包。

只在双方支持 `binaryDelta:1`、已启用 `stateCredits:1`、**远端连接已协商 permessage-deflate** 时启用。旧端/未压缩本机回环保持旧路径；Steam 不启用这个 LAN codec。桌面桥接只透传消息，浏览器看到 127.0.0.1 不妨碍外层远端 LAN 连接协商增量，亦不能用该地址断言物理链路是本机。

## 连续高负载回放证据

录制由真实 `createLanWorld`、`fixedUpdate(1/60)`、`captureCombat` 和生产二进制编码产生：双方各 1 艘玩家锤头和 15 艘 AI 锤头，共 32 舰，seed 1511506142，tick 600～690 的 91 帧，总 33,142,934 B。这是 Node 离线录制，不是浏览器 FPS/网络实测。

生产 sender/receiver 对每帧做逐字节一致性断言，然后比较 RFC7692 level=1、memLevel=7、无 context takeover 的压缩 payload（含 SLD1 应用封装；不含 WS/TCP/IP 头）。消费 ACK 到达时机是回放假设，不是现场测量。

| 消费确认到达假设 | 原完整包压缩均值 | 增量路径压缩均值 | 减少 |
| --- | ---: | ---: | ---: |
| 下一个发送步前（约 16.7 ms） | 105,670 B | 58,804 B | 44.35% |
| 2 tick（约 33 ms） | 105,670 B | 64,454 B | 39.00% |
| 8 tick（约 133 ms） | 105,670 B | 72,301 B | 31.58% |
| 18 tick（300 ms） | 105,670 B | 81,934 B | 22.46% |

这里用十进制 KB。不能只挑最好结果宣传“降低 45% 延迟”：字节下降不等于 RTT 同比例下降。若强行持续传 60 Hz，以上增量 payload 仍需约 **28.2～39.3 Mbps/接收端**，多人共享上行还会叠加。非常窄的链路依然不可能保持完整状态 60 Hz。模型没有验证截图中约 2 秒 ACK/RTT 的收益，不可外推 22% 为所有更差网络的收益下限。

文件：`artifacts/lan-delta-20260919/frames32/manifest.json`、`production-replay.json`。可运行 `node scripts/bench-lan-binary-delta.mjs` 重新回放已保存录制。录制生成时的 bundle 也保存在 artifact 中；工作区其他战斗功能继续变化，不把后续引擎状态当作同一录制版本。

## CPU 成本和 Worker

- Node 回放的 sender（含 CRC/编码/生成）均值约 1.91～2.37 ms/帧。第一组含冷启动，P95 5.73 ms；其他组 P95 约 2.81～3.29 ms。不是实时承诺。
- 单独 Edge 主线程微基准：原完整解码均值 2.61 ms，新增量恢复均值 2.46 ms，随后完整解码约 2.74 ms。**增量并不免费**，所以没有把新增恢复工作硬塞到所有桌面渲染线程上。
- 真正 Edge Blob WebWorker 运行生产 receiver，1 轮预热 + 2 轮测量、182 次逐字节验证与 buffer transfer：Worker 恢复均值 1.77 ms/P95 2.8 ms，往返交付均值 1.99 ms/P95 3.0 ms，主线程完整解码均值 2.04 ms/P95 2.5 ms。
- Blob Worker 微基准没有真实 WebSocket、SAB 队列或战斗渲染，只证明真实 Worker 执行和 transfer 可行，不等于桌面端战斗 FPS 提升。实际 `lan-socket.worker.ts` 另有 VM 集成测试覆盖队列/协商/失败路径。
- 没有 SAB/无法启动已有 I/O Worker 的浏览器继续原生 socket fallback，在主线程恢复，会产生额外 CPU 成本。HUD 的主线程解析耗时不包含 Worker 内的恢复时间。

对应 `edge-decode.json`、`edge-worker.json`。测试只启动并关闭自有 headless Edge，未操作用户浏览器。

## 正确性、内存与回退

1. 可靠有序的 LAN WebSocket 上使用 SLD1，36 B 头含 flags、基准/当前 seq、恢复长度、基准/目标 CRC；恢复后另核对内部 SWB1 seq 和 matchId。CRC 用于损坏检查，不是密码学认证。
2. 每接收端 sender 最多保留一个已确认、一个待确认基准；receiver 最多保留两个明确标记的 anchor。单帧上限 2 MiB，基准数据总计每端最多 4 MiB（不含原有队列和瞬时分配）。receiver 私有副本不会因传给主线程的 buffer 被 detach 而失效。
3. 基准只在原有同 match、精确在途 seq 校验通过的消费回执后晋升。同步订阅者实际消费完整状态之后仍由主线程发回执，Worker 不提前 ACK。等候确认时后续状态继续从旧已确认基准独立编码，不是每帧停等一个 RTT。
4. 首基准未确认时允许继续发全量非 anchor 状态。后续候选 anchor 可以是增量，不必定时强制发送巨大完整关键帧。跳过尚未发送的状态不改变基准。
5. 小于 4 KiB、大于 2 MiB、JSON 状态走原全量并清基准；raw 补丁未能省约一半则使用完整封装。大小阈值是保守启发，不保证每一种数据的最终压缩比例都更好。
6. 同广播同基准的补丁复用；最多计算两个不同基准，累计 matcher 时间达到 4 ms 后不启动下一个。**4 ms 是软启动门槛，不是单次生成的硬时间上限。** 多接收端轮换起点，超预算的本次状态走全量。CRC、封装、zlib 费用不属于该 matcher 软门槛。
7. 每次 matcher 分配两个 65536 槽索引（共 512 KiB），最多两候选/位置，没有跨帧索引缓存。这个分配/GC 成本仍是后续可能优化的项目。
8. 原在途消费窗口和 Worker 队列按**恢复后的完整字节**计费，不利用小补丁绕过内存上限。隐藏、重连、新 match、JSON 回退等切换清理基准；CRC/缺失基准错误不 emit、不 ACK，走已有有界重连恢复，不制造状态。
9. 这次主要减少 relay→远端接收端的数据；没有改变房主模拟、完整快照采集/编码、房主→relay 上传格式、客机完整状态对象还原或 WebSocket/TCP 的队头阻塞。若这些才是现场瓶颈，本改造不足以消除低 Hz。

## 验证和交付边界

最终本轮相关回归 **110/110**：
- 新增 18 项：codec 10、生产 relay 1、客户端 4、I/O Worker 3。包括有种子的 240 帧变长随机序列、延迟回执/丢弃非 anchor、CRC/长度/操作界限、基准副本、满窗/跳帧、协商/旧端/Steam 排除、隐藏/重连/JSON/超大回退。
- 既有 92 项：LAN congestion/diagnostics、共享发送策略、Steam transport/delta/host-budget/session-metrics/input-queue/cadence/diagnostics。结果在 `regression.txt`。
- `npm run typecheck` 和 `npm run lint` 通过。
- Vite 隔离 production build 通过，build ID `2026-09-19T06:31:21.951Z`，输出在本轮 artifacts/dist，保留既有大 chunk 警告。
- Electron/portable 的静态 runtime 依赖图包含新 sender 和共用 codec；仅检查依赖图，没有生成安装包。
- relay 测试使用内存 socket 和 HTTP listen 替身，没有绑定端口。没有登录/初始化 Steam、邀请好友、更改系统网络/防火墙或关闭用户应用。

“110/110”不是整个项目所有测试均通过。此前独立 Steam 共享链路模型已有 5/6：9 客机共享上行从 8 Mbps 骤降 256 Kbps 后约 20.168 秒仍 `Steam link stalled`。本轮未重跑该独立场景、未修复或删除它，亦未把 LAN 增量冒称 Steam 收益。

**修改的是源码和隔离验证产物；没有覆盖根 dist、打包、安装、替换或启动用户桌面端。** 双端必须用同一份新的完整构建（前端 + server，共用 build ID）再验证；只更新前端或看旧截图不能证明生效。

建议按原 32 舰/原网络同场景复测：确认“无损增量已启用”和增量计数增长；比较实收 Hz、最新状态年龄、应用/原生 RTT、socket/credit 跳过数，并区分主线程和网络 Worker 负载。真正完成标准是双方高负载实际可玩且不再长时间积压/断开，不是单看编码压缩率。
