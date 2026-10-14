# Rust 战斗内核：死亡、连锁爆炸与战果闭包

## 主核心共享世界实施（2026-10-08，继续授权）

同步命中补充：爆炸payload保留明确发射绑定（source generation、weapon category、origin、fallback outgoing与捕获事实），Hull explosion明确没有发射绑定；不能用随机爆炸id推断是否存在整数serial。真实source舰仍在时按generation读取当时属性，已退出active roster的source对象保留至其弹体/爆炸结束。Graviton在普通盾静态map之后、external/energy之前折叠，void只用external。共享Host每次伤害边缘刷新动态modifiers，armor positive-cell与实际未拦截Hulldamage均触碰assembly-root void。地形拆nebula/status、asteroid/collision/module-sync两阶段；FX粒子更新在weapon之后、death-sweep之前，debris独立于spark占用。验收使用联合真实TS，不能以完整字段发布替代生产游玩。

共享发布接线补充：保留44词header，以原reserved43发布完整世界区长度，ABI升级13。世界区使用带版本和顺序长度的typed布局，真实发布主舰身份/抑制/clock、双方18项战果、64条损失、活动爆炸（payload、spec、screen和三种已命中身份）、地形ship metadata、nebula/asteroid/hulk/sequence、实际粒子寿命占用与有序呈现records。UTF16字符串按长度发布，不丢失舰名/specId；所有嵌套长度和generation/owner由TS只读解码校验。复制发布不允许展示写authority；呈现消费已生成粒子，不再次抽RNG。此发布仍不是恢复入口：完整checkpoint与生产Worker/恢复另有总策划，不能把snapshot读通叫完整可玩。

本次定向修正依据 Shield.ts:32–33、worldDamage/terrain已验收源码与CombatEngine:1119–1190：普通盾 taken map fold×external×energy 只有4类映射，不读取44长数组末尾之外；nebula在status之前，gravity→asteroid update/collision→capital pair→module sync→weapon在原序。联合actual system oracle正在集中跑，native在首轮结果前保持静止，随后同批接新世界区与正确阶段并集中验证。

独立死亡与爆炸已核实；本阶段接入同一个常驻 Body/ShipState/Ordnance，使普通武器与注册特效的致死命中执行真实死亡闭包。一次安装死亡静态规格、舰名、主舰身份、模块树和残骸槽位，后续只读取 Rust 当时的实体位置、幅能、系统和动态伤害属性；不逐帧导入 JS 世界。共享 Owned 保存爆炸有序列表、Terrain、18项战果、64条损失和有序呈现描述。它与实体/ordnance/双RNG一起克隆为 scratch，全部成功才发布；旧generation与缺失静态定义中止整步，保留上一帧。

玩家现有驾驶/开火/盾/技能交互保持原流程；致死即关闭输入、先父后子死亡、同步chain damage，再由原末尾阶段结算。没有新增产品取舍。明确范围外为本阶段后续生产Worker/展示消费/舰队部署与胜负接线，继续总策划不表示这些完成。原版依据沿本文件来源段；新适配同时查 CombatEngine:1270–1321、WeaponSimulationSystem:78+ 与 ProjectileExplosionSystem 的 push→apply 次序。普通命中真实armor/components之后即时生成装甲粒子并消耗visual RNG，Tachyon按其独特armor→hull→sparks→components顺序执行；不得在JS drain输出时消费。

实施顺序：静态规格与共享状态→generation-safe同步Host、重入爆炸及死亡→注册effect与普通命中接线→terrain/gravity共用宿主→ABI发布与实测联合oracle。验收按实际TS真实死亡/chain/hit源对照，严格比HP、resources、RNG、统计/事件序及模块、留存死亡源、整步rollback；几何沿批准容差。模块纯探针与neutral regression均不充当生产可玩结果。当前complete gate仍关闭。

本块延续已确认的浏览器/桌面共用 Rust/Wasm、规则严格一致、限定几何舍入差异方案。目标是将现有 Web 的舰船死亡完整次序搬到 Rust，使致死命中同步关闭舰船操作、销毁附属模块、立即影响真实世界，并生成与现有玩法一致的残骸、视觉和战果。玩家操作和 UI 不作产品调整；生产接线与完整七包可玩验收由主任务继续推进。

## 范围与玩家流程

覆盖 `CombatEngine.handleShipDestruction`、`shipExplosionPayload`、`createShipExplosion/createExplosionPuffs`、`createShipHulk/applyHulkDisableDamage`、死亡碎片和装甲粒子、`CombatStatsTracker`。保留实际装甲/伤痕/组件/幅能服务，不复制其公式。后续残骸几何分裂及运动、舰载机补员、部署/撤退、胜负裁决、网络 DTO 和 Worker 接线属于主任务其它部分；本模块输出不能单独代表可游玩交付。

