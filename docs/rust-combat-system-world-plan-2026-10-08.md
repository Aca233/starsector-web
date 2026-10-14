# Rust 七包 accepted commands 与同步 world system effects

## 2026-10-09 只读系统观察尝试：语义合格，成本退步，撤回生产改动

下节已审阅方案的<=3内联SystemViews及不可写Observation身份/工程缓存均实际完成，再作同其它源冻结的trueactual270/LAN60完整publication/capture rawf64位/结构/引用对照，摘要完全相同；26必要错误/duplicatefirst/generation/reorder/>3fallback/liveflux/新scope工程变化fixture2677 rawwords也完全相同。结果位于verification-system-observation/result.json及tmp/flight-system-observation/fixtures-result.json。attempt plain SHA507008a0a0367c05dd29acb4b53693fa6f6f35f9ab069cfedc45424ebe97d141只属于已弃优化，不能当作当前生产或正式Cargo。

真实scene_runtime.rs:147每次fire_selected_visual传单component，当前scope不会摊销完整身份索引。真正resident交替16samples/source、300iterations：只内联legacyReader median0.4847→0.4911ms，没有稳定收益；singleReader scope mean0.5213→1.9099ms/median0.4444→1.7797ms，约慢3–4倍；16child共享scope median5.2882→6.7042ms也退步，值checksum保持。完整场顺序计时受其他CPU工作影响不作性能结论。按原验收取舍撤回全部尝试，未扩caller或修改规则来追求收益，不留unused缓存API。

撤回只应用自己的精确patch，保ROOT已完成validate_modifier_observation和其他owner源；system_owner、battle、flight_runtime全部与本次保存baseline逐字节一致。最终SHA分别f39e6f44a1f29d96cf27f16a579b157700b3c12976a48309da690a5cea240340、7abbc3efb95d3233e45351f9e8968eeff6bb0bae94c67dfe58201d5146e55ec1、ad4cd4228bc9d87a23f86e3b4eb2aadf188805e502515ea83765d716df8d6f31，tmp/flight-system-observation/final-sources.json全部sameBaselinetrue。本轮生产delta0，CPU释放；不重跑已撤回检查，不以局部语义通过结束用户全部可玩目标，当前正式性能仍失败，ROOT继续其他实际热点。

## 2026-10-09 正式性能失败后的只读系统观察方案

ROOT已明确授权唯一额外生产调用点 `battle.rs::fire_selected_inner` queued Reader构造前的不可写scope。该scope一次创建Observation，仅在原构造循环内按queued原序使用，保原readers.contains_key重复跳过、support读取及错误次序，循环后立即drop，再进入任何fire/recoil/flux/world写入。Reader不借Observation，保存完整本次views/runtime/owner与parent，逐发read重取实时flux；因此borrow边界不能变成跨writecache。其它Battle区域不变。工程cache按实际owner row，不以重复Handle覆盖owner内容；身份索引必须原firstmatch(slot,generation)。缺失/错误按第一次相同只读world的原序返回，不预判或读后续child。legacy reader/modifiers/validate仍原同期读与完整校验，Observation只是caller明确同BorrowBodies的复用。

当前正式Cargo/LTO `cf8c3f8a…` ABBA正确性通过，但Rust simulation55.6606ms对TS32.3344、roundtrip95.8934对51.8237，性能门禁未通过。目标为保持当前可操作战斗规则与界面，只减少实时系统/工程/飞行观察重复查找和分配，不以旧窄块通过结束用户完整可玩目标。范围限定 `system_owner.rs` 和必要 `flight_runtime.rs` 只读准备；原validate_modifier_observation完整检查保留，不扩火控/近炸/world/TS/玩法/生命周期/资源/RNG/频率或发布字段。

一次当前冻结诊断 `tmp/flight-system-observation-profile/result.json`（真实22主舰/176实体270步、完整capture+ACK）：181–270每帧Reader731.49次/1.695ms、modifiers3739.71/8.311ms、engineering13473.16/8.982ms、find31629.53/5.202ms、views1756.98次/0.770ms，实际最大3系统；flightshared9347.51次/3.634ms已有缓存。ROOT纯校验已减少未消费Reader。nestedtimer和同期机器繁忙不能相加/推算全场gain；sourceUnchangedtrue、profileSHA `b87f50b959211a0657b2029ddaf7fdcfe707eb214b7acf5dda9367e3ee0db50c`，仅tmp，不替换生产Wasm。实际数组规模和调用次数支持先把私有Reader捕获的小数组改为内联。

