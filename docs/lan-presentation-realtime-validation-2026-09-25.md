# 实时相机/瞄准通路验收（2026-09-25）

## 本块交付

新增 `LanPresentationRealtime.ts`，生产 Worker 每次 FrameLoop 的同帧姿态/相机阶段完成后发布相机、zoom、当前 aim、backing viewport、HUD zoom、呈现帧序号/tick、跨realm时间和配置序号。无世界对象、权威命令或输入 ACK。

- 共享模式：固定 120 字节 SharedArrayBuffer，单 Worker 写；所有数值保持 Float64 精度，但按两枚原子 Int32 字发布，受一个版本锁保护。主线程最多尝试四次，遇到写入竞争返回 null，不等待或无限自旋。每帧不发送 postMessage。
- 不支持共享内存时：一份在途小标量消息＋最新一份待发样本，收到保留回执再发最新值；不会积压所有呈现帧。可显式选择 messages 模式用于受限环境/测试。
- 客户端独立单调 viewGeneration 防止新的网络 owner 重复 epoch 后误认旧数据；会话重置、隐藏、停止、失败/关闭撤销可读性。Worker context-loss 路径也发布无效值，恢复后的新帧才能恢复数据。
- `readRealtime` 默认拒绝超过 250ms 的呈现样本，采用 timeOrigin+now 对齐时钟。这个年龄是**呈现坐标年龄**，不证明权威状态新鲜或已获操控权限。调用方仍须保留 launched/synced/ACK/焦点等现有门槛。
- `readInput` 在发送时使用新鲜帧的实际 backing viewport/camera/zoom，加调用者当前 CSS rect，复用现有 clientToCombatWorldInViewport 算术。无活动指针时使用该帧当前 aim。构造输入不发送、不消耗动作，也不登记预测；真实 send 成功后仍显式 recordAcceptedInput。

共享撤销可被下一次内存读取直接观察。消息回退的上下文等远端撤销需要消息到达，不能宣称零 IPC 延迟；本地隐藏/停止/切局门槛则立即阻止读取。所有存量 UI、网络额度和状态消费独立于此通路。

## 不是本块完成的内容

默认 LanBattle 仍未改为 Worker 绘制。本块只解除“主线程输入只能拿100ms HUD相机”的接入阻塞，没有把新 readInput 接入实际页面事件/发送循环，也没完成本地主机、JSON/错误回退、完整页面生命周期和 HUD/命令适配。不能说实际玩家延迟已经下降100ms，更没有 SIM/FPS/GPU计算速度提升测量。

原版 0.98a-RC8 的配置/API证据及坐标转换来源见同日期 source-notes。本轮无可见窗口、键鼠、原版实机或新外观/逐像素等价验收。

## 静态和源码隔离

- 冻结 before 672 个非生涯生产模块，after 673。新增 Realtime 一个模块，只修改生产入口、客户端、消息协议三个文件，其余 669 个 hash 不变；无删除/磁盘漂移。
- 最终冻结 CompilerHost 对照 before 0、after 0、新增诊断 0。其它源/依赖沿用两臂共享读取；不是全仓库功能完整性声明。
- 改动生产/检查文件 scoped oxlint 通过；修复测试启动同步后再次只 lint 两个检查文件，通过。改动文件无尾部空白。
- 未改权威计算、频率、精度、画质、效果或实体数量；没有覆盖生涯及此前 WIP。版本仍为 0.2.11，无暂存、提交、推送、打包或发布。

## 既有无头场景结果

复用现有 Offscreen / 22舰 / 实际生产 Worker + LanConnection/socket I/O / ANGLE D3D11 场景。此前17组仍通过，新增两组生产实时链路验证，共19组，另有同一场景内的原子通路检查。

### 原子和有界性

