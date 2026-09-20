# Steam 客机本机二进制接收：phase10（2026-09-20）

## 当前目标与边界

目标仍是解决客机真实低Hz、排队延迟及断线；不是把插值FPS改名成接收Hz。本阶段未完成稳定端到端60Hz、n2n/原生Steam双机验收或既有三项压力门槛。没有提交、推送、安装、打包或发布，未修改生涯模式。

证据使用 `artifacts/network-latency-phase5-20260920/frames22/manifest.json` 标明的发布版v0.2.5 `ef043ecef4547321929dd0ffb0eee47074d08b13` 22舰完整录制，不使用工作区其他任务改动的引擎。

## 本次真正进入代码的改动

此前SteamBinarySnapshotReceiver已还原并验证完整SWB1，但本机helper仍将完整canonical JSON通过loopback WS发送给客机，再在游戏主线程JSON.parse。

- 客机hello新增独立 `binaryReceive:1`，与phase9房主上传 `binarySnapshots:1`、LAN `binaryDelta` 分开。
- guest gateway仅在本机前端提出、远端SSB1握手确认、hello被welcome接受、**完整canonical字节消费额度已协商**时启用。只在此时给本机welcome附加binaryReceive确认。
- SSB1仍先还原SLD1并执行原CRC、完整decode、canonical JSON大小及SHA256验证；之后才暴露完整SWB1给本机bridge。预测参考/差分包不直接送到游戏。
- 新客机经原生WS或生产WorkerLanSocket接收完整binary，走已有共享decodeBinaryState。旧前端/旧remote/未协商消费额度继续JSON；小/超大状态等fallback仍为JSON并可回到binary full。
- **消费额度仍按canonical UTF-8 JSON大小计费**，不按较小binary放大队列。network ACK仍在本机WS成功回调之后；consumed ACK仍来自游戏同步订阅者处理之后。失败、旧回调、关闭及重连不产生虚假确认。
- 新增receipt诊断 `rendererBinaryWrites`、`rendererJsonWrites`、`rendererPayloadBytes`、`rendererCanonicalBytes`，并加入日志白名单。它们统计本机尝试写入，不是成功应用、显示帧或公网字节；原Written/Errors继续区分回调结果。无payload/身份写入日志。
- 本次没有改变公网包压缩格式、可靠性、ACK窗口、物理模拟或8秒超时；LAN原本已使用binary路径，未再增加一层格式。

## 无头Edge：真实本机WS与主线程解析对照

`artifacts/network-latency-phase10-20260920/check-browser-guest.mjs` / `browser-guest-result.json` / `browser-guest.log`。

Edge153.0.4234.46；生产LanConnection、可选生产I/O Worker、真实loopback WebSocket、生产guest gateway/SSB1验证/receipt逻辑，SDK用明确替身。每20帧取一份完整录制，共13帧；原生WS/Worker × 旧JSON/新binary，四种组合总52次完整canonical相等；各13个network ACK和13个consumed ACK，结束时canonical消费债务为0，无pageerror。

|13帧合计|旧本机JSON|新本机binary|
|---|---:|---:|
|本机WS payload|5,918,499B|2,568,404B|
|计费canonical字节|5,918,499B|5,918,499B|

本机传输字节减少 **56.6%**；这不是公网Steam/n2n包减小56.6%。旧UI snapshotBytes是字符串长度的历史近似值，不能冒充UTF-8字节；此表使用gateway的真实Buffer.byteLength计数。

另在同一隔离页面做主线程parse ABBA：每轮预热5遍后测20遍13帧，每次都实际读取结果；跨运行时完整JSON相等在计时外验证。

|解析|两轮均值|两轮P95|
|---|---|---|
|JSON.parse|1.404 / 1.212ms|2.085 / 1.420ms|
|decodeBinaryState|1.011 / 0.951ms|1.450 / 1.170ms|

均值合并约减少25%。这只是解析微基准，不含游戏apply/render，也不是60Hz实网或input-to-photon证明；离线预先生成的Steam帧仅用于检验客机路径，不拿它冒充房主计算性能。

## 排除的压缩候选：当前真实SSB1包

`probe-compression.mjs` / `compression-abba.json/log` 对当前motion reference后的完整SSB1输入，stride1/3/10、每算法正序及反序，逐包解压字节完全相等。

- stride1：deflate1约21,894B、0.39–0.40ms；deflate6约21,688B但0.51–0.52ms，省不到1%。
- zstd-3更快但约23,882B，比原来大约9%；zstd1约22,607B；zstd3约22,028B。brotli1约22,526B。
- stride3/10仍没有足够的联合CPU/字节收益。没有采用新wire协商/压缩算法，也没有把小幅省字节当作低延迟根治。

## 排除的共享窗口/检查点候选

`probe-checkpoint-caps.mjs` / `checkpoint-caps.json/log` 使用明确esbuild隔离override，生产文件未采用。9人、RTT300ms、8Mbps健康及12秒时跌至256Kbps，50虚拟秒；不调整原断线门槛。

- 计算预算耗尽时跳过full fallback +240KiB：骤降不掉线，但健康约54.4–56.8Hz/人，低于现有健康约60Hz，拒绝。
- 同策略+256KiB：健康约58.6–60Hz，骤降仍掉线，峰值队列264,892B。
- +256KiB并将首次检查点提前分散：健康约57.6–58.6Hz，骤降仍掉线。
- 不设新总上限、仅分散检查点：健康吞吐保持接近60Hz，骤降仍掉线，峰值队列362,939B。

这些进一步证明“直接调窗口/错开full”不能同时满足健康高Hz和骤降稳定；没有放宽测试阈值或修改生产checkpoint定义来刷绿。

## 回归与未完成项

完整测试进程已确认终态：typecheck=0、lint=0（仅其他任务既有生涯脚本警告，未修改）；网络176/176；Steam295/298，失败仍为相同三项，没有新增回归失败。日志为 `typecheck.log`、`lint.log`、`network-suite.log`、`steam-suite.log`。新增8项gateway/本机binary回归及1项诊断白名单测试通过；未调整旧吞吐、队列或超时断言。

当前仍缺：稳定真实端到端60Hz、低带宽排队年龄回归、原生Steam/n2n双方桌面验证，以及legacy9人骤降、实验Sockets长期恢复/9人健康吞吐三项门槛。客机helper仍为canonical完整性检查生成JSON，房主同步编码也仍占用ACK/poll事件循环；下一步需研究有边界的异步准备/校验，而不是假定本次0.3ms解析节省能独自解决这些问题。目标保持active。