来源复读0.98a-RC8 `AmmoFeedStats.java:11–24`、`MutableStat.java:52–61` 的独立动态stat与有序modifier来源；它们不证明Web扩展规则。当前严格基线 `ShipSystem.ts:318–330` 的own→递归auxiliary→runtime→有序parent、`Modifiers.ts:3–24` 原f64加乘、`AdunArkSystems.ts:9–10,28–40` 真存活AFT工程模块与online/corona。源码证据保留在既有最小对照，本轮不改变默认/hover/禁用/取消布局、操作或失败显示；原版实机未获许可仍待核实。

第一阶段私有SystemViews对<=3系统使用完整内联捕获、>3仍原Vec fallback，public views保持泛型Vec合同；捕获按原每life完整view计算和eager spec访问，parent身份/engineering/parentviews/usable组件索引错误先后不变。Reader仍拥有本次系统/owner/runtime/parent快照，read每次重读flux/vent/overload且更新module.child，不冻结逐发状态；不改变compose括号或available截止。需要测得局部收益，未有效则弃改。

第二阶段候选为明确生命周期的 immutable Observation<'a>：只持当前Bodies/specs共享借用，用身份→首行懒索引和按row工程结果在同一不可写借用期间复用；首观察依旧原child顺序、stale/缺world/shortcircuit，不提前遍历检查。写前scope必须drop，新scope观察写后live HP/dead/docked/topology/系统；不缓存最终modifier。生产battle queuedReader只读构造前的scope属ROOT，需先协调其最窄接入，当前不擅改caller或worldOwner。flight若没有更大的明确immutable边界不加跨写cache。取消/失败仍原事务完整恢复，authority/存档/wire/并发不变，无用户产品取舍。

实施顺序为当前cost+原版复核→本方案→仅可落owned内联表示→协调后scopedObservation及caller→一次同其它native/TS冻结旧新actual270+LAN60全snapshot/scene/capture原位值/字段/引用结构，加读取顺序/失效/重复首身份/多slotfallback/liveflux与工程修改fixture。集中最少必要检验，不重复已冻结Modifiers/phase/death块、不跑正式性能/全套。完整sameinstalled游玩与正式ABBA仍由ROOT收尾，不能以本块结果宣称全部完成。

## 2026-10-09 ROOT 近炸保留完整失败检查，避免未消费的 Reader

目标是保持现有近炸、护盾与外壳资格，同时减少只读几何查询中未被消费的属性准备。当前整合真实22主舰/176实体270步后90步的诊断显示：`system_owner::reader` 每步6057.83次/5.54ms，`engineering` 13473.16次/4.64ms，`find` 31629.53次/2.69ms；这些嵌套时间含计时开销，不能相加或作为正式提速。先前近炸对照已经证明它不消费 Reader.read 所算伤害属性，但目前仍为每个资本舰构造 own/parent SystemView Vec 和 runtime Modifiers 后立即丢弃。

来源沿用本文件0.98a-RC8最小对照；本次重读 `../starsector-core/data/shipsystems/scripts/AmmoFeedStats.java:11–24`、`../decompiled/starfarer.api/com/fs/starfarer/api/combat/MutableShipStatsAPI.java:21–35` 和当前 `ShipSystem.ts:318–332`。原版证明动态属性独立于纯几何，具体近炸资格仍以已授权 Web `ProjectileCollisionHandler.ts:241–294` 为准；不改原版/扩展规则或UI，原版实机保持待许可。

范围只有 `system_owner::validate_modifier_observation` 和 `world_owner::Host::fuse_ship` 的调用。新增同步验证函数按旧 Reader 的顺序执行当前ship/world、完整engineering children查找、own所有spec eager读取、parent身份/ship/world/engineering、parent所有spec读取、usable battery扫描与原components索引。缺失/过期、短路、潜在越界panic及返回错误顺序保留；不缓存拓扑或live值，不省权限/校验。仅不分配未被使用的views数组，不折叠未被读取的runtime浮点值。root和collisionless/phase原短路继续由fuse_ship执行；真正逐发Reader仍完整捕获和重新读flux，其他modifiers调用不变。

玩家操作流程、取消/失败显示、联机权威/并发、存档和60Hz不变，没有新取舍。实施顺序为本文→保存两源基线→纯helper与单调用点→冻结其它native/TS的真实270混编/LAN60含reserve完整publication/capture逐位旧新→必要16住舰错误/geometry对照集中一次；默认Host未改，已通过的255合同不重复。失败保整步恢复；通过前不标整场合格。正式Cargo同SHA游玩和ABBA仍待ROOT，局部诊断不替代最终门槛。

