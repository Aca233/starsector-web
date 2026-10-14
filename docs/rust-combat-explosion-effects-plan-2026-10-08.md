# Rust 常驻爆炸、近炸与弹体拦截：实施策划

## 2026-10-09 当前授权准备：近炸舰体校验与关系观察

上一导弹子项仅0.105ms，无生产改动。ROOT现授权 `world_owner::fuse_ship_at/visit_fuse_ships` 和必要的 `system_owner::validate_modifier_observation` 同只读helper，`PublicationObservation`、compose、phase_runtime现仍其它owner/ROOT所有权。先准备源码/方案/低timer脚本，重型CPU尚未开放，不运行或冒称计时结果。

重新读本机0.98a-RC8 API `ShipAPI.java:281,336,449,472`：isAlive、isPhased、parentStation、childModule接口；不能从接口猜反编译内部查询缓存。当前Web `Ship.ts:755–776` collisionless/isPhased为实时parent→dock/retreat→shield→有序系统→external effects，`ProjectileCollisionHandler.ts:257–286`原A后B战机/C大舰逐资格及当前几何。native既有范围内以 `fuse_ship_at` 实际先ship/combat→modifier前置观察→root→collisionless短路phase→几何投影为准，必须保Malformed first/missing字段/异常发生时机和None结果，不能为了资格提前筛掉检查。

现源码具体成本候选：`validate_modifier_observation` 每个模块都重复parent engineering children原序find+owned/alive短路、parent systems spec indexing；`root` 每层 `body_index` 按 semantic id/generation firstrow再handle firstrow解析parent，重复identity与handle不等价；`phased_world` 再递归parent/child membership、anchor scene、ordered systems/control/external state。相同&self查询中的bodies/world/specs是真不可变，结束后立即仍可被伤害/生成/捕获/phase/关系修改；不能做全precontacts/tick/battle缓存。

诊断准备：当前源冻结的实际22/176body270，每步capture/ACK，warm180后90；稀疏记录整fuse/visitor总量，fuse_ship_at三个callee使用连续观察序号每67个只取一个样本（只采样观测调用host clock，其余wasm count），分别统计modifier/root/真实phase短路调用。保返回/early failure，timer对象drop在?早退时也记；记录sample counts与raw aggregate，不将×67估计当精确总成本或正式速度。不改production timer，等ROOT CPU窗口才执行一次。

若成本有据，优先新增独立 `FuseObservation<'query>`（不改PublicationObservation）lazy first-handle行映射+工程子模块原短路结果缓存，validate函数新增observed变体/原函数委托None：每次仍完整按原顺序查自己systems specs→parent→parentengineering/specs→原mount/component.any，缓存只在真实走到engineering时读写，失败原None/错误不预读。world fuse visitor维持完整scope列表错误在先、dock/retreat成员筛选、first semantic ID解析、原fighter/capital名单和early-return；可用单query first-ID映射替代重复linear lookup，或在原root每层依次访问时共享handle lookup，不把先未触达坏field预检。公共单fuse_ship调用仍旧原路径；observer只归一次visitor，不进commit。

phase若主要成本，必须先给ROOT精确helper范围和短路证据再授权，不能自行复制read_live算法或跳检查。候选是其owner增加只读query observation，使parent phase结果只在原递归到达时memo，并保visited-cycle上下文、firsthandle/children、anchor missing、spec/control查序；同一row在不同seen上下文出现的错误不能直接错误缓存。当前尚无phase生产方案授权。

实际实现后一次sameotherfreeze old/new270+LAN60/reserve完整raw publication/capture，定向拓扑/engineering早停后坏child/spec缺失/component越界/root循环/duplicateidentity+handlefirst/phasecollisionless短路/unknownHost与下一query实时写变化fixture；原比较字段、RNG/clock/规则/几何界全不放宽。独立低开销同冻结成本确认明显有益才保，无收益撤自己增量。UI/玩家操作/联机权限/存档/失败事务无改变，新功能外部边界、ready/default/正式ABBA/发布都不做。

## 2026-10-09 下一性能块：近炸只读导弹解析

ROOT 的实际完整270/captureACK profile记录 precontacts8.877ms/171.589calls，但这不是近炸导弹子项计时。本次只 owns explosion_effects/world_owner 的 fuse只读 missile 接面；不动已验 ship保守geometry/interception、store写路径或fuse_commit。先冻结当前源，以稀疏计时 precontacts/store/fuse/interception及近炸导弹循环、只计数missile读取，真实22/176body warm180后30且每步captureACK确认比例，再决定是否落窄优化；不把总8.877都归因本循环。

