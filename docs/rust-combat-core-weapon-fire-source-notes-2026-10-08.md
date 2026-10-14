# Rust 实际发射周期：来源对照与实施方案

2026-10-08；原版版本 0.98a-RC8。本文件仅覆盖实际武器周期与发射资源边界，供主策划的 P2 发射块引用。

## 来源最小对照

| 来源 | 核实内容 | 当前 Web 合同及验收 |
| --- | --- | --- |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/A/if.java:346–355,421–428,1184–1191` | projectile 充能入口同时检查弹药、过载/排散与幅能；费用按可中断性决定一发或整 burst；原版还计 chargeTime × energyPerSecond | `ShipWeaponControlSystem.ts:974–1005,1216–1237` 的当前 Web 不计 projectile charge energyPerSecond；迁移保持 Web，不能顺手补原版差异。验证资源不足不扣弹药、不抽 spread/id，不出实体。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/trackers/B.java:54–85,87–99,147–168` | 非可中断 burst 在开始 ACTIVE 时整体扣能量；可中断 burst 分发扣能量；过载/排散中断周期 | 对照 Web `advanceWeaponLifecycle:1098–1151`，首发当步立即 return，后续 burst while 可同一步发多发。中断时保留 refire cooldown，不退款。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/trackers/D.java:64–133,170–185`；`ship/A/oooo_1.java:160,479–481,509–531,901–909` | burst beam 扣一次 ammo，充能/ACTIVE 连续扣 energy，chargedown 销毁光束；RoF 只在 burst 冷却使用 | 对照 Web `requestWeaponFire/activateBeam/enterBeamChargedown/advanceWeaponLifecycle:979–1199`。Web 可分别创建 charge、ACTIVE、chargedown 光束实体；遵循其真实创建次数、计时和 RNG，不将原版单实体改进混入迁移。 |
| `ship/A/if.java:315–340`；`../starsector-core/data/config/settings.json:195` | 原版多炮管切换、最小 refire 0.05 | 已在 P1f 移植最小 refire 时钟；本块实际击发再消费当前 spread、offset 与 barrelIndex，Gloriana 只在成功发射后清对应轨道。 |
| `ShipWeaponControlSystem.ts:1229–1283,1321–1444`；`SourceMissileLifecycle.ts:8–12` | 实际 Web spawn 算术和有序 RNG | 真正 shot 先抽 spread，后抽实体 id；普通 source missile 再抽 dud。charge/chargedown beam 仅抽实体 id。实体继承开火前舰速后才施加物理 recoil，下一个挂点读取新速度。 |

未操作原版实机、未获得新截图。界面默认/选中/冷却/失效/恢复结构沿用当前 Web；本块不改按钮、武器组、热键、布局或视觉资产，不据此声称原版视觉等价。

## 本块方案

目标与体验：把已确定的真实开火意图变为常驻 Rust 周期、严格资源扣除和可消费实体生成记录；玩家的充能、连发、停火、束流收束、幅能门控与后坐力保持现有行为。

范围：有序挂点提交、charge/burst/beam 生命周期、有限/无限弹药、整 burst 幅能预扣、连续 beam 幅能、spread/RNG、炮管偏移/切换、双轨清空、实际 projectile/beam spawn 几何与物理 recoil。模块消费主核心已确定的 FireInput；瞄准/AI 决策、group 选择、碰撞/命中、特殊 gravity force、任意 hullmod callback 与生产 admission 由主策划其它块接线。它们不能用本模块通过来冒充完整战斗迁移。

规则与流程：每 tick 前置时钟完成后，按安装顺序消费唯一意图。requested 与 triggerHeld 分开；自动开火在提交时重新读当前幅能，按 AI 非 PD 起火 .95 容量门槛处理。请求成功只代表开始周期；实际发射后才出现资源/后坐力/spawn。已承诺周期可在 opted-in suspended 条件下暂停，而冷却/弹药时钟已在前置阶段推进。舰船锁武器或挂点系统禁止按 Web 规则中断；可中断 charge/burst 的放开触发及 beam charge/ACTIVE 的 flux 不足转取消/收束，chargedown 不额外收费。未知/失效输入应由调用方事务校验，失败回滚状态、实体记录、幅能和两流 RNG。

联机与存档：不变更权限、并发或生涯存档；发射记录供同一权威状态创建实体与呈现，不是客户端上报的命中或整状态 DTO。发布副本不取得权威；一次提交不得重复消费。主核心负责代次、tick 和安装完整性约束。

依赖与交付：复用 P1f Mount、Flux 和 Random；独立 `weapon_fire.rs` 提供 typed spec/context/input/emission 与真实周期实现，主核心负责 resident spec 与结果实体接线。先本文件对照/方案，后模块实现，再由主核心集中实际 TS 对照和端到端无头验收。模块孤立编译只证明可编译，不证明游戏可游玩。

验收：严格比较 ammo、flux、timer、burst、cycleId、barrelIndex、spread、rails、spawn 数量/类型/顺序/实体 RNG 和全部 RNG witness；只 position/angle/velocity 使用既定几何容差。覆盖 charge 为零/非零、autoCharge、可中断/整 burst、同 tick 多发、缺弹/缺幅能、连续/爆发 beam、半充能收束、零收束、reload、暂停再分配、多炮管、dud 条件抽样和先继承旧舰速再 recoil。生产 playable/full battle、特殊 callback、原版实机视觉为待整合/待核实，无新产品取舍待用户决定。

## 模块实际交付与回执

独立 `weapon_fire.rs` 已实现真实 source 生命周期/资源/emission。`scripts/lib/rust-core-weapon-fire-harness.rs` 仅作为隔离模块的验证 ABI；生产主核心不能把此 harness 当后端。`scripts/lib/rust-core-weapon-fire-check.ts` 直接调用真实 `ShipWeaponControlSystem.requestWeaponFire/advanceWeaponLifecycle/fireWeapon/programFluxBudget`，使用真实 FluxTracker、ShipSystem、range/speed 服务与 source projectile/missile 初始化，消费真实生成实体并比较；没有手写 TS 规则副本或空 emitter。

集中 Node 和新建无头 Chromium dedicated Worker 各通过 32 场景 ×50 次提交：69,616 次严格字段、8,361 次几何比较、51 个真实 spawn 记录、22 个成功周期开始、66 次有序幅能预算拒绝；几何最大差 `2.5757174171303632e-14`，33 条逐字段差异留在 `artifacts/rust-combat-core-20261008/verification-weapon-fire/result.json`。覆盖初始有限小数弹药 burst、预扣后缺弹、连续 ACTIVE Infinity、半充能取消、autoCharge、收束终止、缺弹、reload、零 chargedown、source missile dud 条件 RNG、物理 recoil 与多炮管。前置时钟不由此 probe 推进，因此不声称 P1f/完整发射时序已联合验收；该联合验证仍由主核心接线后进行。

Rust 模块 metadata 与隔离 Wasm 编译、改动 TS/mjs scoped ESLint 通过。单文件 `tsc --strict` 跟随实际源依赖，遇到现有源模块的严格类型错误及缺少 standalone ImportMeta/raw 声明；新增 fixture 自身的唯一断言诊断已修正，没有将这个命令报告为完整类型检查通过。未运行全套、未修改 unrelated 类型文件、未操作可见桌面。

待主核心整合：`mod weapon_fire`、常驻 FireSpec/FireMountState/意图、连续 ACTIVE Infinity 校验、代次/tick/重入原子性、automatic group 的 successful start 更新、typed Emission 的 resident projectile/beam 创建、beam source 跟随/同一 cycle charge与chargedown ownership、声音/枪口呈现与 hullmod recoil callback、目标/AI/命中/死亡/特殊系统/生产 admission。`fullBattleReady` 保持 false；模块通过不表示游戏 Rust 后端可游玩。
