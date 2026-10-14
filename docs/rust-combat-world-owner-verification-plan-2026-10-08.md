# 共享战斗世界死亡与连锁爆炸联合验收

## 2026-10-09 原 ordinary hulk ID 首差修正方案

目标是让真实死亡验收比较完整生产语义，不改变死亡、残骸、伤害或 RNG。当前冻结 plain oldbaseline 在 ordinary lethal tick4 hulk0 field0 Rust2/TS1；world_damage::create_hulk、terrain::admit_hulk、world_wire 均保留原 id。最早来源是 fixture engine.addRadioMessage 只 record103，生产 CombatEngine.addRadioMessage→FleetCommandSystem.addRadioMessage 会先 visualRandom.nextNumericId；真实 createShipHulk 随后 nextNumericId。因此源夹具漏了无线电 ID1，误期望 hulk1；Rust world.message 已正确产生radio1/hulk2。

来源为本机0.98a-RC8 CombatEntityAPI:17–29中立hulks及 H.java:47–86 breakup、当前 HulkVisuals.ts:16–35和真实 CombatEngine.ts:1298–1301/:421–427、FleetCommandSystem.ts:50–69；原版没有Web数字ID规范，沿当前确定性Web差异，不推测nativeJava数字ID。原版实机/截图仍未核实且禁止桌面；不改UI或宣称画面等价。

本块只修脚本 fixture：安装真正 FleetCommandSystem(visual)，记录wrapper调用真实 CombatEngine.prototype.addRadioMessage 后再原record103。保全部字段/顺序/残骸ID/两个RNG/所有工厂和错误断言，不能补+1常数或跳过字段。生产world/terrain不改；网络权威/存档/取消及事务行为不变。先本文→窄fixture修→原八场真正TS oracle+fresh无头Worker、相关actualKernel死亡消息/残骸完整发布集中验证；成功记录source/Wasm真实指纹，失败定位首差，不重跑已冻结guidance270。没有新产品取舍，整体可玩finalSHA由主代理继续。

## 2026-10-09 死亡文字完成事件补齐方案

主代理已在 flight-owner-agent-task TOP 明确额外授权只 weapon_world::death_visual Floating arm。真实 CombatEngine.ts:1298–1301 调 addFloatingText；fixture:215–216 先调用真正 CombatFXSystem.addFloatingText，再 record104，完整工厂605不替代死亡语义104。Rust该arm仅 floating_text，故同资源/视觉RNG和所有live floating字段一致，但输出少104。修正只在同arm真正factory之后发原 Death::Floating{flagship,position}，原605→104顺序，所有文本/color/size/life、RNG和死亡流程保持。无新UI/玩家操作、联机权威/并发/存档/错误合同改变；没有新产品取舍。

验收沿原八场真实TS oracle Node/fresh无头Worker完整字段和输出次序，不降任何断言；再同冻结plain生产源Wasm真实主舰自然死亡capture，核radio→hulk编号和完整death文字/残骸来源。native源只生产副本后台rustc opt3，不installed、不finalCargo、不发布；记录精确源Wasm指纹，最终整体可玩门禁仍由主代理整合。若其它域先失败精确报告，不扩owned公式。

## 2026-10-09 parent-chain legacy fixture 准入补齐

原普通场当前plain2253b5fd已六步和rollback通过；parent-chain首步code8在旧5c153只Floating窄补亦同。临时诊断副本只error801定位 motion_owner::sync强读空cs.query，fixture采用原manual fire-intent路径，确实未安装query；生产RustCombatInstall/content.finalize完整query已严格校验，不能以此减弱真正scene准入。该production sync兼容分支交ROOT owning motion处理，oracle不改变fire-intent/sourceplanner/expected。 formal scene 完整性已有 ai_resident::Owned.validate:64要求每actor query、:70所有mount query，state finalized scene:123仍w.ai.validate；phase_runtime::phased_world:92–98亦明确旧独立caller shield/parent-only合同。因此无query的旧standalone sync只需保真实combat team/player，若query存在再同步其player；该兼容不移除正式准入校验。