本轮重新读原版0.98a-RC8 `BallisticProjectile.java:162–170`、`Missile.java:614–622`真实elapsed/advance状态，核Web `ProjectileCollisionHandler.ts:243–257`：A原候选顺序、isRocket/hostile、当前位置距离<=range、第一满足就停，然后才B/C/D。原版片段不证明Web扩展近炸算法原版等价；当前严格oracle仍Web已授权流程及当前native旧接口。UI/操作/同人机制/联机权限/频率/存档不变，没有新产品取舍。

若导弹准入确有成本，具体候选是 `Host.visit_fuse_missiles(candidates, visitor)->bool`：default仍按收到的完整IDs逐 `missile(id)`、missing跳过、visitor firsttrue立即返；所有列表建立/副作用/资格顺序保持。resident只能在当前&self借用内建立全部ordnance的firstserial→row映射（包含非missile首行），再按candidates原序投影；与旧f64==语义一致处理-0/+0，NaN不能匹配，generation!=1跳过。重复serial必须原第一个row，不能像直接iterator任选后面missile；非missilefirst也照旧完整projection，再由原rocket/hostile资格过滤。query后map销毁，下一commit/出生删除/position/flag变更立即重新观察，不跨query缓存。caller的missiles列表保持，不擅改weapon_world；如需改该adapter先ROOT协调。

原核心dist/hostile、早停、B/C/D、target/几何/RNG/错误/实际伤害/fuse_commit全部保持。验证集中same其它native冻结old/new真实270+LAN60/reserve完整raw publication/capture，default访问顺序/缺失/重复/早停及residentduplicate including nonmissilefirst、NaN/-0/generation/live新query。最后同冻结profile子项，收益不足精确撤回自己的修改并保原因，不能为语言迁移改变规则。最终formalCargo/ABBA/可玩仍ROOT，当前无声明性能或最终合格。

本轮诊断完成后决定不实施该候选，生产零改，无需旧新全场重测。`profiling-fuse-missile-current/result.json/source-binding.json/summary.json`：actual22/176body210，每步完整capture/ACK，warm180后30；native生产source全程changed[]、exit0。稀疏precontacts6.1170ms/152.633calls，fuse5.81021ms/29.2；A导弹循环0.05681ms/29.2（包含854.733次只计数读取）与missiles列表0.048667ms/29.2，共0.105477ms=本样本precontacts1.72%/state0.17%。interception0.15819ms/store0.14340ms（含其它store调用，不能全部归precontacts）另列。大部分fuse耗时在船观察/校验，非导弹O(n²)；多层重叠计时、并行负载及临时opt3仅诊断，不能替代正式速度或正确性。新增每query索引成本/合同复杂度无足够收益依据，保原代码，比候选真正firstserial优化更值得先研究实际舰船观察。

冻结生产hash：explosion_effects `667426c69e4da6299371cf16bc52937bbd2da0905ba8eafd59d51c351f8650b1`、world_owner `46658225065d5a88f1181f87a343f43aaef04f6398e64dc05ee480c539f8badc`。尚未改/验任何新接口，重复serial/nonmissilefirst与live query等仅为未来若授权方案要求，不能冒称本轮fixture已通过。已向ROOT交舰船validate_modifier/root/phased观察热点待下一所有权协调，CPU释放。

## 2026-10-09 正式性能门失败后：近炸列表解析与保守距离方案

正式Cargo cf8c3f8a正确性已通过，但实际ABBA simulation55.6606ms/TS32.3344、roundtrip95.8934/TS51.8237，性能门未通过，不能把该证据覆盖成成功。此次只改explosion_effects.rs及world_owner.rs的fuse路径，界面、操作、伤害、clock/RNG、联机权威/频率、取消/失败事务、存档/生涯无新规则或产品选择；其它system/topology优化由其owner负责。

先核来源：本机0.98a-RC8 BallisticProjectile.java:162实际advance/didDamage，DamagingExplosion.java:188–208真实半径与核内外伤害；原版只支撑真实状态/范围语义，Web近炸扩展不可冒充Java等价。现Web ProjectileCollisionHandler.ts:241–287仍A导弹→B战机→C当前大舰盾弧/舰体→D射程；C已使用distanceToDeployedShield(limit)和mayBeWithinShipHullDistance而native无条件算全polygon。HullGeometry.ts:265–287为authored vertices的max(|x|+|y|)旋转保守界、1e-7*scale余量，非collisionRadius，NaN/Infinity/extreme fail open；ShieldCollisionGeometry.ts:227–255为radius+limit enclosing-square，近处原三角/弧端点算序。当前native hull_geometry_distance保原contains+每edge严格算式，因此可以只对已证远处跳过它，不能把半径当真实表面。

