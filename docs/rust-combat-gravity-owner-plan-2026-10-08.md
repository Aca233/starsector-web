## 2026-10-09 单次hydrate只读观察诊断：当前真实场无重复mount读取，保原生产

目标是保持既有F/右键/左键牵引、技能费用与时序，在一次hydrate不可变Bodies/specs内减少原重复mods/views/find/phase；范围仅gravity_owner::hydrate_with/read内部，不扩gravity_runtime、phase、系统观察生产、dispatch、restore、UI或存档。ROOT已接受此前完整publication并完成f080 Cargo，该六源冻结。新profiling的gravity dispatch7.213ms包含全部ordinary system/hullmod/status，不等于hydrate成本，不能据此预测收益。

原版0.98a-RC8再次复读../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/GravityPullEffect.java:33–91，暂停不推进、真实mass/radius决定velocity外力；这是来源边界，不证明Web扩展牵引规则。当前严格依据ShipSystem.ts:318–336 live own→aux→runtime→parent modifier顺序与实际canFire，GravityTractor.ts:38–100真实assembly/当前range/资格。Rust hydrate_with当前每body原序slot.read，逐mount验证weapon→combat→fire→query→首身份mods→全部views→phase→component→weapon geometry→groups；若优化必须保持第一fallible访问和缺spec/bounds错误顺序。不能用当前body row替换首重复身份行，也不能跨hydrate写入复用live值。现UI、快捷键、确认取消/失败不变，原版实机仍待许可。

先上述来源→只tmp低开销scope诊断→按事实决定是否实施。tmp/flight-gravity-hydrate-profile/result.json真正current frozen native、actual22/176initialbody270tick，每tickfullcapture+ACK；仅hydrate整体timer，内部计数无计时桥。全270累计274次hydrate、48224次body metadata读取，gravity mounts rowsTotal/max皆0；hydrate内部mods/views/gravityfind/system engineering/systemfind/phase read_live全部0次。全程平均hydrate0.01925ms/frame，181–270均值1.0444次/0.02475ms/frame。这只证明指定实际场成本，不外推其他引力舰场或正式性能。

profileSHA63a4707636feb6f2358a93e8a49a415a166ed850ba40c4e1e5411f5c62219b04，所有native及TSbundle changed=[]/sourceUnchangedtrue。初次tmprunner重名source语法失败发生在编译/执行之前，日志保留工具输出；仅tmp语法修正后诊断完成，生产无改。当前场没有可摊销重复读取，给零gravitymount的hydrate加索引/cache只引入成本，按收益门槛不实施。未改规则、权限、并发、RNG、存档或生产字段，无新产品取舍。

集中验收结论为本域生产delta0、无需重复270/LAN60位对照或新fixture；actual诊断只用于拒绝无益优化。原有完整publication验收不重跑。ROOT应继续gravity_runtime::dispatch_with_flight内真正ordinary modifiers/slot/aux/visual callee或其它成本路径；该函数未在本域授权内，未擅改。最终formalABBA/同installed全场正常游玩仍待ROOT，CPU free/no sessions，未安装/发布。

## 2026-10-09 弹体元数据实时对齐索引续块

当前detail诊断22/176body，late181–225每步约178次 reconcile_projectiles/4.33ms（timer及同时诊断开销，非正式收益）。原版0.98a-RC8 CombatEngineAPI实际弹体集合及source entity关系仅为来源边界；本Web引力接管/绑定是已授权扩展，规则以 gravity_owner::reconcile_projectiles 当前顺序为准。该函数对每个实时弹体两次扫meta、再每meta全扫弹体，所有调用仍实时重读，优化目标仅同一call内相同serial查找。

范围仅本函数：按原metadata原序建立slot→first row和当前projectile serial集合，原projectile顺序核missing后仍调用真正projectile_spawned校验/分配，再写mine与mass_driver OR。serial必须精确等于u32转f64（含0原匹配边界），非法/NaN/无限仍走原spawn拒绝，重复meta保首项，最后原序retain全部实际存在项；binding/captured/RNG不变，不跨call保索引、不跳实际集合/字段验证。其它gravity/world/beam/航母和UI/权限/存档无变化，失败仍原调用者完整事务，没新玩家取舍。

先方案→窄改→同其它native冻结old/new真实混编270与reserve LAN60完整逐位比较，加空/重复/stale/非法serial/绑定保留对齐的必要fixture；完成后正式收益和最终sameSHA验收归整体。无原版桌面操作。
# 引力真实 Rust 世界适配

