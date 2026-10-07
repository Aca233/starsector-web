# Combat decision-domain replacement — current TS execution plan

## 当前唯一派工方案：TS同步数值决策域；下文Rust全核心方案撤回

主审指出原A写集不可交付，且机器没有 cargo/rustc/clang/emcc。本轮不安装工具链、不建Rust空架子、不迁移全物理/伤害权威。以下三个任务替代本文其余历史方案，禁止按历史A/B/C范围派工。

### 替换边界与最小协议

保留现有对象作为可变权威及有序资源/伤害提交者；**完整替掉读取密集的AI决策、武器火控决策、弹体-舰体命中查询**。数值视图是明确阶段的观测，不冒充全引擎唯一权威。差异不是换容器：热查询不得再读取Ship/mount getter或调用旧对象solver，输出直接进入现有有序提交。

共享协议由任务C独占，A/B不得各造世界codec：

```text
capture(stage, tick, sources) -> NumericStageView
  stage = AI_PLAN | AI_EFFECT_READ | FIRE_QUERY | PROJECTILE_CONTACT
  view = {epoch, rosterOrder, handles, shipColumns, mountColumns,
          projectileColumns, geometry, rowByHandle}
AiBatch.plan(view, dt, orders) -> controls + effectInputs
FireBatch.plan(view, dt, manualInputs) -> weapon/group decisions
ContactBatch.query(view, projectile) -> ordered earliest-hit result
refreshChanged(handles) / invalidate() / close()
```

- 阶段一次采集所需字段，复用存储；初次规格/几何编译后按修订更新。无Worker、无全世界对象重建、无getter代理；采集成本计入整步。
- AI与fire不能共用同一时间点：共用布局、句柄和几何存储，各自capture正确阶段。弹体阶段在terrain/status/舰体碰撞之后再建立观测。
- 句柄含generation，遍历/平局使用语义序号；Float64、数组按需增长，不限实体或候选数量。
- 旧提交者允许保留，但其内部重新查询威胁/射线的部分也要接新solver；不得消费结果后重跑原决策。特殊未知回调必须显式标记未支持，不能靠目标重场景大面积fallback宣布完成。

### 任务1：AI端到端替换（约束在AI域，不迁移系统物理）

**独占文件**：`src/engine/ai/CombatAIPhase.ts`、`CapitalShipAI.ts`、`FleetTactics.ts`、`NumericalFleetPlanner.ts`；新建 `src/engine/ai/batch/AI*.ts`。其它旧AI查询文件只作为移植来源，避免与任务2共享编辑。

**producer**：将当前阶段观测、orders、舰队分配输入、现有controller记忆整理为数值输入；不按每舰重复构造TacticalWorld。**solver**：迁移舰队分配、威胁评估、目标/站位/导航/让路、紧急避碰与转向的实际计算，使批次默认不调用旧 assessThreats/chooseCombatVelocity/avoidCollisions 等对象消费者。**consumer**：每步生成当前controls/effectInputs，经原顺序提交；保留系统/defense的有状态动作，而非复用旧effects/world。提交中的live威胁复核、forward-path查询也改用当前AI_EFFECT_READ数值solver。

已知系统效果后刷新受影响行；未知可跨实体写入的效果使观测失效，再次需要时重建，不能读旧帧。不把所有系统/护盾/flux状态机重写分给本任务。完成标准是上述读密集计算默认退出旧对象函数，不是多一个profile缓存。

### 任务2：火控端到端替换（挂点/tracker -> 求解 -> 原序发射）

**独占文件**：`src/engine/simulation/systems/ShipWeaponControlSystem.ts`、`src/engine/ai/AutofireController.ts`；新建 `src/engine/ai/batch/Fire*.ts`。

