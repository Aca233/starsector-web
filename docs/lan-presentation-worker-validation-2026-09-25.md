# 生产呈现 Worker 接入验收（2026-09-25）

## 本轮交付与边界

新增 `LanPresentationWorkerProtocol.ts`、`LanPresentationWorkerClient.ts` 和 `lan-presentation.worker.ts`。此前只有测试 Worker 驱动 FrameLoop；现在有独立生产入口，可由页面创建、接管真实 `LanConnection.claimBinaryState`，把二进制快照及 motion/combat 原始数据送到同一个呈现 Worker 内解码、恢复、预测和自主 RAF 绘制。

本轮没有修改默认 `LanBattle`。这不是默认游戏路径已提速的交付，也不是服务端 GPU 模拟、直接 socket Worker → 呈现 Worker 的通信路径。原始网络包仍经主线程转发；主线程阻塞时不能声称持续收到/确认新网络状态。默认 UI/input/audio/视觉组件、本地主机、偏好设置及回退路径的完整连接仍未完成。

原版证据与不改变规则的边界见同日期 source-notes；无原版实机、可见窗口或键鼠操作。版本保持 0.2.11，无暂存、提交、推送、发布或打包。

## 实现约束

- 创建 Worker 后，先确认原生 RAF/Offscreen 支持，再不可逆转移 canvas。WebGL2/资产初始化仍可能在转移后失败；完整页面必须处理替换 canvas 的回退，不能承诺任何失败都能复用原 canvas。
- 重用实际 LAN 消费账本，不另造网络 ACK。主线程在 post 前同步 defer；只接受匹配本地 id、owner、epoch、通道的完成记录。Worker retain 加主线程同步保留小型声音/输入 ACK 数据后才能 complete。
- 主线程只接收 UI 投影、状态摘要和至多 64 个声音记录，不接收恢复的世界图。声音字段归一化保留无效 key 对合法递增 id 水位的语义，不夹带任意额外对象。
- 控制样本保留一个在途包和一个最新副本；不合并动作边沿。已成功发送的真实输入通过显式 recordAcceptedInput 登记，时间戳使用 timeOrigin 对齐。
- UI 沿用现有 one-in-flight codec 和 afterRevision 命令屏障；没有新 UI 时 views 为 null。切局和停止撤销旧命令能力。地图/失焦不会错误停掉 motion/combat 接收，仅影响预测/控制的活动门槛。
- 错误终止 Worker，不静默切回另一绘制 owner。失败 owner 不能复活或用 stale/discarded 获得额度；显式 dispose 才释放剩余网络 claim。
- UI 应用期间可能调用音效回调；若回调同步关闭/重置连接，必须重查会话和客户端身份，不再发布旧 UI 或返还旧回执。

## 静态与源码隔离

工件目录：`artifacts/lan-presentation-worker-20260925/`。

- baseline 667 个非生涯生产模块，candidate 670 个。原有 667 个全部 hash 不变，新增仅上述 3 个模块；candidate 与磁盘无漂移。
- 最终冻结 CompilerHost 对照 before 0 / after 0 / 新增诊断 0。其它源码和依赖两臂共享首次读取结果；不是将整个脏仓库声明为所有功能洁净。
- 3 个生产文件、定向检查脚本、既有 Offscreen harness 的 scoped oxlint 通过；改动文件空白检查通过。
- 首次类型检查发现两处访问 TextureCache 私有字段。已删除生产代码的 Bitmap 内省和 closedBitmaps 报告，使用既有公开 disposeBitmapImages，不增加 any/暴露私有对象。生产入口本轮只证明公开 GPU 资源报告归零，不假造 Bitmap 关闭数量。

## 既有无头场景：最终通过 10 组

使用实际 Chromium、RTX 5060 / ANGLE D3D11、真实生产 Worker 入口、真实 LanConnection/socket I/O Worker、WebGL 和资产。复用既有 22 舰、seed 917、600 tick 预热的夹具与回环 fixture peer；后者不是实际权威服务端或跨网络延迟实验。

