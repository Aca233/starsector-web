## 2026-10-09 live modifier 内部表示与稀疏合并方案

本块实际交付并冻结：`ship_effects.rs` SHA `0aefeb36d67c27a6f37fbd09f0362d2ef687ad7f662f97fbe03dcb2608febdc6`、`scene_commands.rs` `815b4099f45350a55658a184674771f52973bfce5f2f41ddfd6c81f1e66a546c`、`startup_wire.rs` `8f37cb7a7c57a062c615b2583dfcb537fb5b102f4e0f14009bd62d47883c6640`。仅表示与上述必要调用点变化；原derive Debug表象已由自定义Debug保持，PartialEq与缺失槽+0不变量保持，未动compose_iter或任何规则。Wasm内每份Modifiers **816→416bytes（-49.0%）**，新plain冻结SHA `7e46a5f2944ad799e43edb4d59e563cb8a0280fa9a3bdb254d7aead83fefdb38` /4,532,111bytes，未installed/finalCargo/发布。

集中验收 `artifacts/rust-combat-core-20261008/verification-modifiers-compact/result.json`：同其它native/TS冻结、仅三个生产文件为旧新变量，实际22主舰/176初始实体270步与LAN60步（含第8步实际reserve部署），每帧完整snapshot/scene的值、字段/顺序、原f64位含负零、typed位与引用结构摘要全同。ownedSourceUnchanged=true；运行期间ROOT的system_owner/world_owner有其它改动已列changed，不把冻结结果说成最新全部源不变。未再重跑之前未改death/相位/投影块。

既有真正TS reader/callback oracle Node及全新无头DedicatedWorker各2,400 own场景、250 auxiliary/runtime/parent合成、2,280动态步、200helper、528broadside边界、280jump事件：**317,736 strict、9,040 geometry，最大差异0**；`tmp/flight-modifiers-compact/current-source-oracle/result.json`。必要独立edge **365,755 raw f64 words** 旧新SHA相同，覆盖51字段每种缺失/显式+0/-0/1/-1/极小/极大/±Infinity/带payload NaN、valid、defaults、words/values/mask、清除/clone独立性/PartialEq/Debug、80组稀疏/非有限合并；key51/63/64/u32MAX的set/get/field/clear16项双方均原bounds trap。`edges-result.json`。真实startup_wire tag116另16种duplicate显式0/1、字段越界/负/未在mask、缺key/initializer/stale/complete、padding及组合错误先后，**1,685 raw words**同SHA；`startup-result.json`。不为此窄表示改动运行全套测试。

性能界限如实：上述270/60顺序场诊断LAN native8.068→7.611ms，local后段50.130→53.433ms，机器同期变化不能认作稳定全场收益。仅必要后续samefrozen纯compose交替顺序诊断，空/单系统/3系统+runtime+parent每样20,000次、各24samples，校验和全同；mean **3.228→1.244ms、3.332→1.465ms、9.420→5.022ms（-61.5%/-56.0%/-46.7%）**，`cost-result.json`。证明局部表示/稀疏合并值得保留，不能代正式ABBA或最终可玩；ROOT仍负责最终sameinstalled整场门禁。

目标是减少玩家实际战斗中的同步属性读取成本，保持既有技能、模块、输入、声音、界面布局和完整操作流程。范围只含 `ship_effects::Modifiers` 的存储/default/clone/combine/get/words/defined_mask/values/valid，以及三个必要类型兼容调用：scene_commands 的 disableWeapons/Defense/Venting 临时逐字段拷贝、startup_wire 的 duplicate 检查、ArkForge 读取 speedPercent。不改任何 system_owner/Reader、生命周期、parent/runtime/auxiliary 合成算法、火控、相位、资源、RNG、可用性校验或发布字段，不缓存跨时点 live 最终数值。

