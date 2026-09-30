# LAN owner 自主帧循环：实现与验收（2026-09-25）

## 本轮交付及边界

新增 `src/network/LanPresentationFrameLoop.ts`：与 LanPresentationRuntime 在同一 realm 内，用本地原生 RAF 连续执行接收端播放恢复、同步gate、pose/实时aim、camera、effects/WebGL。实验Worker已调用这份生产模块，不再需要主线程逐帧postMessage发draw指令。

**这是已验证的库级/实验Worker调度能力，不是完整默认联机迁移。** 默认LanBattle仍在主线程；尚未接通该循环的完整生产输入、音频、HUD控制plane、projectile-visual、本地主机快照和Canvas失败回退。没有新增默认Worker开关，没有降低模拟tick/画质/实体/事件数量/校验强度，也没有改变消费回执或输入预算。

该模块不产生PlayerInput序号、不提交网络输入、不自行登记预测输入、不发送网络ACK，也不跨线程返回恢复后的world。调用方在相同realm提供当前viewport、已持有控制状态和同步判断；跨线程传送这些值的时序/新鲜度仍须后续完整连接验收。不是把主线程DOM布局读取永久缓存为Worker旧坐标。

## 生命周期

- 一次最多一个待执行RAF，重复start共用资源准备；所有阶段同步，拒绝Promise回调。
- 资源准备完成才调度；隐藏与context lost取消RAF，但不清理确认效果/播放端点。恢复重新等待资源，并重置dt基准。
- 首帧及恢复后的第一帧dt为0，后续沿用默认LanBattle的0.05秒上限；真实帧间隔仍输入SnapshotPlayback，不擅自把权威时钟推进为固定60Hz。
- stop保留终局端点；reset撤销旧播放tick/预测并等待调用方新会话；dispose/失败关闭owner。generation同时拦截迟到资源完成和已从浏览器队列取出的旧RAF，不只依赖cancelAnimationFrame。
- 同步gate在apply之后；若gate撤销owner，旧帧不能继续pose/camera/render。activity在gate后重新采样，aim在运动/战斗呈现应用后才读取。
- 生产循环不调用gl.finish；检查中的gl.finish/readPixels仅用于未计时的像素对照。无setTimeout伪造RAF回退；未来完整入口必须在不可逆canvas transfer前选择支持的路径。

## 一次集中验收

### 静态与源码隔离

- 修改前冻结666个非生涯生产模块；candidate667个，仅新增FrameLoop，原有666个hash全部不变。没有覆盖此前接受的base64、消费回执、UI/控制端口等优化，也未改生涯WIP。
- 冻结CompilerHost对照：before 0、after 0、新增诊断0；其它源和依赖第一次读后两臂共享。不是将脏仓库称为全体功能洁净。
- 新生产模块和3个相关脚本scoped oxlint通过，diff/新增文件尾部空白检查通过。
- 既有check-battle-batching-browser的 `OFFSCREEN_LOOP_CHECK=true` 分支一次通过；无失败重跑、无额外广泛套件或性能ABBA。

### 像素与顺序

真实22舰（5 Onslaught+17 Hammerhead）、seed917、600tick预热的既有Offscreen夹具，4组普通战斗+8组伤痕/过载/残骸画面。

- 同一未改变的Runtime/renderer，显式旧阶段顺序对照新循环的可控RAF：12组通道差异全部0。
- 覆盖apply→gate→activity→pose→input→camera→effects顺序、完成数据、相机/位置、一个pending RAF、暂停恢复dt与clamp、缺失viewport不绘制、同步撤销后不绘制、RAF不登记未接受输入。
- 本轮像素比较采用确定性时间、immediate playback与相同输入。没有把它说成真实延迟播放、活动鼠标网络链路或原版UI交互的完整等价证明；冻结源证明Runtime及渲染器未改。

### 取消、重连和失败

可控RAF只替代调度，世界/资源/渲染器均为真实对象。覆盖：取出后才取消的旧回调不能抢走新ticket；旧资源resolve/reject不能复活或破坏新epoch；资源等待期间dispose；stop保留尚未绘制的tick900端点；reset撤销sync证据并接受新的tick600；onFrame中dispose不重排；资源/时钟/坏display帧/异步hook/观察者异常均fail-closed并释放GPU。

### 真实Worker自主进度

RTX5060 / ANGLE D3D11，真实transferControlToOffscreen、ArrayBuffer transfer与Worker原生RAF：

- 主线程忙等250ms，期间没有发draw命令；SharedArrayBuffer计数表明Worker完成15次绘制。
- **该窗口权威状态固定在tick600，15次是独立呈现，不是15次模拟推进，也没有证明忙等期间仍收到新网络状态。** 不以此计算游戏FPS提升、输入到画面或WAN RTT收益。
- 隐藏后100ms无绘制且pending=0；恢复继续。真实WebGL loss时RAF暂停，context restore后重建一次并继续。
- reset后tick=-1、pending=0且等待期间无绘制；收到新端点并显式start后恢复tick600，pending恒为1。
- Worker/浏览器错误均为空。最终draw/apply/input拒绝已dispose owner；230张Bitmap关闭，residentTextures/pendingUploads均0。

## 没有完成的部分

不是完整LanBattle生产Worker、不是默认功能开启。网络数据目前仍由既有入口路由，不能用静态帧独立绘制证明主线程阻塞期间的最新网络输入已经到达Worker。下一块应将完整生产owner的消息/controlplane与这个循环连接，并保持二进制/组件信用、终局屏障、同步epoch、输入焦点/音频和回退顺序；端到端成对测量通过前不默认切换。

本轮无原版实机、桌面截图或键鼠操作；原版源码核对与待核实界面状态见source-notes。版本保持0.2.11，无暂存、提交、推送、打包或发布。

## 工件/复现

`artifacts/lan-presentation-loop-20260925/`：before/current冻结图、typecheck-comparison.json、lint/browser日志、source-changes.json、acceptance.json、offscreen/offscreen-result.json。相关源码边界见 `lan-presentation-loop-source-notes-2026-09-25.md`。

使用既有浏览器依赖设置NODE_PATH；设置 `OFFSCREEN_RECEIVER_CHECK=true`、`OFFSCREEN_LOOP_CHECK=true`、`OFFSCREEN_BASELINE`/`OFFSCREEN_CURRENT` 指向本目录冻结图、`MULTIPLAYER_ANGLE=d3d11`、`BATCH_TEST_OUT`为新输出目录，然后运行 `node scripts/check-battle-batching-browser.mjs`。不需要设置或启用其它Offscreen检查/网络特性开关。
