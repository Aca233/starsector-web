# Rust 常驻舰载机宿主适配方案

2026-10-09 输入释放失效范围修正：flight_owner.clear_input 只写当前 craft 的 motion 输入与 query.trigger；phase_runtime.clear_held 仅在其 gravity_systems 非空时追加真实世界修改。前者仅移除本 craft 的短期 body cache，后者保守清空，所有效果仍即时执行。此前每架无引力战机释放输入都清空整 scope 导致重复构造约1300次。cache 仍仅一次 with_host 生命周期，不跨真实系统/物理/伤害屏障，集中持续交火验证控制、RNG 与结果。

2026-10-09 重新武装声音修复：FighterSystem.ts:519–522 在 REARMED & LAUNCHING 浮字后立即播放 fighter_deploy，音量0.6、rate1、当前位置。Ark702 完整视觉和规则一致但声音少一条，native FlightRuntime.event 只调用浮字。按同一现场补播放，保当前 listener 和事件先后，不重抽 RNG；实际持续场景集中验证。

2026-10-09 事件工厂修正：实际 FighterSystem.ts:316–317,443–445,521,558 的重构统计/部署声、战机死亡电台、重新装载和弹药投放浮字必须在 event 当场创建。runtime Host.event 直接用当前 world、craft/carrier姿态和同一 visual RNG 调用真实 message/floating_text/stats/play，再保留原 Record。不能在 with_host 返回后补抽 RNG，因为 PayloadAway 先于本舰尾迹。验收 Ark108 及持续 FX/audio/结算统计，全事务回滚仍涵盖事件。

2026-10-09 flight 现场观察优化：同场真实 collect_wings 约10.9ms，约6904次 body 重建。with_host 内独享一次短生命 body cache；scope/ship world 不跨operation保存。commands/pose/heal/rearm/shield/target/autofire仅失效实际craft，set_recall/sync_modules/clear_input/spawn/bind/remove/destroy保守清空，deck/order/event/enqueue/random不会写body的动作不失效。任何真正phase/system/global伤害和生成先清空，再按实际现场重新读取；控制预测、模组推进和phase仍用正式共享规则。Host operation返回即丢弃cache，不冻结整个flight phase；验收完整舰载机真实receipt/交火/系统失效/动态准入与测同场耗时，不允许省观察字段或改抽样。

2026-10-09 持续交火修正：实际 FighterSystem.ts:421–448,556–581 在每个 afterShip receipt 中生成真实尾迹，flight_owner::finish_visuals 已严格消费同样的 visual RNG，但 flight_runtime 只留 Record 未连接真实 FX。with_host 对本次操作新增的 records 逐项调用 world.visual.flight；不重放先前 records、不二次抽样、不提前 aging，仍由原 FX 屏障推进。原版 ContrailEngine.java 仅证明原版尾迹实体与衰减结构，Web 粒子字段以实际已批准源码为准。无界面、玩法、联网权限或存档格式调整，失败进入完整事务回滚。验收复用 Gloriana 第71帧和持续完整 FX 字段对照，不能用 records 数量代替真实发布。

2026-10-08。继续总目标“全部做完，能正常游玩再停”。本块接已有 `flight_world.rs`，只修改独立 `flight_owner.rs`、本方案和集中actual TS校验；共享lib/state/ship_state/battle/projectile/system_owner/world_owner/protocol由root接线。

## 目标、范围及操作

现有舰载机真实出击、拦截/缠斗/攻击、舰队命令、召回、回收、补损/后备甲板、泊舰与重新武装继续同一操作和界面。FlightWorld持唯一航空规则状态，本宿主持真Body/ShipState/Ordnance以及一次性静态craft构造模板；每步不创建TS权威Ship、不导入旧world、不调用JS热求解。生成后舰载机同其它舰体使用真实Rust状态/物理/火控/发射/死亡服务。

不调整平衡、原版差异、UI、联机权限或生涯存档；不发布/提交，不开可见窗口或占用键鼠。原版0.98a-RC8：已复读 `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/FighterLaunchBayAPI.java:16–69` 的land移出engine/新AI与replacement合同，`FighterWingAPI.java:12–89` 的source/members/returnData，`loading/FighterWingSpecAPI.java:16–77` 的variant/count/refit/range/tags。这些证明接口，不证明Web私有数式。原版实机/截图仍待核实。

## 源码对照与完整阶段

`FighterSystem.ts:101–121` → nextId在Ship构造前；truthy point-defense技能继承；carrier refit作用于craft stats；station定位在构造后 → template必须可按所继承技能选择预编译变体，使用当时两种Rust RNG构造实际组件/engine/readiness，不能复制另一舰运行tracker。`Ship.ts:393–534` → armor/flux/shield/system、weapon tracking、递归children、engine trackers、shield malfunction interval、ordered hullmod apply → typed template保留构造顺序并拒绝不完整数据。

