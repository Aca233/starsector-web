# Worker例外路径修复与三模式先导测量（2026-09-25）

## 本轮结论

继续保持Worker默认关闭。真实页面的Worker能在主线程人为忙时维持较连续的绘制，但当前控制消息仍依赖主线程处理“controls-applied”才能发出在途包之后的最新值。本轮测量中，新控制进入绘制端的延迟并没有更好；不能把更平稳的帧间隔称为输入延迟优化完成。

下一块应针对**主线程→Worker的最新控制样本传递**去掉这个等待，而不是增加Worker数量、降低模拟频率或减少效果。需要保留focus/visibility/停止/代际隔离，输入动作及网络消费回执不能塞进可覆盖的控制邮箱。

## 已实际修改

1. `protocol.ts`：区分当前状态编码；同一JSON流不再每包重置播放、UI能力和实时坐标。真正binary/JSON切换仍明确重置，存在未消费债务时仍安全重连，不跨格式虚发信用。
2. `LanPresentationWorkerClient/Protocol` 与Worker：只有不可变图形设置对象真正变化才随控制包同步，避免每帧发送/normalize及Worker里尝试访问localStorage。
3. `LanBattle`：键鼠边沿立即发布最新控制，不再仅等下一次主线程RAF；仍只有一份在途+一份最新控制。先导测量证明这**还不足以消除等待主线程回执的瓶颈**。
4. 坐标暂时不可读与失去焦点/操控权限分开处理。前者不清空已排队动作、也不消耗输入序号；后者仍按原行为清空。
5. JSON解析耗时随本地消费账本保留，只计一次；Worker JSON入口补齐安全整数tick/minTick检查，未降低已有校验。

基线674个非生涯模块，候选674个；6个生产文件修改，其余668个hash未变，没有新增/删除生产模块，最终磁盘与冻结图无漂移。冻结CompilerHost对照before0 / after0 / 新增0；项目oxlint和改动whitespace通过。不是对整个脏工作区/生涯WIP的交付声明。

## 三个同源运行臂

既有 `scripts/check-normal-multiplayer-browser.mjs`，同一候选冻结图：

- main：原主线程呈现；shared：实际页面Worker+共享实时坐标；messages：同一实际Worker，测试专用变换强制使用其现有messages模式。
- 每次2个真实客户端、实际权威Worker/relay/桌面helper/网络回执，总22舰、seed917，完整样式，CSS与backing都是1280×720，ANGLE/NVIDIA GeForce RTX 5060/D3D11。
- 三臂均启用相同实验分层设置 `VITE_LAN_LAYERED_SYNC=true`、`VITE_LAN_CRITICAL_COMBAT=true`；因此不是对默认完整快照策略或Steam网络的性能结论。
- 每臂10秒：前5秒普通运行，后5秒每250ms的实际DOM输入之后执行一次70ms主线程忙任务。均为隔离无头页面DOM事件，没有OS输入/可见窗口。
- 测试专用变换在真实draw owner线程本地保存最多10000行标量，每次完成真实WebGL提交才记录；最后一次性取回，不逐帧向主线程发探针消息，不复制世界/替换renderer。

### 观察值（单次先导，不是统计充分的优化证明）

| 模式 | 普通帧间隔p95 | 忙任务期间帧间隔p95 | 普通控制→提交p95 | 忙任务期间控制→提交p95 | 忙窗口绘制帧数 |
|---|---:|---:|---:|---:|---:|
| main | 22.48ms | 78.31ms | 16.55ms | 82.76ms | 240 |
| shared | 22.16ms | 26.39ms | 19.38ms | 94.20ms | 298 |
| messages | 22.58ms | 27.20ms | 18.07ms | 98.27ms | 296 |

“控制→提交”严格定义为DOM事件到实际draw帧采样了新的按键mask并提交WebGL；**不是GPU完成、合成器显示、屏幕扫描或input-to-photon**。每个窗口只有20个输入，p95/p99属于很少的顺序统计量，不能据此声称稳定尾延迟。本次顺序运行、未做ABBA，权威推进和交战细节有运行噪声，不是逐tick相同图像的配对实验。它足以否决“Worker已经全面更快”的说法，并指导下一步控制通道优化，但不足以默认开启。

### 保留碰撞保护，而非为测试强开预测

首个main运行的“每个输入都必须得到局部预测帧”断言失败。实际诊断明确显示 `motionPrediction.reason=collision`，renderedFrames停在420、suspendedFrames继续增加；真实交战中的保护条件不能禁用。

探针修正为分别报告：

- 新控制实际被draw帧采样的提交时间；
- **确实启用局部运动预测**的提交时间，仅在有证据时计数；
- 没有局部预测响应的输入数量及真实skipReason，不补零、不伪造可见响应。对应缺失必须有collision/unavailable/stale的安全门槛证据。

最终普通窗口各有3个输入没有局部预测响应；忙窗口main/shared/messages分别有14/15/13个。故不能将表中的控制采样延迟直接等同舰船可见运动延迟。原碰撞/状态校验完全未改。保存首轮失败日志和原诊断，修正后保存完整原始标量记录。

## 消息模式与JSON真实页面验收

messages臂完成测量后，既有relay对同一认证访客的新连接使用实际完整权威JSON线格式；协商不启用motion/delta，保留真实协议解析、同步与消费回执。JSON转换开销在测量窗口之后，不混入上表。

- 同一JSON代际11：应用tick891→956，权威输入ACK548→583，Worker接收的JSON条数14→41；**代际没有逐包重置**。
- 此期间64个控制包没有一次重复图形设置发送；实际修改screenShake=.375后，Worker状态报告该值，恢复原值也获确认。
- 先用真实背压将武器组动作留在页面队列，再令实时坐标读取150ms不可用，同时恢复发送许可。输入序号一直为597；恢复坐标后该动作只发送一次，得到权威ACK且HUD显示实际新武器组。
- 总计发送66份JSON后，真实完整binary恢复，收到11份binary，代际12、tick1023、ACK611，仍为同一场战斗与同一Worker。
- 三个运行臂最终errors=[]、failures=[]、cleanupCompleted=true。

消息模式是强制选择现有fallback传输，**不是对某个真实非隔离浏览器/不支持OffscreenCanvas设备的能力验证**。本轮没有测试Steam、多机、长期浸泡、GPU上下文丢失或原版实机UI等价；先前主机800ms停顿场景本轮未重复，没有冒称重新通过。

## 工件与复现

`artifacts/lan-presentation-measure-20260925/` 包含before/current冻结图、typecheck-comparison、lint日志、source-changes、acceptance；首轮main失败在 `main/`，最终三臂在 `main-recheck/`、`shared-recheck/`、`messages-recheck/`。各成功臂有result、presentation-submit原始逐帧标量、两阶段计算结果及诊断JSONL。

沿用NODE_PATH，设置MULTIPLAYER_FROZEN指向本目录current-browser.json；PLAYERS=2、MS=10000、SEED=917、ANGLE=d3d11、STYLED=true、STALL=false；相同分层环境如上。依次设置 `MULTIPLAYER_PRESENTATION_MEASURE=main/shared/messages`，main对应 `VITE_LAN_PRESENTATION_WORKER=false`，其余true，分别设置MULTIPLAYER_OUT后运行同一个既有场景脚本。

版本保持0.2.11；保留WIP，未暂存/提交/推送/打包/发布/修改安装游戏。整体优化目标继续，当前仍没有默认切换依据。