实际已实现并通过：`verification-fuse-validation/result.json` 冻结除这两文件外相同源，真实混编270/LAN60含reserve的完整snapshot/scene及capture原始f64位、引用结构、字段顺序逐位摘要相同，current plain SHA `2a9f195ae63fe0eb7239b35ebb623a3e70b4efbd928f704fa50689599a97196a`。检查期间火控负责人落已验证单cos修正，changed列出fire_control；两冻结副本仍相同其它源，owned两文件未改，不宣称wholeCurrentSourceUnchanged。

`verification-fuse-validation-fixtures/result.json` 在之后完整当前源冻结，19个直接Reader/纯验证旧新案例和16个真实Gloriana近炸观察都逐值一致，changed=[]。保原Err4/8、缺world普通成功、missing own/parent spec及malformed components的原bounds trap，组合错误的engineering→own spec→parent→parent engineering→parent spec→usable索引先后保持；vent/dead仍先执行旧usable索引。fixture首次编译因诊断方法私有失败，修成pub(crate)仅在诊断副本；失败日志另存baseline-private-method-failed.log，未改生产错误或断言。生产无新诊断导出；此块冻结，最终formalCargo/游玩/ABBA继续。

## 2026-10-09 ROOT 实时modifiers避免临时系统数组

联合验收已通过 `verification-resident-combined/result.json`：当前 Rust 生产模块整体编译，10 个性能文件旧新对照，实际 22 主舰混编 270 步与含真实 reserve 部署 LAN 60 步的全 snapshot/scene 摘要逐位相同（保存负零与引用结构），检查期间 changed=[]。原 missing-spec eager 检查及 owned Reader 逐发 flux 语义保留；最终 TS/Rust 正确性与正式 Cargo 验收仍未合格。

实际混编后段约9,834次system reader/5.30ms；modifiers目前每次先新建own/parent SystemView Vec，再只读compose。沿下文已核0.98a-RC8+当前Web combineSystemModifiers原序，仅独立同步modifiers使用借用当前ShipState的双向迭代器，保全部生命周期/metadata即时读取及原auxiliary截止点、逆序递归括号、runtime后parent合并顺序。原Reader继续拥有完整捕获Vec供真实逐发recoil重新读flux；不得让fire hooks借旧跨变更状态或改变只读snapshot服务。

先实现通用compose_iter并使旧slice compose调用相同计算，再复用同row/parent/module取得方法（保持engineering、parent缺失、spec预检与错误先后）走无临时Vec的modifiers。不缓存最终modifier，不省system/parent合法性，controls/armor/usable与原同值。同其它native冻结的旧新22舰270步/LAN60步全snapshot+scene逐位，以及现有完整modifier states/外部字段有无/失败场景集中验一次；原版实机仍待许可，本块无玩法/UI/权限/存档/频率变化，没有新玩家取舍。实现与分阶段整体交付仍按总策划。

## 主核心常驻世界接线（2026-10-08，继续实施）

玩家体验仍为现有九项系统及三项动态舰装，不改布局、配装或平衡。本次把独立模块接到真实 Body/ShipState/Ordnance：每舰一次安装内容资格、父子和载机代次关系、炮口与系统专用武器规格；accepted 指令只携带准星和已确认方向，origin/velocity由权威捕获。ShipState.systems仍唯一持有生命周期；新增元数据仅持kind、input、jump和实例regen，事件调用期间构造typed Slot并同步回唯一owner，禁止两套timer推进。Host查询按实际roster和allSystems顺序，资源、heal、spawn、jump直接修改本次Rust scratch事务。

来源沿用下文0.98a-RC8 API和已核实Web规则；本次再次读FortressShieldStats.java:15–18、ShipSystemAPI.java:24–53、Ship.ts:934–1040、CombatShipStatusSystem.ts:93–106、SystemProjectile.ts:19–64及三个动态舰装原回调。原版相关界面状态仍待实机核实，不以后台差分宣称视觉等价。

实施顺序为早期封舱/补偿、真实deployment/PPT、当前time modifier、系统update/CR/取消、defense/upkeep/flux、所有舰体motion/weapons、统一system dispatch与FieldRepair、后续gravity/ordnance。全舰体生命周期后重新读取当前parent，后续fire/contact继续读live modifier；静态stats与live增量分开，不能累乘跨帧。Zhefeng真实取消禁用cycle和盾请求，RocFire给PD真实policy；伤害当场中断FieldRepair，成功每发physical recoil当场申请补偿。