实际当前200步/后30诊断profiling-fuse-geometry-current/result.json：fuse28.233calls/12.4823ms，fuse_ship4969.0667calls/8.2721ms，hull_geometry_distance1100.1667calls/1.25890ms，shield_distance同1100.1667calls/.13058ms，fighters/capitals各28.233calls/~1ms。计时中多层timer与并行CPU开销明显，不是正式性能证明。住舰fighters/capitals先Owned.rows校验完整scope，然后Ship ID逐index过滤，再fuse_ship index、root index，重复查同一不可变body。

方案一：Host加单query visit_fuse_ships(fighter,visitor)默认仍原fighters/capitals全列表→每ID fuse_ship→原早返，未知Host副作用/重复/缺失/过期代次/列表建立在先的错误顺序全保。resident覆盖方法先按原Owned.rows完整校验、相同ship离场/size成员条件与self.index first-match构造**本查询canonical rows**，再直接private fuse_ship_at(row,id)做原完整modifier/root/phase校验和live投影；fuse_ship公共原index→同helper。所有列表错误先于读取，重复identity仍解析原first-body，保first资格；只读借用结束后立即丢弃行列表，不跨任何mutation/query缓存。

方案二：仅C的shield查询可加入与Web同enclosing-square reject，返回Inf只用于证明>limit；hull may-near helper逐次读取bounds计算有限L1reach而非缓存（Rust bounds不具冻结品牌，但当前&self借用不能在query内写，下一query重新观察）。所有Pose/geometry/limits有限且scale<=1e100才可拒绝，边界用Web原1e-7scale余量，negative/NaN/Inf/degenerate/extreme仍原exact回退。保原shield→Math.min/min→精确hull与<=的算序，满足不了reject证明就完整原distance；算法不改变任何近处距离或candidate接受阈值。

实施顺序：本文与source→窄两源实现→同其它native冻结baseline/current plainWasm actual22 270与LAN60/reserve完整publication/capture raw-bit严格比较→默认Host顺序/stale/missing/live合同、真实resident缺phase/root/parent/重复身份案例与几何边界/凹/退化/远顶点/NaN/Inf/extreme集中一次→同冻结窄profile后项→ROOT新formalCargo及完整ABBA/可玩门。此前54未受影响的explosion模块场景不默认重跑。原版实机/UI待许可，本块无可见窗口与输入。若任何资格/错误/资源/RNG不同则定向修复相关位置，不能提高误差阈值、跳原校验或把诊断改称正式验收。

### 2026-10-09 本轮近炸窄计时收尾

afterprofile采用正确性集中验收的冻结current-native，actual200步后30帧：fuse_trigger仍28.233次、ship实时观察4969.067次，modifier4969.067/root4974.6次均未减少。原全hull与shield几何各1100.167次变0次，改为同数的保守远界检查；这是该晚场样本，近处/边界/异常原exact回退由2048案例另核。原fighter/capital列表各28.233次改为56.467次resident有序visitor，不跨查询缓存，firstduplicate解析和完整scope校验先于逐舰观察。

诊断fuse12.4823→6.6869ms、旧fuse_ship8.2721→newfuse_ship_at4.6844ms；新hull保守检查0.25582ms、shield保守检查0.05909ms。前后并行CPU/嵌套timer负载不同，state86.556→45.742ms不能作为整场收益。profile没有正式source绑定断言，before是当时current生产、after明确frozen current-native；详细限制与实际次数在verification-fuse-near-query/profile-summary.json。完整严格等价仍以result.json为准，不以窄profile替代。两production fuse路径已冻结，旧正式ABBA失败证据保留，ROOT统一freshCargo/同installedSHA与完整可玩门尚待。

## 2026-10-09 实时截击只读查询优化方案

