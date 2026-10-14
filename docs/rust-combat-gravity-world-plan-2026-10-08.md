# Rust 引力世界与真实外力提交

2026-10-08；P3独立分工。只增加 `gravity_world.rs`、本文及独立实际TS差分；共享lib/state/battle/projectile/protocol/生产入口由主代理连接。不递归代理，不提交/发布，不启可见窗口。

## 目标与边界

保留万有引力七包当前F区域场、左键抓取、右键定向推送、G全向解围与潮汐伤害体验。实际舰体/模块、弹体、小行星和残骸参与质量响应、真实轮廓/遮挡及统一速度限幅；不是投影特效。迁移旧引力井/全向波/惯性折转/远端释放/手动坍缩/极性及当前战斗版区域/解围/推送，保留历史ID和规则。无UI/平衡/存档或单人机制变化，不扩展原版舰船或引力技能，不负责普通terrain/flightdeck。

## 原版与当前依据

原版0.98a-RC8，`../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/GravityPullEffect.java:36–91`：暂停无推进，真实实体质量与碰撞半径决定外力，直接加速度到velocity；该原版效果只作用ShipAPI，短时吸引。`CombatEntityAPI.java:9,35`提供velocity/mass；`CombatEngineAPI.java:90–100,384`真实点伤害与source modifiers；`ShieldAPI.java:41–50`盾弧/吸收。当前项目扩展为带预算的多对象/弹体/散落物、有限速度、抓取接管与潮汐伤害，属已授权Web原创，不能声称原版同技能。没有原版实机截图，禁止桌面控制，视觉保持既有呈现待验证。

当前权威来源 `GravityFieldPhysics.ts`：事件之后、弹体移动/碰撞之前一次外力；emitters按owner ID/type排序，连续/冲量先各聚合预算、最后按对象统一限幅，模块只继承root一次；波前内外界扫掠首次接触/每波去重，不用外圆盘代替。`GravityTractor.ts`：实际轮廓候选，sticky CAPTURE，60软flux预约先于接管，hold真实range/arc/LOS复验，waitRelease不能换组偷重新抓，selfTow必须manual/root/真实内轮廓。`GravityDirectionalPush.ts`：排除held及友方，F占aim时保留已有方向。`GravityDamage.ts`：真实contact ENERGY hit、hard shield flux、原armor/component/hull路径，.1s连续伤害包和每assembly坍缩一次。`GravitySystems.ts`及ShipSystem expire：accepted锚serial、真实释放、到期自动坍缩与预警/资源，打断不爆。`GravityControlInput.ts`明确逻辑hold优先级，`FireControlGeometry/Geometry/HulkGeometry`明确盾/船/弱简单残骸轮廓；排序localeCompare需保留实际ID顺序或明确约束，不能silent数值改序。

## 规则、状态、完整操作与失败

typed持久系统含lifecycle、immutable accepted input、field位置/age/radius/polarity/linger、波hit列表/预算、push目标/方向、maneuver剩余转角、held。mount状态含CAPTURE/HOLD目标generation、捕获/损伤时钟、锚/接触点、waitRelease、恢复/cooldown/aim/deflection。一次安装实际spec和generation，不按帧JS导入world/数式。所有体型、轮廓、源stats、资源和entity来自Rust resident宿主；本地临时观察只存在本次外力pass。

按原顺序命令资格/accepted→prepare生命周期/upkeep/取消→weapon输入抓取→post events createField/释放/极性→外力收集→统一实际velocity+模块继承→真实潮汐伤害→原弹体移动/碰撞。松键/组切/disabled/retreat/vent/overload/失效generation/超射程/遮挡/捕获或hold超时均用原release规则，既有flux不返还。field接管不刷新总时限；F cursor只移动范围内650/s、松手linger，不动LMB锚；右键不接管LMB对象。全向release成功保存released targets，普通友舰免疫。自然expire才能自动collapse；费用不足/受打断只收場，不能异常补伤害。

宿主所有flux/capture/team/source绑定、速度、hulkmanaged、damage均同步Rust动作；不能用空动作或JS回调假完成。source武器/CR/出伤与目标减伤依实际hit位置实时查询；shield→hardflux→armor/component→hull时点保留，同tick改变对后续查询可见。未知实体/traits/geometry/宿主错误fail closed，放弃完整step并rollback实体/系统/mount/RNG/呈现，不半步fall back TS。复原这些typed状态与generation去重列表，不以HUD状态文案恢复。

## 依赖、顺序、验收与待核实