**producer**：一次接入挂点/组、tracker计时与RNG、手动输入及任务C的FIRE_QUERY视图。**solver**：原有寻敌、拦截瞄准、炮口/弧度判定、遮挡/友伤、在飞火力预算和组调度，改为直接读数值列；旧FireControlQueryBatch/NumericAcquisitionFrame不得再转回对象solver。**consumer**：把tracker、炮塔及决策写回对应挂点，原序commitFire继续做真实扣除/生成，且不重算aim/decide。已有冷却/连射状态推进和实际开火60Hz保持不变。

多舰只读查询共享阶段数据；共享幅能/弹药/火力账本相关检查仍在正确有序位置，不能用过期批量许可超发。手动、PD、导弹/光束及当前装备的特殊策略明确覆盖，不得简单排除后不发射。

### 任务3：共享观测producer + 弹体命中rest域 + 默认接线

**独占文件**：新建 `src/engine/ai/batch/Stage*.ts`、`Contact*.ts`；修改 `src/engine/simulation/CombatEngine.ts`、`ShipStepBatch.ts`、`src/engine/simulation/systems/WeaponSimulationSystem.ts`、`systems/weapon/ProjectileCollisionHandler.ts`。不改任务1/2文件；不接手全舰体物理、全伤害、deck/status/gravity改写。

**producer**：实现并首先冻结共享列布局、规格/几何表、阶段epoch与身份映射，正确放置三个主采集边界。**solver**：将弹体-舰体完整候选筛选、精确几何/护盾接触、最近命中及平局裁决改成纯数值执行，不只是提供候选后回调旧几何。**consumer**：命中结果直接接已有伤害/穿透/移除处理，保留逆序弹体及中间伤害影响后续查询的顺序；命中/爆炸/销毁后刷新受影响行，影响集合未知时使当前观测失效。禁止预先冻结全步所有命中。

本任务不迁移导弹制导、弹体推进、光束伤害和全物理；它覆盖的是已有rest中的真实命中查询成本，数额未证明。生产接线确保A/B批次直接运行，不先调用原循环再覆盖结果；旧路径仅保留显式兼容，不作为重场景主要执行路径。

### 派工与验收边界

任务C先冻结Stage协议，随后三个任务按独占写集并行；共享ABI变更只经C。三域接通组成一个实现块，再集中做最少必要检查和原重场景整步验收，不新增profile/容量探针/探索矩阵。

本修订不增加采样、不降低物理/射速、不缩容。旧14.56+9.72+16.91仅用于说明覆盖范围；最新45.01ms不能据此拆分。该方案覆盖实质AI/fire计算与一块rest，但不能保证16ms；producer、刷新、提交和未替换机制成本全部计入。只有容器或新输出表、旧热点仍执行、target场景大量fallback，均不算完成。

以下内容仅保留撤回方案历史，不能作为当前实现或派工要求。

日期：2026-10-04。状态：设计，未实现、未构建、未测试、无性能验收。

## 授权、证据与目标

- 用户授权完整核心替换及换语言；禁止缩容、实体/弹体/挂点硬上限、分波、延后开火、降低物理频率/射速或屏外模拟。保留当前已启用的 standard multirate，不再以继续采样为交付。
- 现有同轮旧拆分为 AI 14.56 + fire 9.72 + rest 16.91 ms。最新 multirate 整步约 46.84 -> 45.01 ms，没有对应新阶段拆分；不得把旧比例套到新结果或承诺某个 Rust 模块可节省多少毫秒。
- `C:/starsector-core`、`C:/decompiled` 在此前检查中缺失。0.98a-RC8 历史引用仅文档可读，未重新核实。这是用户授权的 Web 性能扩展，不声称原版等价；不涉及 UI 修改。
- 验收目标限于原有 seed917、20AI+2玩家、相同装备/派生实体/运行方式的完整场景。整步包含输入、计算、提交、桥接与必要发布，不用核内耗时替代。目标均值 <=13ms、P95 <=15ms、P99 <=16ms，同时真实约60完成步/墙钟秒、不丢时、不累积债务；均为目标，非已证明结果。