目标仍是原点防弹体逐帧连续扫掠，不改变玩家操作、UI、玩法、联机host权威、60Hz或存档。ROOT授权本块仅`explosion_effects::interception_query`只读generic接面及`world_owner`相应只读missile投影；必要时`weapon_world::projectile_precontacts`窄adapter。其它死亡、爆炸、舰载机、beam、geometry、RNG、可见窗口及生涯内容不做。原版0.98a-RC8 `BallisticProjectile.java:162`实际advance保持原弹体状态与didDamage；`Missile.java:614`实际推进，`settings.json:9`60fps。本优化不声称Java算法与当前Web自定义点防扩展完全同等；实际严格oracle为当前`ProjectileCollisionHandler.ts:431–455`：数组原序、rocket/hostility/damaged IDs和targetflare条件、严格最近`t<first`，只有真实有missile候选才查询ship→asteroid→wreck，并要求`first<limit`。

现状：native `interception_query`每次先`Host.missiles()`遍历真实ordnance生成serial Vec，再每serial调用`Host.missile()`重新从头找同一个对象；一次query约O(projectiles × missiles)，actual22晚场ROOT诊断precontacts平均154.6calls/14.85ms。`world_owner::Host`拥有原样ordnance，不需要用id重新搜索纯读取的同一个对象。live序列、投影字段、generation、source/team、gravitycaptured对象、源自身及全部资格不得省；每个commit/出生/删除之后必须重建下次查询视图。

方案：给explosion Host新增仅本函数消费的`visit_interception_missiles(&mut visitor)`只读方法，默认实现完全沿旧`missiles()`→`missile(id)`顺序和缺失过滤，保未知/fixture caller观测和完整generic合同。resident Host覆盖该方法，借本次`&self`原样projectiles iterator、按原missile||guidance.rocket成员条件，直接以原完整字段投影逐个传入Visitor；不存全场缓存、ID索引、不跨query存值、不改所有其它missile lookup/mutation。单一共享投影函数使旧missile(id)和newvisitor字段一致。生产serial由Ordnance monotonic递增且上限u32、回收不复用；generic任意重复/失效generation仍保default旧lookup语义。query核心原算式、序/tie、obstruction时机不变，commit同步动作和RNG不变；Rust借用在query返回前结束，随后mutation继续旧路径，错误仍完整步事务回滚。

流程：窄profile真实200tick/后30子项确认→以上窄实现→同冻结其它源前后真实22 270完整publication/witness、LAN60与部署场景strict→现有54generic oracle一次集中及visitor/default观察必要检查→窄profile后项→交ROOT最终Cargo/全场可玩门。先profile尝试遇ROOT正在修改的flight_runtime临时borrow编译错误，尚未运行，没有假计时。待该窄函数稳定再跑一次。没有待用户产品取舍，旧接口必须保持完整并允许未知caller走原路径；任何扩大行为范围先改方案/报告owner。

验收：全部目标身份、generation、最近t/point、过滤/遮挡/firsttie、伤害/commit/retirement、所有资源/clock/RNG和完整capture逐位保持，old/new数据不得混其它owner新代码。通用Host默认调用次数/次序不减少；生产visitor无跨查询旧值，通过pass-through后删除/新目标继续的实际场景验证。性能只报告同场diagnostic变化，最终ABBA/55Hz与整场可玩仍ROOT同installedSHA集中验收；未运行据实标明。

2026-10-08；依赖已确认Rust/Wasm范围和总策划。沿用现有Web规则，真实目标、伤害、资源、计时、RNG严格一致，仅纯几何使用已确认有限容差。本块完成后仍需主任务做完整生产闭包。

## 目标、玩家体验与范围

玩家维持原有操作：导弹真实碰撞后溅射、高射炮接近目标/射程耗尽近炸、点防弹体连续扫掠拦截；盾/装甲/组件/目标回收即时生效。迁移ProjectileExplosionSystem常驻寿命与命中过一次的集合、VoidShieldArea接触时冻结足迹、近炸引信实际A/B/C/D检测、legacy破片数值与有序visualRandom、弹体拦截最近目标及阻挡排序。

不改UI/数据/弹道制导/terrain毁灭/七包系统/生涯schema。主任务拥有lib/state/battle/projectile/protocol接线；本任务仅`explosion_effects.rs`、本文和独立oracle。未知扩展/缺world动作不能静默忽略。暂停/aftermath不推进；取消/重开销毁resident explosions。无引信/未满足距离不扣伤/抽随机；source-fuse生成真正持续explosion，没有legacy额外伤害。失败属于外层完整步事务，不半步重试。

## 原版证据 → 预期 → 差异 → 验证