本文/来源→typed world/query/commands→field/tractors/push/deflector/maneuver→damage宿主→Node+fresh headlessWorker实际TS对照→主核心生产接线及完整可玩。验收strict实际目标/顺序、qualification、资源/时钟/预算/命中去重、RNG、damage参数/结果、释放和恢复；geometry仅位置/朝向/速度允许已批准微小舍入，任何影响实际决策的边界仍strict。覆盖多场聚合/预算/overspeed、波前穿越/已穿过逃逸、assembly一次、友方校准限制、self/fixed tow、projectile真实接管source、dead/phased/disabled、F/RMB优先、flux不足、遮挡、ID过期、pause/large dt、打断不爆与自然坍缩。

原版实机/视觉仍待验证；主核心完整damage/shape/source实现、production/recovery和用户实际可玩由主代理负责。独立对照不能使fullBattleReady=true。没有新的产品取舍待用户确认。

## 实际交付与验收

`gravity_world.rs` 已独立交付常驻 `Controllers/Slot/Mount`、实际9类系统命令/生命周期/自然expiry、typed accepted锚与serial、极性/hold/cursor/linger、sticky抓取/接管/释放、推送、偏转、惯性折转、按真实对象聚合的连续/冲量和多场预算、程序集质量/单root继承、波前去重及 .1s潮汐/一次坍缩damage调用。所有速度/flux/binding/capture/hulkmanaged/damage写入同步Rust Host，没有JS callback/action notification substitute。弱简单残骸 `polygon_area/hulk_mass/point_in_hulk/hulk_segment` 去掉双向桥的真实边规则也已迁移。

`node scripts/check-rust-gravity-world-module.mjs` 独立编译Wasm，并在Node及全新无头Chromium dedicated Worker运行实际 `ShipSystem`/`GravitySystems`/`GravityTractor`/`GravityFieldPhysics`/`GravityDamage`。每端 **480步、150,996严格字段、25,920几何字段，58次实际潮汐伤害调用、2次实际弹体接管，9项authority合同**；Node全部零差异，Worker最大几何差异 **4.440892098500626e-16**，所有严格字段零差异。geometry包含真实velocity/facing、cursor/anchor/contact和友方绑定turn；turn达到π/4的后续资格仍严格，未用容差绕过实际选择。额外 **320组wave**（含64相邻f64资格边界）及 **192组弱简单残骸面积/内外/接触/mass**对照通过。

实际场景包含WELL/REPULSOR/BattleWell/remoteRelease/collapse/maneuver/polarity/push全部系统、两个owner及多个field同体预算、稀缺flux、预先overspeed、root+module速度继承、盾/armor/部件/hull、友弹MASS_DRIVER寿命/累计turn、火控不支持弹体、固定体、self抓取、sticky capture、失效/vent、LMB waitRelease、F aim优先、RMB held排除、自然collapse/linger collapse/打断不爆、远端锚serial、重复wavehit及source接管。对source damage仅添加只读观察行，未替换原规则公式。fixture真实TS armor/flux，Rust Host复用已有armor/flux；伤害输入raw/strength/continuous及结果HP/cells/flux/components严格。fixture仅涵盖普通360°盾与常规polygon、环境asteroid；weak hulk另有直接oracle，但完整生产特殊盾/技能出伤/引擎组件/复杂船形仍依主核心Host实现及验收，不能据此宣称全部宿主等价。

9项authority合同涵盖owner/target stale generation拒绝、部分velocity提交错误冒泡、恢复完整Controllers+world checkpoint后一次提交、区域重新接管保持serial/时限、已死亡目标不可解析、打断清field不坍缩、自然结束真扣1800并进入COLLAPSE/IN、已退场projectile为普通无目标。退场与generation冲突严格分开：无当前实体→Ok(None)且连接原规则释放；同槽不同generation→Err(Stale)防错目标，完整step必须rollback。本probe只证明可Clone持久状态与错误传播，生产恢复/网络snapshot仍待接。

scoped ESLint通过；无全套检查/可见窗口/桌面输入。结果 `artifacts/rust-combat-core-20261008/verification-gravity-world/result.json`；生产共享文件未改，`productionIntegrated=false`、`fullBattleReady=false`。

## 主核心接线合同

