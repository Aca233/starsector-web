# Rust 常驻发射实体与有序命中：实施策划

## 2026-10-09 导弹实时只读观察续块

沿现有倒序 projectile 生命周期与同步 contact 合同，仅 guidance 观察构造改为在当前 item 借完整 resident bodies/原序 rows/projectiles；observe 函数仍写完整字段，原 world.rows 验证每 item 保持。规则查询按当前实体生成只读观察，结束借用后立即 sync/store/写锁/子弹出生，后一个 item 必须读前一个命中、capture、death、phase 与出生后的真实状态。借 immutable guidance 代深 clone MIRV child；子实体出生仍独立 Delivery，保已实现 Rc/COW。没有 ABI、字段、碰撞、发射或频率变化。详细来源、流程、失败和验收见 [导弹方案](rust-combat-missile-guidance-plan-2026-10-08.md) 的本日实时观察续块。

## 2026-10-09 ROOT 弹体交付规格复制续块

真实22舰混编的后段采样中，advance_projectiles占14.20ms；当前事务、碰撞batch、保留弹体和retired列表多次clone Projectile，同时深复制Delivery的声效字符串、visual、制导子弹体规格。采样有计时开销，只用于定位，不能宣称正式收益。沿下文已核0.98a-RC8弹体来源及当前Web oracle，不改玩法、UI、原版差异、频率、字段、权限或存档。

本块仅将Projectile内部Delivery改为单线程Rc值，出生仍接收并独立拥有完整Delivery；所有读通过同一规格。事务/查询clone仅共享规格，所有可变飞行、伤害、guidance、birth和命中列表继续各自复制。全库唯一出生后Delivery写是gravity_owner::capture_projectile禁用制导，该边界必须Rc::make_mut先分离当前弹体规格，再按原顺序修改guided/inertial/acceleration/speed；不得影响原事务、查询快照、其它弹体或发射挂点。FireEntry/安装/制导child构造仍原有独立Delivery，不把它们顺手共享。

范围只projectile.rs与gravity_owner.rs，ROOT先备份后落。验收为同其它native的旧新完整snapshot+scene严格逐帧对照：真实22舰混编270tick、LAN60tick含真实tick8reserve部署，并补真实gravity capture的共享clone隔离及失败事务原状态保持；原七包、final同SHA和正式性能仍待整体收尾。未知/错误先后和全部导出布局不变，不用局部clone通过称完整可玩。取消/失败沿原完整事务，不需要用户新增产品取舍。

2026-10-08；总目标仍是完整可玩 Rust/Wasm 战斗，本文是 P2 的实体/命中实施块，不是缩减总交付。沿用浏览器和桌面共用 Wasm、限定几何舍入、规则结果严格一致的已确认取舍。

## 目标、范围与体验

玩家沿用现有部署、驾驶、选组、自动开火、充能/连发和防御操作，看见相同炮口、弹道、束流、命中、故障与沉舰结果。先把真实发射周期输出接到 Rust 持有的实体，再闭合普通弹丸的运动、源生命周期、精确护盾/多边形接触和同步伤害；光束沿当前源挂点周期与亮度推进并按 .1 秒取样。保留射程最后一段的命中，不把逐步导出再导入的 JS Projectile 当作常驻实体。

本块不新增按钮或改变布局；默认、选中、冷却、禁用、暂停/取消仍由现有 UI 显示。特殊 onFire/onHit/beam 效果、导弹完整制导、近炸/拦截/穿透、爆炸持续实体、terrain/模块/无人机属于紧接的完整能力闭包块；暂未实现的类别必须明确拒绝，不能用常规弹道冒充。不能因此整场七包回退后声称完成 Rust。

## 原版证据与最小对照

本机版本 0.98a-RC8；读取 `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/BallisticProjectile.java:162–179` 和 `BeamWeaponRay.java:53,69,87,156–191`。前者按既有 fade 更新伤害并推进实体，后者积累 brightness²、每 .1 秒形成 DPS duration 与 multiplier。当前 Web 以 f64 和确定性 SimulationRandom 表达这些规则；不改成 Java float 或 Math.random。

