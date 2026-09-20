# Steam / LAN 状态延迟优化（2026-09-20）

状态：代码已实现，局域网/发布链路回归98/98、Steam全量209/212；未提交、未打包发布，未替换正在运行的桌面端。不能宣称用户双机现场已根治。

> 本文记录第一阶段。后续累计输入 ACK、双进程限速 WS 回放及仍未解决的问题见 [第二阶段报告](network-latency-phase2-2026-09-20.md)。

## 依据与边界

- 15:23两份附件是Steam legacy-p2p。主机desktop.log确认8秒状态ACK超时；无法据此确认具体Steam路由、丢包或SDK故障。
- 16:30两份附件当前保留的1320条全部为LAN。早期记录已被滚动淘汰，不能把其中的LAN字段当成Steam结果。
- 轻/中负载房主约60Hz、客机约60FPS但状态接收低至6Hz，消费额度满；22舰另有房主发布链路阻塞及模拟压力。
- 保持物理dt=1/60、目标60Hz、舰船/伤害/碰撞、输入和离散事件语义；不扩大消费/在途窗口、不放宽8秒或心跳超时。

## 生产改动

### 1. LAN可靠有序流采用上一成功发送帧作为增量基准

`server/LanDeltaTransport.mjs` 增加显式 ordered 模式；仅 `server/lan-server.mjs` 已协商压缩、binaryDelta和消费额度的LAN连接启用。旧confirmed-anchor模式保留用于非FIFO调用和A/B。

每次成功send后commit基准，所有发出的增量都标记为anchor；发送前因socket/credit拒绝的状态不推进基准。接收器原本就在有序解码时保存anchor，因此无需改变SLD1格式或放宽校验。ACK继续管理消费额度，但不再反向决定codec基准新鲜度。滞后/重复ACK不能回退基准。

重连、隐藏/resync、新战斗、JSON/大帧回退仍清空基准；破损/缺基准关闭并重新同步，不凭空补状态。发送端最多一个基准，接收端最多两个私有基准。广播共享补丁和每次2个/4ms软预算保持不变。没有用于Steam或不可靠传输。

### 2. Steam仅为客机返回的快照确认增加快速副本

`server/steam/gateway.mjs` 对 guest→host、单包且不超过1200字节的ACK，先尝试发送相同编码的 UnreliableNoDelay(1) 副本，再照常发 Reliable(2) 原件。包括普通快照ACK、消费ACK和needsFull确认；不改战斗状态、输入、动作、房间消息和ping/pong的可靠性。

副本不占新协议ID。接收方仍校验connection/id与在途成员，重复确认不二次释放或采样。快速发送失败/丢失仍有可靠原件兜底；可靠发送失败仍报错。额外流量按整个guest gateway限额8192字节/秒，突发上限1200字节；这不是IP/Steam协议总开销保证。

初版双向复制在窄带多人模型产生回归，已撤回该策略。**房主的输入ACK不发快速副本**，避免多人共享上行额外膨胀与破坏原输入合并节奏。最终窄带9客机及健康9客机原门槛均通过，没有调低测试要求。

本改动只帮助“可靠反向流排序阻塞，但不可靠小包仍可抵达”的情形；SDK停摆、真实断网、前向状态流停滞或两条路径一起拥塞不因此自动修复。

### 3. 房主延迟发布和本地解码调度

`src/network/host.worker.ts` 在精确匹配的snapshot-consumed回执到达、计算任务已结束时，立即尝试发布被旧额度挡住的最新完成tick，不再等下一次timer/物理批次。计算任务尚在进行/等待AI/让出时只释放额度，仍由正常计算尾部发布；停止后不发布，相同tick不重复发，无新增物理步或无界载荷队列。

`src/network/NetworkTaskScheduler.ts` 用可取消MessageChannel任务代替嵌套setTimeout(0)；`LanSnapshotDecoder.ts` 保留2普通帧+1终局帧的解码额度、按序消费、flush/reset/close和错误处理。不是用微任务循环抢占输入。空闲时关闭端口，取消时删除任务闭包。