1. 一次安装所有9种 `Kind` 与实际有效Spec/field/collapse/auto/maneuver/push及gravity weapon规格，按每舰实际allSystems和mount order存储；`Kind::from_id`未知拒绝。动态state全部Clone/checkpoint/recovery：完整input/targetgeneration/锚serial、lifecycle、held/polarity、field所有optional历史/预算/去重、push、maneuver、tractor及真实mount cooldown/angle/glow/trigger/deflection。typed状态不以status文字复原。
2. `Observation`是一次外力pass内的Rust resident只读快照，不得由JS每帧提供或保留跨步cache；以实际roster顺序保留ship/projectile/asteroid/hulk。root/成员总质量、非phased/alive、fixed trait、manual/root/module、actual hull outline、source damage/flux/shield状态来自核心实体。environment hulk mass用 `hulk_mass`及source原bounds；环境按asteroids→hulks源顺序装配，排序稳定。surfacepoint/query回调是Rust函数，禁止空动作/JS观察或bounding-circle代替shape。
3. `Host.segment_entry`必须按当前 `shipSegmentEntry`首hull/当前部署盾；range/arc/遮挡、pointer distance是真实polygon/weak hulk/localoffset，source Math.hypot与Vector2 norm运算顺序不同。Host `line_clear`按原ship→asteroid→hulk遍历，跳owner/目标assemblyroot、比较contact `limit-1e-5`。root assembly用于ordinary body，collapse对选中module临时使用该ship的position/shape但总mass/radius仍assembly值。
4. `Host.locale_compare/target_key`保留TS localeCompare在候选与collapse等距排序中的结果；pure `String.cmp`仅给TS `<` source排序用。隔离fixture只用同case ASCII keys因此其codepoint comparator对照有效；生产mixedcase/标点/数字ID不允许直接照该fixture替代。可在安装ID时一次生成当前runtime的稳定collation order供resident comparator，禁止每帧JS比较回调。
5. 命令边 `Controllers.command`保留 `CombatCommands.ts:94–96` 成功区域输入立即held（含paused）；`activate`为底层系统调用。`control_hold/push_hold`接实际逻辑F/RMB意图；inactive/disabled/manual资格及未接受理由由核心投影。`Host.reservations`完整allSystems原顺序（非gravity也有），当前gravity slot原位patch，不能append或把总reservedflux按子集重排。origin/velocity/facing由authority捕获，不信客户端上传。
6. prepare原barrier调用 `Slot.cancel_before_update`→`Slot.update`（含真实expire自动collapse，不使用generic lifecycle update跳过expiry）→CR→`cancel_after_readiness`；早期hullmod前后顺序由上层保持。无效舰跳普通update，post-status跳dead/retreated/docked。公开 `Controllers.dispatch_slot(index, host)` 在各owner原allSystems准确位置消费该slot pending事件，允许非gravity事件穿插；索引失效报Stale，宿主错误必须恢复完整step及已消费pending。不能让gravity整批提前到非gravity之前改RNG/资源时序。`dispatch`仅在完整事件顺序恰好等于slots存储顺序时使用（隔离fixture），生产接线不将slot序列挪出sourcebarrier。
7. weapon原输入阶段调用 `tractor_input`；每个mount的 `muzzle`、range、angle、disabled、permission、cooldown/group须真实live，cooldown由现有weapon阶段推进不能再重复。本模块更新后的mount state必须写回原resident武器记录，实际cancelOnDeath/defense/fire consumers不能只改HUD。完整系统事件后 `advance_fields`→`advance_damage`，位于 `CombatEngine.ts:1161–1162` 原实际位置，随后原projectile movement/collision。所有输出位置/velocity/RNG/stock都不得事后写回TS继续同半步。
8. `capture_projectile`完整接原source字段及强引用binding：保留首次originalSource，改source/team/player/capturedBy/MASS_DRIVER，关闭guided、inertialFlight=true、engineAcceleration=0、maxSpeed缺失、gravityDeflected=true，清native targetship/projectile并更新真实sourcecache。保持damage/lifetime/RNG不变，释放不返阵营。fixture只观察source/team/capture标识及后续gravity binding；生产完整这些字段要在主核心验证。
9. `Host.velocity`写真实velocity，changed projectile置deflected，非rocket且angularVelocity缺失/0才改facing；root每次聚合syncModuleTree一次，已有overspeed不截断。hulk_managed真实改变host碎片后续移动消费者。支出flux必须同步可见，失败回滚整步。`tidal_hit`需完整source weaponDamage→crDamageDealt→outgoing hitposition multiplier→targetCR multiply，普通/void/phase盾→hardshieldflux→armor(actualstrength/continuous)→components→hull，positive damage立刻通知FieldRepair等真实damage监听，并记录可回滚呈现/统计。任何缺Host或未知行为不得准入。
10. 本模块不提供production registration、完整联机snapshot或主核心Host，ready保持false。主代理完成resident几何/伤害/source/排序、slot事件准确顺序、完整checkpoint及七包实际可玩后才能启用生产；原版实机视觉继续明确待核实。
