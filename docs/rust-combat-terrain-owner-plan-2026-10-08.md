# Rust 地形真实宿主接线方案

## 2026-10-09 ROOT 大混编同步查询身份索引与静态外包络

新 callback 清空后重建、公开 API 无缓存的当前生产实现已与其它 9 个 ROOT 性能文件联合集中比较：`verification-resident-combined/result.json`，22 主舰混编 270 步/LAN60 步含真实 reserve 部署全部 snapshot/scene 数值位、顺序与引用结构摘要相同，changed=[]。尚未以此证明 TS/Rust 混编严格规则、最终正式 SHA 或整体提速。

续修：实际new_resident在第一个hull/retreat/environment回调后永久回线性路径会让随后大量near_circle重复失去收益。闭实例内所有可修改身份/几何的同步回调仍先清identity_index和hull_extents，但保留resident可建索引模式；回调完成后的第一query从已经修改后的真实bodies/owned重新建立，不复用回调前任何缓存，后续受控读重复用新索引。公开Host::new仍全程无cache。外部在callback内没有Host引用，故不能在旧索引未失效时读；失败仍沿整步事务。按同freeze旧新完整publication集中检，加callback后真实修改重读与通用API修改重读；不以静态元数据不会变为假设放弃失效。

公开通用Host的bodies/owned仍可被调用者直接修改，不能把该API冒认为闭屏障。`Host::new`保原无缓存语义；只新增crate内`new_resident`供world_owner三个真实同步阶段使用，该实例没有向外返回，生命期内写仅上述受控服务。world回调先清该实例索引/外包络，之后首次query按实时数据重新建立；通用API任意先查→改名册/几何→再查仍读当前值。完整生产旧新对照包含world_owner构造接线。

目标是降低同真实地形宿主内重复名册查找和相同 hull bounds 外包络计算；碰撞数式、全部实际舰/小行星、遍历平局顺序、频率、伤害/资源/RNG、UI、联网权威及存档不变。沿下文已核0.98a-RC8实体与module API及实际AsteroidSystem/ShipCollisionSystem来源；原版实机待许可。late22诊断181–240步真实near_circle13,397次，5.33ms，pair3,003次；仅热点数据，不能当正式收益。

`Host` 一次借用 `[Body]`，该生命期不能新增/删除body，所有真实world callback只更新状态、pose、terrain_speed、moduleflags、盾/资源/伤害；registered Meta身份/handle/module父子与combat bounds/radius不变。新增局部first-match索引：terrain identity(id,generation)→第一Meta，identity+handle→第一Body。f64 id按bit key并归一±0，NaN仍回原线性查找拒绝；每次命中再检查当前真实identity/handle，疑似失效回原路径。保原先meta→body的检查顺序与Err4，循环/未知parent仍按原root长度上限拒绝，不提前跳任何规则检查。宿主内按handle记同bounds的hull外包络；盾active/radius/offset、每次pose与距离仍即时读/算，不cache shield、phase、modifiers或collision eligibility，撞击后后继查询必见真实修改。

ROOT只修改terrain_owner，不碰weapon/flight规则。先方案→局部索引与hull extent→与只恢复该文件旧源的同其它native独立Wasm实际22混编270步和LAN60步含tick8后备部署完整snapshot+scene严格逐帧相同。既有terrain坏identity/parent/cycle门必要定向核；最终七包与相同安装指纹仍需整体验收，不把本域AB当完整可玩。

本阶段接续已验收 terrain_world，目标是让现有驾驶、撞击、地形阻挡与残骸碎裂在同一 Rust/Wasm 权威事务里完成，关闭固定护盾/record component服务。玩家界面、操作、游戏数式及包能力保持既定方案；没有新的产品选择。本次只新增 terrain_owner、独立集中对照与接线合同，不改共享lib/state/battle/projectile/effect_owner，不提交、发布生涯内容。

原版依据沿用 terrain_world方案的0.98a-RC8 Asteroid.java、Ship.java、H.java/Tesselator.java；另外本机 `starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:9–10,35,49`、`ShipAPI.java:446–461,527,541–542,589–596`证明实体速度/朝向/质量、parentStation/slot、isStation/module和shield中心都是实时实体状态。API不证明Web具体撞伤系数，继续保留已有Web差异。当前 `Ship.ts:127–159,177–191` 的assemblyRoot、syncModulePose、独立旋转、parent angular velocity、team/player、撤退与root void接触，`ShipCollisionSystem.ts:114–221` 的质量/即时双目标伤害，`AsteroidSystem.ts:163–245` 的不乘CR撞石伤害与数组splice顺序，`ComponentDamage.ts:9–32` 的真实组件，`ProjectileCollisionHandler.ts:499–524` 的立即环境impact，构成本次最小对照。原版界面/实机待核实；无UI改变、后台验证，不占用用户桌面。

