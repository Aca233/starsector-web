# LAN 网络线程 + 接收消费窗口（2026-09-19）

## 当前状态与范围

已将 LAN I/O Worker 和接收消费窗口**成对接入源码**。原来只启用房主网络线程，会将堵塞转移到原生客机；本轮组合方案通过两次混合能力实测。当前源码/桌面包验收状态见下文追加记录；不要把实验构建当成已安装版本。没有重启/替换用户的 3005，没有开启 AI 多 Worker。

Steam 不走这个 Worker 或消费窗口。未有双方同包的真实 Steam 开战/断线日志，不能据 LAN 结果宣称 Steam 已修好。保留现有失联、重连和过载保护，不以放宽超时掩盖断线。

## 已测到的变化

同机 loopback，两套独立 headless Chromium **正常 D3D11 绘制**，固定 32 舰、同种子、默认浏览器调度，权威物理 1/60，目标快照60Hz，AI owner Workers=0。这是键盘事件到客机收到累计权威输入确认，不是网卡 ping 或 GPU 呈现时延。

| 32舰路径 | 实收快照 Hz | 输入确认平均 / P95 ms |
| --- | ---: | ---: |
| 原生基线 | 29.84 / 30.78（复测） | 91.99 /145.55；98.50 /154.00 |
| 仅房主网络线程，原生客机，无消费窗口（拒绝的旧候选） | 36.94 | 118.56 /218.33 |
| 双端网络线程 + 消费窗口 | 40.06 | 57.38 /89.42 |
| 房主网络线程 + 原生客机 + 窗口 | 35.67 /36.58（复测） | 83.52 /128.34；81.95 /127.49 |
| 原生房主 + 客机网络线程 + 窗口 | 31.52 | 82.59 /128.45 |

每组32舰94个输入边沿全部累计确认，无恢复事件；测量段物理约59.6–60Hz。8舰双网络线程+窗口实收59.70Hz，输入确认20.16ms/P95 29.60ms。不能把32舰约32–40实收Hz显示成60，也不能将同机数字外推为用户物理LAN。

单独给原生两端加窗口没有稳定收益（ACK 85.36/95.31ms）；收益来自**两处一起改**，不是回执本身降低网络RTT。

分段关联表明：原生房主到relay的主线程发送等待约20ms，网络线程后约3ms；混合路径relay到原生客机分发约64ms，消费窗口后两次约27–30ms。跨上下文分段含时钟校准误差；同客机端到端ACK及同权威Worker内部耗时不需跨钟。

## 机制与边界

- `LanSocket.ts` / `lan-socket.worker.ts` 私有适配器将LAN原生WS I/O移出绘制主线程；解码/世界应用仍在原位置。每个连接一个网络Worker，不是AI Worker。不支持隔离/SAB/Worker时初始化回退原生；连接可能已打开后禁止未知故障透明换链重放。
- 原适配器的出入队列32MiB/8192条上限和同步背压保留；不合并已接收消息，不detach调用者buffer。真实重连、刷新与结束的FIFO路径不改。
- 客户端 hello 提议 `stateCredits:1`，服务端 welcome 明确同意后才启用。Steam两边均排除。原有协议和精确build匹配仍阻止不同构建混用；未协商端保持legacy路线。
- 客机在解码并通知同步订阅者后回 `state-consumed(matchId,seq)`。此回执是主线程消费，不是GPU已显示，也不能用来估计线路RTT。
- 每个客机独立只保留 `seq -> bytes`。窗口满时跳过**尚未发送的best-effort状态**，不保存旧payload、不超时补发。输入/控制/终局控制消息不经过此门禁。
- 窗口为 `max(2, min(64, ceil(min(lastFiveNativeRTT)*60/1000)+1))`，并有32MiB在途上限。只用原生WS ping/pong估计，不让应用线程积压推高窗口。精确300ms为19，实际略大于300ms通常20。缩窗不撤回已发状态，暂停新reserve直到还到新上限以下。
- 只有已协商LAN非房主、同match、精确存在的已发seq能累计释放credit；future/duplicate/其他match不能释放。同步、可见性、离开、断开及新hello建立/清理独立epoch；旧socket不能操作重连身份。
- **请求预算与传输回执分开**：只有<=256B、验证成功的精确在途消费回执不计入游戏请求预算（每个seq只能成功一次，数量/字节受服务端发送窗口约束）。无效/重复/畸形回执和所有既有请求仍计原160条/秒；没有提高输入、控制或恶意包限额。目的是避免恢复时合法回执占用游戏输入预算，不宣称已在真实用户对局复现这种限额断开。

## 离散事件与终局语义

解码后逐帧消费的 muzzle 窗口和声音回调顺序不被网络Worker合并。muzzle是有界重放窗口；**一次性声音不是可靠事件通道**。服务器原来已在TCP背压时跳过状态，新消费门禁也可能跳过带一次性声音的未发送帧；不能宣传所有声音无损。

`ended`/报告控制在原FIFO上交付，满窗不阻止它，没有终局后补发旧世界。**最终world snapshot仍是best-effort**，不能将终局控制保证说成最终world必达。既有末帧解码保留与终局呈现逻辑不改。

## 验证与复现资料

诊断全在 ignored `artifacts/lan-receiver-credit-20260919/` / `artifacts/lan-worker-latency/`；未新建项目tests/runner，未做素材hash/size审计。

