# 实际联机页面 Worker 接入验收（2026-09-25）

## 交付范围

生产 `LanBattle` 现在可以通过 `VITE_LAN_PRESENTATION_WORKER=true` 为**非计算主机**启用真实呈现 Worker。默认仍关闭；本地计算主机仍使用原来的主线程呈现 + 权威 Worker。没有迁移权威物理到GPU，也没有降低模拟频率、精度、效果数量或校验。

- 原始二进制状态、独立关键状态和弹丸呈现继续由已有 owner/epoch/消费回执机制进入 Worker。新接入的JSON例外状态也等待Worker保留后才完成本地回执，不把恢复后的世界送回主线程。
- 真实输入循环在发送时读取实时相机/aim标量。坐标不可用或发送背压时不提交序号、不清空排队动作；只有真实网络发送成功才记录预测。重置导致的旧异步操作拒绝按generation隔离。
- React继续承担HUD、地图、音频和联网操作；Worker负责恢复、插值、局部预测、相机及WebGL绘制。UI命令仍等待命令确认及相应版本数据，沿用已有组件及命令限制。
- 新增实际apply/render阶段耗时、绘制帧率/间隔、接收应用率、显卡及绘制统计的小型遥测。实时输入不读取100ms的HUD相机。
- 启动失败时只由React替换已转移的canvas，再走原路径；运行中的失败不会私自切换owner。取消创建、停止入口和关闭旧UI能力均有独立处理。

## 冻结与静态验证

本块基线673个非生涯模块，候选674个；6个既有模块修改，新增 `LanPresentationTelemetry.ts`，其它667个哈希不变，无删除、最终磁盘无冻结漂移。

冻结CompilerHost对照：before 0 / after 0 / 新增诊断0。其它源码/依赖两臂共享首次读取；这不是对全部脏工作区和未完成生涯功能的交付声明。项目实际使用的oxlint检查7个生产文件和2个场景文件，退出码0；改动文件whitespace检查通过。

## 一个既有真实场景

扩展而非新建工程：`scripts/check-normal-multiplayer-browser.mjs`，实际LanBattle、权威Worker、LanConnection、桌面helper、relay和WebGL；3个无头浏览器页面、总22舰（3玩家+19AI）、seed917，8秒测量窗口，随后执行既有主线程停顿及页面操作验收。操作仅为隔离页面DOM事件，无可见窗口或OS键鼠注入。

最终 `multiplayer-fixed/result.json`：全部断言通过，errors=[]，failures=[]，三名viewer错误均空，cleanupCompleted=true。

- 席位0保持main；席位1实际Worker；席位2测试故意在canvas已转移后抛出启动异常，最终是新的React canvas、原canvas已脱离DOM，主线程回退可加载/显示/同步。
- 三个实际context均报告ANGLE / NVIDIA GeForce RTX 5060 / D3D11；Worker显卡信息来自其真实context，没有在转移后的HTMLCanvasElement上再次调用getContext。
- 席位1真实按住前进、网络发送、权威确认以及位置变化通过；不是只调用本地预测。
- 地图打开和关闭都获得accepted结果与对应UI revision；又在地图打开时断开访客，恢复同一场战斗后地图重新发布、可关闭，操控重新启用。新呈现代际11，应用tick874，而非复用旧HUD作为同步证据。
- 既有主机主线程800ms忙等待场景保持原断言：有效中间450ms有25次权威发布，访客输入确认507→540且在真实阻塞窗口内被观察到。这里只证明既有发布/确认连通性没有被页面接入破坏，**不是本块性能提升证据**。

## 具体失败与修正

首轮场景发现并保留在 `multiplayer/` 与 `browser.log`：

1. 访客重连时出现一次 `UI presentation is not available`。原因是旧facade立即关闭，但React并发提交尚未卸载HUD/地图的RAF读者。外部会话失效回调现在先用flushSync卸载这些读者，再关闭能力；组件自身停止/卸载阶段不在React生命周期内强行flush。修正后增加“开着地图重连”复查，错误为空。
2. 原有主机停顿探针只观察主线程decoded-state订阅，Worker owner按设计绕过该路径，因而错误地记录空ACK。探针改为观察真实Worker retained消息中的权威ACK，仍保留进展和真实时间窗口断言，未禁用断言。
3. 地图路径触发Vite预转换时缺少项目的virtual:studio-summary插件；既有场景加入生产所用的studioSummaryPlugin，而非伪造模块数据。

只因这些具体失败进行同一场景的定向复查，没有重跑无关全套或ABBA性能测试。

## 边界与下一步

- JSON例外分支、非共享内存消息模式已接入，但**本轮真实页面场景未覆盖这两个环境的端到端切换**。先前实时通道场景测试过消息模式，不可写成整页已验证。
- 本轮没有专门验证服务器权威模式、Steam、多机网络、浏览器原生上下文丢失、长期运行或全部部署/技能快捷键组合；不宣称原版实机/画面等价。
- 没有同场景同配置的前后配对测量，不能据此声称SIM加速、FPS提升或输入到画面p95/p99下降。Worker可能缓解主线程拥塞，也可能在轻载引入IPC开销；保持默认关闭，下一步先做上述例外路径和端到端对照再决定默认策略。
- 保留已有WIP，版本0.2.11；未暂存、提交、推送、打包、发布或修改安装游戏。

## 复现

后台PowerShell，保留现有NODE_PATH运行环境；清除无关MULTIPLAYER_/VITE功能环境，设置：

```powershell
$env:NODE_PATH='C:\Users\Aca\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:MULTIPLAYER_OUT='artifacts/lan-presentation-page-20260925/recheck'
$env:MULTIPLAYER_FROZEN=(Resolve-Path artifacts/lan-presentation-page-20260925/current-browser.json).Path
$env:MULTIPLAYER_PLAYERS='3'
$env:MULTIPLAYER_MS='8000'
$env:MULTIPLAYER_SEED='917'
$env:MULTIPLAYER_ANGLE='d3d11'
$env:MULTIPLAYER_PRESENTATION_PAGE='true'
$env:VITE_LAN_PRESENTATION_WORKER='true'
$env:VITE_LAN_LAYERED_SYNC='true'
$env:VITE_LAN_CRITICAL_COMBAT='true'
node scripts/check-normal-multiplayer-browser.mjs
```

工件目录同时保留before/current冻结图、typecheck-comparison、lint-final、source-changes、acceptance、两次场景日志及结果。整体“继续优化”目标仍在进行中。
