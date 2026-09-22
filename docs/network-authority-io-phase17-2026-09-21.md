# Phase 17：权威模拟与房主画面线程解耦（2026-09-21）

## 状态与边界

第二阶段的共同网络 I/O 直通代码已落地并默认启用，三/四人 22 舰实战、五人轻载及重连通过。**五人 22 舰重载尚未通过验收**，不宣称所有客机稳定 60Hz 或多人延迟已彻底解决。

本轮只改线程接线、信用分离和诊断，不改变 fixedUpdate、AI、碰撞、伤害、武器、原版界面。没有把所有客机改成运行完整战斗模拟，也没有用预测帧伪装网络接收 Hz。Phase16 的受限首发显示预测保持不变。原版证据范围见本阶段 source-notes 和 Phase16 记录；未做原版实机 UI 等价验证。

未修改生涯模式，未暂存、提交、推送、打包或发布。用户已安装版本及 dist 不是本轮新代码。

## 默认执行路径

以前：权威 Worker → 房主画面线程 → socket Worker；远端输入反向经过房主画面线程。显示解码信用间接限制网络上传。

现在：权威 Worker ↔ 私有 MessagePort ↔ 原 socket I/O Worker ↔ 原认证连接。房主显示有独立信用、独立有界音效积累；网络上传无需等显示消费。没有新增远程端口/协议/身份，也没有放宽服务端校验。

- `LanBattle` 默认尝试 `attachAuthority`；`VITE_LAN_DIRECT_AUTHORITY=false` 是紧急回退，不是默认值。
- 普通桌面 LAN、Steam 的本地 socket Worker 接线共用；不是仅为 dedicated authorityFactory 生效。
- 不支持 Worker/SAB、WorkerLanSocket 已回退原生 WebSocket 时保留原路径。
- 断线/失效解除直通。可重试断线重连成功后本局保持原路径，不冒险自动重新绑定；因此重连后 `io.enabled=false` 是当前明确的降级行为。
- 正常网络快照最多一个在途，独立保留房主显示槽；终局有额外终局槽。慢消费者不积累旧快照队列，使用既有发送门限及 socket 字节记账。
- display/network 分别最多 64 个单次音效，共用事件 ID；相同事件批次复用编码，不同批次独立编码。超额不无限积累，不增加远端音效重播。
- `input/presence/deployment` 从已验证连接按顺序转交权威 Worker，不再额外复制到主线程执行一次。旧 MessagePort 的排队回调无法注入新局。
- 发送序号维持高水位，回退/resume 不重用已发序号。终局 barrier 只证明本地端口上的上传处理顺序，**不是远端收到或消费 ACK**。
- 既有 LAN motion 保留；没有把 Steam motion 标为已实现。重载完整世界仍可能受带宽、序列化、relay、客机应用和渲染限制。

## 可观察性

`hud.authority.io` 新增并白名单保留：`enabled/sent/skipped/inputs/inflight/displaySounds/flow`。

用 `enabled=true` 和增长的 `sent/inputs` 判断是否实际使用，不能只看 feature flag。`flow.rates.uploaded/uploadSkipped` 来自 I/O Worker 实际本地发送结果，非远端 ACK。HUD 的模拟、网络接收与画面 FPS 保持各自测量，不统一写成 60。

## 受控浏览器结果

工件目录：`artifacts/network-stream-20260921/phase17/`。

测试运行真实 LanBattle、物理 Worker、WorkerLanSocket、DesktopLanBridge、relay、WebGL/native assets，不是只跑录制回放。每个客户端隔离浏览器上下文、不读取用户浏览器配置、不打开可见窗口。CPU/GPU 均在同一台机器上争用，WebGL 为软件渲染、640×360、loopback。以下为短时单次测量，不是多机/公网基准；没有统计显著性保证。