失败保持原技能普通拒绝和冷却规则；未知kind/专用武器不完整/stale topology/Host错误拒绝并整步回滚，事件只在commit后发布。联机输入权限维持原链，typed元数据/动力/材料/输入/jump和呈现事件同事务；恢复发布和网络接入继续属于完整生产阶段，不改生涯存档。

集中验收采用实际ShipSystem/舰装/弹体生成联合oracle，比较accepted、生命周期、共享stock、regen、HP、真实生成与两条RNG、动量与damage，geometry只用既定容差；覆盖互斥、同tick短周期、父/工程死亡、失败/重复事件及stale command rollback。验证前不把本节视为已交付，fullBattleReady保持false。后续flight/deck、terrain、世界死亡/AI与生产页仍依总策划推进，没有新产品取舍需确认。

2026-10-08；按总策划P3及主代理分工，独立实现 `native/combat-core/src/system_world.rs` 与集中实际TS对照。本文件和该模块是本分工边界；不改lib/state/battle/projectile/protocol/生产入口、其它分工文件，不暂存/提交/推送/发布，不用可见窗口/输入，不递归代理。

## 目标、玩家体验与范围

保持现有技能按钮/快捷键、确认输入、共享资源、武器锁和取消体验，使Rust对接受指令和生命周期事件真正执行world效果。覆盖日蚀、战列敕令、休伯利安Yamato/jump、方舟forge/barrier/repair、罗西南特attitude/fire control、折锋commutator。复用已交付 `ship_effects.rs` 的live modifier/许可、动态舰装和jump。重力物理/地形、舰载机flight/deck及原生无人机launcher由主核心后续完成；本块不得创造不存在的七包drone系统、免费craft或empty launch。未知/尚未实现world功能严格返回不支持，不能算入准入。

不改玩法平衡、UI结构、生涯存档或联机权限，不重建TS世界、不每帧导入JS stats。扩展指令不存在新的产品取舍。

## 原版依据与当前差异

版本来自 `../starsector-core/starsector.log:1`：0.98a-RC8。读 `CombatEngineAPI.java:90–100,157,294,384` 的真实伤害/弹体生成/source修正，`ShipSystemAPI.java:24–53` 的active/state/stock接口，`DroneLauncherShipSystemAPI.java:7–38` 的RECALL/DEPLOY/ATTACK/landing/index；API只证明执行依赖，不证明七包数式。`../decompiled/starfarer_obf/com/fs/starfarer/combat/systems/int.java:104–130`和已交付jump最小对照证明accepted位置与activated事件分离。

七包主题技能是已授权Web规则。实际来源：`ShipSystem.ts:176–237` 的readiness→扣charged uses→accepted input→pending activation/active events，以及dispatch先复制两种event计数、清原计数、依次onActivate→onActive→onAdvance；`HyperionSystems.ts:45–59,82–107` 的Yamato真实launch之后扣共享charges与jump；`AdunArkSystems.ts:21–28,35–68`的互斥扣费、实时regen与assembly/craft顺序HP；`GlorianaEdict.ts:54–60` invalidates input后中断；`ZhefengSystem.ts:13–24`在IN锁非PD、ACTIVE禁止防御。`RocinanteSystems.ts:116–118`在vent/overload中断IN/ACTIVE。

当前Rust有通用lifecycle、fire/projectile和独立effects/jump模块，但世界技能事件尚未实际接成生产。不能把数值动作列表或notification当成真实执行。原版相关截图/实机状态没有证据且用户禁止桌面控制；保留待核实，原UI不变，本块后台逻辑验收。

## 规则、流程、失败与权威

一次性安装每个系统的kind、实际lifecycle spec、content weapon handle/Yamato安装位置和owner generation。系统slot持accepted input和jump visual，与lifecycle一起Clone/restore。命令只接真正控制边捕获的point/origin/velocity/facing/目标generation；检查实际resident owner/roster和资源。cooldown/disabled/dead/docked/retreated、vent/overload/retreat、charged uses、总pending flux按原先后顺序。toggle-off也是接受命令，但RocFire IN时拒绝重分配关闭，OUT拒绝。

