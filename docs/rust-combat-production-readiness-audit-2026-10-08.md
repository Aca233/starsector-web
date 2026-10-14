## 2026-10-09 生产页面验收接线补充

继续既定 P4/P5：现有 CombatView、CombatSession、Worker、WebGL2、HUD、模拟部署和暂停菜单直接用于 Rust 页面验收。enableWorker 可显式指定现有 backend，开发入口 combat=rust 选择 Rust；默认继续 TS，待完整验收后统一切换。该入口不改变玩家规则或布局，不引入 TS 热步回退。真实无头浏览器独立 profile 通过实际键鼠事件、部署/暂停/地图/继续及结果操作检查 ACK、画布、资源和页面错误；仅控制新建 headless 浏览器，不占用户桌面。13 配装逐一用原渲染器准备资源并输出同分辨率画面，纯投影不得包含执行 Ship。音频检查真实文件解码与原 sound 路由，浏览器声音不证明用户设备听觉。最终可玩证据与当前源码/Wasm 指纹绑定，缺项仍保持 readiness=false，不以截图代替规则/结果对照。

# Rust/Wasm 生产接入与可玩验收：现状审计及 P4 策划

2026-10-08；对应总策划 P3 能力闭包、P4 生产接线和 P5 可玩门槛。目标沿用用户的“全部做完，能正常游玩再停”，不把领域测试完成或两个无特效舰体能互相扣血视为完整交付。本文件只审计与策划，没有启用生产后端。

## 目标、体验与边界

玩家继续从现有模拟、舰队遭遇和 LAN/Steam 房间开始战斗，使用相同部署、驾驶、选组/自动开火、目标锁定、升盾/相位、排散、技能、战术图、召回/撤退、暂停、恢复和结果界面。Rust 是现有权威 Worker 内的实际规则所有者；输入和呈现不会获得第二份可变权威。保持七个内置包和当前已授权 Web 规则，不借迁移调整射速、资源、伤害、AI 或原版差异。

本块范围是开战能力检查、一次性静态安装、权威命令/步进、显示与声音投影、结算以及同构建恢复的完整生产链。它依赖 Rust 已完成所有当前场景实际需要的规则。未迁入能力不能通过 TS 热求解回调、每步导入旧 Ship/Projectile 状态、空事件或关闭特殊装备来填补。纯展示可以继续 TS，但必须消费明确的 Rust 发布状态/事件；涉及核心 RNG、伤害、生成、目标选择或资源的逻辑归核心。

本次不新增 UI，不做生涯规则迁移、存档 schema 改动、新发行包、发布、提交/推送，也不控制用户桌面。浏览器与 Electron 共用 Rust/Wasm、限定几何舍入和规则严格一致均已确认，没有新的玩家取舍待批准。

## 原版证据 → 预期 → 当前差异 → 验证

来源版本沿用本机 0.98a-RC8（`../starsector-core/starsector.log:1`）。本次读到：

| 原版文件与位置 | 预期行为 | 当前迁移差异 | 验证方法 |
| --- | --- | --- | --- |
| `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipCommand.java:3–29` | 转向、横移、加减速、选组、自动开火、FIRE、VENT、升盾/相位、召回、系统保留同类操作 | Web 还有战术图、模块输入、引力按住和跃迁落点流程；迁移合同是其现有实现，不从 API 推断快捷键或 UI | 对照实际 `CombatControl`、`PlayerControls`、`CombatCommands`、模块输入和生产命令回执 |
| `CombatEngineAPI.java:50,63–70,90–100,157,330` | 舰船 roster、移除、舰队管理、暂停、真实伤害/实体生成和结束是模拟事实 | 目前 Rust 仅开发域，生产 TS 仍持有这些世界事实 | Rust 完整步、实体生成/回收、实时伤害/死亡、暂停和结束对照；生产导入链核实 |
| `CombatFleetManagerAPI.java:31–63,74–93,116,158` | reserves/deployed/destroyed/retreated 独立；部署额度和真实出击不能由画面猜测 | Web `CombatDeployment` 已有预算、自动补波、阵营和撤退规则，Rust 尚未接其完整权威事实 | 真实 reserve→deployed→retreated/destroyed 转换及一次性结算 |

原版 API 证明接口语义，不证明线程、Web 数式、界面布局或取消行为。没有本次相关原版截图/实机操作证据，且用户不许可占用桌面，因此原版视觉/实机等价保持待验证。现有布局不改，Web 生产可玩验收可以无头完成。