必要性证据来自一次冻结生产 native 的临时诊断 `tmp/flight-modifiers-profile/result.json`，真实22主舰/176初始实体、seed917、270步、完整capture+ACK。Wasm中旧 `[Option<f64>;51]` 占816bytes；270步 combine 共2,039,228次、旧遍历104,000,628个字段槽，右侧已定义字段合计仅2,707个，2,036,521次右侧为空。后段181–270每帧 compose3743.73次/3.844ms、combine7638.94次/.819ms、default18189.56次/1.163ms，右侧均为空。这些时间包含诊断桥接、嵌套timer和额外计数，不能直接宣称可实现的增益；真实零/稀疏合并次数与816byte存储证明改表示有必要。profileSHA `d3569ade6d405ee786f62acd948eddb4ac5b8a2bbc65f763151698e3a1a092dc` 仅诊断，生产无timer，sourceUnchangedtrue/changed=[]。

原版依据复读0.98a-RC8 `data/shipsystems/scripts/ManeuveringJetsStats.java:13–28` 的逐stat修改/OUT解除与保留、`FortressShieldStats.java:21–24` 的1-.9level与upkeep0、`MutableShipStatsAPI.java:96` 等具名动态stats；它们不证明Web f64扩展。实际严格基线复读 `src/engine/extensions/ship-systems/Modifiers.ts:3–24` 与 `src/engine/simulation/ShipSystem.ts:318–330`：undefined和显式0/1不同；每个字段原默认值加/乘；auxiliary原递归右结合，runtime后有序parent。下文来源对照继续适用。本轮无UI/交互变化，也未操作原版实机，截图/实机仍待许可；不能以后台数值通过冒称原版视觉等价。

实施采用 private 51bit presence mask + `[f64;51]`，缺失槽始终+0，只在API边界以Option显式呈现存在。default全缺失；set/get/field先保持原数组越界检查，不能将key51当可访问；set_field(None)清存在并恢复+0，保持原临时字段赋值；clone独立复制同一值，PartialEq/Debug保持原可观测合同。combine按右侧mask最低位到最高位，只跳过旧None分支，每个已定义项仍用左侧原默认与原乘/加并立即写入；不改变浮点括号、负零或显式1。NaN/Infinity仍可由set进入，valid按已定义字段拒绝，不提前裁剪或改变malformed准入/错误先后。words仍缺失NaN、defined_mask仍51bit、values仍缺失+0；不改变wire或snapshot。

阶段：现状成本诊断和原版复核 → 本方案 → 窄表示及三个调用点 → 一次集中同其它native/TS冻结旧新actual270+LAN60完整值/字段/原数值位/引用结构，复用既有modifiers实际TS oracle，加缺失/显式0/1/负零/nonfinite/越界/clone/清除/重复及generic compose的必要fixture。失败仍原事务恢复和原错误码；无新取消/确认流程。权威只改变每个实例内部表示，不改变线程/网络权限/并发频率/存档格式；没有新玩家行为取舍。局部plain测量用于是否保留该优化，最终sameinstalled正式ABBA和完整可玩由ROOT完成，本块通过不替代该门禁；不提交/发布。

# 最新后续：gravity_owner 真实常驻接线

gravity_world 已收到且完整领域验证通过。请立即读 `docs/rust-combat-gravity-owner-agent-task-2026-10-08.md` 的最新真实 Host 接线任务，实施独立 gravity_owner.rs/策划/oracle。不要再只重复 gravity_world 交付结论；root继续等待真实接线模块。消息常丢正文，以该磁盘文件为任务。

# Rust 舰船技能与动态舰装：实施策划及来源对照

2026-10-08；补全总策划 P3 中七个内置包的 live modifiers 与动态舰装状态。本块持有 `native/combat-core/src/ship_effects.rs`、本文件及独立 `rust-core-ship-effects*` 验证入口；不修改共享 ABI、`state.rs`、`ship_state.rs`、生产接线或其它分工文件。

## 目标、体验、范围

