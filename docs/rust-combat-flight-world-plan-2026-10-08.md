# Rust 舰载机、飞行甲板与七舰包航空方案

2026-10-08。继续“全部做完，能正常游玩再停”。目标是原有航空编队实际生成、拦截／缠斗／突击、召回／回收、损失补充和轰炸机返航重新武装全部由持续 Rust 状态运行；既有飞机、装配、联队和命令体验不改变。

## 原版证据 → 当前差异 → 验证

原版0.98a-RC8，本机 `FighterWingAPI.java:12–89` 区分 source bay／carrier、range、member、returnData；`FighterLaunchBayAPI.java:10–69` 明确 land 从 engine 移除飞机、重新 launch 创建新 AI，并保留 fast replacements／extra deployments／lost／replacement interval。`ai/M.java:324–340` 对失效母舰不创建 returning bay。`impl/combat/ReserveWingStats.java` 核实一次2倍额外部署／30秒；`RecallDeviceStats.java` 快速回收和再出击。已读 API 和本机反编译，不复制恢复不足变量。

当前 `FighterSystem.ts` 明确不是完整原版补充率；基于Web的CRR下限.3、每损失.04、自然恢复.015、轰炸机修理60/s及3.2+rebuild×rearmFraction必须准确保留，不能悄悄换规则。`FlightFormation.ts` 的sprite／module footprint队形、`FighterTactics.ts` 的真实射程／目标筛选、`GlorianaFlightAI.ts` Fury／Thunderhawk／Starhawk与`AdunArkFlight.ts`盾逻辑是已批准Web扩展，非原版飞机。迁移合同为实际源码；原版截图与实机待核实，本块不操作桌面或改UI。

## 范围和完整操作流程

新增独立`flight_world.rs`。持有ordered carriers/wings/fighters/bombers、mode/timer/target/payload、reserveDeckUsed、reserveCraft/dockedReserve、recovered FIFO、CRR/rebuild queue和Formation slot/footprint。完整handle/generation验证；静态模板在装配时安装，不能每帧JS DTO成为权威。母舰先同步module tree并递归登记children，验证所有craft是FIGHTER，再建立player/enemy wings并按原顺序spawn。

spawn保留原special offset、实际nextId位置、Ship构造RNG、point-defense继承、真实carrier/wing归属和station/previous position/velocity。同步Rust Host负责真实模板构造／Shield／Flux／Mount／engine/RNG／membership；未知模板和缺失操作返回错误，外层整步事务回滚，不允许空生成。正常机／轰炸机独立ordered数组，附属母舰与assemblyRoot存活判断严格保留。

deck先推进reserve timer并逆序删除死亡／归航reserve；applyReserveDecks在自然CRR恢复前后执行；recovered FIFO逐个消耗elapsed，relaunch创建新身份；缺员按现有refit/CRR入loss queue并减CRR、空队自然回升、逆序计时／spawn／重建事件。ReserveWing先consume正常loss queue，额外飞机只30秒，回收保存余时；到期飞机MANUAL禁autofire归航，在原距离边界移除deployed再下一deck清除。回收不是kill／CRR loss；detach必须去掉所有mode/reserve/wing关联和输入。Recall沿宿主已接受命令写mother状态。

fighter更新次序是存活检查、station序号、reserve return、special Gloriana、Ark盾、clearInput/AI/timer、specific→player fleet order、hostile、carrier leash、waypoint取消、guard/avoid、incoming missile→dogfight→capital／Ark screen，最后真实Ship更新及afterShip receipt。Bomber保留DOCKED跟mother、死亡／撤离分支、真实HP修复、到时reload有限弹舱及recharge progress、recall hold、formation relaunch、payload全部低且无已承诺burst后返航、靠近且相对速度合格才dock、fire后实际ammo/cycle重查。Gloriana保留12秒且不免费修船、Fury防空高于forced攻击、Thunderhawk .85射程、Starhawk shield窗口与2/3／.875射程、限制fire roster/missile避免autofire绕过权限。

通用steering／威胁评分／station几何由Rust执行；每个武器的真实solveAim/intercept、盾接触查询由Host同步Rust已有火控实现，不能返回定值或调用TS。Host.enqueue_ship_step必须进入真实Ship物理／火控／发射阶段；FlightWorld保存receipt并在ship finish读取实际ammo/HP/clock。source视觉RNG／烟迹和音效／提示交给有明确语义的Rust宿主事件，不能消耗combat RNG或用空回调冒充完成。

## 权威、并发、存档和失败

只有宿主已接受orders／recall进入持续flight状态；外部输入不取得直接spawn/recover权限。生成、损伤、membership／mode／RNG／resource／rearm与全battle一同事务，FlightWorld Clone纳入checkpoint，scratch可重建。Host每次查询读取当时resident状态；array iteration与Source afterShip边界不能改。stale generation／unknown template／failed writer拒绝且外层rollback，不截掉不同步的craft或空前进时钟。生涯及发布不在本块。