- Mailbox 固定120字节；初始化无样本、代际不符、无效值、关闭均不能读出有效坐标。读者修改返回对象不会改写邮箱；未知额外字段不会进入标量数据。
- 人为置为写入中的奇数版本时立即返回 null；有符号 Int32 版本越界后仍正确读取；不以一次硬件时序碰巧成功替代代际/锁断言。
- 独立测试 Worker 使用生产 Mailbox 实现写入40000次，主线程在两线程并发期间取得4144个一致样本，检查 frame、tick、相机、aim 和配置间的对应关系，无混合帧。该计数只是一次运行的调度结果，**不是吞吐量基准**。
- 发布100份消息而不回执，仅保留初始化在途包及最新值；匹配回执后只发第100份。错误serial/generation不打开队列，重置和关闭使旧回执失效。共享发布没有帧消息。

### 实际生产共享通路

- cross-origin-isolated页面实际选择共享模式。
- 扣住真实 UI 发布消息、不返还其回执；相机样本仍前进多帧并收到新 zoom=1.2，而公开 HUD/status 和 UI 发布数没有变化。证明新通路不依赖100ms HUD或UI消费。
- 输入构造复用当前640×360 backing viewport、偏移且320×180的CSS rect；与既有转换函数结果精确一致。无指针 aim 正确；动作副本不受调用者之后修改影响；没有新增发送/RPC或消耗动作。
- 隐藏的本地门槛立即拒绝读取；新会话无新帧时不能读旧数据。既有图形偏好、独立175枚弹丸渲染层、坏包和消费账本检查仍通过。

### 实际生产消息回退

- 另一个真实生产 Worker 显式选择 messages 模式。
- 扣住一份帧消息300ms，期间没有第二份消息排队，旧样本因年龄过期不可读。回执后得到最新 zoom=1.4 和更大的帧序号，不逐帧重放历史。
- 实际 stop 请求立即撤销本地读取，并由 Worker 确认停止；真实连接 reset 后，故意再投递已扣住的旧代际消息，仍不能使旧坐标复活。新基线和配置恢复有效读取。
- 坏 motion 导致终止时 realtime 也不可读；既有失败 owner 不能授信的检查继续通过。

正常 workerErrors/networkErrors/browser errors 均空；生产 dispose 的 residentTextures、pendingUploads 均0。没有新增原生context-loss故障注入；此项只核对调用绑定和原先FrameLoop的生命周期机制，不能写成这一块已重新做过真实上下文丢失实验。

## 失败与定向修正

并发测试初次失败没有完成写入；增加诊断后显示 done=0、reads=0、last=null、无运行错误，没有报告撕裂样本。问题发生在探针启动阶段：主线程发送测试消息后立即进入忙循环，缺乏“写者已收到并准备好”的同步证据。

测试改为明确握手：写者收到邮箱后报告 armed，测试 Worker 用 Atomics.wait 等待专用启动标志；主线程确认 armed 才通过共享标志唤醒，再并发读取。该等待**只在测试 Worker**，生产读/写没有 wait。修正后原子测试和19组既有生产场景一次通过，未修改生产算法来放宽断言。保留两份失败/诊断日志。未运行无关全套或性能ABBA。

## 工件/复现

`artifacts/lan-presentation-realtime-20260925/`：before/current冻结图、typecheck-comparison.json、lint.log、lint-tests-final.log、source-changes.json、acceptance.json、失败日志、offscreen/offscreen-result.json。

沿用已有 NODE_PATH，设置 OFFSCREEN_RECEIVER_CHECK=true、OFFSCREEN_TRANSPORT_CHECK=true、VITE_LAN_LAYERED_SYNC=true、VITE_LAN_CRITICAL_COMBAT=true、MULTIPLAYER_ANGLE=d3d11；OFFSCREEN_BASELINE/OFFSCREEN_CURRENT 指向本目录冻结图绝对路径，BATCH_TEST_OUT 指向本目录 offscreen；清除其它 Offscreen 开关，运行既有 `node scripts/check-battle-batching-browser.mjs`。

下一块应实际接页面事件/发送与 UI 命令/HUD、主机和回退，不再使用 HUD 投影来近似输入相机；默认切换前仍需同场景同画质下输入到画面 p95/p99 等端到端对照。整体优化目标仍未完成。
