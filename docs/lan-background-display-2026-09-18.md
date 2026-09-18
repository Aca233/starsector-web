# 后台页面的联机显示开销优化（2026-09-18）

## 问题与实现

已有后台心跳与有界恢复逻辑会保留连接，但隐藏页面仍持续接收、解析大快照；房主页面也会解析 Worker 每份 JSON 用于本地画面，即使没有可见画面。部分浏览器仍调度后台 RAF，进一步触发无效世界还原、绘制和过期状态重同步请求。

本轮保留既有后台恢复协议与保护，修改三个位置：

- `server/lan-server.mjs`：隐藏接收者不再接收可替换的 state 消息，资源未就绪过滤仍保留。可见状态恢复时清除旧的发送时间门槛，但不重置网络拥塞档位。房间、心跳、部署反馈、结束报告继续发送。房主向其他可见玩家的转发不受房主自身可见状态影响。
- `src/network/protocol.ts`：对于已经在途的标准 state 文本，以当前 `document.visibilityState` 在 JSON.parse 前丢弃。即便 visibilitychange 回调尚未执行，也不重复解析后台画面。控制消息照常解析、分发。
- `src/network/LanBattle.tsx`：隐藏房主跳过本地快照 JSON.parse/播放队列，但仍上传 Worker 快照、更新发送节流并回送 snapshot-consumed；隐藏页面跳过 RAF 内的世界还原、渲染和显示过期重同步。回到前台仍由现有逻辑清输入、请求新状态、确认同步后恢复操控。

没有改变物理 dt、AI、伤害、舰船/特效数量、可见页面的快照频率、SnapshotPlayback、MotionPrediction、心跳超时、30 秒断线保留或后台恢复预算。协议仍为 20。单纯 blur/失去焦点不等于隐藏，不会停发可见窗口的战场状态。

## 验证方法

使用 stdin 临时脚本和独立 Playwright 页面，没有新增测试文件/运行器。所有服务使用随机本机端口，测试结束关闭。真实浏览器验证通过覆盖 visibilityState getter 并分发 visibilitychange 模拟前后台切换，**不是实测物理最小化、系统休眠或浏览器页面丢弃**。

### 接收器与服务端

- 实际 LanConnection 编译进内存，在未分发可见状态事件时改变当前 DOM 可见性；连续 20 个已在途大 state 消息产生 **0 次 JSON.parse**。
- 后台仍收到 room、pong、ended；恢复可见后 state 正常解析。
- 初始隐藏的已加载玩家不会阻止对局开始；回到前台后获得新基线并通过 sync-ready。
- 隐藏期间的 resync 可收到控制响应，但不会引起大帧发送。
- 恢复可见时旧 nextStateAt 归零；非法 visibility 值仍拒绝。
- 后台仍收到结束与房间更新；监听器、定时器在关闭时释放。

证据：`artifacts/lan-background-client.json`、`artifacts/lan-background-relay.json`。

### 真实双端战斗

隔离生产构建 `artifacts/lan-background-preview`；两端视口 1600×1000；2 真人加每队 3 AI，共 8 艘守护者，实际导入/应用上一轮同两份配装。房间开战通过 start 协议触发，不属于工具栏按钮全流程验收。

| 测量窗口 | 结果 |
| --- | --- |
| 可见客机，3 秒 | 收到并解析 49 份状态，17,013,769 个文本字符 |
| 隐藏客机，3 秒 | 0 个 state 收包、0 次 state 解析、0 次 resync；房主推进 180 tick |
| 可见客机收到 blur，1 秒 | 仍收到 16 份状态，服务器未标记隐藏 |
| 隐藏房主，3 秒 | 本地快照解析 0 次，上传 60 帧，回送 60 次 snapshot-consumed，推进 180 tick；可见客机收到 53 帧 |

- 两端分别恢复可见后回到可操控状态，客机 W 键输入序号继续推进。
- 跑到 tick 1803；末段 HUD 为网络 12 ms、画面 56 FPS、状态 18 Hz、战斗 1.00×。
- 客机再隐藏后房主结束对局，客机应用层正常显示结束原因。
- 0 pageerror、0 Worker error、0 recovered。

以上是后台无效工作量的计数，不是前台 FPS 的 A/B 提升，也不能保证浏览器/操作系统冻结房主时物理仍能运行。实际冻结依旧由已有的有界后台恢复逻辑处理。

证据：`artifacts/lan-background-live.json`、`artifacts/lan-background-live-log.txt`。

## 构建和现有入口

- `node --check`、`npm run typecheck`、`npm run lint` 通过。
- 隔离生产构建通过，仅保留原有的大 chunk 提示。
- 普通 dist 未覆盖，3005、3007、3008、3009 均未替换或重启。
- 本轮未再常驻一个新端口，避免持续积累后台服务。新的生产构建在 `artifacts/lan-background-preview`，现有 3009 仍为上一轮服务端优化版。

仍未解决的范围：前台全量快照带宽、长期多机/高延迟验证、实际百舰物理负载，以及此前偶发长物理墙钟停顿的最终归因。