实现使用一次content/deployment初始化的typed Meta（身份代次、稳定string id、mass/station、parent/children、已扣moduleAnchor的offset、angle、independentRotation、spriteHeight/slotPositions）和常驻Terrain。pose/vel/team/player/shield/CR/系统倍率/装甲/组件从真实Body/ShipState每次读取，禁止每帧JS捕获。metadata缺失/旧generation、未知spec/非法树返回错误，禁止填空metadata或忽略未知服务。dead源舰保留供残骸scar/shield/primarySystem；terrainSpeed是本模块真实常驻字段，root飞行观测读取这一字段，不能另设脱节倍率。

Host执行moveRoot→树同步→真实Shield.impact/Flux→Armor.impact/Components→真实共用FX→真实Hull。source倍率在组件边界实时读；armor传入damage/strength已按terrain_world处理，不能再加CR。live modifier在服务边界重新计算；root新增world_owner提供必需Rust World trait，接完整Hull拦截器、rootVoidShield、退场，提供共用粒子占用/工厂及environmentImpact effect/立即爆炸/死亡。接口不会以no-op默认实现这些服务。hurt不是death；碰撞仍由外层既有death scan决定，不在本块新增统计。

借用合同：pair/nebula直接借真实Bodies。调用小行星规则时只take asteroid数组为局部Terrain、hulks/其它Terrain仍在Owned；该阶段Host不会立即世界damage爆炸，视觉服务不得递归玩法。advance_hulks只take hulks/sequence/serial，同步source冷却和split，不调用环境damage。必要查询结束即释放Terrain借用；environmentImpact按resident projectile serial校验后直接传全部Owned给World，不持有局部Terrain，实现立即爆炸可读写所有terrain并产生新的死亡残骸。调用返回无论成功/失败都restore部分，整个外层事务遇错恢复Bodies/Owned/Ordnance/World state/两个RNG/输出，不能半步发包。

流程与取消/失败保持原玩法。worldDamage::Hulk入Terrain不重抽creationRNG；query最近命中保持原tie/穿透/数组身份重查，owner不擅自删除弹体。环境命中先改当前弹体pos，再运行真实trait，后续wreck sparks/debris严格排在同步blast之后。host实例只借一段同步调用，错误向上返回，root联机authority/协议/快照须把Owned全状态纳入版本与回滚。单舰packmetadata在初始化注册，未知内容不能悄悄变成默认。

实施顺序：typed Meta/Owned/admission和真实then-liveHost，安全take/restore运行包装及World边界，随后实际TS集中Node/freshWorker。验收覆盖真实标准/void shield消耗与overload、装甲/组件/伤痕、station/root/module位置和独立旋转、旧generation无副作用、terrainSpeed、残骸真实冷却/分裂、环境命中读取全部地形并真实同步爆炸。FX/特殊Hull必须由World真服务，不把边界record通过称作生产闭合。整场七包可游玩仍由root做最终集中验收。

进度：独立terrain_owner、实际宿主集中对照已完成；root已新增共享TerrainWorld适配和单一Owned，但生产事务、所有环境impact分支及整场游玩仍须由主任务收尾。下述边界不得用探针通过替代。

## 已交付接线合同

`terrain_owner::Owned`是唯一地形状态，包含一次注册的ships、当前active身份和完整`terrain_world::Terrain`。共享`world_owner::Owned.terrain`保存这一Owned；不要再保存并行小行星/残骸副本。`identity(Body)`由真实Body.id与handle.generation组成，Meta.handle另外核验slot和代次。`validate`核验真实combat/armor/shield、所有系统spec、父子双向关系、唯一身份和无环树，未知代次Err4、未知spec/非法树Err8、非法数值Err7。安装只在content/deployment初始化或真实增删舰船时进行。

`Host::new(bodies, owned, ordnance, specs, world, notices)`直接借实际状态。Host.ship的Option接口通过内部Cell保留真正错误，所有公开调用在finish边界传播，不把错误误作“无命中”。调用pair/nebula/asteroid_collisions/advance_hulks/asteroid_commit/hulk_commit/impact必须检查Result；错误时外层恢复整个Bodies、Ordnance、两种Owned、RNG和events/output。局部take/restore保留地形数组所有权，不自行承诺失败调用没有先前伤害/位移或age增加。

`World`的Hull、Retreat、所有FX和EnvironmentImpact是必需服务，无默认no-op。Hull返回真实dealt，须保留Ship.applyHullDamage的原始positive→dead/retreated/suppressed/vastBulk→interceptors→root voidContact→HP顺序；owner不会新增碰撞死亡派发。Retreat须真实clearInput、子树退场、shield/vent/system关闭，不只改flags。armor_sparks在owner先检查实际Armor.data[18]，再按当时Body pose转世界坐标；source位置和常驻particle占用由共用World正确发布。spark密度依赖全后端真实活动粒子，debris与源armor粒子占用应与TS当前reserveParticleSlots口径一致；不能因呈现记录未drain而少计，也不能将独立debris算作TS的particles。

