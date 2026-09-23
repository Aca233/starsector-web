# LAN / Steam 对齐第二批：组件分流与性能复查

> 后续更新：共享生产捕获已完成一轮优化，48 舰 8 秒短场景现已通过。见 [捕获优化与复查](network-capture-performance-2026-09-23.md)。本文保留第二批当时的失败与能力记录，不能用当时的性能结论覆盖最新结果。

日期：2026-09-23。承接第一批 additive motion；用户在“还未全部对齐”的说明后授权继续。

## 结论

**主要组件发布链已接通；不是全部性能/联机能力已经生产验收。** 默认 `auto` 仍只启用附加运动帧，不降低完整世界节奏。combat/visual 和多频率发送仍为显式实验能力，不以打开所有开关代替验证。

| 能力 | LAN | Steam legacy P2P | 本轮状态 |
| --- | --- | --- | --- |
| 附加运动帧 + 完整状态消费门控 | 已有默认路径 | 第一批已接入默认路径 | 保留 |
| 普通玩家房主发布 combat/visual | 现在接通 Worker → 浏览器 → relay | 同一发布/校验路径 | 不再仅限 dedicated authority |
| combat/visual 独立接收 | 现有 helper | 新 SWLC 不可靠数据报通道 | 实验模式，显式协商 |
| combat 编码依赖 | 有序 helper 可用既有 delta | 强制每帧完整、自包含 | 不把有序链假设带入数据报 |
| 浏览器组件消费回执 | 独立有界额度 | 独立有界额度；最终消费仍归浏览器 | 不释放完整快照额度 |
| 完整世界多频率发送 | 保留现有实验策略 | 最近确有组件消费且完整世界仍合格时，200 ms 间隔 | 默认 auto 不变 |
| 去弹丸的完整世界变体 | dedicated 路径已有 | dedicated 输出可正确交给异步编码器 | **普通房主上传仍不携带该变体** |
| 48 舰容量/性能 | 共享权威基准仍过载 | 同一权威瓶颈，不是网络绕过即可消除 | **未通过** |
| 原生 Steam / 公网 / 长时多人 | 未进行本轮实网验收 | SDK 包搬运为 mock | **待验收** |

实验构建须同时设置 `VITE_LAN_LAYERED_SYNC=true`、`VITE_LAN_CRITICAL_COMBAT=true` 才包含 combat 与 visual。Steam 还必须由可信网关协商 `layeredTransport: steam-components-v1`；仅客户端声称支持不生效。`false`/旧端保留完整状态路线。LAN helper 的有序编码/分块调度与 Steam 的数据报适配不同，不要求把不适用的传输实现原样复制。

## 实现范围

- `src/network/AuthorityComponents.mjs`：普通房主发布编码与 relay 接收校验。视觉锚只在换 key/重置时上传；本地 socket 成功发送后才提交发布缓存。combat 校验完整二进制内容，visual 校验锚、tick/time/baseTick。
- `src/network/host.worker.ts`、`LanBattle.tsx`、`protocol.ts`：启用已协商的发布能力，并用精确 tick 归还单槽 Worker mailbox。发布与接收能力分开：普通房主没有 helper 接收通道时也能发布。socket 已积压时跳过可替换组件，不堆旧帧。
- `server/lan-server.mjs`：只允许当前已认证房主上传，限制每条 192 KiB / 每秒 60 条，检查 match、完整世界存在后的 tick 窗口及可用 roster。允许合法组件先于第一帧完整世界到达，接收者仍受 loaded/sync 门控。
- `server/LanCriticalCombat.mjs`：LAN 保留有序 codec；Steam 每次从完整组件编码，无跨数据报 delta 依赖。
- `server/steam/component-channel.mjs`、`gateway.mjs`：独立组件传输、应用回执、可见性/连接清理、丢包回退。视觉压缩/分片先在 gateway 用已有 `VisualWireReceiver` 重组，最终消费归浏览器。
- `desktop/network-diagnostic-record.mjs`、`SteamNetworkDiagnostics.tsx`：只记录有界标量计数/枚举，保留新鲜度门控；不记录身份、连接随机值或负载。
- `scripts/benchmark-server-rooms.mjs`：基准异常也落盘 `passed:false`、恢复历史与 Worker 诊断，避免失败时没有报告。未放宽过载判定或恢复预算。

本轮未改变物理、伤害、AI 决策规则、模拟目标频率或原版玩法界面。没有使用子代理、操作桌面、修改生涯、暂存/提交/推送或发布。基准 runtime 构建不是发布打包。

## SWLC 边界与故障处理

- SDK `UnreliableNoDelay`，每包最多 1200 B，头 44 B；连接随机值、递增帧号、CRC32、match/sync 校验。原始 JSON ≤64 KiB，压缩体 ≤32 KiB；压缩只有变小时才采用。
- 房间发送预算 128 KiB/s，突发 32 KiB，总在途 ≤64 KiB；每 peer ≤4 帧/32 KiB。发送端仅保留回执身份与字节/时间元数据，没有重传负载队列。
- 接收端 ≤4 个未完整重组帧、≤16 个回执身份；重复/坏包/异连接/异 match/sync 拒收。
- 500 ms 未完成回执即停用当前可选组件路线并释放其在途分配，**按放弃而非消费处理**。SDK 拒绝发送也回退；输入和完整世界仍走可靠路径。
- 中间视觉分片只能回 `fragment`；最终完整分片/完整组件才可回 `consumed`；`discarded` 不赋予视觉锚或组件活跃资格。接收器和发送器均检查，不能用一种回执冒充另一种。
- 完整世界必须已真实被浏览器接纳且仍在有效窗口，组件才可发送。可见性恢复优先恢复完整世界，避免“组件等完整基线、完整基线又等组件”的循环。
- 可选路线失败时先作废旧的异步完整快照编码提案，再发送 `layered-unavailable`，避免已经关闭视觉投影的浏览器随后收到去弹丸旧提案。
- 隐藏、恢复、launch、换局/重连重置相应组件接收状态。browser-close/leave 清理视觉重组器和协商标志。这里不声称有独立于 match/sync、跨可见性周期的额外密码学 epoch；实网延迟/乱序边界仍需长期验收。

