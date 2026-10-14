# Rust 整场战斗权威接线方案

2026-10-09 战后弹尾修复：真实 SourceProjectileLifecycle.initialize:22–23 为所有 hasSource 弹体初始化 tail，ShipWeaponControlSystem:1376–77 还为无 source 的 BALLISTIC 初始化。BattleAftermath:25 按 tail 实际存在推进，而 native 仅 source 且非 PLASMA，漏两类。使用已准入相同存在条件（delivery.source 或 spawn_type BALLISTIC）；与纯发布投影相同，不修改几何容差。

2026-10-09 持久遭遇开场声音：真实 LocalCombatKernel 先普通 CombatEngine 构造，再 CombatHandoff.deploy 重新开始遭遇，因此会发出两次 comm_radio。最终电台名册只保留最后一条，不能从该名册推断声音数量。trusted cold compiler 捕获实际有序 CombatAudioEvent 并随 startup 安装，由 native 完整验证并保留，原 legacy/LAN 未提供该证书仍沿一次 comm_radio。无热步 TS 回调、无额外 RNG；真实持久 Worker 对照开场声音并验收至结算。

2026-10-09 表现修复：Gloriana71 的八团烟雾来自 ProjectileCollisionHandler.ts:315–334 的近炸工厂，native explosion_effects 已真实采样并输出 Smoke，但 combat_visuals.capture 遗漏该类别。直接捕获原位置、速度、寿命、尺寸与旋转，固定 maxLife1.1/alpha0.85/color[42,40,44]，不再次抽样。BattleAftermath.ts:30–33 每次弹体退休还会 detach 原尾迹；native 退休循环补相同 detach，保逆序与其余观察推进。按原持续场景集中核对全部 FX、RNG 和结算。

2026-10-09 结算后观察修正：实际 BattleAftermath.ts 在冻结规则/RNG/战斗时间后仍推进真实 FX 浮字、hulk、镜头衰减和尾迹；native 提前返回遗漏 floating/hulk/shake，Roc2472浮字姿态首先暴露。保原自身aftermath计时及舰/弹/光束coast，不调用combat碰撞/伤害/AI；scene result 分支追加相同 advance_floating、hulk_stage 与 decay_shake 并保源FX更新顺序。检查真实death后所有FX、outcome稳定和恢复，不调整结算/存档结果。

2026-10-09 小行星性能补充：实际 AsteroidSystem.ts:157–192 在完整舰船 hull contact 前使用 conservative radius。native resolve_asteroids 对每颗小行星每艘舰先构造完整 live modifiers/phase/topology/hull；诊断为6.2ms。新增 terrain Host.ship_near_circle，默认仍完整读取；实际 owner 只在当前姿态、hull最大顶点半径和真实开启盾半径+偏移证明分离时省完整构造。每对现场重读，固定小行星推舰和前舰推小行星后不能复用位置；保原循环与 narrowphase。无新规则、UI、存档或权限，相关源码/整场验收集中一次。

启动顺序补充（2026-10-09）：一次性 trusted compiler 直接执行实际 LocalCombatKernel/CombatHandoff 构造与部署流程，并投影最终冷启动的真实 Ship、FighterSystem、RNG、地形和电台。这样持久状态、模拟器重新初始化联队及 additionalShips 交错出生沿用实际源码，而无需重写近似构造顺序。该 TS 冷启动所有者只在编译边界存在，从不 step 或接受玩家命令，编译后立即 dispose；生产热步、命令、生成、结算均由 Rust 执行。编译产物记录实际最后 RNG 与已分配的启动电台 ID；native 安装不能再抽一次 ID。动态准入仍需在现有 Rust 世界内完成并事务加入，不重建活跃世界。本补充保留已有批准的 Web 行为、后端范围和严格决策合同，无新增产品取舍。验收直接比较冷启动源码与 native 安装，随后继续整场实际 Worker 流程。