最小对照：原版证据缺失 -> 保留现有 Web 的阶段读写顺序、60Hz物理、资源/命中/RNG语义及已授权 multirate -> 当前热点仍经过对象控制器和短命数值视图 -> 完整替换后用既有场景集中核对行为及整步性能，不新增探索矩阵。

## 已失败方案不能成为新核心底座

依据 `combat-native-ownership-audit-2026-10-04.md` 及本次入口复查：

1. `src/engine/ai/multicore/Owner.ts:88-143` 将观测帧重新应用到对象视图、重建弹体/光束和 TacticalWorld；旧 resident-planning 实验为 34.5631 -> 100.5188ms。不要继续复用此 codec/hydration 执行链。
2. `src/engine/simulation/CombatStateCore.ts:104-113` 与 `OwnedCombatNumbers.ts:71-83` 把旧对象属性接到数值存储，消费者仍走对象方法。新核心禁止通过逐属性 getter/setter 接回旧求解器。
3. `CombatKinematicsStore` 每次 capture 导入、commit 返回对象所有权；不能作为新的单一权威。
4. 审计中 NumericAcquisitionTree 的 exclusive 成本约0.64ms，不支持仅改树节点就覆盖 rest。旧 AI/fire 即使零开销四路化，旧剩余预算仍无法达到16ms。

## 撤回历史：Rust全核心路线

在现有权威 Worker 内运行一个常驻 Rust/Wasm 核心，首版单线程。一次替换：

**舰队/舰船AI -> 挂点与武器组运行 -> 舰体运动/碰撞 -> 弹体/导弹/光束与真实伤害提交。**

对象和 TS 保留加载、玩家命令、展示/网络、尚未迁移的外围流程。迁入核心的字段由核心唯一持有；对象展示副本不是下帧输入。不是先做 TS getter 优化再考虑 Rust，不是先生成 DTO 交给 Worker 调旧方法，也不是把多个小内核包在旧逐舰调用链里。

首版没有额外计算 Worker、SAB协议或异步结果回退。先让完整生产路径退出旧求解器，再考虑是否有必要并行；单线程迁移本身不保证16ms。

## 撤回历史：Rust协议

运行层只暴露四类粗粒度调用，ABI由A独占：

```text
create(specTables, initialState) -> core
apply(commandBatch)             // 按当前允许的边界应用外部事件，不是整世界导入
advance(stage, tick, dt)         // 一次执行整阶段，数值求解与提交均在核心
publish() -> presentation/events
```

内存与身份：

- 实体/挂点/弹体引用为 `Handle { slot: u32, generation: u32 }`；另存语义遍历序号，不能把复用槽位顺序当玩法顺序。
- Float64 保留现有 JS 数值精度。数组按实际实体数增长，禁止固定容量拒绝实体或截断候选。内存增长仅在无借用视图的边界发生；导出的视图附 memoryEpoch，增长后重新绑定。
- World 持有姿态、速度、舰体/护盾/幅能/装甲、装配关系及生命周期。AI域持有控制器记忆；fire域持有挂点/组/tracker；physics域持有弹体/光束推进状态。不得每步从 Ship/mount 重新灌入这些字段。
- 规格/几何/规则参数初始导入；运行中的补机、模块脱离、换配置、传送、系统修改通过具名命令更新。已知写者直接调用核心命令，不通过全对象差异扫描推断变化。
- `apply` 至少区分 input/order、spawn/despawn/dock/detach、spec/stats revision、外部位移/资源/状态事件；携带句柄及稳定事件序号，过期代次不得命中新实体。
- `publish` 输出展示状态和声音/视觉/战报事件。影响后续模拟的资源扣除、伤害、销毁和生成必须在核心的原有因果位置完成，不能留到 publish 才执行。

Rust内部分工使用稳定签名，不把结果搬回JS再组装：