`projectile_input`使用then-live Projectile的prev/pos/radius/damage、实际missile或guidance.rocket及already-damaged floatids。小行星commit本身不新增TS没有的onHitEnvironment；root仍在原WeaponSystem边界同步调用impact。hulk_commit先重查live hulk id，暂装当前ProjectileIdentity(serial+numeric id)，impact在确认live弹体后先修改p.pos，再调用World；同步World回调能访问所有remaining asteroid/hulk和新死亡产生的hulk。World环境回调与TerrainWorld采用整个Owned的swap/take，返回成功或错误均恢复，不持有Terrain借用、不用unsafe。

`admit_hulk`读取源combat.size0..4转换为ordinal1..5和已注册spriteHeight/slots，不重新生成任何creation RNG。advance_hulks只take hulks/sequences/next_sequence，源Scars和真实Shield使用当时fragment facing冷却，仅主System更新；有真实system worldMeta时必须覆盖primary regen，副System保持原状态。全部静态Meta、源Body以及death前的system state须保留到相关hulk/projectile消失，不能从active列表移除源就丢失它。

## 集中验收结果（2026-10-08）

实际`Ship`、`Shield/VoidShield`、`FluxTracker`、`ArmorGrid`、`ShipDamageState`、`WeaponComponentHealth`、`ShipCollisionSystem`、`AsteroidSystem`、`NebulaSystem`、`CombatFXSystem.updateHulkFragments`、`ProjectileCollisionHandler.checkHulkCollision/applyEnvironmentImpact`和`ProjectileExplosionSystem`作为TS oracle；Rust harness使用真实Body/ShipState/Ordnance/system等生产模块，环境场景实际调用共享world_owner::Host::spawn，无伪造armor/component/explosion伤害。

Node和新建headless dedicated Worker各15场景：5,226严格字段、886几何字段、113有序事件，通过；最大几何差`1.4210854715202004e-14`，低于已授权范围。覆盖标准和void真实耗损/overload、front和offset shield、station质量、普通/独立模块旋转、hull/components、suppressed source armorFX、残骸真实Scars/Shield/primary lifecycle/secondary不前进、fracture→装甲split、环境回调读全部terrain→当场真实爆炸→后置sparks/debris。另9项合同检查通过：旧Body代次拒绝且不消耗RNG、未知parent/spec、duplicate/cycle拒绝、小行星/残骸take后错误仍保留数组/sequence、缺失projectile拒绝、suppressed armorFX不消耗RNG。

改动fixture及imports TypeScript集中检查零诊断；scoped ESLint零诊断。Rust编译成功，有共享文件三个unused warning，未替root清理共享文件。证据：`artifacts/rust-combat-core-20261008/verification-terrain-world/owner-result.json`；Wasm1,797,052bytes，SHA256`b6bb43cbad04e4f4f9ae97dff9f71af6cdf3a492e92566eef7e49b2f02c68bf8`。无可见窗口、无桌面输入、未stage/commit/push/release。

边界：本验收environment弹体没有onHitEnvironment插件、rocket、movingRay或source glows参数；验证了真实同步共享爆炸，未证明生产TerrainWorld::environment_impact已完整覆盖这些分支。Hull特别拦截器和实际Retreat并非本fixture场景，trait必需但由root按各服务验收。shared snapshot/rollback和content全七包整场接入不属于本探针；`productionIntegrated=false/fullBattleReady=false`诚实保留。原版源码依据已核实；原版界面/实机仍待许可，未声称原版整体等价。

## 主任务接线具体待办

共享`world_owner::Host::explosion_ship`的shield.data[41..45]越界已由root改为真实四damageType倍率，环境场景恢复通过。仍须核对共享`TerrainWorld::explosion_visual/FxHost`：Asteroid shatter和rocket的TS`spawnAuthenticExplosion`默认rings=true、duration2；当前共用Owned::impact(false,1)与此不同。本独立factory用true2通过，不可把生产现状当作已验收。

生产EnvironmentImpact必须按`ProjectileCollisionHandler.ts:499–524`顺序真实sound→glows→movingRayFade→rocketVisual→registered onHitEnvironment→immediate projectileExplosion→player shake→invalidate；当前共享适配仅cosmetic和explosion分支未证明闭合。root须检查每个content插件的环境命中以及世界owned粒子占用；不把缺少参数的本场景偶然无FX视为全部功能已完成。