## 验证

### 录制的32舰连续91帧：无损FIFO回放

`node scripts/bench-lan-ordered-delta.mjs`，对同一组完整SWB1状态逐字节校验。预热后旧→新→新→旧，包含现有RFC7692 level1/memLevel7/no-context-takeover压缩。

|模拟消费ACK延迟|旧压缩payload均值|新均值|减少|
|---|---:|---:|---:|
|2 tick ≈33ms|64,454 B|58,804 B|8.77%|
|8 tick ≈133ms|72,301 B|58,804 B|18.67%|
|18 tick =300ms|81,934 B|58,804 B|28.23%|

新sender编码约2.12–2.13ms，与旧约2.08–2.23ms接近；因为每帧都保存私有anchor，恢复均值约1.13–1.16ms，旧约0.86–1.06ms，增加约0.1–0.3ms。这是CPU/带宽权衡，不是所有环节同时更快。未删字段、量化或降低发帧目标。

**这些是压缩payload字节和函数耗时，不是测得的双机延迟/接收Hz。** 这组大状态即便优化后强制60Hz仍约28Mbps/接收端，窄带不可能因此必达60Hz。

### Steam确定性网关模型

运行真实SteamGateway/codec/窗口代码，在模型中为guest→host可靠流注入3秒有序停顿，并让不可靠包可独立到达。状态最大到达间隔2944ms（全部快速副本丢失、走可靠兜底）→104ms（快速副本可达）；两组末5秒均恢复60Hz，没有改变8秒断开保护。只是模型，不是Valve网络或这次用户现场的复现。

### 实际浏览器任务队列

独立headless Edge 153，100任务串联、舍弃前10项，旧→新→新→旧。旧setTimeout平均4.95/4.83ms，新MessageChannel平均约0.009/0.007ms，P95约0.1ms。只证明空闲浏览器调度避开计时钳制，不代表游戏每帧或网络延迟下降相同数值。

最初Playwright MCP因另一个任务占用profile而未启动；未关闭对方浏览器，改用临时独立headless实例，finally关闭。

### 回归与构建

- 网络/诊断/心跳/发布/增量/拥塞测试：98/98。
- 新增真实压缩WebSocket FIFO + 延迟消费ACK测试；保留所有5帧消费额度，控制消息与增量交错，无丢帧解码错误。
- Steam完整套件：209/212。失败与发布v0.2.4基线相同：9客机8Mbps→256Kbps骤降、实验Sockets 120s soak+3s停顿、实验Sockets健康9客机每端40Hz门槛。仍未通过，不据此标为稳定版。
- TypeScript app检查、改动文件lint通过。
- 独立目录Vite主入口构建通过。关闭public复制、排除campaign入口，仅为编译校验，不是可发布完整包；public资源运行时解析与大chunk告警保留。未覆盖现有dist。
- 新测试已接入既有Windows CI与steam:check，没有更改prerelease/稳定版门禁。

产物统一在 `artifacts/network-analysis-2026-09-20/`：ordered-lan-replay.json、browser-task-result.json、real-websocket-test.log、network-final.log、steam-full-final.log、typecheck.log、lint-final.log、build.log。初版回归失败日志也保留，不能把它们当最终结果。

## 后续实机验收

双方必须运行包含这些改动、build一致的新桌面包，再分别测试Steam与LAN；当前已安装0.2.4不会自动获得源码改动。比对接收Hz、输入确认、状态ACK、blocked和错误事件，不只看FPS。Steam仍需要确认现场是否属于可绕开的反向HOL，不能承诺任意路由/带宽下60Hz。

没有操作Steam账号/邀请/防火墙，没有修改生涯或其他配装/房间功能的并行改动。`server/lan-server.mjs`存在另一个任务的配装ready逻辑改动；本轮只修改LanDeltaSender构造行，不能把整个文件diff都归给本轮。
