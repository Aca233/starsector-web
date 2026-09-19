# Steam 开战首帧专项诊断（2026-09-19）

## 结论：尚未证实应修复的首帧逻辑 bug，未改生产代码

本轮只追踪 Steam gateway 的首帧、分片、ACK、背压和超时路径。**没有足够证据把用户“进入战斗立即断线”归因到某个可修复的 gateway 逻辑错误，因此没有提交猜测性补丁。** 这不是“Steam 已修好”或“真实 Steam 没有问题”的结论。

- 保留并行任务的 `SnapshotSendWindow`（初始 4、上限 32）、64 KiB 快照字节窗口、guest reliable-queue；没有覆盖或调整它们。
- 未修改 `server/steam/` 的生产代码；未修改游戏、LAN、前端、协议、频率、规模或项目 test runner。
- 未扩大每 peer 4 个分片重组、总计 32 个重组、重组内存预算、8 秒 ACK/重组时限或浏览器背压阈值。
- Steam 仍是 JSON + deflate 路径；LAN binary 的并行优化不构成本报告的 Steam 修复。
- 没有真实 Steam SDK、两账号、SDR、跨网或实际战斗帧采样；本机现存 desktop.log 没有断线现场的 `[steam-transport]` 记录，不能还原原用户故障原因。

## 隔离与文件归属

工作区根目录：`C:\Program Files (x86)\Starsector\starsector-web`。

隔离 Git worktree：

`C:\Program Files (x86)\Starsector\starsector-web\artifacts\steam-start-disconnect-20260919\worktree`

以 `f3e67765986a491db501a92deb0d433e14097bab` 创建，复制诊断开始时的 Steam gateway、codec、两个并行 helper，以及 relay 文件作为输入快照。**worktree 相对 HEAD 可见的 gateway/relay 改动是继承的并行输入，不是本轮新补丁。** 原始 Steam 输入保存在专属 artifacts 目录的 `before/`；诊断后验证 gateway、codec、snapshot-window、reliable-queue 与主工作区和 before 的 SHA256 完全一致。

本轮新增内容仅为本报告与专属 artifacts 目录中的隔离 worktree、输入快照、诊断脚本和结果。未运行会写入其他并行 artifacts 目录的旧诊断脚本，未修改旧交接文档。

## 首帧证据

### 真实 gateway + codec + relay，虚拟有序 Steam 链路

临时诊断使用真实 `SteamGateway`、`SteamPacketCodec` 和 `createLanServer`。走 hello → create/join → ready/start → loaded → launch → 首帧 → sync-ready → controls-ready，非仅调用 codec 的裸 round-trip。

14 场景、1,639 断言通过：

| 场景 | 观察结果 |
| --- | --- |
| 300 ms 目标 RTT、256 KiB 高熵 payload 首帧 | 分片完整送达；首 ACK 304 ms；随后 controls-ready；无断线 |
| 恰好 16,777,216 B JSON 首帧 | 压缩后约 12.64 MB、386 片，每包最多 32,808 B；跨越多个 64 包轮询批次；首 ACK 352 ms（虚拟时间） |
| 64 KiB 独立字节预算 | 第一帧约 36 KiB 后，第二个同尺寸帧被跳过，不累计超预算 |
| 错 nonce、未知/重复 ACK | 不释放错误信用，不令字节计数变负；合法延迟 ACK 恢复信用 |
| 60 Hz 小帧流、300 ms RTT、12 秒 | 提交 720 帧；窗口成长到 20，峰值 18 在途；无断线，未改生产频率 |
| 128 KiB/s 串行链路、700,000 字符高熵首帧 payload | 首 ACK 4,336 ms，无断线 |
| 状态 ACK 丢失 | 超过 8 秒后按审计周期关闭，原因“Steam 状态确认超过 8 秒未返回” |
| guest ACK 丢失 | 超过 8 秒后关闭，原因 `Steam link stalled` |
| 64 KiB/s、950,000 字符高熵首帧 payload | 约 8,320 ms 触发现有状态 ACK 保护，尚未收到完整首帧 |
| 第三片原生 send 返回 false | 立即以“Steam 发送失败，正在重新连接”关闭；不泄漏在途信用 |
| 浏览器 bufferedAmount 超限 | `Browser too slow`，保留保护 |
| 非法分片元数据 | invalid-packet / 10 秒隔离；释放重组内存 |
| codec 片内倒序、重复、到期边界 | 有效片正确重组；恰好 8,000 ms 保留，超过则释放 |
| 32 信用与每 peer 4 个 partial 的关系 | 32 个单包快照均可完成；一帧分片快照受 64 KiB 字节窗口独立限制；详见下一节 |
| 4 帧交错重排 / 强制第 5 帧 | 4 帧重组成功；第 5 帧严格报“Steam 分片数量超限”，并复现 gateway quarantine；详见下一节 |

前述虚拟 ACK 时间用于验证状态机，不包含真实 CPU 时间，不是实网性能结论。状态数据为 relay 接受的合成合法结构，非真实舰队采样；建房预算设为 3200，但没有运行物理模拟，不能据此证明任意舰船规模的游戏性能。

### 真实 localhost WebSocket、真实时钟与 send callback

另一个独立临时脚本使用真实两端 WebSocket、真实 relay、真实定时器和 gateway 的 5 ms / 64 包轮询限制。只有 Steam 原生网络函数被替换为目标 300 ms RTT、有序且不设带宽上限的内存链路。

每种尺寸均重新建房开战，测试其**第一帧**；不复用热身首帧。

| 首帧完整 JSON 字节数 | 本轮首帧送达墙钟时间 | gateway ACK 样本 | controls-ready | 断线 |
| --- | ---: | ---: | --- | ---: |
| 512 | 172 ms | 311 ms | 成功 | 0 |
| 524,288 | 194 ms | 335 ms | 成功 | 0 |
| 16,777,216 | 971 ms | 541 ms | 成功 | 0 |

