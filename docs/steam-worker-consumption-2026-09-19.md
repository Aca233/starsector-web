# Steam 网络 Worker 与前台消费回执（2026-09-19）

## 此次改动

- LAN、Steam 的 `LanConnection` 都复用私有 `createLanSocket` 适配器；不替换全局 WebSocket。COOP/COEP、SAB 或 Worker 初始化不可用时仍走原生 WebSocket；已开始连接后的故障只按原协议重连，不透明重放。
- Steam SDK 继续在桌面 utility process 后台，不搬进浏览器 Worker。网络 Worker 不等于 AI 多 Worker，也不保证 Chromium 为每个 Worker 分配独立 OS 进程。
- Steam 生产 legacy-P2P 路径增加**独立的前台消费窗口**。窗口只保存包号、时间和字节数，不保存待发 world，不重传旧快照。
- 不改物理 `1/60`、快照目标 60Hz、舰队/绘制规模或断线/过载保护。AI 多 Worker 仍仅显式环境变量为 `true` 才开启，此测试未开启。

## 协商与两类回执

1. 新客机后台的 `open` 提议 `stateConsumption: 1`。
2. 前台 `hello` 提议 `stateCredits: 1`。新房主后台只有在前两项同时支持、relay 接受 hello 并发送 welcome 后，才在 welcome 中确认 `stateCredits: 1`。
3. 客机后台看到确认后建立 `(matchId, seq) -> Steam packet id` 的有界映射；前台同步订阅者消费/保留状态及事件后才发送 `state-consumed`。
4. 客机后台严格匹配映射，把合法小回执转换为原有 `ack` 操作的 `{id, consumed: true}`，不占输入控制队列。错误/重复/未协商的前台回执仍交原 relay 验证及限流。
5. **普通网络 ACK** 沿用原来的本机 WS send 回调：只释放传输在途量并训练原有网络窗口。**消费 ACK** 只释放消费窗口，不参与 RTT、带宽或共享上行估计。普通网络 ACK 本身含后台处理和本机桥交付时间，不能称为纯线路 RTT；消费 ACK 也不是 GPU 呈现确认。

旧后台/前台未协商时保留原流程。Steam relay 不启用 LAN 那套以 native WS ping 为基础的 credit；本机环回 RTT 不能代表 Steam 远端链路。仅测试注入的实验 native Sockets 不在此次消费窗口适配/打包范围。

## 边界和恢复

- 消费帧数随既有传输窗口变化，只加一个本机交付余量，最多 32 帧；压缩字节预算沿用 64 KiB（保留单独一帧超额发送），原始状态在途量再限 32 MiB。
- guest 映射同样最多 32 帧、32 MiB，匹配完整 match 和精确 seq。无 payload 队列。
- 包号还受 Steam connection nonce 与当前 WebSocket 身份保护，旧连接/重复/未来回执不放额；替换、离开、关闭会清理窗口。
- 窗口满只跳过尚未发送的 best-effort 状态；输入、心跳、终局控制继续原有 FIFO。最终 world 仍 best-effort，一次性声音不因此获得可靠投递保证。
- 缺少 delta 基线时丢弃该帧、请求 full，并明确释放两种窗口；不把不可解码的帧交给前台或当作前台存活。
- 保留原 8 秒网络状态回执保护；消费窗口超过同样 8 秒未释放也进入原重连路径，没有延长阈值掩盖卡顿。

## 验证与交付边界

- 真实浏览器＋真实本地 WS：两 Steam 前端 Worker、近 16 MiB 文本状态、同步消费顺序、旧 welcome 回退、无隔离回退、故障重连与旧 socket guard，5 组通过。
- 复用 Worker 生命周期诊断 11 组、临时内存/边界诊断 14 组通过；当前工作树的既有 Steam 传输/delta/输入队列检查 28 项通过（不是冻结包全套 checks 全绿，见下项）。
- 后台独立机制检查：冻结候选 15 组、155 个断言通过；真实 ws+真实 relay+生产 gateway/codec，P2P 为注入的受控可靠传输。覆盖新旧协商、消费暂停、两种 ACK 独立、输入控制通行、缺基线、8 秒保护和预算边界。
- 冻结包原有 transport+delta 检查为 24 通过、3 失败；原 0.2.5 跑完全相同命令也是同一失败集。原因是检查要求较新“摊销/10秒关键帧”策略，而保留的旧 v3 仍固定 1 秒。相关编码及检查文件在025/026逐字节相同；不修改检查消红、不混入未验收编码候选。原始日志及对照保留在 review-report.md。
- 完整 UI smoke：两个独立正常绘制 headless Edge（无 background/focus 策略覆盖），真实 relay/gateway，模拟 RTT300ms / 1,000,000Bps。配装、开战、消费回执、3秒可靠链路停顿后恢复且未重连、1秒真实guest主线程暂停（消费峰值23帧）、客机刷新/移动、双方回房通过；无pageerror，未开AI多Worker。此为功能检查，不是延迟AB或真实跨网改善数据。
- 0.2.6成品启动及安全隔离检查通过；当时 steamAvailable=false（Steam IPC不可用），无真实双账号开战。ZIP运行模块/来源/build一致性检查通过，未进行素材hash/size审计。初次ZIP验证只因PowerShell将ISO日期格式化成地区日期，README精确build文本修复后通过；初次日志保留，未改测试门槛或游戏代码。
- 临时脚本、原始报告放 ignored `artifacts/steam-consumption-20260919` 和 `artifacts/steam-frontend-worker-diagnostic`，未新增项目 tests/runner。
- 独立候选 `artifacts/steam026-src` 基于已冻结 0.2.5 源码和其已验收 Steam v3 后台，仅加入本次改动。**不混入工作树的 shared-uplink/native Sockets/玩法候选**，不覆盖 0.2.5、不安装或发布、不重启 3005。
- 真实双账号 Steam SDK/P2P、物理双机 LAN/Steam 的延迟/频繁重连改善仍需用户双机实测。不能把受控 P2P 模拟、浏览器本机检查或构建成功当作该实测。

## 本地测试包

`artifacts/Starsector-Web-0.2.6-steam-network-test.zip`，build `2026-09-19T02:13:53.586Z`。双方必须完整解压同一包并运行其中 EXE；旧快捷方式不会自动更新。本轮未安装、发布或替换用户进程。