最新交付：`gravity_owner.rs` 已实现并完成 actual TS Node/fresh Worker 集中验收。普通盾 Graviton 在 `data40` static Map fold 后、external/energy 前相乘；Void 只接受 external，不能把 Graviton 乘进 raw damage。模块 armor-cell/hull contact 属 assembly-root void，已实装。本块直接在 Rust 命中阶段生成 armor sparks 并消耗真实 visual RNG，不能延迟到 JS 展示再调用生成器。捕获弹体 outgoing 为 1。独立验收不替代完整生产可玩验收。

2026-10-08。接已交付 gravity_world；本块仅增加 gravity_owner.rs 和独立集中对照。共享 lib/state/ship_state/battle/projectile/protocol 由主代理接线，无发布、可见窗口或桌面输入。

## 目标、范围与玩家流程

保持现有九类历史/当前引力技能、牵引/潮汐/偏转武器、左键黏性抓取、F 区域场与右键推送流程、取消/失效松键后重抓规则。把已迁移控制器接到真实常驻 Body、ShipState、Ordnance；几何、幅能、速度、装甲/组件/舰体伤害及弹体阵营/来源接管立即提交。无玩法、UI、平衡或生涯存档变化，不实现普通地形碰撞/舰载机，环境由主核心真实 typed 地形对象供给。

ShipState.systems 是 lifecycle 唯一权威。每阶段临时借当前 System 到 gravity Slot，执行后回写同一实体；常驻 SystemMeta 只保存引力输入/持续状态和 immutable specs，没有另一份 lifecycle。mount 从真实 weapon/component/fire/query 状态刷新并回写原 angle/cooldown/glow/trigger；冷却仅原 weapon 阶段推进。按 allSystems 实际顺序逐 slot dispatch，随后 fields→damage，在原弹体运动之前。

命令资格失败只返回原规则原因，不产生费用或伪动作；宿主/过期 generation/未知规格失败中止完整 step，主核心同时恢复 bodies/ordnance/metadata/environments/两种 RNG/呈现。取消、死亡、退场、暂停和恢复沿已验收 gravity_world 合同。环境非可选伪空值：首次安装明确完成真实 asteroid/hulk 列表，可合法零对象，但未安装不可执行。

## 原版证据与最小对照