最大首帧完整内容 hash 一致、ACK 后在途窗口归零、重组内存归零，无 invalid-packet。

两种时间口径不同：送达墙钟从本地发送开始，包含 JSON/压缩等工作；host 的 ACK 计时是在 encode/transmit 后记录，因此不是端到端首帧成本。本轮没有拆解各编码阶段耗时，也没有把这组数据当作 Steam 编码成本已优化的证据。16 MiB 合成 JSON 的本机耗时没有触发立即断线，不排除实际低配主机或真实战斗更重。

全部临时 listener、WebSocket 和定时器在每个场景结束时关闭。没有启动 Steam SDK 或触碰用户游戏进程。

## 每 peer 4 个重组 vs snapshot window 32：没有直接放宽

1. `packet-codec.receive()` 的 pending 计的是**尚未收到全部分片的消息**，不是等待最终 ACK 的快照。
2. 单包快照在一次 receive 内完成并移除 pending，即使有 32 个等待 ACK，也不意味着有 32 个 partial。
3. 一个真正多分片快照的 encoded payload 必须大于 32,768 B；两个这样的快照相加就大于 65,536 B。现有 SteamPeer 字节窗口不会同时提交第二个；超过字节窗口的一帧也只能独占发送。因此单凭 32 个计数信用，不能构造五个并行 partial **快照**。
4. 控制消息并不受这个快照字节窗口限制，不能把第 3 点泛化成“所有消息都不会交错”。
5. 用真实 codec 人工交错 4 个多分片控制消息，包含片内倒序与重复，全部成功。强制交错第 5 个首片时，codec 确实报“Steam 分片数量超限”；实际 gateway 的 poll 随后记录 invalid-packet、隔离发送者并清空 partial。
6. 第 5 点是**人工重排**的构造结果，没有捕获到 native Reliable=2 在真实开战时产生这种交付次序。不能据此认定用户故障由这个限制引起，也没有调整每 peer 上限。

## 超过 8 秒：能复现关闭，不等于应删除的保护

现有 codec 重组按首片总年龄计时；即使持续有片到达，跨过 8 秒仍会 sweep。独立 codec 用持续 9 秒的片流可以复现不完成。

但真实 gateway 同时有发送端首帧 ACK 8 秒硬期限。把 codec 改为“最后片活动时间”并不能解除这个期限；如果再随片延长发送端 ACK 时间，就在改变本任务明确要求保留的超时/过载策略。没有真实故障包大小、可用吞吐量、首帧发送时刻和关闭理由之前，本轮不做这种修改。

已复现的 native-send-false、ACK 超时和浏览器背压也都有明确注入条件，不能拿“注入失败会关闭”冒充找到生产 bug。

## 复现、输出与边界

在工作区根目录运行（只写专属 artifacts；第二个脚本使用第一个准备的 fixture-dist）：

```powershell
node artifacts/steam-start-disconnect-20260919/diagnose.mjs
node artifacts/steam-start-disconnect-20260919/real-websocket-check.mjs
```

主要文件均位于 `C:\Program Files (x86)\Starsector\starsector-web\artifacts\steam-start-disconnect-20260919\`：

- `diagnose.mjs` / `diagnostic-results.json`：14 场景、1,639 断言。
- `real-websocket-check.mjs` / `real-websocket-results.json`：三个真实 WebSocket 首帧场景。
- `tested-bundle.cjs` / `tested-sources.json`：确定性诊断的被测 bundle 和源码 SHA256。打包仅去掉 relay 未调用的 CLI 顶层启动分支，业务函数不改。
- `before/`：诊断开始时的 Steam 输入快照。
- `source-integrity.json`：前后生产文件与 fork 的 SHA256 对照。

语法检查通过。定向 oxlint --deny-warnings 通过（显式 --no-ignore，以免 artifacts 被忽略）；本次范围 diff --check 通过。未全项目 build，未修改或调用项目新 test runner，未覆盖并行测试脚本。

继续定位原问题最有价值的证据是：双方使用相同完整包/build ID 的一次复现，保存进入战斗至关闭后的双方 desktop.log，查看 `peer-close`、`browser-close`、`invalid-packet`、`native-link-failed`、`room-status` 的相对时刻与 reason/code，以及 inflightBytes / oldestAckMs。当前生产日志不包含完整分片序列，不能仅凭一次断线倒推出 Steam 真实交付发生了帧间重排。

## 给 0.2.3 本地整合包的兼容性结论

本轮没有改变 SWSP framing、op、ACK 格式或 protocol 25，也没有新增生产依赖，故无本轮补丁需要合并。既有并行 gateway 依赖 `snapshot-window.mjs`、`reliable-queue.mjs`，整合包应一并包含两者。

guest reliable-queue 依赖 host 对 guest data 发 ACK；旧后端不提供该 ACK。双方必须使用同一份完整的 0.2.3 本地包及相同 build ID，不能只替换一端或只按显示版本判断兼容。本轮不会把源码层通过描述为 0.2.3 打包/真实 Steam 验收通过；应由整合方完成最终包检查和携带新增断线日志的双机复测。

未发布 GitHub，未创建版本或分发包；本任务到此收尾。

## 整合方：方便双机取证的桌面入口

桌面帮助菜单新增“打开联机日志”，只在玩家点击时在本机文件管理器定位desktop.log，不上传日志、不导航外部网页、不新增renderer权限。启动与后台ready记录桌面版本、运行模式、前端build ID。后续真实Steam复现需要双方使用相同完整包，并保存断线前后各自desktop.log；旧日志缺乏具体断线事件，当前不能断言根因已解决。
