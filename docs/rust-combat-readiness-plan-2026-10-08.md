# Rust 战备度、峰值性能与部署故障方案

日期：2026-10-08。状态：独立常驻规则模块及实际 TS 差分已完成；尚未接入生产权威，不代表完整战斗可游玩。

## 目标与玩家体验

将当前 Web 的 CR/PPT、部署低 CR 损伤调度和护盾故障时钟迁为常驻 Rust 状态。玩家看到的战备度、峰值性能剩余时间、组件失效、系统禁用及护盾故障保持当前规则；不增加 UI、操作或玩法取舍。当前完整迁移授权包含此块例行实现。

## 范围与边界

本模块包含 CR 性能/故障概率计算、世界时间的 PPT/CR 衰退、懒部署、低 CR 目标队列、随机间隔和护盾故障检查。真实组件禁用、武器组删除、弹药清空、严重故障的装甲/舰体伤害、过载及系统取消，由主 Rust 舰船状态在规定同步位置执行。本模块返回的是需要立即提交的内部动作，不能延期到显示事件处理。

不修改生涯存档、内容配装、原版 CR 规则或现有 HUD。尚未完成的全战斗、其他系统和原版实机 UI 验证不计入此块交付。

## 原版依据 → 当前行为 → 差异 → 验证

来源版本为 `../starsector-core/starsector.log:1` 标记的 0.98a-RC8。