## 本轮验证与证据

证据目录：`artifacts/network-parity-phase2-20260923/`。`source-before/` 保留本轮前的工作版本，用于隔离已有脏工作区；没有拿 Git HEAD 覆盖现有实现。

- 集中 `npm run typecheck`：通过；集中改动文件 oxlint：通过。后续只改 JS 后定向 lint 通过。
- 组件单测：2/2 通过，覆盖数据报分片/坏包/丢包/异连接/回执及普通房主视觉锚上传。最终新增了分片与完整消费不能互相冒充的断言，通过。
- 普通 LAN 房主 → 真实 relay/helper → 真实编译客户端的 combat/visual 发布和精确消费：通过。
- Steam 场景使用两个真实本机 relay、真实编译 `LanConnection`、真实快照编码 Worker，**仅 SDK 包搬运 mock**；验证可靠完整状态被暂扣时运动/组件仍可到达、组件不释放完整快照额度、压缩多片视觉基线、后台恢复、组件丢失后完整世界继续。发布负载由测试生成，不等于全战斗 Worker 与画面实机联调。
- 新增回退竞态断言：人为挂起一个去弹丸完整世界提案，组件失败后编码 epoch 前进且旧提案移除，随后完整世界成功到达，连接未关闭。最终 `fallback-race-recheck.log` 通过。
- 诊断隐私/新鲜度 fixture 修正后通过：必须给 `steamAgeMs:0` 才能作为新鲜样本；没有为了测试放宽 sanitizer。见 `diagnostic-recheck.log`。

保留失败记录而非覆盖成全绿：首次场景命令错误地将 `--test-name-pattern` 放在文件名之后，使 Windows 的 `.*` 展开成 8 个隐藏路径，它们只产生模块加载错误；其余 3 个实际失败来自缺少 VM 的 atob/btoa、过时的 Steam 不支持断言和后台恢复循环门控。均已定向修正/复查，没有重跑整个工程测试。`scenarios.log` 的 55/44/11 不是最终全项目验收结果；`targeted-recheck.log` 中早期 Steam 失败由后续 `steam-visible-recheck.log` 和最终回退场景复查覆盖。

主要日志：`typecheck.log`、`component-tests.log`、`targeted-recheck.log`、`steam-visible-recheck.log`、`diagnostic-recheck.log`、`receipt-lifecycle-recheck.log`、`fallback-race-recheck.log` 及对应 lint/status 文件。

## 48 舰复测：仍未达标

仅复查一次原场景：48 舰、1 房、2 个隔离显示副本、计划 8 秒活跃时间，`--apply-replica --no-motion-reference`。构建成功；在 tick 560、两次恢复后，仍因持续过载停止。完整失败报告是 `room-48.json`（`passed:false`）。

| 失败时诊断 | 值 |
| --- | ---: |
| simulationMs | 14.94 ms |
| captureMs | 20.30 ms |
| encodeMs | 5.58 ms |
| backlogMs | 253.85 ms |
| callbackGapMs | 130.20 ms |
| realtimeRatio | 0.795 |
| 最近采样窗口 simulated | 50.28 Hz |
| 最近采样窗口 produced | 8.38 Hz |

这是墙钟时间/平滑诊断和末段采样，**不是 CPU 火焰图、显示 FPS 或可相加的精确成本分摊**。截至失败生成 139 个完整快照，累计约 69.55 MB（生成量，不是实网带宽）。状态构造开销明显，值得下一步沿生产 `captureLanDisplayCombat` 路径定位；不能拿使用旧 capture 路径的 22 舰小基准冒充这次 48 舰的优化证明。

AI Worker 和独立 serializer 实验保持关闭，capture plans 开启。没有降低模拟保真度或放宽恢复次数来制造通过结果。不存在成功的前后配对性能数据，不能声称容量/FPS/端到端延迟已提升。

## 未完成项

1. **性能**：修复生产路径 48 舰持续过载并取得相同规模的前后结果。
2. **普通玩家房主带宽收尾**：尚未传输完整/去弹丸世界成对变体；目前不生成无法使用的重复编码，完整回退仍保留弹丸。dedicated 变体可用不代表普通房主也已对齐。
3. **原生与实网验收**：真实 Steam 账号、跨机/WAN、多人压力、长期抖动丢包、重连和实际画面/输入体验尚未验证；不操作用户桌面补做。
4. **实验转默认**：多频率/组件通道尚未晋升默认；Native Sockets 仍为显式注入实验。历史未通过的 AI/serializer Worker 不因“先进”而启用。

下一步优先处理 capture/权威过载，再收尾普通房主世界变体；不以增加更多传输开关代替性能治理。