保持当前玩家启动/关闭技能、共享反应堆、模块强化、战损封舱、脱战抢修和轴炮反冲补偿体验，使这些规则由 Rust 常驻状态执行。保留原 UI、按钮、快捷键、阶段提示与取消流程；不引入新的玩法取舍。浏览器与桌面共用 Wasm、允许限定几何舍入但资源/规则严格一致沿用用户已批准条件。

本块实现当前注册的七包 scalar system modifier/控制许可/模块 fold，以及荣光封舱、休伯利安抢修、罗西南特反冲补偿的完整数值状态。共享太阳能/休伯利安反应堆提供真实扣费与互斥辅助；方舟重构提供顺序 HP 规则。生命周期沿用现有 `lifecycle.rs`，静态舰装和武器 stats 由一次性可信内容编译结果安装。引力世界作用、跃迁障碍检测/真实 teleport、Yamato 发射、舰载机/甲板、动态战斗技能和宿主 native 动态 hullmods 属于其它尚待整合的能力，不以空回调替代，不凭本模块宣称全战斗就绪。

## 原版证据 → 当前规则 → 差异 → 验证

本机 `../starsector-core/starsector.log:1` 为 **0.98a-RC8**。已读：

| 原版来源 | 预期合同 | 当前差异与本次处理 | 验证 |
| --- | --- | --- | --- |
| `data/shipsystems/scripts/BurnDriveStats.java:9–17` | OUT 撤销 speed，保留已施加 acceleration | Web OUT 明确固定 200，迁移保持当前表达式 | 实际 TS modifier 逐字段对照 |
| `AmmoFeedStats.java:9–18` | ballistic RoF `1+level`，flux ×.5 | Web 同式；不增加 ammo | IN/ACTIVE/OUT/idle 对照 |
| `ManeuveringJetsStats.java:13–28` | speed/turn immediate，OUT 保留其它 stats | Web retainedEffectLevel 明确保存 OUT 入口强度 | 原值与 live 合成顺序 |
| `FortressShieldStats.java:21–24` | shield damage `1-.9*level`，upkeep 0 | Web 另有容量×.025硬幅能 upkeep | 控制与资源辅助核对 |
| `ShipSystemAPI.java:24–53`、`MutableShipStatsAPI.java:30,96,175,190,316` | lifecycle、ammo、effect 与分别的动态 stats | API 不证明 Web 的私有 timers/f64/扩展玩法 | 与现有 TS 规则模块作严格 differential |

七包技能及三项动态舰装是已授权 Web 改编/原创，原版没有其规则，不把反编译原版作为这些数式来源。当前真实来源：`ShipSystem.ts:326–350` 的 own→auxiliary→runtime→有序 parent systems fold；`EclipseProtocol.ts` 的 live flux；`GlorianaEdict.ts/GlorianaEdictState.ts` 的 accepted broadside 与直接 module 资格；`HyperionSystems.ts` 的成功跃迁后冷却窗；`AdunArkSystems.ts` 的工程段/corona/共享 charges/重构；`RocinanteSystems.ts`、`ZhefengSystem.ts` 的阶段许可；`GravitySystems.ts` 的 well upkeep；`GlorianaBuiltins.ts:30–48`、`HyperionHullMods.ts:60–94`、`RocinanteHullMods.ts:28–43` 的动态舰装。

无本块原版截图/实机证据；用户不允许桌面控制。因此默认、hover、选中、禁用和取消界面的原版实机/视觉等价保持待核实。本块不改布局，可做后台逻辑验收。

## 规则、状态、操作和失败

Modifier 使用具名固定字段，保留 undefined 与显式 0/1 的区别；相加字段与 multiplier 的 fold 严格按 TS 左到右次序。一次性安装 kind 和内容资格；普通步只借用同一 resident world 的 lifecycle/owner/module/weapon observations，不接收每帧 JS modifier 或 world capture。