```text
AiDomain.plan(worldRead, tick, dt) -> domain-owned intent rows
AiDomain.commit(worldWrite, tick, dt)
FireDomain.advance_state(worldWrite, tick, dt)
FireDomain.plan(worldRead, tick, dt) -> domain-owned fire rows
FireDomain.commit(worldWrite, tick, dt)
PhysicsDomain.advance(stage, worldWrite, tick, dt)
```

Read/Write是阶段限定的直接存储访问，非反射、Ship外壳或闭包。AI/fire行只活到当前提交边界；跨步保存的导航/瞄准意图不持有旧world、索引、碰撞结果或开火许可。

## 撤回历史：过大的三写集

### A：主代理/集成执行者 — 状态、物理、构建和全部旧入口

**独占写集**

- 新建 `native/combat-core/Cargo.toml`、构建/依赖接线。
- 新建 `native/combat-core/src/lib.rs`、`abi.rs`、`state.rs`、`physics/**`。
- 新建 `src/engine/runtime/native/**`。
- 所有现有 TS 文件、项目配置的改动均由A独占，B/C不得修改共享ABI或旧调用点。

**完整机制**

- 舰体 state/motion、模块装配同步、舰体碰撞响应。
- 弹体/导弹推进、制导/诱饵/近炸/拦截、环境与舰体精确接触、穿透/爆炸、光束持续伤害。
- 资源/装甲/组件/舰体伤害与死亡生成。C产生的发射在原边界进入A的弹体存储；产生即具备完整机制状态，不返回旧 Projectile 方法补算。
- 当前场景用到的生命周期、伤害修正和 on-hit 内置行为也属于范围。未实现这些不能用“通用弹丸已通过”代替。

**旧入口对应**

- `CombatEngine.fixedUpdate/fixedUpdateStages`（680/712）：选择并调度新核心，不再先跑旧路径再覆盖结果。
- `ShipStepBatch.execute` 的 state/motion/finish、`Ship.prepareStep/integrateStep/finishStep`：迁入的状态不得重复推进。
- `CombatEngine.ts:1131-1153` 的舰体碰撞与模块同步：改为核心阶段，不是新 broadphase 回调旧逐对 resolver。
- `WeaponSimulationSystem.updateProjectiles/updateBeams`（49/305）及其 handlers：迁入域的新默认路径不再调用旧更新循环。

### B：AI执行者 — 所有AI计算消费者一起迁移

**唯一写集：`native/combat-core/src/ai/**`。**自建 `mod.rs` 导出 AiDomain；共享类型只从A约定的 state/abi 使用。

**替换链**

`planFleetAI/FleetTactics/NumericalFleetPlanner -> CombatAIPhase -> CapitalShipAI.plan/decide -> ThreatAssessment/导航/避碰/Steering -> 控制/系统/defense提交`。

- 舰队分配、目标选择、战术站位、协同、威胁/防御、系统AI及controller计时/RNG直接消费核心存储，不能生成 FleetUnit/Ship/TacticalWorld 对象再调用旧实现。
- 保留standard当前节奏；即时威胁、紧急避碰、defense observe/效果60Hz。舰队分配共享claims和浮点累计顺序按现有规则有序执行。
- 已知内置系统决策必须形成真实核心效果；若返回JS继续遍历所有系统并重建场景，该域未完成。
- 新AI完成后，native域退出 `CapitalShipAI` 的 plan/decide/executePlanEffects（149/207/410）；旧类只服务显式legacy路径。

### C：火控执行者 — 从挂点推进到发射提交

**唯一写集：`native/combat-core/src/fire/**`。**自建 `mod.rs` 导出 FireDomain；不得修改A的状态/协议文件。

**替换链**

`ShipWeaponControlSystem.advanceState -> planFire -> AutofireController/目标及遮挡查询 -> weapon group scheduling -> commitFire`（226/296/520）。

