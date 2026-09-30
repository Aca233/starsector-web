# LAN 实际呈现所有者：实现前记录（2026-09-25）

## 原版与当前依据
原版 0.98a-RC8；本轮读取 `../starsector-core/data/config/settings.json:8-12`（vsync/fps/devMode）和 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEngineAPI.java:67-89`（projectiles/player/pause/end/viewport 为不同能力），并复读 `../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/OOoO.java:160-168` 的热光整数颜色规则。只合并 Web 的呈现所有权，不修改原版规则、频率、精度、效果、UI 布局或按键。没有原版桌面实机新证据；保持后台文件工作及隔离无头验证。

## 当前差异 → 实现范围
已验证的 LanPresentationRuntime 没有被正式 LanBattle 使用；页面另建 playback/pipeline/renderer，并分别维护 appliedTick/latest、停止和重连清理。先将真实默认收包 → 播放恢复 → pose → camera → effects/render → HUD 走同一个运行时所有者，允许加载资源/首包到达前创建它。所有者保留稳定控件/相机引用，不复制完整世界，不改变同步时序或每微任务 HUD 读取频率。

网络信用有两种真实边界：本地主机 LanSnapshotDecoder 在保留有界容量时提前发放 credit，消费后再释放持有的 ACK；客端 LanConnection 在同步 listener 完成后发送 state-consumed，projectile-visual 依赖同步 visualHandled。它们尚不支持把异步 postMessage 当成功消费。本轮完整保留这些边界，不提前 ACK、不放宽队列预算，亦不增加未接入的生产 Worker。

运行时统一三个不同生命周期：重连 reset 丢弃旧播放/预测；普通 stop 保留终局已确认 muzzle/particle 窗口供最终画面；失败或 dispose 清理全部效果并关闭 UI 端口。世界尚未建立时也能接收/重置，退出必须释放已创建 renderer，异步资源准备完成不能重新挂载旧 UI。初始化失败必须保留原错误并可安全重复 dispose。

## 验证
修改前已冻结 656 个非生涯生产模块（artifacts/lan-presentation-owner-20260925/before-browser.json）。实现完整后集中一次 typecheck、改动文件 lint、扩展既有 Offscreen 场景的实际 runtime 生命周期/旧流程对照，并跑既有真实正常联机+主机重连。steady、command-held、prediction、weapon、particle 输入/特效夹具全部 false。对照覆盖摄像机/阶段顺序和像素，不宣称新的原版等价；无需配对性能跑，因为本轮是正式路径所有权收口，不宣称 CPU/FPS/端到端时延收益。

不启动子代理、不操作桌面、不暂存/提交/推送/打包/发布；保留所有已有工作。本轮不等于跨线程 HUD/map/deployment、生产 Worker 协议或完整迁移完成。