来源版本0.98a-RC8，读取`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/DamagingExplosion.java:188–209,222–236`：damagedAlready过滤、core-radius线性插值max/min damage、notify记录直接目标及关联模块；`Missile.java:983–999`生成真实DamagingExplosion并addDamagedAlready直接目标。Missile反编译出现错误Iterator cast，不照搬此异常类型，通过DamagingExplosion本体和API语义交叉核对。

实际迁移合同：`ProjectileExplosionSystem.ts` spawn立即apply、life-=dt且<-1e-9退出、随后velocity漂移再apply，Ships正序、missiles倒序、asteroids快照正序；按collisionClass控制FF/fighter/missile，持续每实体只命中一次。`VoidShieldArea.ts`每hostile root一次屏障、alreadyIntercepted冻结fraction0、inside不触碰、remember后足迹不跟随carrier或fallen shield。`ProjectileCollisionHandler.ts:220–480`近炸A missile→B fighter→C真实盾弧/多边形→D射程，拦截t严格小于live ship/asteroid/wreck obstruction；legacyAoE和source spec的规则有意不同。`ExplosionContact.ts`默认hull圆fallback内含半径*.82，nearest polygon strict tie，盾弧最低5°，不是完整active圆。

Web自定义void盾与legacy高射破片不宣称原版：原版证据只支撑native blast的基本语义，迁移保持既有扩展。没有本次原版截图/实机，用户禁止桌面操作，原版视觉/实机等价待验证。

## 规则、状态与提交

每explosion拥有source payload、spec、position/life、冻结void screens、hit ship/asteroid/missile身份列表；caller须保留source hit-time damage stats，即source从active roster移出后仍沿现有OutgoingDamage语义。世界观察通过Rust内部live借用接口，每个伤害/死亡/回收即时commit后再取下一个目标；禁止冻整批contact/damage。Ship和projectile身份必须含generation，重复id新代次不继承旧命中记录。

真实damage接口支持void/普通shield absorb、hard/softflux、armor raw hitStrength、component、statistics及world destruction。输出具名表象/音频/统计顺序，visual samples在Rust消费；legacy smoke8×8样本、玩家radio conditional sample、missile visual内部样本依照现有函数。interception query返回目标身份/t/point，commit应用普通damage→effect额外damage→判断毁灭→统计→damagedTargetIds→pass-through/source explosion，不以query代替执行。

shield与hull geometry由resident数据计算，team/isPlayer可缺状态沿CombatTeams原规则，不用默认team0。root/assembly关系在live世界查证；footprint保存team与center/radius/fraction。near fuse source eligibility保留isPlayer undefined的旧分支，不在迁移修正。

联机客户机不能直接调用damage、爆炸初始化或写damage结果；静态spec准入和真实spawn由host Rust负责。恢复包含resident explosions/hit lists/screens、两条RNG和内容/构建指纹。存档schema不改，不暂存/提交/发布。

## 实施、验收与状态

顺序：来源/本文→数值contact/falloff/fuse/intercept→resident explosion与即时Rust提交→source/legacy近炸完整动作→一次集中actualTS/WasmNode+fresh headless Worker→主任务真实world/生产接線。无新玩家取舍。

验收严格比较触发、目标/t tie、hit lists/screens/寿命、shield/armor/component amounts、普通/软/硬幅能、removed missile、source exclusions、RNG及有序输出；几何容差单独记录。涵盖inside/outside/deployed arcs/offset、多边形/圆fallback、same-team/noFF/fighter、last shield层/移动后屏障、persistenthit去重、proximity range0/expiry/source spec/legacy、missile flare target/pass-through、obstruction equal-t/wreck桥、whole-step错批回滚和repeatpublish。集中风险相关测试，不跑全suite。

当前：来源/策划完成，实现进行中；完整world毁灭/真实接线、七包生产可玩和性能不能由本模块结果宣称。

## 已完成模块交付与实际证据

`explosion_effects.rs`已实现typed resident explosion/screen/hit身份列表、contact/falloff、source与legacy fuse触发和提交、最近interception query/commit、weakly-simple wreck边界。`Host`必须由Rust世界实现，读取then-live对象且所有mutation即时执行。未改shared battle/state/lib/protocol；本块没有启用生产。

一次集中差分`node scripts/check-rust-explosion-effects-module.mjs` Node和fresh headless dedicated Worker通过54场景：6,364严格字段、719几何字段、524有序记录，最大差0。actualTS ProjectileExplosionSystem、getShipExplosionContact、ProjectileCollisionHandler近炸/拦截、segmentCircleEntry/segmentHullHit是oracle；damage services记录请求。证据`artifacts/rust-combat-core-20261008/verification-explosion-effects/result.json`；Wasm1,482,280bytes，SHA256 `4b6b3eddb7438c345b723ab1afaba564e911655def974fec42cbc2e61edb41e9`。严格scoped ESLint通过，没有全suite或桌面操作。