独立另一个准入缺口：motion_owner::advance对attached parent需world.motion Meta，而旧worldFixture未安装。按 RustCombatInstall.ts:46–51生产入口、Ship.updateMotion当前同spec源，fixture一次 initialize-motion-world安装每ship真实station/axial/independent/inheritParentEngineCommands/turnAcceleration/maxTurnRate；不补临时规则或RNG，不更改actor或输出断言。source仍用同Ship真实prepare/integrate/finish和manualfire工厂，联机/存档/UI不变。既有scene-command/prelude复用本fixture没有其它motion安装，故无需改其caller；query由caller原本安装，继续避免重复。通过原八场集中且保所有stats/death/RNG准入回滚断言。

## ship_effects world死亡/残骸标识域已闭交付冻结（2026-10-09）

先原版source + world-owner-verification-plan三节后：worldFixture真正FleetCommandSystem(visual)/真实CombatEngine.addRadioMessage wrapper恢复ID消费，真正cold initialize-motion-world在battle-world后按Ship/spec metadata安装；未改actors/manualfire/expected。生产只额外授权weapon_world::death_visual Floating arm真factory605后发原Death::Floating104，原时序/RNG全保。ROOT owns motion_owner::sync legacy现存query才syncplayer，生产finalize完整准入保持。

本轮最新 frozenproduction plain rustcopt3 SHA34a2574bf248c3449625c1cd8c80712ce98863d3f51e87315abbe6c805967fa3 /4533784bytes exit0。原八场Node+fresh无头DedicatedWorker各41steps/23actualships/37,301strict +18,014geometry/109deatharmorrecords/16rollback，maximumgeo2.842170943040401e-14，所有ordinarydeath、parentchain、非neutral、deadEmitterbinding、shield、phase、void、transient、fighter、breakup/expiry均passed；完整输出/字段/双RNG断言未删降。tmp/flight-hulk-radio/result.json sources.json native-sources.json/sourceUnchangedtrue/nativeChanged[]，本轮最新ownedfixture 38dd95c3f6e61ebe0e469df687678bc52f4adbe47148b1ea2983ae8c5f245d52 /weaponworld 68bebfe62a8ee37449aafa1a22706ab4b0d414d21111457a2c3e8c1c0b969461；onlyFloatingarmChangedtrue，ROOT其它函数无覆盖。最后scopedTSC+fixturelint exit0。

相关actualKernel真实Roc vsGloriana natural247tick主舰死亡完整capture此前current2253b5fd已accepted（ROOT明确不重复未改场）：deathRadioID6→hulkID7/player_ship numeric1/gen1，真正HULL DESTROYED和完整bounds/slots/pose/RNG发布，kernel-result.json SHA2253分开记录未冒34a同SHA。旧隔离5c153+arm也用于识别legacy缺准入，不计最终通过。当前owned窄块冻结、CPU释放；未installed/finalCargo/发布、未用本域通过冒全场可玩。等待ROOT下一必要任务继续，用户全部正常游玩总目标仍进行。

## 首轮真实阻塞与当前状态

正式收尾通过：`node scripts/check-rust-combat-core.mjs --world-owner` 在905440bytes、SHAad10a9bc5ba6412a3171f087cfe14e7a26992d96b52131cca4416f9c4bf27646（ABI13）完成Node和fresh无头Worker所有八场。结果 `artifacts/rust-combat-core-20261008/verification-p2-world-owner/result.json`；完整死亡/链爆炸/父模块/ordinary shield/phase/void/实际breakup/非中性outgoing和发射舰死亡保留绑定均覆盖。详细计数见结果。此项生产仍未集成/fullBattleReady=false，继续后续共享规则与可玩入口。

后续 emitter tick4 explosion.payload.didDamage 检出0/1。真实 ProjectileExplosionSystem保存原 projectile 引用，碰撞完成后markSourceProjectileImpact的didDamage、源生命周期damage等仍可见；Rust之前捕获了命中前值。原对象爆炸保留serial reference并在同一事务弹体更新/退休后同步payload，留住退休最终值。近炸明确克隆并清velocity的payload、舰体爆炸继续独立值，不能误同步。仅Rust内部引用语义，无JS每帧导入；余下持续生命周期和来源严格核对。

