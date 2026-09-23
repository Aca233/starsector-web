# Phase 14：从实验开关转向实际默认协商

日期：2026-09-21。针对用户“做了这么多怎么感觉都不启用”的反馈。

## 根因与交付边界

此前不能把“测试通过”说成“玩家已用上”：

1. 共享完整快照/粒子编码已接源码，但工作区未发布，安装的 0.2.6 不会自动得到未发布代码。
2. 客户端 `VITE_LAN_LAYERED_SYNC` 原本仅在显式 true 时提供 motion/visual 能力。
3. 桌面 `electron-service.mjs` 启动普通 relay + 浏览器房主 Worker，没有提供 `authorityFactory`。服务端 visual/combat 原本还需要 dedicated authority，因此只改前端开关不足以启用。
4. SteamGateway 的真实 legacy-P2P 路径没有 LAN helper 独立通道；没有把实验 sockets 模型冒充已发布原生路径。

## 本轮实际改动

- `NetworkFeaturePolicy.mjs`：未设置环境变量时默认 `auto`，LAN 提供 `motionState:1,motionAuto:1`。显式 false 关闭；显式 true 保留原实验分层模式。Steam 不提供 motion。
- 默认模式只增加受保护的运动通道，不启用 projectile visual、critical combat、weapon extension 或 bulk chunks，不安装原实验的 200/500ms 完整世界降频。
- helper 协商 MotionWire；直连桌面房主仍可作为运动生产者，不要求房主先走 helper。普通浏览器/旧服务器没有 helper 时，完整状态路径照常工作，不能宣称已有独立接收通道。
- `AutoMotionAdmission`：只在真实、仍未结算的完整状态消费回执通过原校验后，才允许该接收方的附加运动流。记录最多64个 seq/tick/发送时间标量，不保留世界 payload。
- 完整状态从 relay 发送开始的年龄，或相对于运动的 tick 差超过750ms时，对该接收方停止新增运动发送。本场保持回退，resync/前后台切换不会立刻反复开启；新场可重新协商。此计时不是网络 RTT，也不是完整 input-to-photon。
- 回退不释放 motion/full-world 欠账，不伪造 ACK，不放宽客户端原1500ms整世界保护；已经发出的包仍按原规则消费。自动退出只停止该接收方新增运动下行，不承诺停止房主 Worker 的捕获/本机上传。
- `features` 写入欢迎/重连/战斗日志；区分 build policy、实际协商、motion wire 与实验能力。Steam 明确记录 `steam-motion-not-implemented`。
- `lan.receivers[].motionAdmission` 记录 awaiting-world/eligible/fallback 与原因、发送年龄。是否真的有流量还要同时看 controlLane.active、motion.sent/consumed/fresh 及 HUD motionHz；`features.motion=true` 本身不等于60Hz或完整世界同步成功。直连房主的 no-helper-lane 指没有独立接收通道，不代表它不能生产运动。

## 原版与范围

这是联机扩展的能力协商/流量准入，不修改原版玩法、模拟精度、武器、AI、伤害、原版 UI 或生涯。复核本机 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:5-13`：位置/速度 API 是 Vector2f，朝向/角速度是 float；它不是原版有联网协议的证据。复用已核实的 MotionReplica/ShipPresentation 独立呈现，来源与限制见 `network-motion-display-source-notes-2026-09-21.md`。原版桌面实机仍未获准，不作原版像素等价声明。

没有提交、推送、打包或发布；没有动生涯文件、系统网络、n2n 或桌面输入。要让已安装游戏更新，仍须隔离未完成生涯改动后另行构建、发布正式版；本轮不能声称已完成交付到安装版。

## 验证

- `check-network-activation.mjs`：实际构建的 LanConnection 在独立 VM 上运行，桌面房主直连、每客机独立 production helper，真实 loopback TCP/WS；默认3/4/5人运动收发/消费、完整世界不被降频、失去独立通道的主通道回退、显式关闭、整世界停滞/恢复/重同步、隐私 allowlist。不是完整游戏渲染压力测试。
- `check-network-activation-browser.mjs`：纯无头 Chromium，真实跨源隔离与 SharedArrayBuffer I/O Worker，默认 Vite 配置能力 + production helper/relay + MotionReplica。两客机验证运动到达并呈现、模拟对象坐标未改变、断开独立通道后仍能接收完整状态、过期 pose 清除。合成小世界，不是3/4/5真实玩家/N2N/Steam性能或FPS证明。
- 首次浏览器测试暴露测试页面未注入 build ID、隔离响应头缺失；修正测试页面而未放宽断言。浏览器关闭清理另有 watchdog 失败记录，不能把中途写出的报告单独算成通过；最终以退出码0的日志为准。

最终命令结果与实际完成的范围记录在同目录 phase14 artifacts 和下方验收补记。未做新的22舰限速对照，未证明新增流量在所有链路都不回归，也未把上一轮开启实验分层的压测结果当成本轮默认模式性能。五人弱链路全世界陈旧、Steam独立运动传输仍是未解决范围。

## 验收补记

- `network-final.log`：391/391，另有武器 replica 5/5。新默认路径的回退还覆盖实际重连，当前场次保留 fallback，换场才清除；不靠重连反复加流量。
- `activation-final.log`：30/30（与 network gate 重叠，不累计为独立测试数）。
- `steam.log`：337/337。只是回归未破坏原 Steam，**不是 Steam 独立运动传输已实现**。
- `browser-verified.log`：退出码0；`browser.json` 的 `cleanupCompleted:true`；真实 WorkerLanSocket、motionCount=1、两客机显示 pose=11 而物理 pos.x=0、失去快通道后完整状态仍进展，pageErrors=[]。
- 无头浏览器的测试清理改用 `launchServer/connect`，拿到独立测试子进程句柄并在结束时 kill 该实例；不是操作/关闭用户浏览器，也不是桌面游戏正常退出的验收。
- `tsc-final.log`：`npx tsc -b --pretty false` 退出码0。
- `lint-final.log`：本轮相关文件 oxlint 退出码0；限定文件 `git diff --check` 通过（仅有现有Windows换行提示）。
- 此处没有测量并承诺“延迟下降X毫秒”或“弱网客机保持60Hz”。
- `shared-final.log`：共享快照/真实 Worker/Steam preparation 联合 gate 退出码0，各段22/22、6/6、81/81及实际authority集成通过（与其它gate有重叠）。
