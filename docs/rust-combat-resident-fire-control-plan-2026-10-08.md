# 常驻世界自动火控接线策划

2026-10-08。延续完整可玩 Rust/Wasm 迁移授权，采用已确认数值合同。本块让现有自动炮塔、目标选择、手动组与交替组真正控制 Rust 发射实体，不增加界面或改变射击习惯。

## 来源、当前差异和范围

原版 0.98a-RC8：再次读取 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/AutofireAIPlugin.java:8–45`，自动开火独立推进、返回目标及 shouldFire、切组 forceOff；`../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/attack/AutofireManagerV2.java:146–193` 含幅能/持续射击组门控。后者有 CFR 局部变量恢复异常，不照搬。细节来源见 `rust-combat-core-ai-audit-2026-10-08.md` 和 `rust-combat-fire-control-source-notes-2026-10-08.md`。直接迁移合同为实际 Web `planNumericFire`、`FireInputs`、`FireGroups`、`InFlightFireBudget`、`FireProgram` 与 `commitFire`；不借迁移纠正其原版差异。原版界面实机仍待许可，本次无 UI 修改。

`fire_control.rs` 已通过独立数值对照，但尚未接入 Core。现有常驻弹体/束流已经实际扣资源、提交命中。本块安装一次静态挂点/目标资格属性及真实 roster、visibility 身份规则，查询时从 Rust 的舰体、护盾、装甲、tracker 和弹体产生观察，持有每挂点独立 RNG/目标/时钟，并驱动真实发射。不能每步把 JS 世界捕获后供 Rust 求解，不能用全可见、空预算假装生产支持。

## 规则、操作和状态

全部舰船运动和武器前置状态完成后，冻结本阶段观察；逐舰按有序挂点计划转炮塔与目标，再关闭查询，按舰船/挂点顺序提交实际扣资源/生成。实际 post-turn bore 必须用于安全检查。每挂点 scheduling RNG 由真实 `ship.id + '/' + slotId` 的既有 FNV salt 初始化，手动/禁用清理记忆遵循原顺序，独立于全局两流；salt 属于安装元数据，不能每步重播种。

部署时完整安装身份、有序 scope 和阵营可见性；其权威归核心。后续驾驶仅修改瞄准点、主扳机、选组、目标身份以及明确组/策略控制，普通步骤不上传瞄准记忆、武器 tracker、弹体或装甲。无效目标/代次、缺少实际 scope/可见性/挂点拓扑、未知策略拒绝。导航/传感器的完整生产规则后续接入同一常驻世界，静态初始化不代表它们已经完成。

预算按真实世界该步已有且被 ledger 接收的发射记录建立，保留 target、source scope、语义順序、team、eligibility；不预留未来 DPS。只有实际成功启动才更新交替组指针。commit 时在各挂点原扣费位置再次检查实时幅能；手动选中组仍用原请求/实际容量门槛，不额外添加 AI .95 预算约束。禁用、目标死亡/离场、组切换、手动/AI切换均按来源清理，取消不留下隐藏射击请求。

界面沿用当前选组/自动开关、瞄准、武器状态和快捷键，暂停冻结核心，退出/重开销毁实例；本块不更改界面布局、提示、确认/取消流程。失败整批或整步同时回滚全部 fire memory、三类 RNG、groups、资源、实体与事件。发布复制只读，暴露 decision 和完整 scheduling witness 用于对照，不成为可回写 authority。

## 权威、依赖与验收

联机仍以宿主具名控制和 tick/epoch/ACK 为准，客户机不得写目标决定或伤害。此开发投影不等于恢复 checkpoint；完整生产接入与规则/内容/build 指纹仍按总案后续实现，生涯存档不修改。

顺序：本案与来源→常驻观察和 fire memory→Core阶段与真实 emitter接线→ABI/绑定→一次真实 TS FIRE_QUERY/commit differential 和 fresh dedicated Worker→导航、传感器、special systems/全部内容闭包→生产可玩验收。缺失特殊 callback、gravity、模块、完整导弹和传感器时拒绝对应能力，不用常规算法替代。

集中验收比较实际目标代次/决策、每挂点 scheduling witness、全局两流、scan/cadence/group/资源计时、炮塔 post-turn 友军阻挡、实际发射和有序资源扣除；只对已批准纯几何容差留日志。覆盖手动↔AI、LINKED/ALTERNATING、selected/automatic、失败回滚、stale、发布隔离、真实在途预算与目标离场。普通弹体/束流检查已完成的字段不因未改动反复跑全套。待核实是完整内容/AI/传感器/生产联机恢复与实机视觉，无新玩家取舍。

## 已完成实体块回执

普通/源 BALLISTIC/MovingRay/PLASMA 与充能/持续/burst光束，在 Node 及 fresh Chromium dedicated Worker 各完成12场景×150步、308,582严格字段、13,385几何字段、94真实生成、61弹体接触；两流 RNG、flux/ammo、装甲格和HP严格相同，几何最大差0。对应 `artifacts/rust-combat-core-20261008/verification-p2-projectiles/result.json`；Wasm265,591bytes、SHA256 `bf18f73f57331201bd08ac97513ebfb15e957506032a2c0839d865e12773aa6c`。这不是完整可玩验收，生产仍为 TS。