第二个真实emitter差异（905547bytes SHA `72359c0b90fec30d9d5364a1ee0d751fcdd56cf2ef3d9d4a086a3c89a424b737`）：tick4 explosion0 field20 = `Payload.did_damage`，不是isRocket。`ProjectileExplosionSystem.ts:31` 保存 `projectile:p` 真实同一对象；直接contact先spawn/apply，再 `WeaponSimulationSystem.ts:290–296` 调用 `markSourceProjectileImpact`，后者 `SourceProjectileLifecycle.ts:71` 在任何弹体退场判断前将p.didDamage=true。活动Explosion因此立即看见同一对象后续didDamage写；Rust `weapon_world::spawn`克隆payload后，`battle.rs:200`才p.impact，活动payload未同步。正确修正需保留来源对象别名语义：每次impact/retire和后续源生命周期写后，更新所有仍active且identity对应本p的payload实际动态字段（至少本scene did_damage；对BALLISTIC等还包括damage/emp/pos/range/prev/velocity、source binding），不再次apply或消费RNG。即便projectile已移出live列表，Explosion仍持有最后状态；不能从live roster消失就清掉来源payload。oracle正确，不改field/expected。本scene gun未指定spawnType，真实ORDINARY无sourceLifecycle，impact不清damage，但didDamage仍true。

续接正式验收在 emitter tick2 mount.triggerHeld 检出 Rust0/TS1。真实 `Ship.clearInput():373–381` 清主 firing 与导航/held，不清已发射挂点 triggerHeld；死亡后的 prepare 不继续 mount lifecycle。修正 world_owner.shutdown 的多余 mount.data25 清零，保留发射输入清除和真实系统/护盾关停。属于源状态修正，不放宽oracle或数值断言。该轮通过前七场但没有整体通过；修正后定向原 eight-case oracle。

续跑实际失败（ABI13 905784bytes SHA `d7c0e0ff8ccd29c0900f525691bb0f3b3adc7bc6f8a6ffa965c6582a81f4dfe3`）：emitter tick2 ship0 mount0 field9，即 `mounts[j].slice(16,32)[9]` = resident `m.data[25]` = actual `WeaponMount.triggerHeld`，Rust0、TS1。实际第一帧开火将triggerHeld置true；下一帧外部致死使 `Ship.prepareStep:944–947` 提前return，故武器advance/query/commit均未运行。真实 `CombatEngine.handleShipDestruction:1278` 调用 `Ship.clearInput:373–381`，它只清 `isFiringMain`、gravityControlHeld与motion inputs，未清 WeaponMount.triggerHeld；死舰之后亦不跑射控，保留true。shared `world_owner.rs::Host::shutdown:164` 额外将每mount `data[25]`清0，是实质差异。修正应仅删除此death mount历史清零；主驾驶/射控intent清零仍按clearInput保留，既有外部持续payload/source binding继续有效，不改正确oracle。`world_damage.rs:199` 注释“Fire/group/control input sidecars”应明确不含最后一次mount lifecycle triggerHeld历史。后续由root共享修、集中原场景Node/fresh Worker复验；本诊断不宣称验收通过。

正式共享 ABI13 world-owner 首轮发现真实零容量舰体被 `state.rs::flux_config` 的 `max>0` 拒绝。`FluxTracker.ts:44–60` 实际构造保存0，`fluxPercent` 采用 Math.min(1,total/max)：0/0内部是NaN，后续大小比较为false，不能偷改成容量1或比例1。修正准入为非负容量，并使Rust percent保留此内部NaN；原始幅能资源与发布字段保持有限。当前场景零容量舰不发射/不装能量精通；零容量发射源的衍生值发布和未知内容准入另须完成真实审计，不能以此宣称完整闭合。oracle保留原始actor。方案不改变玩法或数值合同；最少验收为原本world实际Node/Worker持续场景。