| 场景 | 客机完整状态 Hz 中位数 | 客机输入确认 P95 | 物理 Hz 中位数 | 结果 |
| --- | --- | --- | --- | --- |
| 3人/22舰，仅关闭直通 | 22、22 | 149.503、137.674ms | 59.937 | 基线 |
| 3人/22舰，默认直通 | 41、40 | 71.656、70.796ms | 59.992 | 通过 |
| 4人/22舰，默认直通 | 30、29、30 | 105.106、107.523、96.283ms | 59.986 | 通过 |
| 5人/5舰，无 AI，默认直通 | 46、46、47、49 | 66.370、78.171、64.329、70.426ms | 59.968 | 轻载通过，不替代重载 |
| 5人/22舰，默认直通 | 22、22、22、22 | 188.497、203.492、154.091、173.243ms | 59.748 | **重载未通过** |

房主 JS 线程人为阻塞 800ms，中间 450ms 内 relay 接收的完整快照数：三人基线 0、三人默认 22、四人默认 19、五人轻载 27。三/四/五人轻载中客机已执行输入 ACK 继续增长，证明网络/远端输入不再硬性等待房主画面。

五人重载 `browser-5-heavy`：该窗口只有 **3** 次上传，未达到测试要求的至少 5 次；客机 ACK 86→101，说明不是完全停止，但仍有明显降速。采样末尾 `loaded=false`，不能按“全部同步正常”验收。画面只有约 10 FPS，后段出现重新同步，真实瓶颈还需进一步拆分；单机软件渲染争用不能直接代表用户多机性能，也不能作为忽略失败的理由。`browser-5-per-client` 的前一次重载失败同样保留，未降低断言或选择性删除。

`browser-reconnect-final`：三人轻载，4000 可重试断线，match ID 不变；relay tick 570→763，所有副本重新 loaded，转入旧路径，错误列表为空。代码不会把 4001 身份接管当作允许重试的普通网络断线。

## 自动化验证

- `npm run network:check`：414 个主测试 + 5 个武器副本测试 + 35 个首发预测测试通过（`network-final.log`）。
- `npm run network:check:shared`：native capture 22、codec 11、真实共享 transport 集成，以及末组 86 个测试通过（`shared.log`）。
- `npm run steam:check`：342 个测试通过（`steam.log`）。包含真正默认 snapshot preparation Worker 的二进制/旧 JSON 客机兼容、原 relay 校验与真实消费信用；SDK 为注入测试替身，不等于连过 Valve 公网。
- 修改后的定向集成 65 个测试、TypeScript 和项目 Oxlint 全部通过，见 `review-gates-final.json`；完整网络门禁见 `network-gates-final.json`。
- I/O 单元覆盖发送/背压/顺序/scope/回退高水位/旧 port 回调/终局顺序/诊断白名单；实际 host snapshot 函数覆盖房主显示不 ACK 时继续 80 次独立网络快照、64 音效上限及终局槽。

保留的失败记录包括：早期缺隔离头、fixture 缺 directIo、重连关闭码错误、五人共用 helper 上限、五人重载失败。已修夹具问题与仍未通过的负载问题分开记录，不把失败隐藏成全部通过。

## 复现与下一验收边界

在仓库目录运行（需本机 Playwright/Chromium，可用 Codex 的已安装 Node runtime 依赖目录设置 NODE_PATH）：

```powershell
$env:MULTIPLAYER_PLAYERS='5'
$env:MULTIPLAYER_MS='8000'
$env:MULTIPLAYER_OUT='artifacts/network-stream-20260921/phase17/new-five-heavy'
node scripts/check-normal-multiplayer-browser.mjs
```

默认 AI 数为 22 减玩家数。`MULTIPLAYER_AI=0` 仅用于明确标记的轻载 smoke；不要把该环境变量带进重载复测。配对基线可设 `DIRECT_AUTHORITY=false`，重连设 `MULTIPLAYER_RECONNECT=true`。测试服务器关闭文件监视，避免其它源码编辑导致测量中途重载。每个客户端使用独立 helper 实例，不修改生产四连接安全限制。

下一步仍需针对五人高负载的 capture/encode、relay 排队、客机 apply/render 分别测量并处理，以及用户 Steam/n2n 多机复测。当前不承诺任意规模/带宽稳定60Hz，不承诺 RTT 会被本地线程优化消除。
