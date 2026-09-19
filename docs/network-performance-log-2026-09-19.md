# 联机性能日志（Steam / LAN 共用）

## 使用方式

- 战斗期间自动每秒采样一次，不用展开诊断面板，不逐帧打印。
- 战斗中：Esc → **导出联机性能日志**；F1 → 性能与网络诊断中也有相同入口。
- 断线/返回房间后：房间侧栏、联机入口的 **导出联机性能日志**。
- 浏览器导出最近约 10 分钟的本标签页记录；数量上限 660 条，总量上限 4 MiB。事件较多时可保留的时长变短。
- 记录保留到当前页面关闭/刷新；不会写入 localStorage，不会上传到新接口。
- 桌面端额外自动写盘：**帮助 → 打开联机性能日志**。原有 **打开联机日志** 仍然保留，记录连接/后台事件。
- 正式桌面版默认目录：%APPDATA%/Starsector Web/network-performance.jsonl；开发版是 Starsector Web Development。使用 --profile 时跟随该目录。
- 单个桌面日志约 4 MiB，轮换保留一份 network-performance.jsonl.previous。异步串行写盘，最多 32 条待写；文件不可写不影响游戏，下一条成功记录包含 desktopDropped。
- 房主、低 Hz 客机分别记录同一场高负载对局，各自导出，才可以比较路径。房主日志不能代替客机的实际接收/还原速度。

## 字段含义

JSONL：每行一个 JSON。浏览器导出第一行 log-info 是格式说明，其余是 sample 或有限集合中的生命周期事件。

- build：网页构建时间；transport：lan/steam；role/seat：房主/客机与席位编号。
- battle：本页面的对局序号，不是真实房间号或 matchId。
- wallTimeMs：本机墙钟，跨机器可能不同步；monotonicMs：页面本地时钟，不能跨机器相减计算延迟。
- sampleGapMs：计时器两次采样的真实间隔。JS 主线程卡死或后台节流时采样也会延迟，恢复后只记录间隔，不补造丢失的样本。
- hudAgeMs / pipelineAgeMs / steamAgeMs：数据新鲜度，**不是 RTT**。HUD 超过 2.5 秒、心跳/Steam 报告超过 5 秒时清空对应数据。
- pipeline：房主模拟/产出、relay 接收/发送入队、socket/消费 credit 跳过、消费回执速率；保持各阶段独立采样窗口。
- hud.hz / appliedHz：本端接收与还原的状态端点速率，不是 FPS；播放合并可能导致还原次数少于接收。
- hud：原诊断面板的采集、编码、解析、还原、渲染耗时，FPS、解码队列与累计背压；加上当前客户端舰船/弹丸/爆炸数量作为负载参考。
- hud.rtt：浏览器到所连接 relay 的往返（Steam 桌面通常是本机 relay），不能当作 Steam 远程玩家之间的 RTT。Steam 网关 ACK/SDK 队列在 steam 字段中。
- lan / steam：现有传输报告的数值白名单；没有新增网络包、SDK 查询或 ACK。
- 字节数据是各层应用统计，不表示 TCP/IP 实际带宽；Steam 网络 ACK 不能替代 LAN 消费回执。
- null 表示未知、不可测、尚未采样或过期，不等于测得 0。日志记录的是观测值，不自动判定瓶颈。

## 隐私与边界

不记录 IP、URL、SteamID、昵称、房间号、密码、令牌、设计和世界快照，也不输出任意服务端错误文本。错误只记录事件类别，详细连接错误仍可查原后台日志。

浏览器和桌面端分别执行字段白名单与限速；桌面只接收本地游戏窗口、本地脚本来源的固定前缀日志，无额外 preload/Node 权限。Electron 的 srcdoc 控制台事件可能归到主 frame，因此同时校验脚本来源。

本改动是诊断出口，**不是已修复 10–20 Hz 的承诺**；不修改模拟、快照发送策略、缓冲、超时或 60 Hz 目标。

## 验证与交付

- scripts/check-network-diagnostics.mjs：12 项通过（限流、容量、隐私、时效、低 Hz、故障写盘和真实文件轮换）。
- snapshot-pipeline / background-heartbeat / steam-overlay 回归：55 项通过。
- scripts/check-network-diagnostics-electron.mjs：真实 Electron 44.4.2，隐藏独立窗口与独立 profile；验证自动写盘、脱敏、拒绝 iframe/非游戏页面。
- scripts/check-network-diagnostics-browser.mjs：真实 headless Edge；验证 Blob 下载、断线记录和构建后的入口/房间按钮。
- typecheck、lint、隔离 Vite 构建通过（现有大 chunk 提示）。
- 隔离网页构建：artifacts/network-diagnostics-20260919/dist，build 2026-09-19T09:56:10.375Z。
- 未覆盖根 dist，未打包/安装/重启用户桌面版。现有已运行程序不会自动获得本功能，需要使用这次源码的新构建。
