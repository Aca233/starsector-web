# Rust 完整发布的同阶段只读观察

## 实际交付与集中验收（2026-10-09）

六个授权文件已完成并冻结。同其它native/TS冻结only六文件变量，verification-publication-observation/result.json实际22主舰/176初始body270tick、LAN60tick含reserve8部署全snapshot/scene与local完整capture原f64/typedbits、ownkey顺序、别名摘要完全一致。plain SHA ad843e614325fed75477d8af46ef61ac7349d3360c3434d93dc63d0b223b9021；ownedSourceUnchangedtrue，检查期间fire_query和PresentationOrdnance由其它owner修改已列changed，wholeCurrentSourceUnchangedfalse，不宣称该SHA等于最终当前全源。顺序完整场计时受其它CPU工作影响，不作本块性能结论。

31必要primitive场景3944原始字完全一致，tmp/flight-publication-observation/fixtures-result.json：Err4/8在输出中原序保留、missing spec与bounds六个原trap不变、重复首身份与generation/reorder、alive engineering后坏child保HUD完整失败而system短路成功、缺armor两合同区别、新scope flux/生命周期/父舰death、复制世界隔离都通过。generic commands七处/seat一处constructor替换逐字expected一致，无其他规则改动；不增加生产诊断export。

同resident完整发布交替成本达到预定收益，tmp/flight-publication-observation/cost-result.json：两份真实22主舰战斗均推进181步（全captureACK）后78635发布数值字rawbits相同，SHA1d6260fc4165d0677a09779556ce6742748ec564c53d241a9184f6da4f3f280b。交替16samples/source，每sample20次真正core_scene_publish；mean5.0464→3.8039ms（-24.6%），median4.9997→3.9764ms（-20.5%），checksum1572720一致。保留实现；这是同状态完整publication局部成本证据，不能推成simulation/roundtrip正式门禁通过。

六生产SHA记录于tmp/flight-publication-observation/implementation-sources.json。CPU释放/no running sessions；本块不安装、Cargo、不暂存或发布。ROOT最终同installed SHA正式ABBA和全部正常游玩尚待，原版实机界面对照仍待许可。

## 目标、玩家体验与范围

保持全部战斗操作、技能提示、资源、伤害、计时、舰船包和联机呈现，减少一次完整发布对当前世界的重复身份/工程观察。只在完整publication持有Bodies/world/specs不可变借用的调用内复用，离开发布即释放。范围为system_owner、scene_publication、scene_system_publication；scene_system_read及其constructor兼容接点须主代理额外授权后才实现。不改battle、flight_runtime、phase算法、控制权、生涯存档、RNG、字段、频率、玩家UI或平衡，不复活已弃逐炮短scope缓存。

当前正式性能门禁失败，不能用本块局部结果代替全部可玩验收。低开销诊断tmp/flight-publication-observation-profile/result.json：实际22主舰/176初始body、270tick、每tick完整capture和ACK，181–270每frame modifiers176次，system工程232次/504children probes，system find560次/22988扫描，HUD Reader.owner376.53次、read::row2774.1次/204346扫描，phase read_live724.16次/row171.62次。只有完整pub与内嵌systempub两个scope timer，5.935ms和1.647ms含计数开销且嵌套，不能相加或宣称可减收益。原native全部未变；主代理同时修改TS PresentationOrdnance，changed如实列出，未宣称wholeUnchanged。profile SHA c298d118cdfdec7acfb81278c89cfebedf1d8de6068412b30ed73d55ce035536，仅tmp。

## 原版证据 → 预期行为 → 当前差异 → 验证

原版0.98a-RC8（既有starsector.log版本）：../starsector-core/data/shipsystems/scripts/AmmoFeedStats.java:11–24通过MutableShipStats独立增减实际属性；../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/MutableStat.java:52–61、216–238、345证明独立有序modifier来源和读取。这些源码不能证明Web扩展的工程段或HUD提示。其严格依据是当前ShipSystem.ts:318–330 own→recursive auxiliary→runtime→parent顺序、Modifiers.ts:3–24 f64加乘、AdunArkSystems.ts:9–10/18–40存活AFT和当时online/corona、Ship.ts:764–775当前parent/shield/allSystems/external phase原序。

