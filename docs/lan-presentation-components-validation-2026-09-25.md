# LAN motion/combat 呈现消费验收（2026-09-25）

## 结论与范围
本轮完成运动/关键战斗状态的有界呈现消费路径，修复默认 LanBattle 在实际接收前就发出运动 ACK 的时序。**默认仍为主线程同步接收；没有默认启用完整呈现 Worker，也没有测得或宣称 FPS、模拟速度、网络延迟提升。**

版本保持 0.2.11。未改模拟 tick、wire 精度、舰船/特效数量、游戏权威或界面；未暂存、提交、推送、打包、发布或替换安装版。后台文件操作和隔离无头测试，没有子代理、桌面操作或键鼠注入。

## 实现
- 新增 `LanPresentationComponents.ts`：只读取 base64 前 16 字符（12 字节）取得本地 ACK tick；检查编码长度、魔数、安全整数。该步骤不冒充完整校验，完整 motion/combat codec 仍由实际 Runtime 执行。
- `PresentationReceipts` 新增独立 motion/combat 通道。运动最多 16 条、234688 个编码 code units；战斗最多 6 条、262152 个编码 code units。计量不是解码后堆大小，也不是浏览器跨 epoch 消息队列总上限。
- 运动 ACK 按接收顺序释放，保持服务端累计确认约定。战斗通道不等运动或大快照，终局屏障则等待全部四个通道完成。
- 未激活/隐藏运动被本地丢弃时不发 motion-consumed，避免误激活服务端运动通道；战斗明确发送 consumed/discarded。合法旧帧可以消费，不回退显示、不增加接收 Hz。
- Runtime 的 `receiveMotion` 同时被默认远端路径和本地主机调用；预测基准更新保留在该 Runtime 内，保留原先“接收成功 → Hz/input ACK 回调 → 预测基准”的同步顺序。本地主机原有 `finally motion-consumed` 不变。
- 可选 `LanBinaryStateOwner.receiveComponent` 复用已有 owner/epoch 和显式 defer/complete/reject 约定。不发送完整解码组件图作为生产返回值；返回的是状态、是否前进和数值输入确认。原始 base64 字符串跨线程仍会复制，并非 zero-copy。
- launch 先记录新 sync 再重置 owner；stop/reset/dispose 撤销组件会话，旧 owner/epoch/sync 的工作不能写入新会话。
- 复查补上“组件早于首个二进制快照”时撤销 owner 的恢复：只要尚有消费债务，就重新连接获取新服务端额度，而非静默移交。

## 验证结果
既有 `check-battle-batching-browser.mjs` 的新增组件分支完成 **27 项定向检查**，无浏览器错误：

1. 默认同步 Runtime 与原运动接收步骤、预测基准、渲染姿态一致；combat 包含 SCC2 武器状态。
2. 使用真实 LanConnection、socket I/O Worker、呈现 Worker、WebGL/OffscreenCanvas。主线程/Worker 对同样运动与战斗帧的诊断值完全一致；位置权威不被呈现改写。
3. 到达/投递/Worker retain 前均不提前 ACK；retain 后还必须完成本地发行的 receipt。
4. 一个未确认的大快照和两条未确认运动并存时，combat 702 能先完成；运动回执再严格按 700、701 顺序释放。
5. 旧帧、inactive、minTick、错误 match/sync、epoch 重置、错误 owner、未协商能力、头合法但正文无效均覆盖。
6. 四通道终局屏障、16/6 条数上限、编码预算上限、取消与旧 token 拒绝通过。
7. 真实终局等待 motion 710 和 combat 711；最终 combat 回执明确观察到 consumed。
8. 默认非 Worker 连接同步消费通过；无领取的 owner、返回 Promise 的 owner 均 fail-closed，不授予额度。
9. 首个大快照之前的组件 owner 交接会撤销旧 token 并重连。
10. 实际 Worker dispose 后 draw/apply/input 被拒绝，230 个 bitmap 已关闭，GPU residentTextures/pendingUploads 为 0。

这不是实际联机 relay/authority 压测；测试 peer 仅回送夹具。测试专用跨线程诊断探针会返回姿态等数据，不代表生产路径要传这些图。没有本轮像素一致性/原版界面比较、WAN RTT、RAF FPS、input-to-photon 或 GPU compute 验证。

## 集中检查与失败修复
- 冻结非生涯源码：before 663 模块，candidate 664 模块；5 个已有生产文件修改、1 个新增，另 658 个已有模块保持冻结版本。验收时未发现本轮冻结范围的额外工作区漂移；不代表仓库无其他 WIP。
- TypeScript 冻结图对照：before 0、after 0、新增诊断 0。生涯及共享依赖在一次比较中共用读取，不能表述为全仓库洁净检查。
- 6 个生产文件与 3 个相关脚本 scoped lint 通过；测试修复/交接复查仅检查对应文件。scoped `git diff --check`、新增/相关文件尾部空白检查通过。
- 首次场景发现测试前置步骤不对称：Worker 多执行了一个 inactive renderPose，所以 suspendedFrames 多 1；改为相同的 apply-only 前置步骤，保留全部比较项，没有删除差异字段来掩盖结果。
- 随后 teardown 发现测试过早重建了无 world 的 Runtime，却按已有 views 断言销毁；去掉多余重建，直接验证原 failed owner 销毁。
- 最后因代码复查发现组件先于快照的 owner 移交债务问题，补上恢复条件和针对性检查，再复查类型/相关 lint/同一场景。没有运行广泛性能或生涯全套。

## 原版证据状态
实现前证据见 `lan-presentation-components-source-notes-2026-09-25.md`。已核对本地 0.98a-RC8 配置及 CombatEntityAPI；本轮只改变 Web 传输消费所有权，不改这些模拟属性的权威计算。没有新增原版实机、截图、交互证据，不能声称原版网络或 UI 等价。

## 工件与复现
目录：`artifacts/lan-presentation-components-20260925/`
- `before-browser.json` / `current-browser.json`：不可变对照输入。
- `source-changes.json`：源码 SHA-256、改动清单、相关脚本哈希及漂移检查。
- `scoped-source.patch`：仅本轮生产源码变化，不混入此前 WIP。
- `typecheck-comparison.json`、`lint*.txt`、`diff-check.txt`。
- `offscreen/offscreen-result.json`：27 项、实际回执、Worker 和释放结果。
- `acceptance.json`：接受范围与结果摘要。

复现使用 `OFFSCREEN_RECEIVER_CHECK=true`、`OFFSCREEN_PIPELINE_CHECK=true`、`OFFSCREEN_COMPONENT_CHECK=true`；BASELINE/CURRENT 指向本目录两个冻结图；测试进程设置 `VITE_LAN_LAYERED_SYNC=true` 和 `VITE_LAN_CRITICAL_COMBAT=true`，没有修改项目默认策略或 .env。其它 OWNER/UI/COMMAND/INGRESS/CONTROLS/VIEWS 检查不启用。运行 `node scripts/check-battle-batching-browser.mjs`，`MULTIPLAYER_ANGLE=d3d11`，测试依赖沿用既有 NODE_PATH。

## 剩余工作
完整生产呈现 Worker 的调度、所有音频/输入生命周期、projectile-visual 和本地主机大快照迁移、Canvas fallback、跨 epoch 已入浏览器队列的数据回收均未在本轮完成。必须在完整连接接入后做同战场/同设置的成对负载与延迟测量，再决定是否默认启用 Worker。