## 当前生产链和缺口

审计时 root 正在增补 P2，Rust 域布局可能继续变化。可玩判断不得依赖本文件中冻结的临时 ABI 数值。当前明确事实是 `core_full_battle_ready()` 返回 `0`，`RustCombatCore.fullBattleReady` 为 `false`，绑定拒绝以完整核心身份装载；生产入口未导入这个绑定。

| 当前入口/合同 | 实际依赖 | Rust 接入要求 |
| --- | --- | --- |
| `LocalCombatKernel.ts:47–62` | 安装内容后直接创建 `CombatAuthority(new CombatEngine(...))`；AI、舰队和系统均 TS | 开战前异步私有候选创建/准入，固定一个后端。静态内容可经现有编译器转换一次；普通步不重建 TS 模拟对象 |
| `LocalCombatKernel.ts:70–141` | epoch、部署准备 revision、防重入、控制、`stepScheduled`、遭遇结算 | 保持已接受 sample 的复制、部署/tick 屏障、单次提交、关闭/取消与 epoch 语义。不要仅令 `stepScheduled` 在 TS 步后额外调用 Wasm |
| `local-combat.worker.ts:24–84` | 严格 epoch/sequence、fresh Worker 恢复、TS kernel、encoder、声音、telemetry、witness/outcome | 一个 Worker 只实例化一个后端；相同消息序号/ACK 驱动 Rust 实际步。发布/音频/结算在完整步之后一次产生 |
| `CombatPresentationEncoder.ts:35–73` | `capture(CombatEngine)`；查询 TS 舰船、HUD、战术图、部署、武器范围、visual layers | 增加接受明确 `DetachedCombatPresentation` 的编码入口，复用已有 graph/delta/packed visual wire。Rust 发布直接填充显示类，不用 `new Ship`/`new CombatEngine` 恢复模拟图 |
| `ProjectedRenderState.ts` | `ProjectedRenderShip/Weapon/System` 不继承模拟类；仅纯显示查询 | 可复用这些纯显示 facade、Vector2、immutable dictionaries 与渲染器；保持实体身份、carrier/module 关系和插值前态 |
| `CombatHudProjector`、`TacticalMapView`、`DeploymentView` | 来源仍是 TS 只读接口，但内容包括完整操作所需字段 | 从 Rust 权威字段形成同一只读 DTO；不能以空 HUD、全部 available=true 或旧主线程 engine 值补齐缺项 |
| `CombatHandoff.ts:17–39,104–181` | persistent fleet 绑定 TS Ship；真正 roster/armor/ammo/CR 捕获 | 结算读取 Rust 权威 roster 与持久成员绑定。保持未出击 reserve 原记录、transient 排除、损毁/退场状态、CR 待扣与单次 outcome。显示投影不是结算来源 |
| `CombatReplayCheckpoint.ts:10–54`、`LocalWorkerHost.ts:145–163` | format 2、22 数值 witness、固定 build/protocol/content 门槛 | 显式增加 backend/rules/Wasm build/capability 指纹并同步生产者/消费者；ACK 后日志才能恢复，fresh 候选核对后替换。不自动把旧 TS checkpoint 认成 Rust |
| `network/host.worker.ts:135–137,497–520,649` | 独立 `CombatAuthority`/CombatEngine，LAN/Steam 都走此路径 | 本地 Rust 接线不会自动覆盖房间。host 的席位权限、输入排序、tick、投影、报告、IO/recovery 屏障同样替换 |
| `AuthorityCombatSnapshot`、`CaptureCriticalCombat`、`CaptureProjectiles`、`CaptureBattleReport` | 当前签名/采样仍依赖 TS 模拟对象/组件事件 | 从 Rust 只读发布形成当前协议或同步升级协议；不用客户机投影写回 authority，不由 droppable snapshot 重建结算 |

`OwnedCombatSession` 包装 `LocalCombatKernel` 并做 TS modifier admission/cache；它不是现成 Rust 战斗实现。`hostCapability()` 证明可信 TS 宿主已注册回调，不证明 Rust 已迁移这些回调。

## 实际七包闭包清单