各技能activation reason保持严格资格：Eclipse真实可用energy；Edict接受准星侧别、核心且对应direct module有可用ballistic；Yamato安装reactor、共享core在线/互斥/charges和舰艏400距离/±12°；jump共享与初始point range；Ark依自身core互斥/charges，forge需活assembly武器、barrier需实际shield、repair需受损assembly或shield半径内所属craft；RocAttitude受真实补偿/刹车/发动机资格；Zhefeng需shield和非PD未disabled武器，保留其无ammo检查的当前规则。

效果宿主是同步Rust trait，所有spawn/heal/stock/regen/teleport修改当场作用resident world，不是JS回调或延迟action queue。Yamato在实际onActive读取当前muzzle/facing/velocity，真实source weapon spawn完整成功后才扣60/45储备，随后音频。spawn失败必须返回错误使完整step回滚，不把资源先扣然后藏失败。按真实event计数复制顺序执行，onActivate中断不跳过已复制onActive；相应onActive自身再检查资格。读取不能重复dispatch，已清pending保证一次消费。

Ark onActivate在该系统事件阶段再验证online/互斥/费用；失败真实interrupt。Forge onAdvance写实例regen（不能改公共spec），repair只ACTIVE、owner online时按assembly顺序后world roster顺序，前者1.5%maxHP/s、所属shield内craft12%，均min(maxHP)且死/docked/retreated不修。Edict不再复活已invalidated input，vent结束也不能OUT重新附buff；取消保留原费用/冷却。Zhefeng权限复用live phase reader，raise request必须核心当场lower，并中断禁用mount真实cycle；不只改UI图标。

world roster和generation由authority持有；stale target/context、unsupported kind fail closed。每个slot状态与真实world的RNG/spawn/HP/stock同一事务，失败全部回滚。宿主spawn独占原gameplay RNG（Yamato ID next及source initializer必要条件调用）；本模块不绕开顺序。恢复完整slot spec/kind/input/jump/counters和实体状态，不以projection/status文本恢复。联机客户端只收projection，存档/协议接线属主代理。

## 顺序、验收与待交付

先本策划/来源→typed常驻slot+syncHost模块→actualTS activation/dispatch/effects对照一次集中验收→主核心真实host/command/order接线→完整七包可玩。对照严格accept结果、reason、cycle/phase/counters、resource/regen/HP、spawn顺序/真实projectile ID及RNG；geometry仅pose/muzzle允许已批准容差。覆盖共享抢占、onActivate失败仍已复制onActive、禁用/dead/retreat/vent/overload、原预留flux、success/absent muzzle、targetgeneration、Ark工程失效/corona/assembly/craft/界外、Edict取消和Zhefeng权限，repeated dispatch不能重复支出/生成。

待主代理：把同步host实现接成实际resident ordnance/heal/stock/teleport/audio，完整rollback/recovery/production；重力、terrain、flight/deck及隐式drone依赖不由本块宣称完成。独立检查通过仍 `fullBattleReady=false`。

## 实际交付与集中验收

`system_world.rs` 已交付 typed `Slot` 与同步 Rust `Host`。七包上述9项（jump复用此前独立实现）有真实 readiness/accepted command、通用生命周期、共享资源扣费、方舟动态regen/有序heal、大和实际spawn调用、jump实际mutable pose、Edict输入失效及RocFire中断。新增prepare前导航/死亡取消与readiness后排散/过载/发动机取消接口；它们必须在原barrier调用。未知native/gravity world技能返回Unsupported。不存在当前七包方舟drone技能，未创造无人机动作或免费craft。

`node scripts/check-rust-system-world-module.mjs` 编译独立Wasm，并在Node与全新无头Chromium dedicated Worker调用实际TS `ShipSystem.activate/update/consumePendingActivationFlux/dispatchEvents`、原定义回调与 `spawnSystemProjectile`。每端 **6,750步，234,307个严格字段、5,607个几何字段、20次真实TS大和发射，零差异**。严格项包含失败原因分类/优先级、接受结果、生命周期/计数、shared charges、实时regen、五实体HP、完整已观察弹体ID/伤害/source multiplier/range、世界RNG cursor/ID allocator；几何项仅弹体position/velocity/facing/inherited velocity，实际差异同样为0。

场景包含延迟dispatch、资源在接受与执行间被用尽、共享busy/预留flux、缺失炮口后不复活旧事件、重复dispatch、不停留ACTIVE的大dt、disabled/dead/docked/retreat/vent/overload、非可用武器、护盾关闭、无修理对象、craft盾半径恰好1000与紧邻界内、工程段死亡/停靠和内置/选装corona。ready reason对照发现并修正OUT相对Active的错误优先级；host观察fixture补齐真正模块侧别与实际reactor装配，未改原TSoracle公式。