生产入口实施补充（2026-10-09）：新增 RustCombatKernel，异步装载同一 Wasm 并只保留编译字典与 Rust 权威；Worker 保持一个事务、epoch/sequence、已确认历史重放和 detached 编码入口。首发姿态、主舰身份和默认配装来自 CombatEngine 构造器，完整初始化依次为舰船/舰载机、地形、HQ 通告；地形读取 StandaloneNebulae 的实际完整图定义，不抽额外 RNG。普通初始化、持久出击、动态补舰分别保留各自原构造顺序，不重新构造正在战斗的世界。舰载机出生的 read/prelude 元数据与 allocator 在同一事务准入；喷口读 prepare 的 listener 前基线及 integrate 的 recoil 前快照，插值读 deployment listener 后姿态。发布保留场景浮字与电台，声音保留至成功发送后显式确认。回放记录所选后端及实际 Wasm 指纹，恢复不能跨构建或后端。后端在整场源码对照、真实无头 Worker 的部署/操控/暂停/撤退/结果/恢复与内容覆盖验收前保持未就绪。现有界面操作、确认和失败文案不变，无新增产品取舍。

完整读取接线补充：在既有数值快照之外发布独立、版本化数字记录，直接读取同一 Rust scene/world/flight 的部署状态、实际名册、命令、结果、死亡通知和暂停边沿音频；静态名称、资源和描述只从一次性编译字典绑定。视距基值和武器维修倍率以 startup tags186–188 完整准入，生成舰船沿用相同 metadata，不在展示端复算规则。纯读取不得改变任何 RNG、生命、资源或计时；publication 缺少 metadata、句柄不一致或不完整类别必须报错。生产 Worker 保留现有 epoch/sequence 和 ACK-only replay journal，恢复使用相同后端与内容，真实重放隐含状态并核对 witness；不从 RenderFrame 恢复战斗。验收包含初始与生成实体完整读取、暂停命令音频、撤退/结果和新 Worker 重放。

整场队列实施补充：本次按 `CombatEngine.fixedUpdateStages`、`ShipStepBatch.execute` 和 `Ship.prepareStep/integrateStep/finishStep` 的实际顺序接独立 `scene_runtime`。预 tick 使用原始 dt；玩家时间技能只缩放世界 dt。AI 根舰按敌舰、增援的实际次序后接模块，手操模块在各自 AI effects 后恢复；仅外部席位及手操主舰排除 fleet 分配。ordinary 更新、wing deck/fighter/bomber、drone 在收集阶段捕获各自目标、火控名册、导弹与 dt。执行全部 prepare → 全部 motion 与模块同步 → 全部 weapon-state → 全部 fire-query → 每舰每挂点有序 commit → 全部 finish → wing receipts。早捕获名册允许保留后来退场或回收的实体，预算和世界物理仍用即时参战名册。整场事务包括出生 slot/generation/ID/order 和全部领域/RNG；任何失败不提交。护盾在 motion 屏障实时读取同一 query aim，保持防御朝向独立字段；不改变玩家交互。验收以实际持续混编战斗的 source 对照及 production Worker 全流程为准；编译、孤立领域和 DTO 通过均不代表整场可玩。

2026-10-09；执行已授权 P4 和“全部做完，能正常游玩再停”。本块保留现有 Web 规则，不增加产品取舍。

目标是把后备舰、部署额度、撤退、战术命令、指挥点、胜负和战后观察放入同一个 Rust 事务。玩家沿用当前加载、部署、驾驶、战术图、撤离和结果界面。纯展示读取权威事实；不重建可变 TS Ship，也不在热步调用 TS 求解器。