差分纠正真实顺序：ProjectileExplosionSystem炸毁导弹按HP→detach→interceptstat→splice；legacyfuse则按HP→detach→splice→sound→visual→text。两者不能合并成统一顺序。sourcefuse使用真正explosion并zero velocity；legacy八团烟64visual samples、条件radio保留。

### 主任务必须保持的接线合同

- 将`Explosions`及其active payload/source/screen/hit lists纳入当前整步clone/回滚与恢复。`spawn`必须立即apply；`advance`在当前WeaponSimulationSystem约定阶段调用，不在发射后随意额外推进。`source ship`离开roster时，payload不能只存失效ID而失去OutgoingDamage及missile增伤。当前Payload的规则来源由Host保留，需与项目已有source retention策略对应。
- `Host.ships/fighters/capitals/missiles/asteroids`每阶段提供原语义顺序；`ship`/`missile`随后按identity+generation读实时状态。筛选dead/collisionless/FF/phase/assemblyroot必须来自本刻世界，不用上一投影填入。`Ship.shield.facing` FRONT使用ship facing，其余真实shield angle；shield_taken含graviton、energy-only和既有modifier，不能硬填1。
- `absorb`是shield.impact的真实路径；area void屏障不产生普通flux（TS仅absorb）。普通hit absorb后再调用真实shield_flux及overload/lower callbacks。Armor的raw strength在native/legacy explosion为pre-CR raw damage，之后propagate/hull先后依对应分支。Host能复用`weapon_effects_owner`的真实ShipState提交思想，但explosion需要damageKind/rawStrength参数，不能用energy默认方法替代。
- `Output`不持规则写权，按即时提交发生顺序进publish/event音频/FX/统计。`Smoke`省略固定字段：maxLife1.1、alpha.85、maxLife为1.1、color[42,40,44]；CameraShake固定(3,.1)；FloatingText kind0对应BURST INTERCEPTED(12,.85,[120,255,160])，kind1对应BOMBER SPLASHED(14,1.2,[255,80,80])；ShieldRipple(35,[255,120,100])。Fuse声音使用静态真实soundKey，默认flak_explosion。SourceExplosion包含数值Spec，颜色/原版visual spec由对应static delivery retained元数据消费，不可统一改色。
- `missile_visual`必须同步运行真实source missile visual/AuthenticExplosion RNG；oracle此处record-only，无完整visual内部random覆盖。`asteroid_impact`须走真实terrainHP/shatter/随机/子实体，不是输出假事件。`interception_effect`须接本弹onHitEffect追加damage并随后读取target实时HP；unknowneffect拒绝。
- `interception_query`仅query。commit之后外层按实际返回删除source/target，不能提前删target后再effect。target毁灭统计先于其visual；passThrough preserves pos，damaged projectile列表保存identity。rocket源爆炸使用真实source_spec（无spec保持无爆炸），source visual还须允许retired source identity被使用。
- `fuse_trigger`沿isPlayer optional的现有hostility分支；legacyfuse sourceTeam还允许在emitter绑定里推导，这需由payload allegiance compile补齐。prox source spec只能走spawn，不legacyAoE。radius0保留其TS truthyfallback视觉radius45与damageScale0的区别。
- 已入screen的root足迹不移动、不在fallen shield后漏伤，不重复吸收；alreadyBlockedRoot在shieldfallen/dead时仍冻结fraction0。持续explosion对fraction0ship记录命中过，从而后续不重新伤害。

剩余明确未验收：实际world/Armor/Component爆炸集成、entitygeneration回收/错误整步回滚、live chain destruction/asteroid fracture、完整visual内部RNG、生产release/projection联机闭包。不可把上述record服务对照误报为整场可玩。

### 2026-10-09 visitor 窄块验收

已实现 explosion Host 默认访问器和 resident world Host 原序只读投影，同一投影函数用于旧 missile(id) 与 visitor；没有修改 weapon_world、近炸、爆炸、提交或 RNG。编译时借用限制保证 visitor 结束后才恢复 live mutation。默认访问器仍执行每个旧身份的 lookup，缺失/代次、重复身份、失效值不被去重。现有未知 caller 继续完整路径。