原版 0.98a-RC8 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/GravityPullEffect.java:36–91` 已复读：暂停不推进、实际质量与 radius 决定真实 velocity 外力，只作用 ShipAPI。`CombatEntityAPI.java:9,35` 与 `ShieldAPI.java:41–50` 的真实质量/速度/弧面合同已在 gravity_world 策划引用。Web 多对象、接管、预算、潮汐属已授权原创，不能宣称 vanilla 等价。无相关原版实机截图，禁止桌面控制，原版视觉仍待核实。

真实 Web `GravityTractor.ts:38–95,112–143,182–190` → 完整 assembly 质量、hull/deployed shield 首接触、asteroid→weak-hulk LOS、source cache 与接管字段 → 当前核心 contact.projectile 的 circle 门槛和 shield cosine 不可直接冒充 fire-control entry，需保留 Geometry.segmentCircleEntry 的 1e-12/直接除法和 Shield.isHitBlocked 的 atan2/while 顺序 → 实际 TS geometry/抓取 oracle。

`Ship.ts:141–159` → parent offset/rotation/velocity+angular cross、nested children 原序同步 → 核心尚缺 module mount offset/独立转向资料，由一次性 metadata 安装 → 真 TS module tree 对照。`GravityDamage.ts:24–50` → raw × live ENERGY weapon × sourceCR × outgoing(from,contact) × targetCR，真实 hardshield flux、armor strength/continuous、components 后 applyHull → 不用 projectile 简化击中路径/空通知 → 真 TS partial/void shield、armor/components/HP/RNG 对照。

## 常驻、联机与依赖

Owned 保存安装船名/质量/固定/模块 offset、引力 SystemMeta、mount typed state、弹体接管/绑定 metadata、真实 typed Asteroid/Hulk 与运行时一次编译的 Intl locale 排位。Body/ShipState/Ordnance 仍持真实位置/速度/资源；任何 JS 每帧 world capture 或热回调均禁止。generation 与 exact handle 校验；projectile serial 必须整数且永不复用（现有 cap u32、generation=1）。源绑定更换真实 source_handle 和消费者 guidance/source cache，保留第一次 original_source；捕获弹体依实际 OutgoingDamage.ts 强制 outgoing=1，不能在命中时套捕获者 mastery/target-analysis。未捕获弹体来源退场保留强引用或主核心 retained source，不冻结其 dynamic stats。

伤害本身调用 ShipState.armor_impact/propagate、Shield.impact/Flux，立刻 FieldRepair.on_damage，按原顺序生成真实 armor particles/消耗 visual RNG；typed records 在 step commit 后展示，不再次消费 RNG。GravityDamage 不在每次命中时销毁：terrain/collision/projectile/mines 后的原世界死亡 sweep 才通过同步 Rust destruction trait/closure 调真实 world 销毁、模块/关键模块连锁、爆炸、残骸和舰载机回收。网络 authority 只执行一次命令/step，client 仅投影；完整 Owned 参加 clone/rollback/recovery，不修改生涯存档。

顺序：本方案与来源→typed metadata/hydrate/restore→全部 gravity_world Host 实体适配→真实 source/capture/mount/module/damage→Node/fresh headless Worker actual TS 集中对照→主代理共享字段和 barrier 接线→完整七包游玩。root 仍负责完整 terrain 生命周期、readiness/live modifier刷新、presentation消费、snapshot 与生产准入。无新产品选择待确认。

## 验收

集中 strict 比较资源、HP/cells/component timers、RNG、source/team/player/targets/guidance/coupling、资格/LOS和生命周期 pending；几何只有 approved tolerance，决策/边界 strict。包含真实 concave/rotated/offset hull与小弧/void/phase盾、nested modules+angular velocity、weak-hulk holes/localoffset、asteroid遮挡、不同case/数字/标点 locale tie、接管后 source 缓存、stale generation/缺metadata/缺terrain、原子恢复、多个命中同tick动态状态可见。独立 Host 对照不是生产完整可玩验收，fullBattleReady 继续由主任务核定。

## 实际交付、验证及生产接线合同

已交付文件：`native/combat-core/src/gravity_owner.rs`；`scripts/lib/rust-core-gravity-owner-harness.rs`；`scripts/lib/rust-core-gravity-owner-check.ts`；`scripts/check-rust-gravity-owner-module.mjs`。依赖全部实际 Rust 源，包括现在生产中的 world_owner/terrain_owner/effect_owner；fixture 仅声明同布局 Body/Handle 以避共享 Core ABI，没有替换伤害、几何或命中规则。

最终 `node scripts/check-rust-gravity-owner-module.mjs` 通过：Node 与全新 Chromium dedicated Worker **各** 512 actual TS 几何/LOS 查询、192 潮汐命中、16 模块命中（armor-cell/no overflow 与真实大伤害）、16 nested/independent rotation pose、8 实际接管/WeakMap source 重绑定、40 权威合同、2,063 JS number key；27,775 strict 字段全部逐位一致；2,088 geometry 字段最大误差 7.105427357601002e-15。包含实际 GravitonBeamDamageTakenMod、CombatFXSystem.spawnArmorDamageSparks 的粒子数量/位置/速度/尺寸、Armor/Component/Engine/repair状态及两种 RNG。scoped ESLint 两个 TS/MJS 文件通过。结果写 `artifacts/rust-combat-core-20261008/verification-gravity-owner/result.json`，`visibleWindows=false`、`productionIntegrated=false`、`fullBattleReady=false`。未启动全套测试。

接线顺序必须遵守：

1. 一次可信安装为 Core 增加 `gravity_owner::Owned`；安装真实船名、质量、fixed/module traits、moduleOffset（已扣旋转 moduleAnchor）、原序 children、各系统 immutable gravity spec、各 gravity mount。metadata 不持 lifecycle。安装真实 terrain，包括合法明确零对象；`None` 表示尚未安装，拒绝准入。`complete(bodies,ordnance)` 检查身份唯一、attach cycle、system/mount/child/projectile 存在；主准入仍须校验有限值/spec 和全部需要的功能，不能把此布尔当全部 readiness。
2. 命令/事件通过 `Owned.hydrate(bodies,specs)` 建临时 Controllers；它从真实 `ShipState.systems` 拷当前唯一生命周期、当前 components/weapons/fire/query/live modifiers/ECM range。系统更新用 gravity Slot.update **取代**该 gravity 实例的 generic lifecycle update，不可再执行一次推进。非引力系统仍沿原 allSystems 顺序执行。
3. 命令资格/activate/control_hold/push_hold/cancel/reset 保持真实 Controllers API；输入是经 authority 接受的 player/AI command，不能用展示状态猜。每个 gravity slot 在它的实际 allSystems event 位置 `Controllers.dispatch_slot(index, &mut Host)`，随即 `Owned.restore_slot(bodies,slot.clone())` 回写，再允许后续系统读取资源/accepted状态；不要所有 gravity 事件移至普通系统之前/之后。对事件使用最新持有的 slot，避免重新 hydrate 覆盖未消费 pending。
4. 原武器阶段按 owner/weapons 原序调用 `tractor_input(index,&mut Host,dt,trigger)` 并还原 mount。gravity tractor/deflector 不能走普通 projectile/beam generic emission；gravity_world 推进角度/trigger/glow与牵引状态，常规 weapon mount cooldown 则只由原 weapon advance 推一次。`m.range` 为实际战斗 range；`m.base_range` 保留 authored spec，deflector 单独原规则使用它。每个 barrier 重新读最新 weapons/fire/query 许可，拒绝缓存旧 control state。
5. 在原 `advanceGravityFields` → `advanceGravityDamage` barrier，先 `Owned.reconcile_projectiles(ordnance)` 对实际新增/退休序号同步，不清捕获/binding。Host 读实际 resident world；`Controllers.advance_fields` 后 `advance_damage`；立即 restore slots/mounts/terrain velocities 和管理标记。共有 terrain 若由 terrain_owner 持有，应仅 Rust 内部安装/同步真实对象，保持 source hulk weak bounds/localOffset/source mass；不能每帧 JS capture 或假空地形。
6. `capture_projectile` 同步 source/team/player、target清除、guided/inertial/accel/maxspeed、guidance Source/Allegiance、first original source、capture/deflected/binding。主 normal projectile/explosion outgoing 查询必须读取 captured_by 标记而返回 1；仅根据 rebound source/outgoingcache 不够。新 serial须1..u32::MAX整数、generation=1且永不重用。
7. `Record::Notice` 接现有 authority notices；Damage 更新完整 stats；Ripple/Floating 按固定色值呈现；Sparks 已携带真实 `world_damage::ArmorParticle`，同步纳入世界 particle lifetime/budget，展示不能重生成。所有呈现仅 whole-step commit 后发布。gravity hit 不提前 destroy；原死亡 sweep 可用 `Host.finish_deaths` + 实际world closure，或由主 sweep直接调同一 world_owner 管线，保持 death RNG 顺序。
8. Core checkpoint clone/rollback/recovery/witness覆盖完整 Owned、terrain、bodies、ordnance、两种 RNG、呈现/statistics；Host错误整步恢复。`Restore_slot` metadata/lifecycle 不能漏 snapshot。客户端仅投影新 typed gravity状态，不在 TS 再推进一次；船包/键鼠操作/UI保持原规则。

主共享依赖仍待接入：`system_owner::kind` 当前只0..10，须映射真实 GravityWell/GravityBattleWell并在 `views` 提供实际 collapse flag，自动/手动collapse时ACTIVE不扣250 soft upkeep。`Owned.complete`尚不验证整个world有限值。mount hydrate/restore已实现但 full group/cooldown/physics chain 仍需生产步骤集中验收。number_key覆盖阈值/极端值/实际 SimulationRandom IDs，非全binary64形式化证明；collation须用实际 Intl 一次编译rank，numeric alphabet优化须证实字符字典合同，不能静默ASCII兜底。重力字段候选中JS `<` 的ID用于生产ASCII stable IDs；非ASCII扩展还需UTF16顺序支持。

另一个共享源观察供主代理定向核对：交付期间 `world_owner.explosion_ship` 使用 shield `data[41..45]`，但 Shield.data 为44长；这会越界且并非完整四类 taken multiplier。应按实际 Shield.damageTakenMultiplierFor/void规则重建，而非复制越界slice。本块不改共享文件。

2026-10-09 reconcile索引完成：verification-resident-indexes old/new真实270/60完整strict same且changed=[]；verification-resident-index-fixtures 128严格cases含空、重复meta首项/原序retain、0与-0已有/缺失、u32边界、负数/小数/NaN/±Inf/越界、失败前部分写原序、captured/binding/negative-zero字段保留及第二次集合reverse/removal，old-original-method/current结果与完整metadata bits同。copied Core未改committed状态，无production诊断export，全源unchanged。正式收益门槛仍待。