系统 own reader 按 available、isActive 分别走 active/passive；auxiliary 顺序折叠，然后 primary 加 runtime，最后满足父子存活资格时按 parent allSystems 顺序追加模块增益。直接附属、侧别、装弹机、武器可用、父级 online 等资格由真实 resident 事实建立。无资格不制造 buff。控制项保留 releaseOnOut、disabled defense gate、Zhefeng IN/ACTIVE，以及 Rocinante automatic policy 的不同资格。

封舱每实例一次：≤40%HP、足够空间且非 vent/overload才支出25%容量硬幅能并保持6s，期间装甲/HP×.4、禁止 weapons/vent；期间 dt 缩减到 `1e-8` 清除，不重触发。抢修在实际武器/系统更新后识别完整短周期；positive armor/hull damage 在命中边界立即清 quiet/tick。足够 quiet6s、盾受击时钟及资源后按6储备/s逐单位扣费并修HP，80% ceiling、20%战斗材料预算且没有超支。补偿只由实际 railgun recoil 成功钩子捕获世界方向与70%预算，额外120软幅能；0.25s分段恢复，任一受损/急转/资源/既有补偿资格失败不申请。中断清余量，不囤积。

所有实体状态 Clone，可由上层完整 step rollback 保持 atomic；本模块不提前 publish、不跨线程保留 borrowed world。动作必须在当前规则阶段立即应用，并由主代理接入实际 HP/flux/runtime slots，不能把 action count 当执行证明。读 modifier、status 或 wire 不消费资源/RNG。本块不使用 RNG。暂停 dt0 保持动态状态。reset tactical system 不返还封舱材料；重新开战创建新 state。

## 权威、存档、依赖与交付

联机只允许 authority 核心执行，客户机继续接收 display projection；generation/命令权限和原子批次在共享核心处理。本模块的状态必须加入战斗 snapshot/witness/recovery；不得用 UI status 文本恢复。不会修改生涯存档 schema、部署/结算规则，不提交/推送/打包发布。

顺序：来源及本策划→纯 typed resident 模块→集中独立实际 TS/Wasm对照→主代理 lifecycle/armor/HP/fire 阶段接线→生产完整七包可玩验收。独立对照通过仅证明本块数式，不代表完成生产迁移。

## 验收与待核实

严格比较所有 defined scalar/weapon modifiers、组 fold、控制/许可、timers、资源、HP、材料、补偿状态。覆盖 disabled/dead/docked/retreated/vent/overload、IN/ACTIVE/OUT/passive、corona/工程段失效、接受侧别锁定、父子资格、jump6s边界、repair短周期/伤害/大dt/耗材/ceiling、bulkhead预留容量与parent失效、补偿世界方向/重复拒绝/中断。必要几何使用已有容差，实际侧别/资格判定仍严格。集中运行一次独立 differential；只针对实际失败修复复查，不跑全套。

待主代理完成：resident observation生产、共享模块接线、动态状态 rollback/recovery/witness、真实 HP/flux/runtime actions以及完整生产流程；独立模块不会替代这些。没有新的产品取舍待用户确认。

## 独立模块实际交付与集中验收

`ship_effects.rs` 实现上述 modifiers/control/permission、有序 fold、三项动态舰装及资源/方舟HP辅助。`Kind::from_id` 对当前七包注册技能逐项映射；未知ID返回None，引力其它技能仅标记为本模块无scalar效果，不能据此证明其世界行为已支持。附加六个旧native scalar公式仅用于原版来源核对，不宣称当前 custom-only 注册或内容准入。