隔离 native 前后仅 explosion_effects.rs / world_owner.rs 不同，actual22 270 步与 LAN60 含第8步真实 reserve deployment 的完整 publication/capture 350,201,415 strict 值、62,705,418 objects、113,700,301 typed cells 全逐位同，source bind changedDuringCheck:[]。原54 TS oracle 在 Node 和新无头 dedicated Worker 中6364strict/719geometry/524events原断言通过，最大差0；额外default合同位255涵盖调用顺序、缺失与失效generation、重复身份首tie、删除/出生后实时读取、collision flag变化、damaged identity过滤、早退不调用、实际pass-through commit后下一query。proof verification-interception-visitor/result.json，before726211553546fec3e6dfea5bed3e4d124a2ab4ad5bc6612d7ff45479c30c7dc1 / afterff6f051c0a9d8877a99133d1dbb7026affabd309db9d57f5e52fc052046da19d。generic oracle依然record-only，不宣称其为真实damage闭包；actualkernel对照记录真正运行。

本轮真实对照附带native诊断54.513→54.567ms、LAN8.112→8.636ms，不能证明提速，另有并行诊断编译且非正式ABBA。初窄200tick剖析查找约0.42ms而precontacts约8.49ms，query timer因generic '<' marker漏挂，已纠正只读diagnostic，用同冻结other-source再确认query/store/payload；不把这块当整段性能或可玩已经完成。当前两源冻结，正式Cargo/同installedSHA、整场55Hz及最终可玩由ROOT统一验收。

### 窄计时最终记录

同两份冻结native仅本块不同，actual22 seed917 200tick/后30计时：interception_query 149.33次从0.208333ms到0.086863ms，current resident visitor121.1次0.066060ms；store总439.57次0.130647→0.097267ms；payload177.57次0.022947→0.015550ms。baseline与current state69.757→50.594ms、precontacts10.685→7.962ms在不同并行CPU负载窗口，不据此声称整体收益；只有query窄热点约0.12ms的观测，正式无干扰ABBA仍待ROOT。precontacts大量未归入query/store/payload的时间说明还存在其它低层开销，本块不得扩行为范围。proof profiling-interception-query-before/after/result.json，两production文件继续冻结。

## 2026-10-09 近炸读取性能方案（ROOT新增窄授权）

目标和玩家流程继续沿既有近炸A导弹→B战机→C资本舰真实展开盾弧/外壳→D射程；无UI、输入、联机host、60Hz、预算、存档、生涯变化。scope只explosion Host新fuse_ship默认观察、fuse_trigger读取结构、world Host当前只读投影。爆炸/伤害/死亡/导弹身份/commit/RNG/geometry阈值和算序不改，无跨query或跨tick缓存。原版DamagingExplosion/Missile与近炸扩展差异已在本文件先证据；实际严格依据ProjectileCollisionHandler.ts:241–294和HullGeometry.ts:177–192、ShieldCollisionGeometry.ts:224–246，当前native exact几何算法继续保持（本块不扩迁移原来的source broadphase）。

热点证据真实200tick后30：fuse_trigger28.233次9.813ms，4969.07完整爆炸Ship读取6.59ms，explosion_ship6.026ms；precontacts总9.979ms。fuse读取只需要identity/allegiance/dead/collisionless、pose/radius/bounds/展开盾几何，没有任何cr_taken/system_shield/shield_taken或assemblyroot伤害用途，却每个完整projection计算system modifiers/root并复制bounds。

实施选择：新增借用FusedShip（identity/allegiance/dead/collisionless/pose/radius、Cow bounds、原盾geometry），Host默认fuse_ship(id)调用原ship(id)并转换完整值，未知Host原fighters/capitals列表、每个lookup/顺序/缺失/duplicate/早退和任何观察副作用完整保留。resident override使用原index与实际bodies读取，borrow bounds，不生成修改后的新rules。原explosion_ship的可失败检查不能省：system_owner::reader现有函数构造原完整own/parent SystemViews，保持engineering拓扑和每life spec eager lookup、父ship/world检查、usablebattery观察及runtime读取，只有Reader.read/compose所产生且fuse不消费的damageModifiers不执行；随后仍调用原self.root(id)完整检查，再以原shortcircuit c.collisionless(b)||phased_world 保phase parent/anchor/control验证与失败None语义。Reader与modifiers同source调用所需验证已经逐行对照（system_owner:83–106，phase_runtime:76–95），不是以validated scene假设跳校验。错误时fuse_ship默认仍None，外层完整事务不变，readonly无RNG。