- 挂点冷却/连射/弹药补充/炮塔运动、tracker/寻敌/瞄准/抑制策略、当前炮口安全判定、组调度、资源检查/扣除及发射一起进入核心。
- 目标与障碍直接按核心句柄查询；不创建 NumericAcquisitionFrame 后回调原 AutofireController。普通/PD/导弹/光束/手动及当前场景特殊武器明确覆盖，不静默转成不发射。
- 仅纯观察阶段批量计划；共享幅能、弹药、在飞火力账本及生成按现有提交顺序执行。武器不会因CPU预算排队或少开火。
- C负责完整Spawn命令/光束开启更新协议；A负责生成后的物理生命周期。tracker RNG与模拟/视觉 RNG分开，不以新的遍历方式改变随机消费顺序。

## 撤回历史：全核心外围边界

当前阶段实际顺序是：

```text
prelude/visibility/EW
AI观察 -> 所有controls -> 有序effects
舰船/模块收集 -> wings/decks/drones的有序更新
ship state -> motion -> weapon state -> fire query -> fire commit -> ship finish
terrain/status/gravity -> ship collision/module sync
projectile/beam推进与命中
trails/mines/FX -> aftermath
```

AI观察不是fire观察：后者发生在系统效果、飞行更新、舰体状态和运动之后，不能共用一份整步冻结视图。防御提交前需要live复核的地方继续复核。

A必须同步改造还留在TS的deck/status/gravity/mines等已知读写者：只读取声明的批量字段视图，输出具名写入命令并在原边界立即应用；依赖前次写入的后续实体必须看见新状态。它们不能继续直接写展示Ship对象，也不能通过逐属性代理访问核心。

若某个依赖过强的外围流程需要逐实体往返才能成立，应把相应有序机制一并迁入A的physics/lifecycle，而不是把FFI碎片化当最终接线。这一项是A的真实实现工作，不是可省略的适配细节。

弹体尤其不能简单“全体推进 -> 全体伤害”：现有 `WeaponSimulationSystem.ts:94` 逆序访问，拦截、爆炸和删除会影响后续查询。核心保留语义序号和有序机制流；仅在已知无中间写入依赖的范围批量求解。禁止按弹种分桶后改变跨桶命中/伤害/RNG顺序。

## 撤回历史：全核心支持与回退

- 以显式机制/扩展能力注册决定后端。已支持机制在原生核心执行；未知外部回调/直接对象写入的扩展不获得native资格。
- legacy是独立完整路径，在开始修改本步权威状态前选择；禁止native提交一半后调用legacy补算或重跑。
- 当前seed917重场景完整支持、并真正默认退出旧AI/fire/物理链，是本次最低交付门槛。不能靠把目标场景多数舰船回退到legacy来宣布兼容完成。
- 新核心发布状态与旧控制器不得同时运行；旧类保留兼容不等于允许双算。

## 撤回历史：原派工顺序与完成边界

1. A先交付共享state/ABI字段及阶段枚举；这只是接口冻结，不是性能成果。B/C按上述独占目录同时实现，修改共享协议须由A合并。
2. A同时完成物理及所有生产入口/外围写者接线；不等待B/C结束后才发现仍要全世界双向同步。
3. 三域接通后完成一个完整实现块，再集中选择最少必要的类型/构建检查与既有场景行为核对，随后在同一完整场景比较整步。这里不启动测试、不要求新增profile或探索矩阵。
4. 核对每步关键状态、AI/defense/tracker、生命周期、资源和两类RNG，不只比较最终快照。明确数值差异，Rust使用Float64不等于自动逐位相同。
5. 只有核内算例、编译、独立碰撞速度、DTO迁移、计数器或5%小收益，都不能称完整替换达标。发布/桥接/外围成本计入整步；其余rest未迁移部分如实列出。

本计划选择的rest覆盖为舰体状态/运动/碰撞及完整弹体/光束机制，不声称它等于全部16.91ms。换语言只是减少对象分派与转换的实现手段，不是16ms证明；未达到整步验收时状态仍为“核心替换已实现但性能目标未达成”，不能用删除工作量修饰结果。