`node scripts/check-rust-ship-effects-module.mjs` 编译独立Wasm并在Node和全新无头Chromium dedicated Worker执行真实TS readers/callbacks对照：每端 **2,400** 个 own modifier/控制场景、**250** 组 recursive auxiliary→runtime→parent fold、**2,280** 步真实动态舰装、**200** 组shared charge/方舟regen/重构/局部火控policy及 **528** 组broadside相邻f64边界，共 **314,656** 个严格字段及 **4,560** 个补偿速度字段，均零差异。暂停、阶段、disabled/dead/docked/retreated/vent/overload、unavailable辅助链截断、工程/corona、锁舷/loader、jump窗口、实际短周期/受击中断、稀缺与充足材料、ceiling、封舱预留费用及重复补偿拒绝已覆盖。边界检查发现Rust hypot与V8 Math.hypot会改变中心死锥资格，已使用当前V8两输入scaled sum顺序修正，side decision仍严格比较。

验证器仅给三个原TS私有WeakMap附加只读导出以观测状态；回调数式未替换。使用实际HullMod callbacks和ShipSystem readers，没有完整生产战斗或原版实机。结果保存 `artifacts/rust-combat-core-20261008/verification-ship-effects/result.json`；`productionIntegrated=false`、`fullBattleReady=false`。改动验证TS/runner的scoped ESLint通过。未运行全套测试；直接strict tsc包含大量既有依赖错误/未载入Vite声明，因此不声称整个依赖图类型检查通过。

### 核心接线合同

1. 每舰一次性安装各slot的 `Kind`、控制flags、phase许可；三种动态舰装按实际装配创建 `Bulkheads`、`FieldRepair::new(ordered mounts)`、`Compensation`，加入Clone/restore/witness。`Owner/SystemView/Module/RepairMount`由Rust常驻实体当场借用，不上传每帧JS观察。自定义unknown回调须未准入。
2. `compose` 的 `systems` 为primary→auxiliary的真实链顺序，内部保持 `a*(b*c)`；runtime按原source Map顺序先fold，primary再fold runtime，parent系统按实际 `allSystems` 顺序追加。auxiliary unavailable截断后续modifier链。生产发布用 `defined_mask()/values()` 保留缺失与显式0/1；`words()`中NaN只供独立differential。
3. prepare阶段系统更新后读取当时live modifier。现有TS hullmod `advance` 在prepare靠前，system `dispatchEvents` 与hullmod `advanceCombat` 在完整ship/weapons之后的 `CombatShipStatusSystem`；不能把封舱、补偿和抢修放在同一时点，也不能提前把Yamato/重构事件混进prepare。`Bulkheads.advance` 应真实调用resident Flux并将其modifier以固定source安装/删除；seal过期不重触发。父子available资格来自实际roster，独立damage同tick会在后续查询可见。
4. 对每一positive真实armor-cell或hull damage立即 `FieldRepair.on_damage`，避免完成步后复查漏掉伤害；post-weapon/system阶段 `advance` 遍历完整有序mount、实际cycle/trigger/state及shield伤害时钟，传真实HP/共享charges mutable refs。core资格包括安装reactor、未disabled；repair online额外要求非phased。
5. 实际physical recoil成功后调用 `Compensation.on_recoil`；`railgun`来自安装武器ID，`eligible`严格等于原 `canCompensate`（存活/非retreated/非vent-overload、controller未flamed、总flameout为0且所有engine未disabled）。用实际已施加世界dx/dy；advance在后续原hullmod阶段补速度，不改变角速度、不重新旋转预算。只有额外120成本成功才记录状态。
6. `ark_regen`每次真实system onAdvance更新当前forge slot的regen；当前 `lifecycle::Spec.regen`静态，接线必须允许resident slot自身的实时rate，不能每帧由JS改spec。共享扣费在onActivate/onActive真实时点，各技能互斥与core在线用同一谓词检查。`ark_repair_hp`仅在repair state ACTIVE且owner online、每个assembly part alive或所属同assemblyRoot craft alive且距离严格小于shield radius时按原遍历顺序调用。该函数只执行一件HP变更，不负责伪造目标选择。
7. lifecycle `isActive`仅表示trackers；特殊Yamato/teleport/引力的accepted input、真实spawn/move/clear与中断仍需其它world模块完成。本文件及上述检查未覆盖world effects/联机恢复/七包实际生产可玩，不可据此开启fullBattleReady。