1. 从原始二进制接收、解码、绘制并发布 UI；默认 state/motion/combat 订阅者不收到重复恢复数据，辅助回传无世界图和额外声音字段。
2. 在真实 Worker 完成消息到达主线程的边界扣留 2 个 state、2 个 motion 和 1 个 combat 回执，证实 post、retain、绘制和 UI 发布本身不能提前归还额度。乱序释放时 state/motion 各自保持累计 ACK 顺序，combat 不受别的通道阻塞；ended 等待实际 state 消费。
3. 新会话撤销旧 UI/控制能力，旧 facade 不能读取，重新接受较低 tick 600 的有效基线。
4. 扣留一个控制回执后连续更新 80 次加最后样本，仅发送首包与最新包；调用者修改原对象不能改变已保留副本。
5. 真实 input send 返回成功后显式登记输入，坏坐标在主线程拒绝；验证跨 realm 时间戳路径，不等于输入到画面延迟测量。
6. 地图打开、选择、关闭使用真实 Worker 命令和命令后的 UI revision；声音按既有语义：直接打开无声，选舰 map_open，关闭 map_close。战术撤退权限仍被拒绝。
7. 切局后已排队的旧 state 完成不能向新会话归还额度；最终网络 state ACK 为 1、2、3、4、6，不包含过期的 5。
8. 在后置 UI 应用触发声音时同步关闭真实连接，命令被撤销，没有陈旧 UI 发布、额外错误或客户端误失败。
9. 正常 dispose 幂等，生产 Worker 返回 residentTextures=0、pendingUploads=0。
10. 新建另一真实生产 Worker，motion header 可 admission、body 却损坏时完整 codec 拒绝，不授予 ACK；终止后 reset 不能复活，过期 receive/component 只能 reject；显式 dispose 释放 claim。

最终正常路径 workerErrors/networkErrors/browser errors 均空。坏包测试的失败为刻意注入、单独断言。保留在正常场景中的辅助数据计数、UI 发布次数只是实际运行观测，不是固定速率或性能指标。

既有辅助测试 Worker 的退出报告仍记录 230 个 Bitmap 关闭及 GPU 资源归零；**它不是新生产 Worker 的 Bitmap 数量证明**。本轮没有重跑 12 组像素比较或主线程阻塞进度实验；那些是上一轮 FrameLoop 验收的证据，不能算成本轮新的测试结果。

## 具体失败与定向复查

保留 browser-*-failure.log。首次场景因更新代码但未重算冻结 hash 而在启动前拒绝；修正快照 hash 后运行。其后修复了 ACK 回显检查的异步等待、切局后未同步 facade 暴露，以及测试误以为直接打开地图会发声的预期（改为核对既有打开/选舰/关闭行为，没有改生产声音规则）。复查时补上音效回调重入和失败 owner 的终态保护。最终场景通过后未再重复运行。未进行广泛套件、FPS/延迟 ABBA、可见桌面或原版实机验证。

## 复现

设置 NODE_PATH 为已有 Playwright 依赖路径，清除其它 OFFSCREEN 检查开关；设置：

- OFFSCREEN_RECEIVER_CHECK=true
- OFFSCREEN_TRANSPORT_CHECK=true
- OFFSCREEN_BASELINE 为本目录 before-browser.json 的绝对路径
- OFFSCREEN_CURRENT 为本目录 current-browser.json 的绝对路径
- BATCH_TEST_OUT=artifacts/lan-presentation-worker-20260925/offscreen
- MULTIPLAYER_ANGLE=d3d11
- VITE_LAN_LAYERED_SYNC=true
- VITE_LAN_CRITICAL_COMBAT=true

运行既有 `node scripts/check-battle-batching-browser.mjs`。静态检查、源码 hash、场景结果见 typecheck-comparison.json、source-changes.json、acceptance.json、offscreen/offscreen-result.json。

## 下一步

将生产客户端接入实际战斗页面的完整 UI/输入/音频/视觉组件、同步门槛、本地主机和错误回退，然后在同场景、同权威 tick/数据、同画质下做主线程时间及输入到画面 p95/p99 配对测量。直接 socket→呈现路由必须连同控制序、epoch、消费额度和终局屏障一起迁移，不能只绕过主线程的一段代码就宣称问题已解决。整体“继续优化”目标仍未完成。
