# Rust 战斗内核：AI 与火控迁移审计

日期：2026-10-08。状态：只读来源审计；本文件不表示 AI、自动开火或完整战斗已经迁入 Rust。配套总方案见 [迁移策划](rust-combat-core-plan-2026-10-08.md)。

## 目标与玩家体验

维持当前 Web 的敌舰、友舰自动驾驶、舰队命令、武器组和射击行为，将其真实决定和记忆迁入同一 Rust 权威状态。部署、选择目标、切换武器组/自动开火、手动与自动驾驶切换、技能/防御、暂停及撤离的界面与操作维持现状。语言迁移不增加玩法选项，也不将当前 Web 战术算法换成新的策略。

本审计仅整理主舰 AI 与常规自动开火的现有时序、记忆及依赖。模块、舰载机、无人机、特殊系统/舰装及七个单舰包必须与其对应实现一起完成能力闭包，不能仅凭本文件或一个通用 AI 求解器宣称覆盖。此次没有功能代码修改，没有原版实机或界面补验，没有运行测试。

## 原版证据与差异

原版版本沿用本机已核对的 0.98a-RC8。读取的来源如下：

| 原版证据 | 可核实行为 | 当前 Web 与迁移要求 |
| --- | --- | --- |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/AutofireAIPlugin.java:8–45` | 自动开火组调用 `advance` 决定目标/是否射击，`shouldFire` 返回结果；组切换调用 `forceOff` 要求重新考虑；目标可为舰船或导弹，瞄准点可空。 | Web 使用每挂点 tracker 与 FireProgram，切组/禁用/手动控制须正确清理或保留记忆。API 能证明这些边界，不能证明 Web 的排序、射速或 cadence 等价原版。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/attack/AutofireManagerV2.java:39–54,87–132,146–223` | 原版分组管理使用 `IntervalTracker(0.4f,0.7f)`，检查幅能、持续/齐射承诺及自动开火组开关。 | Web 战术与火控为已授权改编，不在语言迁移中改变其规则。CFR 输出存在 `bl2` 等赋值恢复异常，不能按反编译文本直接实现。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:93–130` | 原版 AI 组合 engine、attack、threat、shield、vent、fighter、system 模块，并持有目标与碰撞检查 interval。 | `CapitalShipAI` 明确是 Web 策略组合，尚非完整 BasicShipAI 移植。Rust 应保持当前组合的实际行为，而非仅迁一个导航公式。 |

预期行为和布局沿用当前 Web；本审计不提出布局更改。缺少本次对应的原版截图及实机权限，默认/选中/禁用/确认取消状态的原版视觉与操作等价仍待核实。

## 当前所有权与真正阶段

`src/engine/runtime/rust/RustCombatCore.ts` 仍为开发绑定，装载要求 `core_full_battle_ready() === 0`。实时代码中 P1f 已完成武器前置状态域，但本地/LAN/Steam 的 AI 与实际火控仍由 TS 运行。

主舰 AI 的生产链为 `CombatEngine` → `CombatAIPhase` → `AIBatch`/`CapitalShipAI.planNumeric` → `commitControls` → `commitEffects`。AIBatch 明确只拥有阶段观察租约与纯求解器，不拥有权威状态。`StageProtocol`/`StageAIData` 是现有 TS 阶段观测列，其每步 capture 不能充当 Rust 内核完整输入，或成为再把世界复制回 TS 热 solver 的接口。

所有 AI 先完成 plan，然后按原安装/舰队顺序提交所有 controls，再按同一顺序执行 system/defense effects。controller 记忆在 plan 内推进，世界写入在 controls/effects 中发生。effect 查询必须获取当时的真实状态：系统回调可以影响自己、整个模块族或未知对象，后续威胁查询与排散判定不能沿用已关闭的 plan 观察。`ShipDefenseController` 的 quiet/safeVent 记忆也属规则状态；live threat 重查不会再推进 calm timer。

舰船射击的生产链为 `ShipStepBatch.execute`：全部舰船 prepare/state → motion → 实际运动后边界 → weapon-state → FIRE_QUERY → 每挂点转炮塔/查询 → 关闭观察 → 有序 fire-commit → finish。`FireProgram.decide` 要求实际转动后的 bore。FIRE_QUERY 阶段不预留未来射击资源；`commitFire` 必须在每次真实扣幅能/弹药的位置重新读取当前幅能。该时序不能合并成“所有命中/扣费/副作用在步尾结算”。

## 必须常驻的记忆与身份

`CapitalShipAI.ts:77–117` 记录 withdrawing、attachedMotionLast、tactical/multirate/forecast/decision clocks、order/intent/attachment key、target、held velocity/facing、profile、position diagnostics 与 forecast 内容。目标引用要迁为有代次的实体身份；数组行仅表示当前语义遍历顺序，不能用作跨步身份。

`AutofireController.tracker` 和 `FireProgram.FireMemory` 记录每挂点目标、scanIn、firingTime、idleFireTime、ammoAllowed、policy key 及 cadence guards/held point。这里还有**每挂点独立 scheduling RNG**：用 FNV 的 `ship.id + '/' + mount.slotId` 初始化 `SimulationRandom`，候选扫描消费。它与全局 combat/visual 两流不同，必须独立常驻、恢复并比较完整 witness；仅比较两条全局 RNG 不足以证明火控相同。

cadence 修改 mode、range、speed、base/arc、relative position、PD、控制状态或退出 sampled/multirate 时，按当前代码的顺序清理目标/计时、重新播种或删除 tracker；不能通过重建每步 DTO 获得表面一致。初始化首次 cadence 不清掉已有 full-rate tracker。失效目标先推进本步 tracker clocks，再清目标并唤醒 held aim；长步只执行一次实际求解/扫描，不回补历史开火。

## 实施依赖与验收

先在 Rust 常驻世界中完成真实舰船/武器/弹体/光束/障碍物的身份、语义顺序、几何与 visibility/team/module 关系；接着迁入火控 geometry、已发射弹体预算、tracker/targets/cadence 与决策，接真实发射及资源有序提交；再完成 fleet/profile/threat/position/navigation、controller/defense 记忆和全部原顺序 effects。生产接线只能在本次开战内容的完整能力闭包通过后选择 Rust；未知能力在初始化前整场选择原 TS。运行后错误保留上次完整回执，不在半步切换后端或用显示副本恢复权威。

| 验收域 | 最少必要证据 |
| --- | --- |
| 目标/决策/排序 | 目标身份和代次、所有 FireDecision 原因、PD/导弹/诱饵/舰船资格、priority → threat → utility → retained → traverse → lex rank 的准确 tie；不截断候选。 |
| 数值与 RNG | clocks/资源/阶段/目标/决定严格相同；combat、visual 以及每挂点 scheduling RNG 的完整 witness 严格比较。几何只使用总策划已批准 allowlist 和阈值，不能宽容真实决定变化。 |
| turret/fire 因果 | 运动后的枢轴/炮口、炮塔当前角、actual post-turn bore、友军/障碍遮挡、burst/charge 承诺、每次 commit 的幅能再检查、真实弹药/幅能扣除和实际生成。 |
| live effects | 所有 controls 先于任何 effects；系统先于防御；后部 AI 看见前部系统/排散/护盾变化；排散前真实 threat 重查；不重复 quiet/safeVent clock。 |
| 输入转换/取消 | 手动↔自动、切组/组自动开关、disabled/repaired、目标死亡/撤离/移出 roster、cadence 参数和政策切换，均无残留目标或多余 RNG 消耗。 |
| 所有权/失败 | stale entity/target/command 拒绝；失败整批/整步回滚全部 AI/fire 记忆、三类 RNG 和事件；发布复制不可写回；存档/重放不依赖 transient intent/观察租约。 |
| 实际可玩与生产 | dedicated Worker 真实路径，部署→驾驶/自动驾驶→自动开火/系统/防御→命中/死亡/胜负→退出/重开；LAN/Steam authority 与呈现/声音/结果/恢复合同；不得仅凭 DTO 或独立 solver 通过宣布可玩。 |

可复用 `scripts/check-stage-boundaries.mjs` 的 seed917/22主舰混编真实全步场景与 `scripts/check-combat-ai.mjs` 的 tracker RNG、状态转换和 live threat 用例。完整迁移后集中一次对照与配对性能验收；此审计阶段不运行现有 TS 全套检查。

## 未核实与取舍

本块没有新的玩家产品取舍。现有 Web multirate/20Hz 和自定义系统政策维持当前准入与参数，不能借迁移改变频率或玩法。原版实机/视觉等价、七包可生成实体的完整 Rust 支持、未知回调处理、发布/恢复和完整性能均尚待真实实现与验收。
