# LAN wire compression — 2026-09-19

## 范围与整合

为 LAN300ms 做传输层小改动，不动 BinarySnapshot 编码、快照内容、协议号或模拟频率。

生产代码只有：

- server/lan-server.mjs：两个 noServer WSS，按实际 TCP remoteAddress 分流，共用原 acceptTransport；正常关闭与 listen 失败均关闭两组 WSS。
- server/desktop-lan-bridge.mjs：只改远端 WebSocket 的压缩选项。原 loopback-only bridge WSS 仍 perMessageDeflate:false。
- 新增 server/lan-websocket.mjs：地址判定、fresh PMD 配置与远端握手 helper。

新证据全部在 artifacts/lan-compression-20260919/，新文档即本文件。没有新增项目 tests/runner、依赖、自动环境策略、带宽探测、全量构建或浏览器大战。整合桌面包时必须包含新 helper；本次没有打包、发布或替换运行中的服务。

基于工作区原文件做局部替换，保留已有 Steam snapshotWritable 分支、system action 校验，以及 bridge 的双端 CLOSED 才释放、1 秒 terminate、4 pair、5 秒握手、禁止重定向等修复。before-*.mjs 和增量 patch 可用来区别本次改动与既有工作区改动，不应拿 Git HEAD 覆盖当前文件。

## 固定策略

- 非 loopback 的真实 socket peer 才启用标准 RFC7692 permessage-deflate；不使用 Host / Origin / X-Forwarded-For 判断是否本机，也不新增安全放行规则。
- 127/8、IPv6 ::1、IPv4-mapped IPv6 loopback 均不压缩；未知地址保守不压缩。非 loopback 只代表连接路径，不是可信网络证明，原 Host/Origin 等校验保持。
- 两方向 no context takeover，level 1、memLevel 7、16 KiB deflate/inflate chunk、默认最大 32 KiB window、concurrencyLimit 2、threshold 1024。
- 配置每次新建，不按连接修改共享 WSS options；小消息不压缩。
- bridge 用 ws 的公开 finishRequest hook 等实际 TCP 地址可用后，在 loopback 请求上移除 extension offer；不做额外 DNS 查询，不改变 Host、Origin、TLS 身份或原握手超时。即使目标是解析到本机的域名也不协商压缩。
- 远端请求相同 PMD/no-takeover 参数；未支持 PMD 的旧服务端以及不开 PMD 的旧客户端自然回退原帧，不需要新应用层协议。
- ws 的 zlib limiter 是进程全局、首个 PMD 实例决定上限；当前生产代码里的所有 PMD 入口均使用本 helper 的 2。未来新增其他 ws 压缩入口需保持一致，不能声称本选项会重设已有全局 limiter。
- zlib 内存有窗口/级别/块大小边界，但 no takeover 是每消息 reset，不代表每消息释放 native stream。每连接仍有 stream 和最多原消息预算的接收/发送数据；这不是固定进程 RSS 的保证。

未改的保护：maxPayload=16,777,216（也约束解压后完整消息，含跨分片累计），bridge bufferedAmount + data.length <= 33,554,432、最多 4 pair、拨号期 8 条 / 65,536 字节、断线回收、LAN 64 peers、160 消息/秒、普通 ws 状态零缓冲跳过、心跳/超时和安全校验。protocol.version=25、snapshotHz=60 原样保留。

## 真实帧字节和 CPU

输入是原有 artifacts/lan-worker-latency/snapshot-32-{0,1,2}.bin，逐字节保持不变。Node 24.13.1、ws 8.21.3、i5-13490F；完整 hash、运行时间、参数和样本见 benchmark.json。

离线基准：每消息独立 raw DEFLATE level 1、Z_SYNC_FLUSH 去 RFC7692 尾部；20 次预热 + 120 次压缩/解压。同步微基准包括创建 stream 的成本，不冒充异步 ws CPU profile。表中时间为 wall time，报告也保存 process.cpuUsage；机器上可能有其他测试，非独占 CPU。