当前Rust完整pub按body原序调用modifiers、phased_world和HUD系统原因/状态。system_owner::engineering在首存活ENGINEERING child后短路，local_owner缺armor默认hp1；scene_system_read::Reader::owner必须继续检查所有children，live要求实际armor存在。两个工程合同不能共用缓存结果，也不能把某个短路成功当作完整检查通过。拟分别按真实owner row懒记结果，身份索引只记录首(slot,generation)对应原row，不以duplicate覆盖。仍按原call先后计算全部数据、所有spec/malformed components/child验证和失败优先。

原版界面截图和实机状态在本域未获许可，默认/悬停/选中/禁用/确认取消实机仍待核实；本块UI、快捷键和布局不改。实现对照采用全publication rawf64位/typedbits、key顺序、别名和全部提示，不能以后台通过宣称原版画面实机等价。

## 规则、流程、失败、联机及存档

1. 完整pub仍先原scene/prelude/read验证、flight Closed/no admission、active roster，之后才创建不读取数据的只读观察scope。identity index首次真正查找时构建，只读取所有Handle，不访问ship/world字段、不预判错误。每次身份查询返回原首row或Err4；row已有情况下保持原直接越界trap而不是改成别的code。
2. system_owner同步modifier仍按旧engineering→own eager specs→parent身份/ship/world→parent engineering→parent eager specs→usable components→compose顺序。只工程结果在同borrow按实际row懒复用，首读取保原child顺序与短路；最终modifier继续每调用完整计算，原f64括号/有无/负零保持。
3. publication HUD Reader首先按原row→ship→world→所有children完整扫描→phase→runtime构造Owner，只有全部成功才可复用（若保Err缓存，同一不可写世界错误不变）。owner cache独立于system短路工程，按row且从未跨world写入。所有system_reason/status/Host的方法保现实现，不复制另一个提示规则。generic命令/seat Reader无cache，constructor兼容仅换创建API。
4. 内嵌systempub与完整pub可共用同Bodies/specs索引，但owner观察只依这次真实world不可写借用。不提前读未来body，不跨frame、不静态最终数值cache；flux/hp/lifecycle/parent/children等在下一scope重新观察。phase helper若需改变先主代理授权，初版沿用当前phased_world完整读取。
5. 取消、拒绝、malformed及异常仍原错误/事务恢复，不省授权或验收。联机只读取已commit权威事实，客户端接收完整同序字段/回执；不改输入、并发、恢复协议、存档或RNG。无玩家产品取舍待确认。

## 依赖、顺序、验收与未完成

先原版/Web来源和本方案→授权必要Reader接点→保存当前owned基线→仅同scope索引/独立lazy结果与最小caller→同其它native/TS冻结trueactual270/LAN60 reserve部署完整snapshot/scene/capture rawbits一次→必要错误顺序/duplicatefirst/generation/reorder/缺world与spec/malformed children/新scope live mutation fixture与resident pub交替成本一次。旧Modifiers/phase/death/逐炮检查不重复，不全套测试，不安装/发布。

必须全部字段、RNG、rules严格位一致，保持原首失败与panic，父工程变化/死亡/flux/系统变化/拓扑更换只能新scope读取。必须有同resident完整pub交替成本收益；无益或退步弃改。主代理最终同installed SHA的正式ABBA与整场正常游玩仍待，本块未证明完整交付。

ROOT已在flight-owner task TOP明确授权Reader私有可选PublicationCache、构造、owner完整成功缓存与局部row/ship接点，以及scene_commands七处/scene_seat一处纯constructor兼容，其他规则不动。现六个授权生产文件实现：完整pub在原capital之后创建Rc共享Observation，modifiers和contacts使用；内嵌systempub在原meta.validate与active时点之后使用publication Reader。Identity索引懒创建首duplicate row；工程结果按row独立Vec惰性分配，最终modifiers未缓存。Reader owner只有完整旧扫描/phase/runtime成功后才缓存，generic None仍原访问路径；phase/battle/flight无变。当前编译通过、集中old/new270/LAN60全rawbits进行；必要fixture和resident全pub交替成本未通过前不能标本块合格。