## 实施与验收

源码依据和本方案→真实typed持续FlightWorld/Host→当前TS actual FighterSystem/Formation/Tactics/Gloriana/Ark Node＋fresh无头Worker集中差分→主任务接实际resident模板/Ship fire pipeline→完整七舰包可玩。严格比较mode/target/permission/queue身份与顺序/timer/CRR/payload/membership/RNG/resource/HP/spawn/recover/rearm，纯位置／角度／几何限定既定max(1e-9,32EPS×scale)，不宽容选目标/发射/盾开关或dock结果。覆盖recall/invalid carrier/root/reserve阈值/FIFO overshoot／rebuild逆序、普通fighter/bomber、Ark两机型及Gloriana三机型、special window、防空、orders取消、payload receipt和clone续跑。未集成的Host真实构造／完整物理／fire/RNG／视觉／联网存档明确列缺口，独立模块通过不是整场可玩。

不修改shared lib/state/ship_state/battle/projectile/protocol／生产入口，不递归代理，不stage/commit/push/release，不占用可见窗口或用户输入。主任务负责最终接线与全游戏验收。

## 已实现与最终接线合同

`native/combat-core/src/flight_world.rs` 已实现本方案全部持续飞行／甲板规则。`FlightWorld` 和 `Formation` 都为 `Clone` 权威状态；必须同 resident Host 的实际舰体／甲板成员／combat RNG／visual RNG 一起事务备份。槽号和 footprint 缓存不能每帧清空。公共结构包含完整 identity generation；宿主必须在每次 live 查询验证身份，不能按旧 handle 命中新生成实体。解码与静态内容准入必须验证有限数值、数量上限和合法树状拓扑，不能用 `CarrierStats::default()` 填缺失属性。

稳定入口为 `init/add_carrier`、`update_decks`、`update_fighters`、`update_bombers`、`recover/detach/deploy_reserve/toggle_recall`、`finish_ship`。Formation 为 `station`。时间和目标选择保持源计算顺序；纯 Vec2／角度适用批准的几何容差，模式、dock、射击许可、盾命令、HP、资源、所有时钟及两条 RNG 流严格比较。

| 宿主读写边界 | 必须保留的实际语义 |
| --- | --- |
| `carrier_wings` / `formation_templates` | 前者返回实际 `fighterBays` 裁切后的 wing specs，且 range 已使用原 `native-wing-ranges.json[specId+'#'+count]` fallback；后者返回全 authored installed wings 的有效静态模板，包含超过 bays 的定义，因为源 Formation 用完整列表预先确定 spacing。 |
| `template` / `spawn` | Template 只读已安装静态 craft。Spawn 在当时 combat RNG 上真实构造 Ship、Shield、Flux、mount、engine、module、hullmods／skill；`Spawn.point_defense_skill` 为 carrier captain 的 truthy 继承。普通机和 Gloriana 偏移／构造前 nextId／构造后 Formation 顺序不可改。模板 role 从 sourceHullId??id 决定；WingSpec.special_name 按原 Gloriana／Ark 规则提供。 |
| `sync_modules/children/assembly/deployed` | 同步刚性模块真实姿态；children/assembly 按源递归顺序；deployed 按真实 Set 插入顺序。craft 的 sourceCarrier 不等于 parentShip/assemblyRoot。模块必须继承实际队伍、位姿与召回状态。 |
| `commands/clear_input/disable_autofire` | 同步真实 throttle/turn/strafe/brake、AI/MANUAL、main firing、hold、aim/currentTarget。clearInput 还处理源 gravity-direction held/deactivate；reserve 到期关闭所有 weapon groups autofire，并进入 MANUAL。不允许只记录结果数组。 |
| `recall_allowed/set_recall` | 前者复现 `shipCommandFailure` 的 HP／dock／retreat／live module bay+installed/deployed 判断；后者复现 `dispatchShipCommand`，在命令边缘立即传播给存活 assembly parts，暂停时也一致。 |
| `recover/detach/remove_craft` | Recovered 退出活跃飞行数组和 deployed，保留旧实体的 docked／身份见证，不制造死亡或 CRR loss；重新 launch 是新身份。Detached 清 flightDeckWingId／flight AI／reserve关联，保留 sourceCarrier，移交实际独立实体所有权。CarrierDestroyed 直接置 HP0/dead；CarrierRetreated 置 retreated；两者与源 dock 分支一致，不能额外调用完整死亡爆炸。活跃 render／fire roster 必须由当前 flight 列表／dock/retreat/dead状态构建，避免 reserve 从列表清除后留出幽灵实体。 |
| `heal/rearm/set_shield` | heal 仅源普通轰炸机 dock 时的 hull HP 上限修复，不修 armor；rearm 校验 mount generation，并写实际 ammo 和 `ammoRechargeProgress=0`；Shield.setActive 用真实 close/pendingRaise/phase／Flux 逻辑。Gloriana 12秒不修 HP。 |
| `hostile/order/visible/projectiles` | 当前 resident read barrier 的目标／权限／可见性及 ordered missiles。失效 ordered target 由实际 hostile resolver 判无候选；不得回放旧 DTO、选择隐藏目标或截掉未知状态。orders 消费具体 craft→player fleet 优先级；cancelOrder 真实删除已接受命令。 |
| `aim/shield_covers` | Rust 实际 per-mount solveWeaponAim＋失败时 predictWeaponIntercept，以及 target assembly void shield／真实 front shield contact查询。`aim` 是同步只读查询，返回 solved/predicted，各参数来自当时 resident状态；不能调用 TS／固定返回中心。 |
| `fire_roster/enqueue_ship_step` | fire_roster 是本次对应 FighterSystem update 入口的世界名单，前一飞机泊舰不能悄悄改名单；Gloriana 的许可由 FlightWorld 按 ally+target 有序去重，并只允许 selected interception missile。enqueue 必须进入真实 Rust Ship 物理／火控／发射；world permission 仍需实际盟友／地形阻挡和射击资格。 |
| `finish_ship/finish_visuals/event/destroy` | 在该 craft 的真实 fire finish 后、collision 前调用 receipt；再读真实 ammo/cycle 判 payload耗尽。fighters/bombers 都允许各自整组未 finish，重复 plan 同组则 `WrongStage`，receipt 第二次 finish 也拒绝。reserve return 源没有 afterShip closure，因此不产生 flight receipt。视觉随机和 radio/text/audio事件按原顺序送宿主；combat RNG不得替代visual RNG；destroy进入实际死亡闭包。 |