- `self-check-v2.mjs` / `.json`：当前+1 helper 27/27，另存v2，不覆盖旧+2的16项记录。
- `relay-contract-check.mjs` / `relay-contract-result.json`：真实WS协商、假ACK、输入/心跳旁路、可见性、重连、legacy、终局。该脚本的300ms只延迟pong，**不是完整高RTT数据链路**。
- `multi-peer-network-check.mjs` / result / notes：另用透明TCP代理将**所有字节**每方向固定150ms（另外550ms），真实room里一个持续消费客机、一个不ACK客机。保留各次history和失败门槛，不以缩窗断言/关闭排空的诊断错误冒充生产bug。重用录制32舰world，不是模拟或绘制性能实验。
- `receiver-credit-io-{both,mixed,mixed-repeat,guest-only}-32.json`，`receiver-credit-io-both-8.json`：上述实测。
- `receiver-credit-io-recovery-8.json`：真实应用三次TCP断开保留同席位/同match、刷新恢复、恢复后移动获得累计ACK、房主菜单结束双方回房；每端一个I/O Worker，无authority Worker残留。仅自有临时进程被关闭。
- `ack-stages.mjs` / `.json`：离线分段关联；`combined-summary.json`：组合方案汇总。

### 当前源码与打包验收

当前源码 helper27/27、真实WS16项、回执预算12项通过；typecheck/lint、冻结打包源typecheck/Vite、范围diff check通过。预算检查用真实socket/handler，并显式把计数器对齐160边界验证分类，**不是自然游戏断线复现**。

0.2.5本地完整包：`artifacts/Starsector-Web-0.2.5-network-test.zip`；build `2026-09-19T00:53:36.024Z`。ZIP关键运行文件、版本/build匹配和LAN源码读回通过；未安装、未发布，双方须完整使用同包，旧快捷方式不会自动换包。新包从0.2.4稳定Steam v3后端与冻结前端组装，仅带此次LAN更改，不混入并行未验收Steam/玩法候选。

实际EXE的桌面内非loopback地址入房13项通过：本地来源与存储保留、无外部浏览器、同席位重连/刷新、安全隔离不变、日志入口可用。

使用**包内后台和前端资源**的两套正常绘制Chromium：32舰复测输入确认52.76ms/P95 76.53ms，实收46.62Hz，物理59.93Hz，94输入全确认、无恢复；8舰19.32ms/P95 34.66ms，实收59.86Hz，物理60.01Hz，58输入全确认。三次真实断链、刷新后移动确认、终局回房也通过。**不是实际双EXE完整战斗的性能证明。**

保留失败：`packaged-025-32.json`中房主两次267/280ms过载恢复后终止，后半段50个输入没有确认，该轮不通过；同时刻有无关MCP进程启动但没有CPU独占证据，不能仅凭时间断言根因。构建/检查任务退出后，一次未改代码、不缩舰队、不放宽保护的同包复测通过。没有删除或用复测覆盖失败。

全数据TCP代理补充：注入器同步编码导致其自身只有56–58Hz；诊断后改用**有界录制帧预编码Worker**，维持完整32舰world/递增seq/tick/相同判定门槛，单次对照发送约60Hz，300ms稳态实收57.84Hz、恢复后57.91Hz；1100ms恢复后55.49Hz。所有功能/队列/FIFO/清理门槛通过；不是严格无丢帧60Hz或真实游戏性能。这是artifact副本（旧预算分类）的传输试验；当前早验证预算分类另由上述当前源契约检查覆盖。

Steam仅完成新EXE隐藏独立profile启动与后台健康检查，SDK显示接口未就绪（不能连接Steam客户端），**没有真实双帐号开战/断线验收**。完整包便于双方提供同build的desktop.log，不能宣传该问题已修好。

详细记录：`artifacts/desktop-network-025-20260919/package-report.json`。自有临时进程全部关闭；3005/用户桌面进程未重启，AI owner Workers未启用。

## 双真实桌面实例补充验证

0.2.5 成品的两个独立 EXE、临时 profile、动态端口实际启动；房主通过桌面 UI 创建房间，客机通过房主 UI 邀请链接直接加入，没有 fake WS 房主。66 项检查通过，两端各且仅有一个 lan-socket.worker；renderer/Worker 的 crossOriginIsolated、SAB 和 Atomics 实际操作成立，hello/welcome 均协商 stateCredits=1。客机刷新后旧 Worker 退出，仍为同身份/席位，仅一个新网络 Worker。两端保留本地 origin/存储与现有 Electron 隔离设置，无 renderer 异常。

这是**同一台电脑上的两个真实桌面大厅/刷新恢复验证**，不是双物理电脑，也没有以隐藏窗口运行战斗来宣称性能。Worker 是线程而非独占 OS 进程；Steam 尚未走该 LAN Worker 路径。自有 10 个已记录进程全部退出、两个后台监听端口关闭；用户进程、3005 和现有 ZIP 未更改。

结果：artifacts/desktop-network-025-20260919/two-desktop-io-result.json。

### 32 舰下一瓶颈定位

对既有成功的 packaged-025-32-repeat.json 离线分段统计：20.015 秒内 authority 发布 938 帧（约 46.87Hz），客机实收 933 帧（46.62Hz），物理约 59.93Hz。整轮 relay 仅 10 次消费窗口拒绝 / 1309 次发送；这是包含预热和尾段的 lifetime 计数，不与前面的测量窗口混算。说明该轮到 60Hz 的主要缺口在发布端，不是客机窗口大规模丢弃。

20 次定期遥测均值：simulation 9.47ms、capture 4.08ms、encode 2.79ms。这些不是完整的逐帧 CPU profile，也不证明每次缺帧都由编码独立导致。下一步应验证减少捕获/编码的开销，而不是继续加窗口或缩小舰队。该统计不删除原过载失败，也不是新性能测试。可复算记录：artifacts/desktop-network-025-20260919/publication-attribution.mjs 与 .json。