另有 **8项 authority合同检查**：owner/target过期generation拒绝且不接受事件、缺ordered当前slot拒绝、spawn在已消耗RNG/生成部分实体后错误向上冒泡、完整caller Clone checkpoint恢复后只发射/扣费一次、执行时stock观察过期不能吞错、unsupported gravity拒绝、RocAttitude actual lifecycle发动机取消保留已预留flux。此处只证明本模块错误传播及可Clone恢复状态；没有证明生产checkpoint/网络恢复，caller仍必须回滚整个战斗世界。

验证用resident Rust world是隔离fixture；大和Host实际写入该fixture弹体/RNG，TS侧确实调用完整现有系统弹体生成/source initializer。生产ordnance的完整命中特效由主核心负责，不因上述数字探针宣称已完成。prepare取消源adapter仅调用实际定义controls和deactivate；没有把整舰prepareStep或原版实机纳入本检查。scoped ESLint通过。未跑全套检查或新增可见UI；结果保存在 `artifacts/rust-combat-core-20261008/verification-system-world/result.json`，`productionIntegrated=false`、`fullBattleReady=false`。

## 主核心接线合同

1. 一次安装实际kind和已应用refit/hullmod的lifecycle Spec（包括Hyperion reactor regen、focus cooldown/up）；`Slot`独立持 `regen`，不能按帧写公用spec。把整个Slot（owner/kind/spec、lifecycle各timer/counter、input、jump plan/visual、regen）加入rollback和恢复。`lifecycle.words()`及验证f64行不是完整snapshot。
2. `ShipRead`全部由resident Rust实时查询：hyperion资格含真实hull/source ID且非module；reactor/focus/corona同时查内置和选装；engineering只认真正存活、非docked/retreated的AFT；HP/shield radius、sourceCarrier assemblyRoot、direct parent/side、实际ammo/disabled/PD、补偿状态、runtime disabled、manual、live flux/range和muzzle均不得JS每帧上传。只读值不能造cached gameplay world。
3. `Host.systems`保留真实allSystems顺序与当前borrowed slot的原位置placeholder，本模块原位补当前状态；缺当前entry返回Host错误，绝不append后改变reserved flux浮点顺序。stock/heal/assembly/children/roster均使用generation识别真实实体；stock的普通缺失是Ok(None)，观察损坏/过期是Err，不能吞成普通技能不可用。
4. accepted input由authority捕获origin/velocity/目标generation，point来自已应用的准星指令；不能信任客户端上传origin。跳跃朝向特例来源 `CombatControl.ts:79–83`：接受后用signed atan2归一化已确认方向，其它技能保留真实command-edge facing。本模块拒绝过期target；input/jump不每帧从JS重传。
5. 原序：早期hullmod advance→`cancel_before_update`→system update→CR→`cancel_after_readiness`→真实defense/upkeep/pending flux→motion/weapon→post-all-ships `dispatch`。dead/retreated/HP<=0原路径只取消opt-in且跳普通update；post-status跳dead/retreated/docked。方舟heal在完整weapon之后，Yamato RNG/spawn也在该真实事件位置。不能提前到prepare改变RNG顺序。
6. 核心已有 fire/phase consumer须读取 `system_view` 与 `ship_effects` controls/fire_allowed，真正中止非许可cycle，并在Zhefeng ACTIVE实际lower shield及取消raise请求；仅投影禁用图标不合格。这两项物理消费者属于主核心接线，本模块不对Host发虚构动作替代它们。
7. `spawn_yamato`走已安装SYS_YAMATO/system-only PLASMA完整原source初始化、真实world RNG与命中特效；成功返回后本模块扣45/60，随后`play_yamato`记录可回滚呈现事件。heal精确 `min(maxHP, HP + amount)`，不排序、平均或并行批处理。jump借用完整ships/asteroids，用实际pose/prev/sequence/camera，失败仍保留原冷却。
8. 任何Host错误必须放弃整步并恢复所有实体、systems、RNG、spawns、资源/HP/pose与呈现事件；禁止fail-open转回TS继续同半步。四种普通shared不可用原因只导致当前回调的中断/跳过；Host/Stale/Unsupported错误保留并向上返回。主核心完成上述生产/recovery、gravity/terrain/flight-deck及完整七包可玩验收前，ready标志保持false。