源 World roster、可见性、weapon aim 的读取是 live 的，但在 source 存下 before-ammo/cycle 与 carrierAlive 的 closure 值不能改成 finish 时重新计算。外层 Core 必须对整个 advance/cmd 做事务，Host 任一 Unsupported/unknown/failed writer 将 flight state、资源、身份分配、队列、RNG 一起回滚。独立模块不会自行回滚宿主。私有 Formation slots/footprints 与 pending receipts 的 checkpoint codec 尚由主核集成负责，不能以只 Clone 不落地的 DTO 宣称联网／存档完成。

原版补充差异补记：`ReserveWingStats.java:43–64` 在额外部署时还减 launch bay replacement rate，并设置 fast replacements／extra deployment limit。本次按现有 Web 保持“填到2倍+额外30秒”及原 Web queue消费，不偷偷加入该原版 rate cost；因此不能宣称完全原版等价。

## 集中验收结果与边界

真实 `FighterSystem/FlightFormation/FighterTactics/GlorianaFlightAI/AdunArkFlight` 在 Node 和 fresh headless Chromium dedicated Worker 各通过 **8组持续场景、615操作、81次真实 TS Ship 构造、941 queued ship阶段、224,829严格字段、75,127几何字段**。Node 几何差0，Worker最大差 `3.3306690738754696e-16`。全部7模式、普通机／轰炸机、Ark两型、Gloriana三型、missile资格／Fury优先、DOGFIGHT记忆、forced orders、waypoint取消、四种guard orders、护盾窗口、burst/regen返航资格、召回／暂停边缘资格、reserve／recovered FIFO／CRR threshold／逆序 rebuild、母舰死亡／撤离、普通dock修理／Gloriana无修理和 rearm clock 均进入实际源码路径。4次 FlightWorld+完整 Host clone 续跑严格一致；重复更新／重复finish、stale generation、unknown template、负值/NaN dt准入均拒绝。改动 TS／runner scoped ESLint 已通过；未跑全套检查。

证据：`artifacts/rust-combat-core-20261008/verification-flight-world/result.json`；Wasm **190,014 bytes**，SHA256 `3bc212b921d081381a6e0e9fc2037875d767ea42978f8f0b0c069d6d2c807693`。测试文件为 `scripts/lib/rust-core-flight-world-harness.rs`、`rust-core-flight-fixture.rs`、`rust-core-flight-world-check.ts`、`scripts/check-rust-flight-world-module.mjs`。

测试限制明确：最小静态模板有真实 Ship 构造（无 engine/weapon时每机一条 shield malfunction combat RNG），后装真实类型 mount；载舰 stats 在 fixture 中统一为明确输入。实际源码控制路径完整运行；唯一替换为 craft Ship.update queued物理／fire探针，明确模拟 ammo/cycle或致命HP写入再执行原 afterShip closure。fixture aim 使用既有 Rust intercept_time/hull/circle与真实Shield，不是完整任意挂点／动态武器场景。真实模板全构造／所有 mount/engine RNG／完整物理火控／void shield／视觉输出／checkpoint codec／主入口与联网存档仍由主核接真实 writers 后验收。**productionIntegrated=false，fullBattleReady=false**；本报告不作为整场可玩的证据，也未做原版实机／截图验证。