`ShipStepBatch.ts:65–133` → 全部state、全部motion、afterMotion、weapon-state、全部fire-query、orderedfirecommit、finish，再afterShip → Host.enqueue只排真实work；mandatory Rust StageService必须将工作并入主batch，在同一完整阶段后执行FlightWorld.finish_ship。服务无默认no-op，独立验证调用现有真实Rust prepare/motion/weapon/fire/finish API，对照实际TS Ship.update，不再ammo/HP probe。

`FighterTactics.ts:52–91` → per-mount solveWeaponAim，失败后predictWeaponIntercept；range最小值/弧/几何决定真实firing → 同步复用Rust fire_control几何规则，参数来自真实mount/barrel/target。`GlorianaFlightAI.ts:27–50` → assembly-root armed未suppressed void优先，普通盾用真实offset/front arc；selected舰/selected missile权限 → fire-query必须保留该permission，并保留allied terrain obstruction，不能全roster重获敌人。

`FighterSystem.ts:421–448,556–581` → 非Ark真实throttle触发visual draw，按engine slots有序生成contrail，receipt后payload/damage判定 → Rust生成真实粒子属性并消费visual RNG；FX只commit后投影。recover移出活跃array/deployed但保留docked身份；detach清wing/flight AI但保留sourceCarrier；carrier失效dock分支直接dead/retreated，不多造死亡爆炸。模板未知、generation过期、stage重复/服务缺失或writer失败：拒绝并让主核全步回滚所有Body/flight/IDs/ordnance/两RNG/输出。

## 常驻和权威依赖

Owned含static templates、ordered semantic ship metadata/deployed/已接受orders、readiness入口、sourceCarrier、formation authored templates、carrier stats与suppressed destruction事实。舰体资源/武器/技能生命周期仍是ShipState唯一所有者。只存模板不可变spec，不能存可继续推进的第二份ShipState。生成allocator/admission、真实stage、死亡worldclosure用mandatory typed Rust服务接root共享权威；不能返回固定ID或空动作。

carrier_wings按真实fighterBays切片并预编译native wing fallback；formation_templates保留全部authored定义。carrier stats为实际静态refit结果，system fighter damage则走main battle live sourceCarrier读数。module pose由实际挂接元数据/同步；recall在command边缘（含pause）传播liveassembly、资格按installed/deployed/真实bay。stat/visibility/orders从本Rustworld当时状态查询，不从显示DTO写回。

## 顺序、验收和待核实

来源/本方案→完整typed构造/metadata/Host→真实Rust stage与fire aim→actualTS Ship/FighterSystem集中Node+fresh无头Worker→root统一生成和完整batch接线→七包生产可玩。严格比较HP/flux、lifecycle/ammo/cycle/target/order/recall/deployed/IDs/两RNG、constructor trackers、dock/rebuild/rearm/receipt；几何限定既批准容差且实际决策仍strict。包含普通fighter/bomber、Ark/Gloriana特殊craft、sourceCarrier技能继承、真实engine/mount构造顺序、reserve失效和复原/rollback。

本块独立Host与actualstage通过不宣称production/fullBattleReady。主核仍须共享实体allocator、全部新craft域metadata/admission、完整fire permission/roster、flight codec/recovery/投影和最终local/LAN/Steam连接。未知template/hooks拒绝；存在共享接口差异即写明，不以空默认补齐。无新的玩家取舍待确认。

## 进行中交付与共享编译合同

实际scene `real Ship.update 0/19` 冷却挂点triggerHeld失败已定位：TS每query重置false（ShipWeaponControlSystem415/626），只有真正request在reload/system校验后置true（973–976）。共享fire_query此前提前使用手动q.trigger/automaticrequested写held，错误地保留未获准请求。root修为始终false，仍由已验证weapon_fire request同步置true，显式低层FireInput合同不变。最少复验使用本块原实际Node/Worker oracle，保持全规则严格与获批几何1e-9/32EPS容差。

`flight_owner.rs` 已实现 static-only 构造模板、递归模块→parent引擎→readiness RNG原序、真实组件/护盾/armor/fire/query/death/world数据、完整FlightWorld Host、纯真实mount aim、真实ordered visual contrail。未知variant/hooks/incomplete metadata及陈旧generation拒绝。强制 `Services` 无默认实现，提供 allocator、全部域admission、queued真实stage、held控制清除、真实死亡；root统一回滚这些服务。

