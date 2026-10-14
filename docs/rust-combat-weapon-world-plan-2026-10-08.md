2026-10-09 发射提交性能补充：实际 scene_runtime 在全部 FIRE_QUERY 之后，逐舰逐挂点调用 fire_selected_visual；40 tick profile 为189调用/约1.04ms。每次 fire_selected_inner 都扫全体构造 target_handles、全舰readers/support与全挂点permits，即使该挂点无 emission。改为只对原queued所指的去重行构造真实Reader/support，仍在该调用所有提交前采样；两个PD/nonPD许可在同一采样位置求值；仅真实Projectile emission才构造当前相同有序target_handles。保全部调用、reader.read实时flux、补偿recoil、父舰支持、RNG与提交顺序；不跨调用缓存，不冻结flux或系统。原版0.98a-RC8武器API/现有来源见下文，直接依据ShipWeaponControlSystem与scene_runtime真实逐挂点提交。无UI/玩法/存档/权限改变。current同场profile和已授权整场/实际worker验收集中核对，不以局部毫秒代表提速完成。
# Rust 完整武器世界命中链接线方案

Gravity接线修正：actual gravityTractor/deflector mounts由原query后gravity weapons阶段独立推进，ordinary fire必须按installed gravity_mounts跳过，防止对相同挂点再ordinary commit/抽RNG/emission。其它挂点保持原序；本项通过接续aux oracle编译并由root完整gravity runtime场景验收。

最终追加边界验收（2026-10-09）：33场景加2种真实CombatEngine光束closure模式，Node与全新无头Worker均通过，每runtime 14,216严格字段、1,967geometry、191有序工厂记录。Node最大几何差1.4210854715202004e-14，Worker2.842170943040401e-14。新增覆盖mine独立计时与可拦截、systemFuse排除普通missile arming RNG、collisionDisabled下引爆、fizzle前碰撞/普通range后碰撞、普通rocket恰一次detach/退役状态，以及同cycle光束保留/新cycle重置/visualonly转damage统计。Wasm1,934,087bytes，SHA256 `673255e0212e5902f4b8e5432eea1cc7b8e1cddc2f39726ba75511c347158e48`；结果 `verification-weapon-world/result.json`，root正式执行log `build/weapon-world-final-boundaries.log`。production全局接线与整场可玩仍由root验收；本结果不代替完整运行。

沿用用户已确认浏览器/桌面共用Rust/Wasm、规则与RNG严格一致、纯几何允许有限舍入。目标是现有实际武器碰撞、近炸、拦截、穿透、受击效果、立即爆炸与死亡在resident Rust事务内完整运行，玩家操作/布局/暂停/退出不改变。本阶段负责battle.rs的projectile/beam推进、新weapon_world真实视觉工厂与集中oracle；root负责lib/state/projectile/world_owner/effect_owner/protocol/静态准入/发布。不开可见窗口，不提交、推送或发布生涯。没有新玩家产品取舍。

原版依据0.98a-RC8：本机`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Missile.java:932–1010`的didDamage、damagedAlready、passThroughMissiles/Fighters、explosionSpec、直接目标及module排除、onHitEffect；`BeamWeaponRay.java:104–108,219–240`的源舰死亡立即消失、实际damage/baseDPS*.1决定glow、shortened状态。Missile.java的DamagingExplosion误强转Iterator已与DamagingExplosion本体/API交叉，不照搬坏反编译。先前explosion/weaponeffects/terrainplans来源继续复用；原版UI/实机待许可，当前无UI修改。

最小当前对照：`WeaponSimulationSystem.ts:180–307`先引信、截弹，再最近terrain与ship；数组被立即blast/effect剪接后重定位shot，地形穿透沿同一swept remainder再次query。`ProjectileCollisionHandler.ts:244–480,499–524,548–664`包含标准/voidshield、shotHit仅voidscreen一次、组件/FX/stats/hull顺序、fighting pass-through和source-duration blast。`BeamSimulationHandler.ts:120–392`保留挂点cycle、subjective dt、real carrier FIGHTER_DAMAGE、每beamhasRecordedHit一次、先死亡再beamEffect。`HitGlowVisuals.ts`、`ImpactVisuals.ts`、`BeamVisuals.ts`、`CombatFXSystem.ts:223–250,475–503`是视觉随机与持久状态来源。当前TS beam没有asteroid/hulk挡线，迁移不擅自增加规则；这项原版差异保留待后续产品范围决定。

