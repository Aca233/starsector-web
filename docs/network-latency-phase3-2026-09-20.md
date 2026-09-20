# 联机延迟第三阶段：公平发送与 ACK 故障定位（2026-09-20）

## 范围和当前状态

继续处理四份用户日志中的 Steam 停收/断线与 LAN 客机低 Hz。本轮只修改网络发送顺序、诊断及测试；60Hz/1⁄60 物理、实体/碰撞/伤害、8 秒 ACK 超时、状态与消费额度均不变。未提交、推送、发布或替换已安装的 0.2.4；未打包生涯内容。

第一阶段修复和第二阶段的有序 LAN 增量、解码任务调度、发布回执触发、Steam 快速确认副本及协商式累计输入确认继续保留。实际压缩 WS 限速回放的结果见 `network-latency-phase2-2026-09-20.md`，不将其重新算成本轮成果。

## 再次区分现场证据与模型

- 15:23 的 Steam 双端日志为两舰场景。房主约 60Hz，客机仍约 60FPS，但接收只有 4–5Hz 后停收。desktop.log 记录 `peer-close 1013`、状态确认超过 8 秒，oldestAck 为 8337ms。
- 首次被窗口阻挡时只有 4 帧、13,124B 待确认；最后增量 wireBytes 为 1,378B、单片，原始状态约 53KB。因此 **9 人共享上行的大队列模型不是该现场根因的证明**。旧日志缺少客机本地投递和确认发送阶段，nativeSession 又为 interface-unavailable；仍不能分辨本地卡住、可靠流停顿或 Steam SDK/路由问题。
- 16:30 两份导出保留的 660+660 条全部为 LAN。不能由此断言用户没有测过 Steam；前面的记录可能已被环形日志淘汰。dropped 不是丢包，跨机墙钟也不是单向延迟。

## 采用：只轮转实际快照接收者

`server/lan-server.mjs` 的广播现在为 LAN 和 Steam 共用以下策略：

1. 快照先选出非发送方、已连接、资源已加载、前台的接收者。
2. 每个快照轮换起始接收者；不再将被排除的房主占作一个轮转槽。
3. 原来的忙 socket、精确消费额度、Steam ACK 和共享字节额度检查全部保留。无缓存旧状态、无额外发送。
4. 生命周期/控制消息仍按原顺序广播。

这是公平性优化，不是更改网络 RTT，也不能提升一个本来就只有单客机的房间。旧 LAN 只有协商了增量时才轮转且包含房主；Steam 固定顺序容易让后面的席位总在剩余额度不足时被访问。

新增真实 `createLanServer` 测试分别走 LAN 与 Steam 适配入口，验证 1→2→3、2→3→1、3→1→2 顺序、隐藏排除、忙 socket 跳过，以及 ended 控制消息保持原顺序。先修正测试夹具中的“新玩家加入会清 ready”和“四人需四舰”，在旧实现观察到顺序断言失败后才修改生产；最终两项通过。

### 模型结果与限制

生产 SteamGateway/codec/credit + 确定性共享 FIFO 模型，9 客机、8Mbps、基础 RTT300ms、50 秒、末 5 秒统计：

|指标|固定顺序|轮转|
|---|---:|---:|
|最慢客机接收率|41.2Hz|47.0Hz|
|所有客机接收率之和|452.4Hz|447.8Hz|
|状态到达年龄 P95 范围|208–224ms|208–216ms|

改善最慢端而非总吞吐；总和略低约 1%。这不是实际游戏 FPS 或 Valve 线路测试。

- 9 人 512Kbps 启动场景全部达到原 ≥2Hz 门槛；最慢 2.6→2.0Hz，**不能称为所有场景均提升**。
- 80/300/1500ms 混合 RTT 的三客机维持 60/60/16.8Hz，慢端没有拉低快端。
- 8Mbps→256Kbps 的极端骤降仍断线，未解决；轮转不能清除已经交给可靠传输的积压。
- 模型默认顺序已改成与生产轮转一致，仍支持显式 `rotation:false` 作对照。之前 cap/packed 实验脚本已固定 false，以免默认值变化破坏复现。

## 拒绝：缩窗口或直接换格式冒充根治

以下只在隔离 esbuild override 实验内运行，**未启用生产**；记录留在 artifacts/network-latency-phase3-20260920。

|候选|9 人健康链路最慢 Hz / 总 Hz|骤降结果|决策|
|---|---:|---|---|
|原共享预算|41.2 / 452.4|队列峰值 360,103B，断线|基线|
|硬上限 256KiB|25.2 / 362.8|263,613B，仍断线|拒绝|
|硬上限 224KiB|22.0 / 311.0|229,985B，不断线但健康吞吐明显退步|拒绝|
|实验 float-plane 无损格式|44.4 / 493.0|355,184B，仍断线|拒绝默认启用|
|实验格式 + 224KiB|27.0 / 335.8|230,925B，不断线但健康吞吐退步|拒绝|