## 后续块：休伯利安 accepted jump 与实际 teleport

目标是保留当前两次点选落点/朝向、取消、预热受击、失败不扣储备且保留冷却、成功后6s突击体验；不改UI、不新增技能或native舰船支持。本块在同一owned模块中增加accepted input、jump visual/plan、world obstacle查询和真实pose/velocity/camera offset执行，并提供Yamato对准/共享资源资格辅助；真实系统弹体spawn与hit effects仍依赖主核心。

先读来源：0.98a-RC8 `../decompiled/starfarer_obf/com/fs/starfarer/combat/systems/int.java:104–130` 的速度方向/接受落点与后续activated迁移，`advanceImpl:49–94` 的阶段相位/原位置副本；混淆controller只证明分阶段语义。当前Web `PhaseTeleporter.ts:18–59` 明确圆净空、10环×12角确定性搜索、无occupied随机fallback；`HyperionJumpTarget.ts:13–30` 使用Math.hypot的手动资格；`HyperionSystems.ts:82–107` 的onActivate按manual精确检查/AI搜索，onActive复验、真实75共享charges扣费、prevPos同步、速度×.5和camera累计。native相位/随机fallback与Hyperion改编不同，不随迁移改变。

规则与完整流程：accepted immutable point/facing在命令边保存；onActivate清旧visual，online/input/shared资源失败走原deactivate→OUT/冷却，manual不挪落点，AI仅首次搜索；onActive必须持有accepted input与plan、online和shared75空间，重新用精确落点检查live全部非fighter舰体（含hulks/phased）及存活小行星，失败仅清visual，成功先扣储备再更新serial/起终点/position/prevPosition/facing/prevFacing/velocity/sequence/camera。onAdvance失效时清input/visual并中断；冷却窗过后清visual。onReset清视觉计划，不能返还资源。缺asteroid观察fail closed。后台无头差分验证源回调；原版实机/视觉状态仍待核实。

依赖与权威：world borrowed observations来自resident完整roster，generation仍由上层确认，暂停无dispatch；所有accepted/visual/pose state加入同step rollback与恢复。无生涯存档或联机协议私自改动，生产投影由主代理接线。顺序为本策划→typed执行→actualTS onActivate/onActive/onAdvance集中对照→主核心真实event接线。验收包含manual/AI、range200/1800邻界、缺obstacles、friend/enemy/dead/phased/fighter、charge期间障碍移动、drift范围复验、输入缺失、资源被其它系统消耗、core失效/互斥、超载/排散/retreat中断、成功prev/camera/restart以及quiet/ambush窗。没有新产品取舍。

### accepted jump 实际交付

### 主代理后续任务（2026-10-08）

### 最新后续：引力世界和物理

system_world 已完成后，请实现独立 `native/combat-core/src/gravity_world.rs` 和 `docs/rust-combat-gravity-world-plan-2026-10-08.md`。迁移当前实际 GravityFieldPhysics、GravityTractor、GravityDirectionalPush、GravityDamage 及 GravitySystems 中未在 system_world 支持的 accepted输入/持续状态；保持七包已授权玩法，先读 ../starsector-core/../decompiled原版牵引/盾/碰撞相关依据，注明Web原创差异，写实质策划。常驻 typed 状态和同步 Rust Host 为真实舰体/弹体/小行星速度/资源/伤害提交，禁止每帧JS world权威/空动作伪完成。Root共享lib/state/battle/projectile/protocol与生产由主代理接，不更改。实际TS集中Node/freshWorker对照、恢复/rollback合同，未知行为明确拒绝。不递归agent/暂存/提交/发布/可见输入。完整可玩仍由主代理完成。本段优先于之前已交付任务。