舰船 HP 致死后调用同步 Rust 死亡入口。已死亡或副作用受抑制时立即返回；其它状态先标记父舰死亡，再按附属模块顺序将子舰 HP 置零并递归。完成递归后清理开火/油门/刹车/横移/转向输入和重力保持，取消主动排散，关闭护盾，依次中断并禁用全部系统。舰船身份和 generation 必须同时匹配，旧身份不可伤害重用槽位。

非战机、非附属、非临时舰产生损失通知，队列上限 64。按现有声音 → 舰船爆炸视觉 → 旗舰/敌主舰提示或普通战机统计 → 游戏爆炸立即生效 → 碎片 → 震屏 → 残骸 → 禁用装甲损伤的次序执行。连锁死亡须在本次调用内完成；胜负由主任务在整步所有连锁命中完成后裁决。没有新增确认/取消 UI；死亡不可被玩家取消。无效身份、数值或世界动作失败向整步事务返回错误，由主任务恢复完整 clone 和两个 RNG，不允许局部成功帧外发。

## 最小原版对照与证据

原版目标版本沿用本机 0.98a-RC8。以下源码核实不等于原版实机或画面等价，用户使用电脑期间不启动可见窗口。

- `../decompiled/starfarer_api_source/com/fs/starfarer/api/loading/DamagingExplosionSpec.java:69–97`：舰船爆炸基于 maxFlux 的 0.5–1 倍伤害、爆炸倍率、0.1 秒、碰撞半径 core、零最低伤害、HE、舰船/小行星。对应当前 `ShipExplosion.ts:5–20`；当前 Web 用独立可重放 RNG 和浮点 projectile id，保持其次序。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:4334–4518`：舰船死亡爆炸、按舰级放大、闪光/flare、全部普通舰及半数战机残骸、关闭盾/AI、驱逐舰以上中央 2000 HE 与十次 randomDamage。反编译若干 `void var...`、缺失类型不能照搬；与上述 API、粒子工厂及当前 TS 交叉核实。
- `../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/ExplosionParticleSystem.java:107–219`：sqrt(radius) 视觉直径、战机 1.75 系数、固定纹理 puff、环纹理重抽、继承速度。当前 `ExplosionVisuals.ts` 将其转换成弧度和 Web duration；这属于既有差异，迁移不偷偷改为 Java float/RNG。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/H.java:47–86`：breakProbability、正态 min/max pieces、减一 split、0.33/splits 间隔、半间隔至全间隔随机。当前 `HulkVisuals.ts:8–56` 用现有 Box–Muller RNG、格子清零、伤痕同步及数字 id；保持现有公式。
- 当前权威依据 `CombatEngine.ts:1270–1321`、`Ship.ts:373–380`、`ShipSystem.ts:228–233`、`CombatFXSystem.ts:384–393,667–705`、`ArmorImpactVisuals.ts:6–24`、`CombatStatsTracker.ts:14–149`。Web 碎片数量 8/45、震屏 25/0.8、提示及战果为已授权现有规则。原版截图/同状态实机未核实，本块不改变布局，也不宣称视觉原版等价。

## 数据、权威和实施顺序

`world_damage.rs` 保存可 clone 的 typed 视觉描述、残骸和统计；直接使用现有 Random、explosion_effects 的 Payload/Spec、真实 resident ShipState Armor/Flux/Shield/System。同步 Rust 内部 Host 按 generation 读取实时舰船、执行实际输入/系统插件中断和装甲操作，并在 `spawn_explosion` 中立即调用真实爆炸系统；Host 不是 JS 每帧求解回调。元数据由内容初始化、部署命令或 Rust 世界状态提供；最终发布帧才交给 JS 呈现。

先完成数值工厂/统计，再完成死亡次序和真实 resident 资源/残骸适配，最后集中实际 TS oracle 的 Node 与全新无头 dedicated Worker 对照。爆炸递归保持死舰可读取的源伤害规则，不能在清理 active roster 后丢失 source。联机不引入新权限或单人机制，仍由既有权威 Worker 一次推进；整步事务包含 stats、通知、爆炸、残骸、碎片、插件状态及 RNG。存档格式本块不变，主任务增加持久字段时负责版本/迁移，不能序列化临时引用。

## 验收与待核实

验收严格比较死亡/模块序、通知裁剪、统计 18 字段、HP/装甲 cells/伤痕、资源与系统状态、RNG cursor/id、事件先后和数量；位置/角度/纯几何限定 `max(1e-9,32*EPSILON*max(1,abs(a),abs(b)))`。实际 TS 私有死亡入口、真实视觉/残骸/装甲/统计是 oracle。覆盖 fighter/各舰级、零爆炸倍率、附属/临时舰、抑制、重复调用、break 不同 pieces、伤痕抑制、强链爆炸及父子互相命中。原版实机待用户允许。插件 onInterrupt、真实 world terrain、generation 错误回滚、七包完整战斗和性能测量在主任务生产接线后验收；本模块探针不得充当这些结果。

## 实际实现、接线合同和验收结果