无修改 SWSP/SLD1 wire format、生产字节预算上限或超时。格式实验仅证明候选可压缩，不能据此认定兼容性、真实复杂战场收益或稳定性已通过。

## 新增：无需额外网络流量的故障阶段诊断

### Steam ACK 与轮询

`server/steam/receipt-diagnostics.mjs` 和 gateway 新增固定标量，随现有 status/sample 输出，不新增定时器、请求或重试：

- `receipts.rendererPending/Written/WriteErrors/maxRendererWriteMs`：已解码状态到本地 WebSocket 写回调的阶段。**写回调不等于浏览器已应用状态**。
- `networkAttempts/Accepted/Errors` 与 `consumptionAttempts/Accepted/Errors`：网络确认和浏览器消费确认的可靠 SDK 调用结果分开计数。
- `fastAttempts/Accepted/Rejected`：可选快速副本结果，不把失败当作可靠发送成功。
- `networkAgeMs/consumptionAgeMs`：距本机最近 SDK 接受该类确认的时间，**不是 RTT，也不证明对方收到**。
- `polling`：调用、读取、拒收、解码/dispatch 异常、SDK/轮询异常、64 包或 5ms 预算命中、最大轮询间隔与耗时。`oversizedHeads` 单列，因为超大队首只停止本轮，不能谎称已经丢弃。

旧 renderer 延迟回调只修改旧 trace，不会发确认污染新连接；重复回调不重复扣 pending；leave 发生在 poll 内时旧轮询耗时不计入新会话。墙钟回退仅钳制负诊断时长，不改生产时钟或超时。

下一批日志的判断顺序：

1. receivedStates 增长但 rendererPending 积压 → 检查本地 WS 写入路径。
2. 本地 Written 增长但 networkErrors 增长 → SDK 拒绝发送。
3. SDK Accepted 增长而房主 ackedStates 停止 → 范围缩小至返回路径/房主轮询/会话接收；仍不能仅凭 accepted 断言远端已收。
4. 状态 ACK 正常但消费确认停住 → 检查解码/应用/浏览器主线程，而不是仅调网络窗口。
5. poll maxGap/预算命中明显增加 → 检查宿主事件循环或轮询压力。

### 导出日志

`desktop/network-diagnostic-record.mjs` 保持 allowlist、16KiB 单条、660 条/4MiB 环形样本和限频。增加上述标量、完整房主消费额度、native 固定原因枚举，不导出身份/IP/payload/自由异常文本。

- `battle-failed` 带本机 battle 编号和 `failureStage` 固定枚举，区分解码、应用、worker、资源、图形、服务端拒绝等；不再将所有失败猜为断网。
- `log-info` 记录每种 transport 的写入/淘汰/保留数量；另为每种允许的非 sample 事件保留最多一条 6 字段摘要。目前最多 22 条小摘要，不保留世界状态。
- 即使后续 LAN 样本挤掉 Steam 样本，仍能看到之前 Steam 的失败/断连生命周期。明确标为摘要，不冒充尚有历史测量样本。

## 验证

- 新 receipt/poll 回归 **8/8**：本地延迟写、两类 ACK、SDK/本地拒绝、同步异常、旧连接回调、64 包预算、异常、时钟回退、超大队首及 leave epoch。
- Windows CI 同组网络 + 新实际 relay 顺序测试 **93/93**（此前 88，加 3 条导出诊断测试和 2 条顺序测试）。
- Steam 全量 **237/240**，仍仅原有 3 项失败：legacy 9 人骤降；实验 Sockets 120s soak+3s stall；实验 Sockets 健康 9 人每端≥40Hz。未降低阈值、跳过失败或将其称为全绿。
- 本轮 9 个相关生产/测试文件 oxlint JSON：0 diagnostics。
- `tsc -p tsconfig.app.json --noEmit --incremental false` exit 0。
- 隔离主入口 Vite 构建 exit 0（56.09 秒，大 chunk/资源 URL 提示仍保留）：见 build.log；禁止复制 public，排除 campaign 入口，不覆盖 dist，不是完整发布包。

产物：`artifacts/network-latency-phase3-20260920/{steam-final.log,network-final.log,receipts-final.log,rotation-red.log,rotation-green.log,lint-final.json,typecheck.log,build.log,caps-summary.json,packed-summary.json,rotation-summary.json}`。

新测试分别接入原 `steam:check` 与 Windows CI 网络步骤；未改变发布门禁策略。`server/lan-server.mjs` 等文件还含其他任务改动，不得全量暂存/提交，也不得把配装 ready 修改归入本轮。

## 尚未完成

极端骤降及两个实验 Sockets 门禁仍失败，用户双机还没有用同一新 build 实测。不能承诺朋友端已从 10–20Hz 恢复到 60Hz，也不能把旧 0.2.4 的复测当作新版效果。下一步必须用包含本轮诊断的新构建，分别采集 Steam/LAN 双端低载和高载日志，按 ACK 阶段及接收 Hz 验证；继续解决失败门禁时不能牺牲正常链路来换一个模型场景通过。