集中 `scripts/check-rust-flight-owner-module.mjs` 和 actual `scripts/lib/rust-core-flight-owner-check.ts` 已写。使用真实 `new Ship`/`FighterSystem`/`ShipStepBatch`/`Ship.update`；现正检查Node。此前共享 `world_owner::Owned.floating` 和 `weapon_world` root调用编译阻断已由root补齐，Wasm已实际成功编译。测试模板补齐真实碰撞轮廓、挂点尺寸、引擎角/风格与HullMods默认720秒PPT；输出读取真实Projectile.empDamage/facingRad。当前对照已通过普通完整constructor及19tick真实物理/武器/aim，发现shared fire-query冷却挂点triggerHeld差异，等待root修正共享代码后定向复查；仍未宣称oracle完成。

生产StageService必须保留每个Step的资本舰/战机/轰炸机/下一tick新生roster与各自dt。现有 `fire_query::plan` 处理所有bodies并使用全局missile_scope，不能直接用于Gloriana：其permission限定同队＋选定目标舰与仅选定导弹，仍保留所有同队/terrain阻挡。须提供queued范围和per-owner missile_scope接口；不能把只需显示的回收/移出flight witness继续更新。静态模板必须按carrier spec与truthy PDskill编译完整variant。phase_anchor、任意unknown initialize/advance hook目前必须reject，不把纯倍率代替紧急下潜/CR消耗等玩法。

补充源码核实：`Ship.ts:358–367` 初始aim为(0,0)、fireControlMode为MANUAL，flight spawn也保持该默认，首次航空AI才切换AI。readonly shield/weapon aim写入同一真实状态，舰体turnDeceleration从当时真实engine/live modifiers求值。`Ship.ts:516–518` child sync之后必须再次同步child的完整tree；已保留双重reset以保持nested/independent初始pose，真实actual constructor oracle新增parent→child→grandchild场景，验证递归RNG原序。普通回收旧实体保留docked witness，Services.removed强制更新实际名册。

## actual Node局部通过，最终验收仍进行中

为使共享manual冷却差异不阻断其它规则检查，实际场景顺序调整为nested constructor→55tick完整普通FighterSystem/ShipStepBatch→recall/recover/rebuild/reserve→七角色直接物理/aim。以上nested constructor、55tick、tick20/27两次recall、回收旧docked witness、0.8秒deck replacement构造、reserve新树构造均已按全部严格资源/生命周期/两RNG字段通过，再在普通直接物理tick19首度触及 `carrier_craft_1/W1/mount[25]` Rust1/TS0共享triggerHeld差异。未降低断言/绕过共享源码，未替换实际Ship.update。完整最终Node/freshWorker counts仍未产生。

该差异的source：ShipWeaponControlSystem.ts:415/626 query重置false、499–513/733 cooldown门、973–976 requestWeaponFire按reload/system门后置true。生产 `fire_query.rs:166` 不应预装q.trigger或requested；传false让真实weapon_fire::request置位。root owns shared fire_query，native shared source短freeze期间本agent未代改。

## 本块最终集中验收

root已按源码修正生产query的trigger_held，真实request负责置位。`node scripts/check-rust-flight-owner-module.mjs` 在Node及全新无头dedicated Chromium Worker全部通过。每个运行时10场景、658次完整状态比较、46次真实constructor、13次真实发射、784次实际per-mount aim；695,730严格字段零差异，55,340几何字段在既定max(1e-9,32EPS尺度)范围内。Node最大几何差1.1102230246251565e-16，Worker最大5.684341886080802e-14。scope oxlint通过。记录 `artifacts/rust-combat-core-20261008/verification-flight-owner/result.json`。

扩展到真实wing/deck CRR、重构timer/ID、回收FIFO/reserveRemaining、carrier/reserve/docked memberships、每舰wing/deployed有序成员及真实字符串字段；没有用输出数目推断这些内部状态。另加实际new Ship的maxFlux0静态constructor，Rust模板改为允许0（负值仍拒绝）。JS ModManager通用Web自制舰校验尚拒绝maxFlux0，因此该scene直接调用实际Ship构造器，不宣称内容注册已支持原版零flux舰。此差异交root评估编译层，未代改ModManager。

仍清楚保留productionIntegrated/fullBattleReady=false：root必须完成全部authored模板/typed hooks、共享transaction实体增删、queued per-owner acquisition scopes及per-body dt/retired/born-next-tick名册。测试非致命且使用合成非制导普通枪，不能证明完整死亡/爆炸、特殊Gloriana搜索权限或全七包可玩。没有可见窗口/键鼠/暂存/提交/发布。