`native/combat-core/src/world_damage.rs` 已完成真实工厂、18 字段战果、64 条通知队列、同步死亡次序，以及可直接复用的 resident generation 查询、DEAD/子舰 HP/运动输入写入、真实 Flux/Shield/System 关闭、真实 Armor 清零/伤痕同步和 dead hull HE 损伤。`Host::spawn_explosion` 是必须同步改变世界的 Rust 接口；`destroy` 不是单纯 dead flag，也不能接一个只记录伤害的实现。系统的 clearInput gravity onInterrupt 和 allSystems onInterrupt 由完整 Host 的插件 owner 在正确边界调用，`shutdown_resources` 提供实际资源/生命周期写入；插件触发、主开火/组输入必须由 root Host 配套清除。

**身份/舰级映射**：本模块 size 使用原版 ordinal，fighter=1、frigate=2、destroyer=3、cruiser=4、capital=5，undefined 保留 None。主任务 `CombatShip.size` 从 0 起，接线时必须转换 `+1`。`Identity.id` 仍用现有数值注册表，generation 必须来自实际 source/body handle；`Spec.id` 是内容 id，`mount_slots` 保持稳定注册后的 slot id 顺序。min/max pieces 由内容导入应用 TS 默认 2 后提供。损失 hull_name 是内容语言表已解析的显示值，模块执行现有 `split(' (')[0]`。

**连锁 active 顺序**：TS `ProjectileExplosionSystem.spawn` 先 push 再 apply。root 的可重入 Host 必须先为本爆炸保留 active 索引，再同步 apply，结束后写回该索引；新产生的递归爆炸保持排在父爆炸之后。当前独立 `Explosions::spawn` 的非可重入默认方法仍 apply→push，不能直接用它冒充该生产合同。实际 oracle Host 已验证预留索引模式。outer step 在所有递归结束后才裁决胜负。

**装甲粒子 RNG 边界**：给已交付 `explosion_effects::Host` 新增兼容默认 `armor_sparks(id,local,damage,visual)->Result`，在常驻爆炸和旧式近炸的真实 damage/components 后调用。生产 Host 使用 `world_damage::armor_particles` 在这里消耗实际视觉随机数，再发布呈现；默认只记录版本专供此前 record-only oracle，不能称完整 FX closure。系统粒子、护盾/组件/舰船损伤不应移动到 JS。舰船 explosion puff factory、debris、hulk 装甲粒子均已经在本模块原顺序消费 RNG。

集中验收 `scripts/check-rust-world-damage-module.mjs`：Node 和全新无头 dedicated Worker 都通过 **30 场景、94,541 严格字段、68,240 几何字段、1,391 有序事件、55 个立即连锁爆炸**；最大几何差 `2.842170943040401e-14`，严格字段完全一致。oracle 实际调用 `CombatEngine.handleShipDestruction`、`ProjectileExplosionSystem`、`CombatFXSystem`、`ShipDamageState`、`ArmorGrid`、`WeaponComponentHealth`、真实 system.deactivate 和 CombatStatsTracker；Rust 使用实际 resident Armor/Component/Flux/System，不是 record-only damage。覆盖五舰级、抑制/重复死亡、父子/链、fighter stats、零伤害、通知裁剪、随机 breaks/min/max、scar 抑制、实际 debris/armor particle 次序。两端几何差数量可不同，但都在许可范围内。

证据 `artifacts/rust-combat-core-20261008/verification-world-damage/result.json`。Wasm 1,611,422 bytes，SHA256 `fd8f7906caa7133a09d1ebbb7c04225bb6526df1a7c9daa7ace515f7984966c9`。改动 TS/MJS scoped ESLint 已通过。本 fixture 使用只包含本域实际模块的 Rust 入口，不代表完整生产 world 已接线；不覆盖各 ship system 的真实插件中断、terrain/asteroid、残骸后续分裂、联机回执或七包完整战斗。

另覆盖过期 generation 的 Err4/零输出、finalize 的 hull ratio 裁剪和统计快照独立性/reset；新增 210 个严格字段计入上述最终总数。同步主任务新加入的 live modifiers 依赖后重编译，fixture 仍 world=None，使用实际 default Modifiers；若误触任何 world extension damage callback 会 assert 失败。fixture 文件的定向 TS 诊断已归零；其全源依赖图还有既有诊断，未宣称全项目 typecheck 通过。

`explosion_effects::Host::armor_sparks` 兼容扩展集中复查 Node/fresh Worker 54 场景仍通过（6,364 strict/719 geometry/524 records、差0）；此新版 oracle Wasm SHA256 `27d095a8df83a94fb2f6c4c1b7bfa16f8658ba189ebee1b121285ace86340ace`。此前报告的旧 Wasm hash 属于扩展前证据，主任务生产源哈希需重建。

进度：本域实现与集中差分已完成；主任务生产接线和完整可玩验收继续推进。无需新增玩家取舍，沿用用户已确认方案。