直接迁移合同是 `WeaponSimulationSystem.updateProjectiles`、`SourceProjectileLifecycle`、`SourceMissileLifecycle`、`BeamDamageClock`、`RuntimeCollisionKernel.findHitTypeScript/findShieldHit/findHullHit/circleRoots`、`Geometry.intersectSegments/intersectSegmentWithPolygon`、`ProjectileCollisionHandler.applyShipCollisionHit`、`BeamSimulationHandler.update` 和 `OutgoingDamage.outgoingDamageMultiplier`。弹体倒序推进；每个命中立即更新屏障/装甲/HP/组件，随后查询必须读新状态。护盾可先耗尽后保留剩余弹荷继续同一步原轨迹；目标 tie 保留语义遍历次序。光束照当时接触提交取样，未命中取样直接丢弃。

原版实机/截图未补验，用户禁止占用桌面输入；本文不声明原版视觉或操作等价。Web 来源是现有已授权玩法，不借迁移修正与原版的既有差异。

## 规则与操作流程

开战一次初始化完整舰体几何、阵营/尺寸、伤害属性和有序发射规格；规格包含源生命周期，炮口偏移与实体生成信息。之后只接受具名控制/选组/属性修订，普通步不上传整世界、武器 tracker 或弹体状态。发射成功按同一事务扣幅能/弹药，消费 spread/id/dud RNG，再生成实际实体与后坐力；后一个挂点读取前一个后坐力和资源结果。

实体运动保留 elapsed/prev pose、先燃料到期再运动、源弹道 prior fade/PLASMA 新 fade 的差异和移动光线尾部。接触依据实时舰体姿态、护盾中心偏移、展开弧、原多边形/圆回退和敌我/死亡资格。护盾资源使用真正 shield-hit 路径；装甲 hitStrength 与 CR 的算术位置保持原实现，随后扣 HP、传播组件，再产生通知。死亡与爆炸闭包在后续实际 world destruction 阶段执行，不以一条死亡通知冒充。

光束依照源舰 subjective dt、真实挂点 ID/spec/cycle、过载/排散/禁用中断；炮口与长度使用实际移动后的挂点，brightness² 按当前 tracker 累计。burst chargedown 的剩余补偿按现有门槛实施。取样 RNG 只在真实首次可伤害推进消费；inactive 或 dt<=0 不抽样、不银行伤害。

取消、重开或装载失败在推进前销毁准备中的私有核心；已经开始的实例失败不回放半步、不混合 TS 的显示副本。错误安装、旧代次、未知属性/效果拒绝；批次/步骤失败同时回滚实体、舰体、资源、所有 RNG 与事件。

## 权威、并发、存档与依赖

沿用总策划的宿主权威、tick/epoch/序号和 ACK；客户机不能上报伤害或写 Wasm 内存。投影复制只读，事件 ACK 显式；生成实体在完成提交后才发布，重复发布不会再生成/扣费。生涯 schema 与存档不改；新增领域投影不作为完整 checkpoint。完整恢复仍需内容/规则/后端指纹和确认日志。

实施依赖是已验收的 P1 身份/运动/盾/装甲/组件/武器前置域，以及实际 `weapon_fire.rs`；顺序为来源/本文→常驻几何/弹体/光束与发射接线→集中原 TS 差分和 fresh dedicated Worker→特殊能力/AI/world/生产闭包→真实页面可玩及配对性能。独立函数、DTO 或少量领域通过不算完整战斗交付。

## 验收与未核实

严格比较发射数/顺序/身份、ammo/flux/周期计时、两条全局 RNG 以及后续每挂点独立 RNG、所有 fade/damage/EMP/softFlux、HP/每装甲格/组件和有序事件。仅已批准的 pose/角度/纯几何容差放行并逐项留日志；命中目标、格选择、护盾资格、实际资源与计时不放行。覆盖最后一段、倒序与 tie、源继承速度/物理后坐力、BALLISTIC/MovingRay/PLASMA fade、impact remnant、不重复命中、虚空屏障剩余弹荷、源移出 roster、dead/phase/team 过滤、burst/continuous beam phase与未命中取样，以及失败事务/步骤与发布隔离。

待核实：完整特殊效果/生成闭包、world 死亡/统计/胜负、联机/恢复/生产呈现、原版实机和性能；没有新增玩家产品取舍待决定。最终仍须真实 Rust 后端完成部署、操作、交火与结算，未达到前持续开发。
