# 固定附属模块 AI 职责拆分 — 2026-10-03

## 原版证据与边界
目标版本 0.98a-RC8。本机 C:\starsector-core / C:\decompiled 均不存在；本块没有可核实的原版源码、原版 UI 状态或实机操作。不是宣称原版 BasicShipAI 等价移植，而是现 Web 内部的职责修复；不改规则、dt、目标/威胁时钟、实体规模、武器挂点或 ms 计算。不操作桌面，不涉及生涯或发布。

## 最小对照（证据 → 预期 → 当前差异 → 验证）
- Ship.syncModulePose（141+）绑定固定模块位置、速度、朝向；updateMotion（1116+）对 attached 分支不做线性推进，只有 station / INDEPENDENT_ROTATION 消费自己的 turnInput。inheritParentEngineCommands 读取的是母舰控制。预期：固定模块不需要独立巡航/站位/避碰/转向求解。当前 CapitalShipAI.decide 248–290 对模块和根舰同做自由机动。验证：在真实 authority 场景逐步对照物理、发动机及武器状态，并记录真实被跳过的求解次数。
- CapitalShipAI 的 profile/目标、停火、defense.observe/update、排散复查，以及 FleetTactics 的 fleetTask 都有真实消费者。预期保留这些独立状态，不删模块 AI，不复制母舰防御/目标。验证：快照、RNG 和非导航 AI memory 严格对照。
- Ship.prepareStep cancelOnBrake、SystemAI 的输入及未知 hullmod/hook 可能消费运动控制。预期仅原生固定 NONE 系统模块可分流。独立旋转、STATION、有系统回调、非不可变元数据、动态钩子或替换方法走原完整路径。跨舰 advanceCombat 不准入。
- AuthorityCombatSnapshot 跳过 tacticalAI，但 LAN projection 传递四个控制字段。允许且明确的差异：仅已准入固定模块自己的 turnInput/throttle/strafeInput=0、brakeInput=false；导航诊断/缓存清空并标记 ATTACHED。不得全局删除控制字段掩盖其它船差异。target/aim/hold、防御、fleetTask、物理、武器、幅能、护盾、统计、RNG 必须不变。

## 准入/回滚
VITE_COMBAT_ATTACHED_MODULE_AI=false 完整回滚。仅真实注册私有 Worker 的同步 deferred plan、仍有效的 DecisionReadPlane、原始无 getter 的世界数据且 owner 障碍数组身份匹配；无自定义 navigation recorder/fire-lane consumer。原生表面只在本 plan span 检查，不跨 tick 或延长到 effects。模块物理/回调边界仍实时检查。
保守限制为 standard profile；已有 large-battle-v1/v3 whole-decision sampler 不扩大此权限，不改变频率。此前附着角色进入 sampler 时立即失效一次，防止持有过时中性控制。角色变化只强制刷新运动，不提前刷新目标/profile 时钟。新角色 primitive 保留在现有 Publisher/Owner codec 实例中。

## 验收计划
冻结当前 threat-relations candidate 为本块默认基线。完成实现后集中 app tsc、改动文件 lint、既有 seed917 standard 2玩家+20AI 场景（150 warm +120 timed ABBA）。逐步 270 帧只白名单准入模块的控制/导航差异，其余严格等价；flag false 全原始终态/RNG 等价。定向检查 closed/unregistered、未知系统/钩子/元数据/方法、旋转/站点、角色切换、手动恢复。性能数字只归本窗口；无浏览器/传输/跨机/原版 UI 等价验收。

权限边界补充：这是已注册私有 Worker 的同步原生阶段能力，不是任意 same-realm 对象/Proxy 的沙箱。禁止把可变 engine/ship 引用暴露给插件后继续沿用这一权限；若未来开放 Worker 插件，必须重新审计，而不是凭 DTO 标记准入。完整检查原型/已知实例覆盖也不等于支持任意属性拦截。