首轮world fixture真实共享build安装code2。2026-10-08 ABI13 Wasm765556bytes sha058c46f08eeebd808812b54f795d6ddf4a45d3c6bd57baeb4510f381bbe5a866，state源hash匹配manifest。`RustCoreProtocol.ts:449+` 已生成 `initialize-world-ship` 82/83/84/86与`initialize-battle-world`85 rows，但`encodeRustCommands`第二个commands.forEach（533+）缺二者copy分支，实测world-ship返回7rows全部tag0（第一row仅残留id/handle）。root须增加world-ship copy count=`2 + ceil(specId.length/19)+ceil(shipName.length/19)+ceil(hullName.length/19)+ceil(stableId.length/19)+slots.length`及battle-world copy1row。不得用oracle自定义打包绕过生产encoder错误。

Root 已改为第一pass记录实际每command rowCounts、第二pass统一复制已生成rows，解除上述encoder遗漏；正在重建共享Wasm和集中正式对照。新check/helper已有8个真实持续场景，15字段scar采用实际decoder投影、来源binding采用真实发射取样、hulk sequence保留跨帧identity并比所有活跃序列。定向TS 0 own/0 dependency diagnostics、scoped ESLint通过（末次只补现成component/input比较，正式场景等待root运行）。当前尚无world实际全场景通过结论。

22:32 root正式 Node 使用897907bytes sha`deda84187fee959d17b6e5df039da3fd9023118d4fc84e954b771c456c2fc493`，world安装code2仍失败。定向诊断先核对manifest全部Rust源hash，再用真实Ship的第一艘19个productionencoder初始化prefix，全部成功；随后静态核实第二艘fixture用了`maxFlux:0`，触发旧 shared `state.rs:56` 正容量准入，而实际TS可构造零容量且内部0/0谓词有既定行为。Agent曾建议将自选fixture改为小正容量10，root明确要求保留source契约并增加零容量支持，已恢复原0场景；该提议不是shared规则交付，也未取得任何场景通过。根任务正在修准入和内部NaN分支，继续严格比较无伤害爆炸仍消费一次combat RNG的源行为。

真实普通发射source `CombatEngine.ts:754` 立即 `stats.recordShotFired`；此时shared `Ordnance.fire`未见world stats接入，ordinary shield contact分支也未见stats伤害/shot_hit，而armor分支已有部分damage。oracle全部18项stats照真实源比较，root可预查接线；尚未执行到这些字段，不把推测当验证失败。

2026-10-08；属于已授权 Rust/Wasm 共用内核迁移，不增加玩法或界面。规则、资源、计时、RNG、统计和决策严格一致；纯几何沿已批准 `max(1e-9,32*EPS*max(1,abs(a),abs(b)))`。

## 目标、玩家体验与范围

玩家仍使用当前驾驶、开火、盾和技能流程；致死命中同步清除输入、关闭系统与护盾，父模块按既有次序连锁死亡，爆炸当场改变真实世界，最终产生残骸、战果和损失。不能等到 JS 回放呈现时才计算伤害或消费 RNG。正常死亡无确认/取消，错误的身份/数值必须回滚整批，不发半帧。

本块新建 `scripts/lib/rust-core-world-owner-check.ts` 和必要独立 fixture helper，只验收共享 `RustCombatCore` ABI13真实世界。源 oracle 使用实际 Ship 构造、Ship prepare/integrate/fire/finish、实际 `CombatEngine.handleShipDestruction`、`ProjectileExplosionSystem`、真实 ArmorGrid/Flux/Shield/System、CombatFXSystem和CombatStatsTracker。主任务负责共享 Rust/协议/runner/Worker生产入口和最终七包可玩。本块不改共享代码、不改UI、不发布、不操作桌面、不修改生涯内容/存档。

## 原版证据与现状差异

原版 `../starsector-core/starsector.log:1` 为0.98a-RC8。已实际读取 `../decompiled/starfarer_api_source/com/fs/starfarer/api/loading/DamagingExplosionSpec.java:69–97`：舰船爆炸以maxFlux的0.5–1倍伤害、爆炸倍率、0.1s、碰撞半径core、零最低伤害、HE及舰船/小行星类别构造；当前 `ShipExplosion.ts:5–20` 用可重放SimulationRandom和Web双精度，迁移保持其既有次序。`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/terrain/Asteroid.java:55–92` 核实独立ASTEROID/HP/质量契约，不能据此声称Web radius²×.75和碎裂数式原版等价。