本次用 esbuild 在内存中加载真实 `CombatEngine` 注册、`bundledShipPacks`、`shipPackCapabilityRequirements` 与 `validateShipPack`，执行真实装配编译；没有创建战斗、跑测试套件或修改内容。得到七包 **13 个 authored fits、24 个舰体/模块/飞行器定义、32 个包内武器定义**。这些只是目录数量，不是 Rust 覆盖数；跨包/宿主装备和运行时生成还会增加闭包。

| 包 | fit 数 | 现有真实规则闭包至少需要 |
| --- | ---: | --- |
| 烛渊 `foundry.zhuyuan` | 1 | Eclipse 的幅能依赖修正/AI/操作、星针；装配依赖休伯利安武器，不能仅走本包一件武器 |
| 荣光 `foundry.gloriana` | 2 | 12 定义的模块/飞机家族、模块 propulsion/command 继承、void shield、edict/module buffs、装填/flightline/heavy ordnance/减爆/应急结构、fighter/bomber 补机与 rearm、实际导弹/近炸、siege hit/穿透 |
| 休伯利安 `foundry.hyperion` | 3 | reactor/field repair/Yamato focus、Yamato 捕获/执行/真实发射/impact、跃迁目标/阻挡检查/失败中断/取消和后态；共享有效 stats 不每步由 TS 回调生产 |
| 亚顿方舟 `foundry.adun-ark` | 1 | 模块/输入继承、工程段失效机动/充能、共享太阳能/互斥 forge/barrier/repair、solar core/fast matrix、飞机 wing/补机/rearm、lance 穿透导弹/被毁战机/terrain 的即时资源成本 |
| 罗西南特 `foundry.rocinante` | 2 | attitude/fire control、interception matrix/PDC magazine、实际 physical recoil + compensator、普通 native hullmods、两类 rocket 完整 guidance/命中、railgun 穿透和 terrain 预算 |
| 折锋 `foundry.zhefeng` | 2 | 三阶段 commutator、split capacitor/assault rack/steady firecontrol、对应 ammo/flux/stats/AI/故障和操作后态 |
| 万有引力 `foundry.gravity` | 2 | battle well/repulsor/directional push、tractor/self-tow/释放/锚点、projectile capture/校准、`gravityDeflector` 和 `gravityCoupling`、terrain/舰船/弹体实时相互作用；tractor 不生成假弹体 |

登记项最低集合来自 `shipPackCapabilityRequirements`，但此函数只查 `system/hullmod/effect/behavior` 的字符串引用。**隐式规则数据**（例如 gravityTractor/Deflector/Coupling、terrainPenetration、proximityFuse、missileLifecycle/MIRV、modules、void shield、机翼）也必须独立登记到 Rust capability schema；不能因为没有 JS effect 字符串就判定 data-only 可用。

实际准入递归对象是本场已经选择的 `ShipSpec` 与可部署 reserve、modules、wings/craft specs、所有已装 mount 和 dedicated system launcher、当前 captain skills/hullmods/Smods、系统/hullmod/effect 可生成的舰船/投射物/空雷/持续效果。候选配装必须按现有真实编译器展开，补查包外宿主武器与可信生成器元数据；未知/被替换的回调不继承可信证明。仅把整个 pack catalogue 泛扫一遍既会漏依赖，也可能错误阻止未使用能力。

开发期显式选择 TS 或 Rust；只有完全准入的场次可以用 Rust。自动选择在开战推进前因 Wasm/CSP/ABI/未知扩展失败整场选 TS，记录具体原因；首步之后后端固定。已知七包或冻结混编场景大量回退意味着 P3/P4 未完成，不计可玩或性能成功。后续部署也必须预先验证闭包，在原命令边界一次拒绝不支持配装，不能先花 DP/改 roster 再拒绝。

## 规则、操作状态和失败流程