| 32 舰帧 | 原始 bytes | PMD payload bytes | 减少 | 压缩 p50 / p95 ms | 解压 p50 ms | 60Hz payload 原始 → 压缩 Mbps |
|---|---:|---:|---:|---:|---:|---:|
| 0 | 294,093 | 37,818 | 87.14% | 1.070 / 1.827 | 0.547 | 141.16 → 18.15 |
| 1 | 328,486 | 44,324 | 86.51% | 1.189 / 1.936 | 0.577 | 157.67 → 21.28 |
| 2 | 519,544 | 103,745 | 80.03% | 2.621 / 4.121 | 1.066 | 249.38 → 49.80 |

60Hz 一栏是同大小帧每秒发送 60 次、单接收者、仅 payload 的算术估计，不含 TCP/IP/TLS/VPN/重传开销，也不表示实战每秒实际交付 60 帧。对带宽有明确帮助，但最大的现有帧压缩后仍约 50 Mbps/接收者。

候选对比：memLevel 8 得到 37,841 / 44,380 / 103,929 bytes；memLevel 6 为 37,851 / 44,302 / 104,044 bytes，最大帧编码 p95 约 5.00ms。采用 memLevel 7 是减小 zlib 工作内存、保持压缩率的折中，不声称 CPU 比 8 更快。把 window 缩成 12 bits 则变成 84,191 / 91,988 / 157,672 bytes，编码也更慢，故不采用。默认 15-bit window 有明确上界，无需新增复杂自适应策略。

## 真实 WebSocket 验证

verification.json：17/17 项通过。测试绑定临时端口，使用本机实际非 loopback 网卡地址与 IPv4/IPv6 loopback；没有伪造 remoteAddress。每种模式每帧 4 次预热 + 40 次往返，生产 bridge 每帧另做 12 次往返，均逐字节验证输入/输出。

实际 TCP socket bytesRead/bytesWritten（不含底层 TCP/IP 包头）：

| 帧 | 无压缩 client→server / server→client bytes | PMD client→server / server→client bytes | 无压缩 RTT p50 / p95 ms | PMD RTT p50 / p95 ms |
|---|---:|---:|---:|---:|
| 0 | 294,107 / 294,103 | 37,826 / 37,822 | 1.54 / 11.99 | 4.12 / 7.02 |
| 1 | 328,500 / 328,496 | 44,332 / 44,328 | 1.74 / 14.98 | 4.55 / 6.64 |
| 2 | 519,558 / 519,554 | 103,759 / 103,755 | 2.60 / 11.18 | 9.26 / 12.32 |

PMD 的 bytes 与离线 payload 加标准帧头完全一致；多次重复大小稳定。CPU/RTT 不是免费的：在无带宽瓶颈的本机，小帧压缩 RTT 中位数更高。bridge 全链路 p50 为 6.41 / 6.58 / 12.63ms，p95 为 19.89 / 9.39 / 34.11ms，不能据此许诺所有配置稳定 60Hz 或消除 300ms 网络时延。

17 项覆盖：地址分类与独立配置；生产两组 WSS 共用握手；客户端未支持 PMD；IPv6/IPv4-mapped loopback；bridge loopback IP/localhost 不发 offer；非 loopback 双向 no takeover；旧未协商服务器；真实帧往返；小消息阈值；LAN 超限解压及累计分片；bridge 超限解压；压缩中排队预算；突然断线；不读 close 的超时回收；原 Origin 拒绝；活跃连接双 WSS 关闭；listen 失败双 WSS 关闭。

### 有界排队、解压与关闭