死亡视觉、残骸与源码对照沿 [world-damage-plan](rust-combat-world-damage-plan-2026-10-08.md) 和 [terrain-world-plan](rust-combat-terrain-world-plan-2026-10-08.md)，避免重复长篇研究。当前 `CombatEngine.ts:1270–1321` 父先标记、子递归、真实clearInput→cancelVent→lowerShield→deactivate+disable、loss≤64、visual explosion→消息→同步blast→debris→shake→hulk/armor禁用损伤。`ProjectileExplosionSystem.ts:30–50` push-before-apply并逆序更新；即时递归新爆炸必须保持此顺序。装甲sparks在真实hurt/components后消费视觉RNG。原版live UI/截图没有新增证据，待许可；本块不改变界面，不宣称原版画面等价。

## 完整流程、状态与联机/存档

一次安装实际静态flux/armor/shield/weapon/lifecycle/system-world，以及cmd82–86 spec/name/slot/terrain metadata和真实主舰generation；UTF16舰名使用中文/补充字符以验证跨命令分块。之后只有玩家控制/真实damage命令进入权威，不每帧上传JS世界结果。

source所有prepare→所有integrate→所有weapon advance→逐船/挂点实际fire commit→所有finish；nebula→逐船system dispatch与installed advanceCombat→gravity（场景未装则无动作）→asteroid update/collision→capital pair→module sync→真实explosion/projectile/beam update→FX后续hulk与死亡扫描。snapshot在最后阶段，必须比较真实阶段结果，不能移动采样屏障以迎合Rust。无头场景保留全部真实规则方法，只隔离摄像机/音频/绘制。

Rust所有body/ordnance/system-world/world stats/losses/explosions/terrain和双RNG必须同transaction克隆与提交；过期owner/target或失效world metadata使此前同批成本也不提交。只读snapshot的嵌套数组/字符串修改不能改authority。联机权限沿单权威Worker，不更改单人规则；snapshot发布不是恢复入口，本块不证明checkpoint、网络回执或存档迁移。

## 场景、顺序和验收

1. 实际普通武器命中→致死→shutdown/损失/装甲粒子/残骸，多步推进爆炸与残骸；证明非空伤害、真实开火和死亡。
2. 近距离父子模块与敌舰链爆炸，保留死亡源payload、父先标记、子先完成和push顺序；对照双RNG、HP/cells/scars/组件、system lifecycle及stats。
3. 实际动态非neutral技能、普通盾及phase/void/root屏蔽，爆炸伤害依当场owner和target属性；不以固定输出倍率替代真实方法。
4. fighter/附属/临时/抑制与重复死亡的loss/统计差异；无效generation整批rollback、中文UTF16、snapshot投影隔离。
5. 至少一次hulk下一帧运动/源冷却或碎裂、active explosion过期；保留source舰状态并比较共享sequence和slot。

先独立fixture和采样/typed publication对照，再用最少互补持续场景；任何差异记录具体tick/field和源文件，主任务修共享核后定向复查。主任务集中Node+全新headless dedicated Worker运行同一oracle，不默认全套测试。验收严格比较统计全部18字段、loss身份/名称/team/time、RNG cursor/id、输入/资源/HP/cells/scars/系统/武器、活动爆炸payload/spec/命中集合和输出次序；位置/旋转/纯几何限定容差。source私有字段可读，无需复制规则公式。

## 依赖、阶段与待核实

依赖主任务ABI13/header44,data43 world长度及snapshot.world typed section；root负责新runner `--world-owner`和正式共享build。source数据构造已检查，不改上一块system oracle供root正式验收。原版实机、最终renderer、完整checkpoint/联机回执/胜负和七包实战仍主任务待完成；不能把此域通过当成整个迁移可玩。无新的产品取舍。

进度：来源与方案完成；独立fixture/联合oracle实施中，正式Node/Worker尚未运行。