1. 玩家沿原流程选择模拟配装/遭遇/房间；在现有 loading→loaded 阶段验证 content、闭包、Wasm/build。准备的私有实例不发送可玩 frame，不部署双份阵营。取消/关闭/切换/内容 revision 改变销毁候选，保持原回执。
2. 批量规格/初态安装一次，保留 generation 和语义 roster 顺序；Rust 生成/回收/出击/分离以后由内部规则更新，宿主只发送具名修订。stat 生成、AI、fire/flight/命中不能从上一显示 frame 上传。
3. 每个 `CombatControlSample` 属于一完成步；玩家 autopilot 在图表/焦点 blocking 下的原规则保持。手动阻挡释放模块 firing 和引力 held，鼠标 steer/target/选组保持原资格。暂停命令可以变更允许的控制状态，但不得增加规则时间或随机游标。
4. 系统 command 接受 aim/facing/target 的原子快照，跃迁失败在消费费用前回绝。UI 发来的 range/cost/伤害不可成为权威输入。战术/部署命令在现有 pending tick 屏障中执行，限额/阵营/重复与旧 epoch 拒绝。
5. 一个完整步提交后更新 tick、publish、audio/FX、telemetry、ACK 和必要 settlement。ACK 只允许一次事件消费；重复发布/读取不能扣费用、消耗 RNG 或生成实体。memory grow 使旧 typed view 失效时由绑定重取。
6. 节点死亡先写死再递归处理 assembly；ship explosion/chain reaction 与其 RNG/生成同步执行，整步命中完毕且自动 reserve 补波后判断胜负。不得以 hullHp<=0 立即结束，跳过同一 tick 的双杀、殉爆或后备舰队。
7. 结果沿现有 readiness（当前 ship 爆炸表现尚未结束时等待）呈现；后战 aftermath 保持观察与漂移，combatTime/RNG/伤害/资源/胜負/统计冻结。持续查看或重复 collect outcome 不能再次写结算。
8. runtime trap/协议错误终止当前不确定事务，保持最后已确认 frame；不重试半步，不从显示恢复到 TS。现有 paused/failed UI 呈现错误与恢复机会。fresh 候选重放确认日志，完整指纹和 witness 核对通过后原子替换，失败保留原 paused world。

界面区域、快捷键、悬停/选中/disabled 状态和关闭/取消行为保持现有组件；不新增后端选择产品页面。工具/diagnostic 必须能够证明实际后端、完整 capability 版本、TS fallback 原因和完成步，不只报告字符串 `worker-render`。

## 联机、并发与存档

本地 Worker 的单事务 sequence/epoch 和 ACK-only journal 保持。LAN/Steam 的可信 host 选择、席位所有权、room revision、过期 input、幂等、撤退权限、部署 budget 与 snapshot/direct IO backpressure 保持；客户机只得到只读副本。Rust 内存和 domain damage command 不进入网络客户机 API。显示数据可能被丢帧，但命令 ACK、死亡/生成/结算事件不能因此丢失或重复。

不改生涯 SQLite/schema；遭遇 settlement 捕获 authority 并匹配 encounter ID 与待结算状态。恢复必须区分 TS/Rust、规则/Wasm build、protocol 和完整 content/capability closure；普通 save/checkpoint 不存裸 Wasm memory，不使用 RenderFrame 当 checkpoint。旧 TS 回放跨 backend 兼容不作隐式承诺。

## 依赖与实施顺序

| 交付阶段 | 进入条件与实施 | 门槛 |
| --- | --- | --- |
| A：闭合真实 core | 完成 P2/P3 所有需要规则，尤其 AI/fire 的实际决策、全局 barrier、world destruction/reserve/stat、七包可生成闭包 | 独立域/完整同场规则对照通过；未知功能仍明确拒绝 |
| B：生产 adapter | 独立纯数据 kernel 接口；静态编译与配置、batch command、Rust step、呈现 DTO/音频/结算 | Worker 无 TS 热 solver；持续多步无全世界 reimport；显示 facade 可复用 |
| C：本地生产链 | 在原 local Worker factory 选择后端，保留 init/commands/step/restore envelopes 和 UI contract；更新指纹/replay | 实际页面 loading、deploy、驾驶/命令、暂停/恢复、结算通过 |
| D：LAN/Steam | 共享真正 kernel authority；替换 host capture/report 数据来源，保持权限/IO/recovery | 双 peer/重连/授权拒绝/结算，无客户机伤害写权 |
| E：集中验收/性能 | 冻结两臂与场景，运行必要覆盖和一次 ABBA；生产 telemetry 证明 Rust | 可玩、规则、完整权威步/交付链与尾部门槛同时通过后默认启用 |

静态有效 hullmod/技能计算可以留在可信内容编译器一次执行；依赖 live owner/assembly/flux/lifecycle/世界/后坐力的 modifier/advance 回调必须迁入 Rust。呈现功能可继续 TS，而 consume event 的 RNG 与状态必须在固定合同中，不能把表现随机抽样偷偷移出造成两条游标不同。

## 最少必要集中验收