请继续独立 `native/combat-core/src/system_world.rs`、`docs/rust-combat-system-world-plan-2026-10-08.md` 和集中真实 TS 对照。覆盖尚未完成的七包 accepted command/lifecycle 世界效果：Yamato 充能/真正发射动作、方舟共享资源/修理目标/无人机动作、Gloriana/Zhefeng 的发射锁与中断等。休伯利安 jump 已交付，复用该合同。先查看当前 TS 与原版来源并写策划；typed 常驻状态加同步 Rust host action，generation、RNG、顺序、失败和恢复须明确。重力物理/地形和 flight-deck 由主代理后续处理，记录边界。不得修改 lib/state/battle/projectile/protocol/生产入口，不递归代理，不暂存/提交/推送/发布/可见输入。完整可玩验收仍由主代理完成；独立模块不能宣称 fullBattleReady。

新增 `ActivationInput`、`JumpVisual`、`TacticalJump`、`JumpGate`、`JumpPose`，以及 `jump_failure/find_jump_destination`、Yamato真实角度资格辅助。`TacticalJump.on_active`直接变更mutable charges/pose，不以生成通知替代teleport；`on_activate`的false要求主核心运行实际 `System.interrupt`，`on_advance`的true同样要求该生命周期动作。accepted input与plan为独立Clone状态，普通step不由JS重传；snapshot需完整input point/origin/velocity/facing/target generation/gravity anchor以及visual serial/destination/facing/origin、sequence和camera accumulated offset。`words()`只为独立验证，不是完整恢复格式。

在原检查中增加 **70** 个manual/AI场景的 **280** 次真实Hyperion `onActivate/onActive/onAdvance/onReset`对照；Node及全新dedicated Worker均通过，aggregate各 **317,736** 严格字段、**9,040** 几何字段，零差异；scoped lint通过。Math.hypot用于手动/再检查，Vector2 scaled norm用于首次AI搜索，二者算术顺序区别已保留。测试只将fixture `deactivate`观察为待上层动作；生命周期OUT/冷却本身已在P1b核对，本新增验证不证明其完整核心接线。真实系统Yamato发射、引力world行为、完整production/recovery仍待主核心整合，ready标志维持false。

## flight_owner 后续进行中（root 接线必读）

独立 `native/combat-core/src/flight_owner.rs` 与 `scripts/lib/rust-core-flight-owner-{harness.rs,check.ts}`、`scripts/check-rust-flight-owner-module.mjs` 已落文件；scoped oxlint已通过。actual oracle 真实运行Ship/FighterSystem/ShipStepBatch，没有替换Ship.update。详见 flight-owner-plan。

**共享编译阻断已修复，actual oracle进行中**：root已补齐 `world_owner::Owned.floating` 和weapon_world的root调用，Wasm成功编译。当前发现shared fire_query.rs:166把manual q.trigger传成mount.triggerHeld，冷却挂点Rust=true、实际TS=false。实际TS query先置false，只由requestWeaponFire在reload/system检查之后置true；生产计划应传trigger_held=false让真实Rust request置位，不能用q.trigger或requested预先置位。此差异已报告root；当前没有宣称最终Node/Worker通过。

owner读源码纠正：CombatEngine.ships包含仍在bom数组的docked bomber；Recovered旧实体已移出数组不能参加下一批次。Owned分别保留retired与detached成员，Services.removed强制同步global query/batch/ordinary-craft名册；回收旧实体保留其HP/ammo/identity，ReserveFinished只移出名册，不伪造retreated/dead。Gloriana每机permission仍需主查询per-owner missile scope与queued subsets。静态模板必须按实际carrier spec及PDskill编译完整variants；unknown hooks拒绝。

flight_owner最终Node+fresh无头Worker已通过（每runtime695,730 strict / 55,340 geometry，10scenes、658比较、46真实constructor、13发射、784aim；max几何5.684341886080802e-14）。sharedquery triggerHeld源差已root修正，详flight-owner-plan/result.json。productionIntegrated/fullBattleReady仍false；继续独立phase_anchor真实hook。