原版版本 0.98a-RC8。已查看本机 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatFleetManagerAPI.java` 的 reserves/deployed/disabled/destroyed/retreated、max/current strength、spawn/remove，以及 `CombatEngineAPI` 和 `ShipCommand`。原版接口确认名册与命令语义，不能证明 Web 数式、线程或界面状态。本块移植依据是实际 `CombatDeployment.ts`、`FleetCommandSystem.ts`、`TacticalControl.ts`、`CombatCommands.ts`、`PlayerControls.ts`、`CombatEngine.fixedUpdateStages/updateOrderCompletion/endBattle` 和 `BattleAftermath.ts`。原版画面/实机待核实，不操作用户桌面；本块无 UI 布局变更。

部署逐队核对实际 DP、首发名单、额度和已有状态，所有入场位置成功后再改 pending 并创建舰载机；失败整批回滚。reserve 在战斗开始即构造并保留 RNG 顺序、实体身份与持久状态，但不进入实际查询/AI/物理队列。默认额度240， simulator 使用实际配置，边界6000、入场256尝试、间距和位置公式保持 source。每5秒仅自动阵营补波；无在场舰的队伍按原序自动呼叫可负担 reserve。空间站不能撤退；全队撤退可以撤销 reserve。退场同步中断/释放输入，保留最终场内位置。

战术图和命令在现有 tick 屏障执行，包括暂停时的边沿命令。所有权、队伍、可见性与目标资格先校验，再消耗 CP。初始5点，120秒恢复1点且无上限。全舰命令覆盖友军单舰命令，护航组只扣1点。取消不退 CP，反馈、文字与电台保留实际 visual RNG 次序。**本次源码核实的主舰/全舰航点完成半径是90**（`updateOrderCompletion`），不采用旧摘要中的75；舰载机保持其独立规则。

死亡、连锁爆炸、空间站最后 vital 模块和自动部署处理后才裁定胜负。一次结果捕获实际时间、规格、结构比例与统计；持久结算仅从权威状态提取且只交付一次。结果后的观察仅漂移/消亡已有表现，combatTime、规则 RNG、资源、伤害、AI 与统计冻结。ship 爆炸表现尚未结束时结果保持待显示，不用领域 explosion 对象假冒视觉结束。

联机复用相同 scene/kernel，保留席位权限、epoch/sequence、部署 revision、ACK 和幂等。旧 TS checkpoint 不隐式跨后端恢复；本块不修改生涯存档 schema，不暂存/提交/推送/发布生涯代码。

实施顺序：一次性 metadata 与 scene authority → 真实 allocator / generated-domain admission → 全局 AI 与每舰队列的 state/motion/query/commit/finish → 部署/战术/结算/战后 → native facts 与纯展示/音频 → local Worker/replay → LAN/Steam → 集中真实生产游玩与差分。新增模块在生产安装完成前保持 fullBattleReady=false。

验收集中一次，针对实际 source 配对：首发/超额拒绝/多舰入场阻塞回滚、补波、单舰及全舰撤退、station拒绝、CP恢复/护航/取消/90半径、双杀与station collapse后胜负、结果 exactly-once、战后 RNG/资源冻结。再用新无头生产 Worker 验证加载至结果和恢复。已有无关领域不重复测试；失败只定向复查。当前仅策划与源码核实完成，功能和生产可玩未验收。

共享运动接线补充：连续 AI 对照发现 Roc 姿态技能仍产生平移、模块转角使用了自由舰运动分支。依据 `Ship.prepareStep:952`、`integrateStep:1046`、`syncModulePose:141`、`updateMotion:1118` 及 `ShipSystem:125–135`，新增一次性运动 metadata（tags166–168），明确原始 station/独立旋转/轴向自转/继承母舰推进指令与原始转速参数。prepare 保留同步前插值姿态，motion 屏障逐队列再次同步母舰瞬时姿态；station/attached 模块仅按源码转向，不额外平移。自由舰按已安装的完整 controls 和 runtime disableMotion/过载门控；不改变输入、时钟、RNG 或规则。未知自定义 motionControl 仍须明确原生实现，不猜默认。验收复用当前失败的真实连续 AI 场景，集中对照普通舰、姿态技能、固定模块、独立模块和 station；metadata 部分安装/重复/未知 handle 失败回滚。

手操与边沿命令接线补充：已读取 0.98a-RC8 `ShipCommand.java` 和当前 `CombatControl.ts:45–107`、`PlayerControls.ts:8–59`、`ModuleFireControl.ts`、`CombatCommands.ts:71–147`、`CombatTargeting.ts:26–74`。原版 API 确认数字转向/推进、武器组、排散、防御和召回命令；实际 Web 来源决定当前控制布局、目标与模块交接。新增 `scene_control.rs` 消费唯一 tick sample（165），自动驾驶在世界时间缩放前独立 AI phase，地图/blocked 时仍自动驾驶；手操 W/S/A/D/Q/E/Shift/X 保现有 mask 顺序，失焦指针仅停止鼠标转向/射击，不换 A/D 布局。自动驾驶切换同步真实 MANUAL/AI、模块释放、locked playerTarget 与 held；目标选择使用实际 active roster 的 hull interior/edge 比较。边沿命令在暂停时执行，失败返回实际原因/反馈而不推进时钟。后续整场 source 对照集中包含控制、模块、暂停、自动驾驶与输入恢复，不新增交互。

整场前置观察及模块存活补充（2026-10-09）：原版0.98a-RC8 `ECMPackage.java:14–24`、`NavRelay.java:14–24` 确认1/2/3/4 ECM和2/3/4/5导航；`SharedFluxSink.java:22–23,42–95` 确认损失模块50%耗散向存活模块分配并20%作用于硬幅能，原版保持初始缓存而当前Web逐帧读取hullStats。本次保留实际Web规则：`CombatVisibility.ts:18–37` 为用户已定的全距离公开，死亡/撤离/停靠仅对敌队隐藏，本队可见；`ElectronicWarfareSystem.ts:4–19` 按实际active顺序累加，非战机/非挂接/非STATION_MODULE供支援，停靠与HP0未死亡仍参与，敌方最高惩罚而非叠加，导航只改最高航速。`CombatEngine.ts:846–847,986–995` 在AI前更新可见性与EW，武器前按capital preorder计算shared_flux_sink；`Ship.ts:883–887` prepare用实际模块bonus追加baseDissipation/hardFraction；`CombatEngine.ts:1213–1219` 死亡sweep后空间站全部vital模块消亡才将rootHP0并真实destroy。

独立 `scene_prelude::Owned` 由root完整Clone拥有，tags176–178一次安装全部静态metadata（含空集语义），179–182保留；动态visibility/nav/ECM/module共享状态不得JS每步上传。流程为 `observe(active)`→AI，`shared_flux(capital)`→逐队列 `prepare_ship`→物理/武器/死亡sweep→**按capital顺序即时 `is_doomed(root)` 并同步真实destroy**。前root爆炸可能改变后root判定，不缓存候选清单；`doomed`仅保只读inspectAPI。静态flags只明示STATION_MODULE/isCombatModule/shared_flux；station/vast/topology从已安装实际authority读。失败为stale/重复/未知/部分安装或非有限metadata，整场事务回滚；reserve保metadata但不参与active支援，death flags与HP判定严格源区分，拒绝以假docked/dead伪造。无新UI/规则/存档/联机操作，继续原控制流程。验收直接actual updateCombatVisibility/updateElectronicWarfare、真实构造shared module树及source death prerequisites，覆盖多队/high team、模块/战机/docked/HP0/dead/retreat、敌支援损失、nav20上限、零与不等耗散分配、全vital毁灭/非vital/vast保留、Clone重复与失败回滚；root集中生产验收，原版实机待许可。

2026-10-09前置块正式域验收已完成：`node scripts/check-rust-scene-prelude-module.mjs` 在Node及全新无头 Chromium Dedicated Worker运行22真实Ship×7phase，直接actualVisibility/EW并动态抽取CombatEngine共享耗散/vital源码作为oracle，真实prepareStep(0)，21stage/13,916strict零差异，7stage rollback、7malformed/repeated startup rollback、1actualCore+preludeclone；Worker windowAbsent=true。构建4,016,377bytes，SHA256 `35689568b3b405d804a3de31feaddd7f3803e8a7820fb1b0d644160096d52c2e`；全部native及fixture/owned TS源码指纹在 `artifacts/rust-combat-core-20261008/verification-scene-prelude/result.json`。这只证明前置域及准入/clone，playerFlowReady=false；真实逐station destroy、整场scene队列和生产可游玩仍由root集中验收，后续共享源改变应按影响定向验证。

动态准入实施补充（2026-10-09）：普通 addShip 和模拟器整波提交在现有 Rust Core 中追加经 trusted compiler 认证的静态模板，不重建活跃世界。静态模板/生命周期字典先在同一草稿中解码，Rust 核对两队预算、初始阵型/后续入场位置、真实 nextId 和 primary enemy，再按源码次序构造完整舰树、建立 AI、加入 carriers。首波 enemy_ship 保持源码稳定名，旧空模拟器 sentinel 保留为不参与查询的元数据实体，以新敌舰作为唯一 scene enemy。ID、slot/generation、static/spec字典、scene、born元数据、两套 RNG 和 carriers 一起成功才提交。JSON 使用现有有界UTF16 parser，tags198–200为请求头/chunks/finalize；197仍为预算调整，201之后保留。展示字典仅在准入成功回执后合并；失败不污染内容或活动世界。静态构造样本不从正在运行的权威取对象，不推进其 RNG。原版 API / 当前 addShip、deploySimulationFleet、DefaultShipFit、DeploymentControl 是本块对照来源；无新玩法或UI取舍。验收包含成功增援继续战斗、双方超额零变更、首波名册、carrier构造/RNG序、命令合法拒绝、新Worker完整恢复和结算。
持续交火修正（2026-10-09）：实际 CombatEngine:999–1001 和 ShipWeaponControlSystem:618–622,689–713 证明现有 multirate/large-battle-v3 的自动瞄准采样资格不可省略。scene 在真实 postmotion/firequery 屏障按 dt>0、AI、主玩家完整assembly排除、root AI、fullRate/external集合、非FIGHTER和非missile/guided计算；v3只允许small/medium TURRET，编译静态sampleHz20资格，不从sizeScale（PD可能large）猜。系统autofirePolicy存在时禁采样，tracker切换由已有原生FireProgram保source reset/RNG。此次不调整 cadence 数值、射速或玩法。连续七包真实step/audio/ordnance对照负责验收，不把12tick短场替代交火。

持续交火现场读取修正：实际 BeamSimulationHandler:159–160 在每条光束处理时读取当前舰船/母舰伤害与系统倍率，前一条光束可能已经改变后一条发射舰的 flux。battle 的 beam loop 每条先读取真实 system_owner::modifiers，不能沿用 prepare 的缓存，也不能冻结整条循环；乘法次序和原伤害规则不变。实际 terrain/shipCollision 在 projectilesBeams 前会推动玩家，音效 listener 在这个屏障刷新，已有发声事件保持当时姿态。ModulePropulsion 的静态槽位来自完整冷 system_read，在 tag193 后绑定 motion_owner；操控预测、物理和 AI 共用真实在线模块 factors，并保持 ShipMotion 的 minimum 前后数值位置。验收用持续真实交火/audio/source 对照及模块损坏，界面、取消、网络权限和存档交互不变。

性能定向实施：真实生产 host 的 Ark/Gloriana/Gravity 编队每步约72毫秒，先在临时原生副本增加只读时间探针，运行实际 RustLanKernel 相同编队，定位事务克隆、AI 现场读取、火控、gravity、碰撞与验证各段。探针不进生产 artifact、不改变规则或RNG。优化只消除重复构造/只读拷贝与已证实冗余扫描，保持同一源读取时点、完整失败回滚、席位权限和原恢复预算。优化后以相同编队实际60Hz host和整场严格对照验收；性能改善不得替代玩法通过。

源码采样资格补充：ShipWeaponControlSystem:399–413 对通用调用要求真实 hasNativeQueryLoop 与 sampled reader 身份；包含可变 tractor metadata 的舰船通用调用因此保持 full rate。冷编译记录实际该资格，不按舰体名猜。LAN 私有 Worker 的 multirate 已由真实原型/nativePlanLoop+boundQueries 获得独立资格；原生 seat 权威走这条已验证路径，通用本地对照不能冒用它。热步不运行 TS 审计回调；生成模板保相同证书。验收同时保留 generic 本地和 actual host Worker 两条真实源码路径。

fire commit 性能修正：scene 每次只提交一个真实挂点，却为全场所有舰船重建 recoil Reader。只对本次 queued owners 构造 Reader 和母舰 support，仍在同一调用起点采样，并保持整列 queued 原来的冻结次序。没有改变瞄准、开火、成本或生成算法；非queued读取本来从未被消费。以真实挂点有序发射、RNG/伤害和热步探针验收。

碰撞只读优化：terrain pair 在构造完整 hull/shield/modifier 观察前，用实际模块 root 排除本就拒绝的同一 assembly，并用 hull 顶点最大半径和开启护盾的真实中心偏移/半径作保守圆包围检测。仅确定几何上不可能接触的对跳过完整观察；所有可能接触仍按原顺序执行相同 narrow phase，位置推动后的下一对重新读实际姿态。使用额外正容差扩大包围，避免边界舍入漏检；不缓存跨碰撞数据、不改伤害和RNG，整体安装与事务校验仍完整。

## 2026-10-09 单条驾驶采样事务的只读验证复用

目标是保持每帧输入时序和原先完整错误/回滚检查，同时避免单条165采样重复深克隆全部舰船、world和ordnance。当前 RustCombatKernel.stepScheduled 总是先applyPacked单条sample，再真正Core.step；state::apply_scene_commands为此复制全世界，之后只写scene.sample、刷新已有scope/ordnance历史及空音频。原版0.98a-RC8 ShipCommand.java:3–33推进/转向/防御命令已复读，具体mask和采样以现Web CombatControl、scene_wire::apply165为准，无新UI或玩法，原版实机待许可。

最窄路径只接受完整单条165，已finalized scene且scene.audio空；其余批包/命令和有待flush的音频保持原完整事务。验证顺序仍 authority构造→tag/id/handle/有限数值→body定位→sample字段pad/flag/keys/list/admission检查→scope→真实capture_ordnance→完整validate_scene_draft。身体只在同步纯读scope暂移出slot，任何Result失败先恢复；新scene draft保存sample与system_read历史，scope必须与当前完全同才走共享world路径，否则恢复后沿原实现。保world/ordnance/currentRNG所有字节，不省验证、不默认空世界或metadata、不跨tick缓存。成功只提交该scene draft和空command_results；所有模拟/资源/AI仍在随后原step。authority无birth仅供原完整校验，不修改allocator。失败/取消/网络权威及存档合同不变。

实施本文→最窄helper及复用原scene_wire样本解析→同其它native冻结的真实270混编/60LAN含reserve完整snapshot/scene位对照→sample malformed/pad/NaN/过期身份/duplicate/batch/audio/scope回退与forced原drafterror恢复的必要copiedCorefixture。完整资源与校验仍必须执行，收益由实际input apply计时与最终正式ABBA判断，无新的产品取舍。

实际交付：state::apply_scene_sample只单条165/空scene.audio/实际scope完全同的路径，scene_wire复用同一完整sample解析。首先编译遇到Result错误整数推断及恢复slot表达式移动值，均在生产窄修；失败编译日志保留。旧新同其余冻结native的实际270混编和60LAN含真实reserve部署，完整snapshot/scene值、raw f64位、reforder、prototype和negativezero逐帧完全同，verification-scene-sample-borrow/result.json passed，current plain SHA0a6fee0d6dcdc96a970182ff2a509d8c27b83218c46486f2f28323773da8eaae。源冻结对照有效；运行期间另外agent改explosion_effects/world_owner，两owned文件未变，wholeCurrentSourceUnchanged:false如实保留，不冒最终整合SHA。

必要copiedCore fixture在真实local与LAN各12step现有世界上，原旧完整apply_scene_commands与新实际apply各32case：bad pad/v10/flag/keys、NaN/Inf、非法id/slot/过期代次/非player、duplicate pending、list/admission、双sample/batch及混合命令、scope None/空/stale fallback、待音频flush成功和失败、forced cp drafterror/flightstage/非法body、signedzero/完整各flag、错误优先顺序；每项完整publication/音频/两RNG/allocator及raw无效值比较，失败原状态严格不变、所有body恢复，成功随后真实step继续一致。verification-scene-sample-fixtures/result.json passed，SHA b07a2e1ffcedffb7e7fe592e8b96bcf4ad5c8c7416b8dace3e26e87dfbb2e011；运行期间其它fire_control/fire_query/motion改动、owned不变，wholeCurrentSourceUnchanged:false保留。诊断exports只tmp副本，生产无fixture/探针。尚无正式性能、installed同SHA或全部可玩通过声明。
