# 战斗页面接入前：弹丸视觉 owner 与渲染一致性（2026-09-25）

原版 0.98a-RC8：重新读取 ../starsector-core/data/config/settings.json:8–9（vsync/60fps）及 ../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16–42（位置、速度、朝向与碰撞信息）。不修改权威计算、tick、精度、实体或效果数。无桌面许可，原版实机与 UI 外观补验仍待核实。

生产页面接入梳理发现：LanBattle 仍直接使用世界对象读输入，渲染 Worker 的 UI 每 100ms 才发布一次，不能用它替换实时 camera/aim 而平白增加输入延迟；这一部分需独立高频小标量通路。另一个眼前阻塞是 projectile-visual 没有路由到 Worker，完整快照声明 projectileVisuals=1 时会漏掉弹丸；并且生产 Worker 使用 markers 而页面使用 identification，WebGL antialias/alpha 也不同。必须先修正这些真实接入缺口，不能把漏画/降画质当优化。

本块：新增明确的 visual owner 方法，仍复用 LanConnection 原有 bounded fragment assembler 和消费账本，把完成组装的独占 ArrayBuffer transfer 给 Worker；完整 anchored codec/replica 在 Worker。碎片回执仍只表示网络片段已组装，最终 baseline-ready 必须等 Worker 的真实保留结果，禁用/旧 epoch/无同步基线只 discard。保持现有无效 visual 原子丢弃、不误杀仍有效世界/anchor 的语义。主线程仍负责碎片/base64，不宣称整个视觉接收已移出主线程。

提取页面与 Worker 共用的渲染层/WebGL 属性，保持当前页面 alpha=false、antialias=true、high-performance、identification 层；把当前图形偏好显式镜像给 Worker（不改变偏好或增加默认降质）。本块不默认开启页面 Worker、不宣称完成完整页面接入。

验证复用既有 Offscreen + 真实生产 Worker/LanConnection/socket I/O 夹具，补独立弹丸 baseline/update/分片/旧 epoch/失焦地图/坏包与回执检查，以及渲染配置实际镜像。完整实现后集中类型、scoped lint、一个既有场景；具体失败才复查。不新增独立测试工程，不打包/提交/发布，保持已有 WIP。