以下按完整块集中执行；只对具体失败定向复查，不默认全 suite，不反复启动浏览器。不把下面案例写成已通过。

| 场景/检查 | 必须观察的事实 |
| --- | --- |
| 真实 production module Worker + 同步 authority 配对 | 内容/seed/input 一致；AI target/memory、mount fire/timers/ammo/flux、投射物/beam/contact、装甲/HP/组件、RNG、生成/回收/death/stats/reserve/outcome；resource/timer/decision 严格，限定 geometry 差异留记录 |
| 冻结 22 主舰/20 AI 三舰混编及七包 13 authored fits 的闭包 | 实际 Rust 准入与运行；装备、特殊能力、模块、飞机/补机与 terrain 没有删减；不接受 TS fallback 成功样本 |
| 实际页面可玩 | 页面原入口→loaded→部署→驾驶/鼠标 steer→目标/组选切→开火→盾/相位/vent/技能→战术命令→暂停/释放→恢复→撤退/胜负→结果。新无头浏览器，不用用户桌面 |
| 特殊关键操作 | Hyperion 有效/无效跃迁、Yamato；Gravity 抓/自牵/松开/按住/推送/偏转；Gloriana 广侧/void层/受损 propulsion/飞机；Ark 共享供能互斥/工程段失效/修复/召回；Zhefeng 切换；Rocinante 近防/火控/physical recoil |
| 生命周期和结算 | reserve 自动补波、双杀/殉爆、撤退名册、result readiness、aftermath 冻结、capture/outcome exactly once。使用临时遭遇数据，不改用户持久存档 |
| 权威事务和恢复 | 同步/异步重入、部署 pending/content revision、close/cancel/restart、stale epoch/generation/seq、错误批次/步、memory growth/view、重复发布/ACK；fresh Worker 由确认日志恢复及错误 backend/content/build 拒绝 |
| LAN/Steam 共享 host | 实际双 peer 输入/权限/确认/显示；join/reconnect/过期命令/非法部署拒绝和报告。保留当前 Steam transport 配置，不以离线 DTO 当联机通过 |
| Wasm 生产资产 | 正常 Vite/browser 与 Electron 的资源 URL、CSP/ABI/同构建指纹、取消和初步 fallback；后台检查不启动可见 Electron 窗口。未做实际 Electron Worker 的部分如实标注 |
| 一次配对性能 | 冻结当时 TS/Rust 两臂与相同真实场景，完整步含 input/rules/commit，宿主链含 publish/capture/encode/IPC；ABBA 全样本均值/P95/P99、步率/债务、实际后端/closure 证据。领域时长不能回答游戏提速 |

必须对生产 bundle/导入图确认 Rust admitted 场次没有调用旧 `CapitalShipAI/AutofireController/ShipWeaponControlSystem/WeaponSimulationSystem/CombatEngine.fixedUpdate` 或其它 TS hot solver；展示类和静态内容编译器导入可以存在，但不能在步进中执行模拟。所选场次若调用 unknown runtime generator，整步报错而不是忽略。

## 本次交付和待核实

已完成：生产文件静态审计、原版 API 核实、真实登记内容与 13 个配装的元数据编译、七包最低隐式能力清单和本 P4 方案。没有改动功能代码、启用 Rust、运行真实战斗或可玩/联机/性能验收；没有新测试工程。

待完成：P2/P3 完整能力实现、Rust kernel/factory/显示/音频/结算与 host 接入、恢复版本/指纹、真实生产无头游玩和联机、同场全规则差分及完整性能。原版实机/视觉和实际 Electron host 证据未完成时分别报告。所有这些缺口闭合前，保持“开发中”，继续用户授权工作。

## 2026-10-09 实际 GameSession 写回验收

既有 fleet Worker 对照只证明原生 outcome 与源码相同，尚不能证明页面 owner 只保存一次。扩展现有 player-flow 的 game-session 模式：真实 GameSession 加载有效的战前存档与受损敌舰遭遇，使用独立内存存储避免读写用户存档；沿实际 CombatSession.prepare、Rust Worker、控制采样、BattleCompleted 订阅和 GameSaveStore.save 完成战斗。核对结算后 revision、完整舰队状态、后备保留和单次存储写回，再继续观察与重新读取证明不会重复结算。不得手动调用订阅回调、直接设置胜负或伪造 outcome；该持久受损场景仅验证写回，完整七包战斗另行验收。