| 原版证据 | 当前 Web / 本次迁移行为 | 当前差异与验证方法 |
| --- | --- | --- |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/CRPluginImpl.java:24-41,164-175,177-226,355-405,640-681` | 50% 以下衰退、70% 以上加成，最大 10%；故障阈值为 `.4*range-.001`、`.2*range-.001`、`.1*range`；保留当前 Web 战机豁免及 hull stat 附加概率 | 与真实 `CombatReadiness.ts` 和 `Ship.crEffects` 严格差分；原版 Java float 不替代已授权 JS binary64 |
| 同文件 `applyCRToShip/getMissileLoadedFraction`，约 `355-393` | 低 CR 部署建立损伤插件；战机和锁定控制跳过；导弹装载比例原版直接返回 1，本次不减弹 | Web 阈值检查增加 `threshold>0`，CR 非有限输入钳为 0；按现有实现保留 |
| `LowCRShipDamageSequence.java:20-47,53-98,111-134`，`IntervalUtil.java:65-90,116-120`，`WeightedRandomPicker.java:179-193` | 初始间隔抽样先于 1–3 秒等待；按武器组遍历后接普通发动机，允许重复组成员；每步最多一次尝试，丢弃上一间隔超时余量；永久移除不合格目标和已选目标 | Rust 保留实际 TS 构造和 advance 的 RNG 顺序；真实 TS 类作调度 oracle；同步侧伤由主状态负责 |
| `combat/entities/Ship.java:2207-2212` | 活跃 FRONT/OMNI 护盾、幅能严格大于 .75、真实护盾命中严格小于 1.25 秒；通过概率后尝试 forceOverload，成功才置故障标志并降低护盾 | 采用现有 Web 的间隔钟与 `FluxTracker.forceOverload`；不改成每秒概率；验证无命中、边界、排散/已有过载及零 dt |
| `combat/entities/Ship.java:2215-2269` | 原版根据战斗压力/附近敌军推进部署钟并在 PPT 后损失 CR | Web 已采用 2500 距离的存活、非撤离/停靠敌方非战机查询，且 PPT 用尽那一步不补扣超时 CR；本次保留这些差异，不冒充原版完全等价 |

当前规则入口：`src/engine/simulation/CombatReadiness.ts`，`Ship.ts:535-625,874-882,934-1010`，`systems/LowCRShipDamageSequence.ts`，`systems/ComponentMalfunctions.ts`。

原版界面本轮没有新截图或实机操作许可。HUD 布局和键盘/点击/关闭流程沿用已有实现，默认/悬停/禁用/远近与故障提示的原版画面对照仍待核实；源码核对不算实机 UI 验收。

## 规则与完整流程

1. 安装完成后初始化 CR/PPT，护盾间隔初始化消耗一次世界 RNG。部署命令或第一步的懒部署钳位 CR 并记录部署 CR。
2. 非战机、控制未锁定且低于正的严重故障阈值时，按当前组成员顺序及普通发动机顺序建立常驻目标队列。此后普通 CR 修改不重建队列；显式重新部署才重建。
3. 每次舰船 prepare，先用未相位缩放的世界 dt 推进部署序列。选中动作立即在 Rust 提交组件永久故障与侧伤，然后根据真实存活状态结束/移除序列。死亡/撤离舰在此后的存活门槛后不推进 PPT。
4. 存活舰以世界 dt 检查附近重要敌舰并推进 PPT；`peakCRSec<=0` 不损失 CR；PPT 仍大于零时只扣 PPT，下一步起按 `crLossPerSec*.01*dt` 扣 CR。
5. 系统 update 后、护盾维护费用和 motion 前，读取最新 CR 效果，禁用/取消系统与防御；必要时同步降低护盾。护盾命中计时先加 effectiveDt；间隔过期后的下一步先抽新间隔、清零并丢弃余量，再执行条件故障。
6. 零 dt 不推进部署损伤，但允许第一次懒部署、CR 限制和现有护盾间隔行为；暂停不调用真实推进。取消/销毁由主权威清理整个 resident 状态。失败随主步事务回滚状态、RNG、目标队列和真实侧伤。

## 权威、并发与存档

组件资格、队列和敌舰查询来自 Rust 已提交状态；禁止逐步导入 JS 镜像作为权威。内部组件标识使用已安装组件的稳定身份，不通过显示对象索引寻找目标。调用方在同一事务中先提交动作再进行后续检查，过期/缺失身份视为内部错误，不静默选择替代组件。网络仍只接收既有控制命令和显示投影；本模块不增存档字段或客户机权限。clone/clone_from 必须保留整个目标队列与 intervalWasElapsed。

## 依赖、顺序与验收

先写此方案和核实来源，再实现 `native/combat-core/src/readiness.rs`。随后用独立 Wasm harness 对真实 TS CR 函数、Ship 部署/PPT/护盾方法和 LowCR 类集中差分；仅具体失败定向修复。最后交主代理接入现有完整事务，复核真实组件/装甲/舰体副作用、系统取消和发布字段。独立 harness 通过仍不表示生产已接线。

验收：CR、PPT、所有 timer、阈值决策、系统禁用、目标顺序、尝试次数及 RNG witness 全部严格一致；覆盖阈值两侧、战机、锁定控制、零时长/零 dt/大 dt、队列 pruning、重复组成员、末武器保护、发动机 .66 上限、伤害后死亡、新部署和普通 CR 修改的区别。附近敌舰查询用实际顺序/团队和 scaled coordinateLength，几何允差不得放宽重要敌舰真假决策。护盾随机检查覆盖最近命中、高幅能和 forceOverload 的拒绝；真实伤害集成待主状态联合验收。

待核实：原版实机 UI；生产 resident 世界查询及真实副作用闭环；完整战斗和性能。无新增待用户决定的产品取舍。

## 已完成与实际验收

已实现 `native/combat-core/src/readiness.rs`。提供 `Parameters/Components/Contact` 的借用输入、`Readiness` 常驻状态、`LowCRSequence` 目标队列以及立即执行的 `Target::Weapon/Engine` 动作。clone/clone_from 包含队列和全部 interval 状态；没有改变共享 lib/state/protocol 或生产 TS。

实际运行 `scripts/lib/rust-core-readiness-harness.rs` 编译为独立 Wasm，`scripts/check-rust-readiness-module.mjs` 使用 `scripts/lib/rust-core-readiness-check.ts` 的真实 `Ship.prepareStep`、部署/护盾方法、CR 函数和 `LowCRShipDamageSequence` 作为 oracle。Node 与新建无头 Chromium dedicated Worker 均通过：28 场景 × 140 步，共 3920 步，每端 224,278 个严格字段，220 个 CR 效果样本、96 个敌舰查询、73 次严重故障动作。几何允差未启用。计时、CR、队列、组删除、弹药归零、永久发动机比例、护盾故障/过载及完整 RNG witness 严格相同。

独立 harness 中的故障 callback 同步提交组件资格变化，但不执行严重故障的真实装甲/舰体侧伤；该闭环须由主状态联合验收。`shieldFailureSteps=312` 统计的是已置故障标志的步数，不是 312 次故障触发。未操作桌面/可见窗口，未运行全套测试。改动脚本的 scoped ESLint 通过；包含现有依赖的普通 TypeScript noEmit 检查通过，本轮没有声称 strict 全项目检查通过。

记录：`artifacts/rust-combat-core-20261008/verification-readiness/result.json`。独立 harness Wasm 为 1,384,313 字节，SHA256 `65ed241d5fad5834b51fef13faa63589e53697788e520138b30196d5e9eb1814`；此数值不是生产内核体积或性能结果。

## 主内核接线约定

- 在安装时 `Readiness::new` 放到 TS `resetShieldMalfunctionState` 的同一 RNG 序位，并将 Shield 的 `data[28]` 设为 Infinity；不要增加部署时不曾存在的 reset 抽样。
- 每个 prepare 最前段调用 `advance_deployment(worldDt,...)`；返回 Target 后立即执行实际组件永久故障、武器组清除与 `critical_damage`。随后调用 `finish_deployment(worldDt,dead,hp)`，再执行 alive/nonretreated 门槛和 `advance_peak`。零 dt 不可因此移除一个本应保留的死亡序列。
- `significant_enemies` 接收 Rust 真实团队/状态/位置及稳定 slot+generation；默认范围 2500。显式 target 先查，然后 world 任意存在查，不以玩家锁定状态决定 PPT。PPT 用 worldDt，不用 subjectiveDt。
- `Effects` 的概率与 movement/damage/taken 应写到权威 stats 和现有 weapon/engine/armor/shield 策略中；系统禁用发生在 system update 后、ordinary upkeep 前。战机仍允许 hull stat 的 weapon/critical 概率 bonus，原始 CR 概率才为 0。
- 调用 `advance_shield(effectiveDt,&mut shield.data[28],...)` 之前先应用 CR 禁用并降下请求的护盾；此方法本身推进命中年龄，必须删除/避开旧 `ShipState.advance` 对 `data[28]` 的同一步重复相加。返回 true 时尝试 `Flux.begin_overload(0)`，仅成功时 `finish_shield_attempt(true)` 并同步 lower；已有 overload/venting 拒绝仍保留 RNG 消耗。
- 普通 CR 修改只写 current_cr，不调用 deploy。显式新部署才重建队列。当前 Web 懒部署明确使用 controls_locked=false；锁定控制只适用于显式部署 hook。
- 所有时钟和真实动作在现有完整事务 scratch 内执行；返回错误时回滚 readiness 队列、world RNG、组件/资源与伤害。不把内部 Target 转为显示回调执行，不从 JS 镜像恢复此状态。

仍未完成：生产共享协议/状态接线、真实严重故障侧伤联合验收、原版实机 UI 和完整可游玩验收；不启用 fullBattleReady。

## 常驻核心联合接线范围

主代理本次将 Readiness 及 Parameters 安装到真正 CombatShip，deploy/普通CR修订分开命令。prepare最前先执行低CR返回的真实永久禁用、组移除和critical_damage再检查存活；PPT查询读取当时Core实体。系统update之后执行CR系统禁用/降盾/故障，避免shield年龄重复递增。weapon/engine故障策略与outgoing/taken/movement从currentCR产生，不能每步由JS覆盖。联合验收复用现有真实Ship/组件/装甲对照并集中覆盖真实侧伤和全局两流；这一接线开始不等于已通过或生产可玩。零CR、中途死亡和回滚按原合同处理，不新增玩家取舍。

### 联合接线实际完成与验收

ABI9、domain131071已将readiness状态装到真实CombatShip；具名initialize/deploy/普通CR命令分开，所有更新在既有整步事务执行。低CR先执行真实永久组件失效、组删除/弹药清零、critical_damage，再推进PPT和其它舰船阶段；CR故障概率、movement/outgoing/taken从核心状态产生。系统update后取消/禁用和护盾故障使用同一resident Flux/Shield，命中年龄只加一次。发布复制状态、效果、序列及有序目标，不允许显示修改权威。

`node scripts/check-rust-combat-core.mjs --readiness-owner`在Node和fresh无头Chromium dedicated Worker各通过14场景、2,820步、709,130严格字段、33,840几何字段（零差异）。真实Ship.prepare/integrate/advanceState/finish作为oracle，27次真实严重故障、11次装甲侧伤、27次舰体侧伤，包含中途HP归零、重新部署/CR编辑、组重复成员及完整两流RNG；普通CR编辑不重建队列，失败命令对序列与RNG事务回滚。持续近期命中/高幅能场景实际触发护盾故障；829为故障标志置位后的步数，不是829次触发。记录`artifacts/rust-combat-core-20261008/verification-p2-readiness-owner/result.json`；Wasm367,728bytes，SHA256`cc7c5dafef5bede52fa53bf43e710306aa4375d8142fbd3ffc9e07af8e4da1b7`。binding/protocol scoped strict tsc通过。

此联合场景核对真实armor/component/flux/shield副作用和顺序，但未含特殊system取消hook、完整statuses/舰装、生产战斗/联机/恢复及原版实机UI；`fullBattleReady`仍为false。后续实际系统模块接线时继续按此合同复核。未操作桌面或发布生涯。