距离函数抽出hull_geometry(position,facing,radius,&[Point],point)原exactbody供旧Ship与借用FusedShip复用，不改rotate/norm/polygon/Math.min、fallback。默认宿主仍fullship，不减观察调用；resident只有借本query&self，返回后释放，再任何commit/出生/删除必须重新lookup。先保存本块before→两源窄实现→同其它native冻结actual22 270/LAN60 reserve完整publication/capture bitstrict→generic default顺序/缺失/代次/duplicate/早退及live mutation/phase需要合同fixture集中一次；上一54已通过未受其他算式影响，不重复不改断言。记录真实ownedSHA/源bind，再同frozen before/after窄profile。正式55Hz/全场可玩仍ROOT sameinstalledArtifact验收，局部通过不能冒称完整。

玩家行为取舍无待决定项；Reader验证保持若实测失败先准确修复本块，不能降准入或放宽几何资格。新观察默认契约不假设未知caller数据冻结。并行owner变化只采冻结其它源，生产battle159两旋转已在此块之前落并相同纳baseline/current，后续不再碰其它shared函数。
### 2026-10-09 近炸只读观察实际验收

`verification-fuse-observation/result.json` 同其它native冻结的两份生产Wasm对照通过：actual22混舰270步和LAN60步（含reserve部署），完整publication/capture 350,202,268个严格字段、62,705,419个对象、113,700,301个typedCells全部逐位相同。未知Host默认接口bits255，原fighter/capital列表与每ID读取顺序、重复/缺失/过期/即时改动、fighter早返/range兜底维持。16个真实Gloriana住舰修改案例旧新值/None一致；坏parent/child/缺ship/world/解除parentchild列项和缺phase均拒绝，collisionless时原phase错误短路保留，护盾弧/位置/朝向/bounds修改实时可见。此前fixture只出现Rust小数字面量语法错误，定向修为0.01/0.37后完整通过，没有放宽断言。

baseline SHA5832ac8128825a8bf16799459529d426b1e6353c84991cfd3dc4b6e9831e242e/current f781d5c85eb75f7902f781727651709acedff89a87360d647a5dbc3c14e258f0。检查期间只ROOT的motion.rs窄授权变化，两冻结副本其它native仍完全同，当前owned explosion_effects/world_owner与TS来源无变化。本块两生产源冻结，集中对照不是最终formal Cargo或整场可玩资格。一次真实热点后计时仍待，before/after读数受并行CPU任务影响，不直接证明全场性能。

窄热点后计时完成：同冻结两源真实200步／后30，fuse_trigger 28.233次／tick，9.6273→7.6639ms；precontacts 149.333次，9.7969→7.8907ms。4969次旧全explosion_ship投影降0，fuse_ship借用4969次5.1383ms，system_reader2.4325ms包含这些与734次其它读取。state52.8525→51.9442ms只作诊断，串行前后机器同步其它编译／runtime负载不同，不能宣布正式全场提速。证据 verification-fuse-observation/profile-summary.json、profiling-fuse-observer-before/after/result.json。此两生产源冻结，最终formalCargo与同SHA可玩仍由ROOT完成。

### 本轮集中实际验收

verification-fuse-near-query/result.json passed:true，同其它native冻结的old/new实际22混舰270步与LAN60步/reserve部署全publication/capture 350205488 strict、62705420 objects、113700301 typedCells逐位同。defaultHost ordered/missing/stale/duplicate/live/早返bits255；2048几何边界、凹/退化/超radius authored顶点、NaN/Inf/extreme回退及23真实resident mutation原16拓扑/phase加重复scope/duplicateid/离场/size/pose/bounds/missingcombat同。首次新增fixture尾RefCell临时borrow编译问题只localbool定向修，未降断言。baseline 4590f2ba7c7c6f534c7c62ee4f6a7cc48fb1bb9621bf1544b100e820cb7ed591 / current aa3027a7bb50f8bcdfae82af6098c6952556b1ce55823ea370277c60f09fe4ab；期间ship的battle/system_owner授权改动诚实记录，二native冻结其它源全同、owned和TS没有变化。串行诊断native44.568→43.789ms/LAN7.5265→7.4199ms仅诊断，formal性能门仍未通过，不覆盖旧cf8c失败。两production源冻结，最后窄currentprofile待后项；ROOT最终新Cargo/同SHA/ABBA及正常可玩继续。