- 使用真实 519,544-byte 帧，诊断中完成真实 zlib job 后暂缓其回调（仅测试故障注入，不改生产代码），模拟压缩器停滞。发送 65 帧，pending 原始字节峰值 33,250,854，始终低于原 33,554,432 上限；下一帧触发 bridge 1013。说明 ws 的 bufferedAmount 包括压缩中/待压缩的数据，并未因启用 PMD 绕过原预算。恢复回调后约 439ms 释放连接，无无界增长。这是有限边界试验，不是大型压力测试。
- LAN：16,777,217-byte 高压缩率消息以及 18MiB 分片累计消息均被 1009 拒绝，不按压缩后小体积放行。
- bridge 远端：恰好 16MiB 可完整接收；+1 byte 触发 WS_ERR_UNSUPPORTED_MESSAGE_LENGTH，对端观察到 1009，本地 browser 侧按原错误路径 1013 关闭，pair=0。
- 接收器出错时 ws 本端 close 事件可能是 1006，不是收到对端 close 的 1009。首轮诊断错误地断言本端也应为 1009；保留 first-run-wrong-close-expectation.*，只修正测试预期并记录 error + 对端实收 code，未为过测修改生产保护。
- 停读 close 的压缩连接仍占容量到原 1 秒 terminate，实测约 1,024ms 后双端 CLOSED。突然中断释放双端；活跃本机/远端各一条时两组 WSS 都关闭；端口占用启动失败也都关闭。
- cleanup：0 监听服务、0 bridge pair、0 未关闭客户端；每个 WSS 收到 close。

### 保留桌面 LAN 修复的回归

将既有 artifacts/desktop-lan-join-20260919/ 的 ws-validation.mjs 与 p2-lifecycle-regression.mjs 原样复制到本证据目录运行，原证据目录未改：

- ws-validation-results.json：20/20，包含现有协议/恢复/安全/桥接边界验证。
- p2-lifecycle-regression.json：3/3，包含关闭中仍占 4 个名额、shutdown 清理、停读与缓冲的 1 秒兜底。

## 复核命令与局限

在项目根目录执行（所有新诊断输出仅在新 artifacts 目录）：

~~~powershell
node artifacts/lan-compression-20260919/benchmark.mjs
node artifacts/lan-compression-20260919/verify.mjs
node artifacts/lan-compression-20260919/retained-ws-validation.mjs
node artifacts/lan-compression-20260919/retained-lifecycle-regression.mjs
node --check server/lan-server.mjs
node --check server/desktop-lan-bridge.mjs
node --check server/lan-websocket.mjs
.\node_modules\.bin\oxlint.cmd server/lan-server.mjs server/desktop-lan-bridge.mjs server/lan-websocket.mjs
~~~

只证明现有真实帧节省 80–87% 字节、标准 ws 协商/回退、原防护仍起效。不代表真实双机/虚拟 LAN、WAN 300ms、TLS 部署、长期多客户端或满载战斗验收；并发 2 是安全上限，不是已经测得的性能最优值。每个接收者独立压缩会增加 CPU；拥塞时原零缓冲快照跳过策略仍可能跳帧，不能将此描述为修改了 60Hz 模拟。主代理的编码优化会改变字节分布，整合后应再针对新帧比较压缩收益，不能直接套用本表。

## 主代理补充：正常绘制的浏览器链路检查

使用最终前端dist、两个独立headless Edge、通过本机实际非loopback IPv4网卡连接（启用标准压缩），8舰10秒：实收57.85Hz、物理59.69Hz、战斗0.9968×，48个输入边沿全部发送/到达房主/获权威确认；输入确认平均35.52ms/P95 65.70ms，无恢复/断线。网络/输入一致性检查均通过。

报告 artifacts/lan-worker-latency/codec-compression-8.json 整体仍标failed：两个页面各记录一条HTTP局域网IP不受信任、浏览器忽略COOP头的console error（并非脚本异常），不能悄悄改为全绿。没有修改安全header或伪造跨源隔离；AI多Worker仍关闭。这是同机网卡通路，不是双机延迟结果，也没有证明大舰队60Hz。桌面方案将页面保持localhost、安全隔离保持不变，仅桥接远端WebSocket，另做打包UI验证。