补充取样：`OutgoingDamage.ts:40` 明确 hull-reactor blast 无条件跳过攻击技能，因此不能把有 Eclipse 的死亡爆炸冒充来源倍率验收。新增一个实际武器自带短时爆炸场景：ENERGY 类武器、真实registered hullmod `damageToFrigatesPercent:25`，实际effectiveHullStats构造来源属性、真实发射→emitter 死亡→持续飞行→直接命中与副目标 AoE，来源绑定保留而当场读取源状态。新增 `configure-delivery-world` 仅一次安装实际 authored explosion/visual 字段。只比源方法结果和真实 launch 字段，不复制伤害公式。

有效接触要求：ordinary shield actor由170改150，使65半径盾确实进入源100 blast半径；必须观测真实hardFlux>0才计shield覆盖。phase actor改90（真实hull在blast内部），激活后先断言actual isCollisionless、爆炸后必须HP仍100才计phase覆盖。移入实际覆盖区域避免用未命中的场景冒充防御通过。

23:32 root新共享905882bytes sha`0288a8a264fef6096dd7b8ece6a25d2bfbf91b3843aeb4a064937d009fcdc97f`已推进ordinary与parent-chain，之后失败于actual盾hardFlux覆盖断言。源OMNI在.8s仍只展开部分arc，原fixtureaim向右而blast来自左，未命中盾；已补真实aim输入朝blast源（实际Ship和Rust shield-input同值），不改变计算/expected。继续要求非空真实hardFlux。

Source厂屏障修正：death `addFloatingText` 回调曾仅record104漏了真实`CombatFXSystem.addFloatingText`消费visual RNG；已改先按完整原参数调用真实FX方法，再捕获104。`addFloatingDamage`与`addFloatingText`均包裹实际方法，记录完成态605，并与live floating16的真实text/color/size/life/maxLife/位置/速度比较；没有补常数RNG或重复汇总公式。death104仍保留，parent Host不得把真实factory605替代原104语义。

普通命中fragment用输出606（含small/medium/large）而death/terrain用105；fixture按真实调用入口保留scope，调用相同实际FX factory，不篡改factory配方。source texture文件索引为`sml0..3/med0..1/lrg0..1`，不能减1或假设每次都是sml。两种完成态输出保持同一观测次序比较。

零渲染实际TS覆盖诊断又发现void actor的authored `rechargePerSecond:0`由真实`effectiveVoidShield`构造即拒绝（要求正值），在Rust之前已无源actor。改为正1，hitDelay4内不影响当前screen分支；source和Rust同安装值，继续严格比层/资源/后续结果。这类fixture构造错误不能算Rust迁移失败或放宽源准入。

当前`CombatSkills.ts:26`空native技能registry，构造target_analysis/energy_weapon_mastery actor也由实际source拒绝；因此非neutral场景使用合法fixture hullmod扩展点，实际source注册、Ship构造、effectiveHullStats和OutgoingDamage读取25pct，不绕过技能验证，不将尚未接入技能声称已实现。

实际TS-only覆盖诊断（Rust transport stub，仅检查真实source分支，绝不是Rust通过）：shield向源后hardFlux2147.2880177898337；phase内部HP仍100且collisionless；void rootHP600/moduleHP100；dead-emitter source死、副AoE targetHP767.9054689600629；breakup真实3片。诊断文件`artifacts/rust-combat-core-20261008/verification-world-owner/source-coverage-probe.mjs`，正式check还需相同Wasm Node/freshWorker对照。

额外直接比较真实Shield arc/facing和所有19字段VoidShieldState（完整integrity/rebuild/quiet/restart/armed/suppressed/breaks与视觉计时），避免仅moduleHP未损失就遗漏屏障成本或状态顺序。

2026-10-09 ROOT窄修记录：复读原版0.98a-RC8 ShipAPI.java:446–472父舰/槽位合同与当前Ship.ts:141–159明确team/isPlayer继承。独立manual-fire旧caller无query，sync只同步现存query.player；scene_prelude::validate仍严格要求query、ai_resident的完整actor/mount校验保留。只此兼容分支，未构造默认query、未变生产冷准入/伤害/身份/操作/RNG；按原八场源oracle验收。