流程：每步active blasts由root既有阶段先推进；projectiles倒序，保留真实guidance/flare/children后motion；规则disabled/fizzle/didDamage状态保持原边界。fuse按actual A/B/C/D和source/legacy分支，在Rust实际world伤害；intercept最近t须严格小于三类solid，真实HP→registered effect→then-liveHP→sourceblast，可pierce。terrain nearest取wreck<=asteroid<=ship原tie，真实wreck impact，rock先commit/是否shatter再impact；有authored terrainpenetration且预算足够才spend/remember→prev=contact/endrestore重复query，intactrock不能穿。source projectile impact保留尾迹，ordinaryconsume/expiry完成才remove。

ship命中保持一次query后then-live提交。普通armor→真实armorFX→stats→Hull interceptor/rootvoid→component→sound/floating/glows/fade/debris→registered effect→sourceblast reserve/apply重入→shake→death→fighterpierce。shield→真实absorb→stats/glowdamage→flux/overload→floating/sound/glows；voidremainder只缩damage/base/EMP，不耗尾时间、不effect、不爆炸，恢复end再排序；fullblock记root屏障再fade/effect/blast。unknownservices/spec/generation返回错误，外围恢复全部body/ordnance/world/RNG/outputs，不发半步数据。

beam按真实tracker挂点/disabled/cycle/source存活/vent/overload保留；mountedbrightness/duration、liveoutgoing/carriersupport与DPS严格源式；固定damageclock含brightness²、chargedown尾批，between samples也shorten。最近missile须在nearestship前，missilehit按damageToMissiles/decoy、hasRecordedHit、visual/audio/detach/remove顺序。shipvoidleft重排而不再扣fallenroot；armorFX/stats/Hull/component后activecontactaudio/true death，最后beamEffect看到then-live死目标。glow、contactpulse与shotHit都是Rust常驻状态，JS只显示。

staticDelivery一次解析完整visualSpec(passfighter/terrainpenetration/hitglow/missileRadius/color/usehitglow/impactfamily/adun/ark)。动态Projectile新增damagedShipgeneration与voidHitRecorded；Beam新增hasRecordedHit、glow/pulse状态。新weapon_world输出只承载已完成真实factory的表象（hitGlows、sourceMissileExplosion、movingRayFade、sound/shake），visualRNG在当前同步边界消耗，不能发布后才用JS补随机。FXparticle占用与原TSarrays一致。root须将这些字段加入clone/snapshot/publication，联机host权威、无per-frameJSsolve，campaignschema不改。

实施顺序：证据/本方案与sharedAPI合同→weapon_world视觉和同步worldhelpers→battle真实projectile/fuse/intercept/terrain→beamstate/missile/death-before-effect→actualTS集中Node/freshWorker与最少scopedcheck。验收覆盖实时数值/资源/target/orderedRNG、fullvoidbreak后modules、fuse chain death、terrainpierce/idcursor、beammissile和chargedown、deadsource/oldgeneration、unknown拒绝；几何独立容差。该联合oracle不替代root全七包整场实际游玩/Worker启用验收。

本次补验保持玩法与界面不变，增加真实TS `WeaponSimulationSystem.ts:106–185` 的mine、systemFuse、fizzleAtRange边界和 `CombatEngine.ts:754–815` 同挂点beam upsert。Mine在elapsed之前跳过但仍能被后续弹体拦截；systemFuse先motion/fade，再不受collisionDisabled阻止地visual→sound→source blast排除源舰→移除；systemFuse不进入source missile lifecycle。射程消散在碰撞之前移除，普通射程耗尽仍测试最后一段碰撞。Beam充能→active→chargedown同cycle保持entity/短化几何/clock/glow，newcycle复位；shotsFired只在实际开始damagecycle统计。验收为实际source循环、完整数值/RNG和有序factory记录的Node/freshWorker差分，包含移除弹体的最终状态见证。Root整场验收不由这些场景替代。

进度：实现已完成；25场景Node/freshWorker各10,915strict、1,680geometry、164有序记录通过，几何最大1.4210854715202004e-14。新增边界补验正在进行；shared world安装、发布与正式整场验收由root完成，当前不宣称完整七包已可玩。原版实机/UI仍待许可。
# 2026-10-09 光束收束炮口修复

实际 BeamSimulationHandler.ts:167–182 在 CHARGEDOWN 的 barrelOffset 缺省时，仍以选定 hardpoint/turret authored offsets 首对作为当前炮口。Gloriana181 native 错用零向量，源其他状态严格一致。advance_beams 用真实 FireEntry.spec.offsets.first 作该缺省回退，保发布字段缺省和原旋转/加法次序；不改变伤害、控制或 RNG。
