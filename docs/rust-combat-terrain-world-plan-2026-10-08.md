# Rust 常驻地形、实体碰撞与残骸运行方案

延续用户批准的 Rust/Wasm 共用内核与当前规则严格一致方案。本块让小行星、舰体与残骸在 Rust 内实际移动、碰撞、受伤和分裂，保持玩家现有可见表面与撞击反馈。没有新增操作按钮，舰船驾驶/武器流程不变；舰船死亡继续复用已完成 world_damage，胜负仍在整步末处理。

范围覆盖实际 AsteroidSystem 的初始化、漂移/越界 wrap、舰船/小行星碰撞、弹道 nearest 查询和真实命中/碎裂，NebulaSystem 当前 authored cloud 与每舰 terrainSpeedMult=1，ShipCollisionSystem 的质量/station/root 位移及双目标 KINETIC伤害，以及实际 HulkGeometry fracture、splitHulk、shared breakup、漂移/战机残骸过期与每源舰冷却。引力只读写既有 fixed/managed/速度/角度接口；不重复 gravity_world。视觉工厂消耗 RNG 的边界由同步 Rust Host 与 world_damage 工厂提供，不能只返回动作给 JS 求解伤害。完整 Worker/协议/联机部署由主任务负责。

## 原版证据 → 现有行为 → 差异 → 验证

目标 0.98a-RC8。`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/terrain/Asteroid.java:55–92,144–169` 核实 ASTEROID 类型、HP、物理质量与致死删除、粒子反馈；Web `AsteroidSystem.ts:89–146,169–245,271–347` 现有质量 radius²×.75、固定种子中心18+外围60个、碎裂两个石块以及撞伤/反冲是现有 Web 规则，未原版逐项等价，不在迁移中改动。

`../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1539–1544` 核实独立碰撞阶段和执行实体删除/加入。`ShipCollisionSystem.ts:40–227` 明确当前质量加权冲量/撞伤尚待原版核验，迁移保留其20速度阈值、0.8速度消解、8×伤害、station响应、root模块同步和当前部分盾接触，不能声称 Java碰撞公式已还原。

`../decompiled/starfarer_obf/com/fs/starfarer/util/Tesselator.java:43,50–82,98–139,174–217` 核实20单位细分、按舰级8/12尝试、递减cut fraction、带噪断面，反编译缺类型/变量已与当前 `HulkGeometry.ts:94–208` 交叉核实。`entities/H.java:110–157` 核实按包围盒面积选择最大块、共享切割序列。`entities/Ship.java:498–522,640–659` 核实 clone/split、普通残骸舰级和源grid清零；当前 `HulkVisuals.ts:61–127` 只保存源舰装甲/伤痕引用与可见碎片、原顺序 slot 分配、grid对齐中心、第二块.5速度冲量，保留此模型。工厂dead hull禁用损伤复用world_damage，避免重复实现。

`NebulaSystem.ts:14–28` 当前仅绘制 authored cloud、速度倍率1；不补造原版星云减速/传感玩法。原版界面/碰撞实机未核实，用户当前不允许操作桌面；本块不变界面结构，不宣称原版实机画面等价。

## 权威流程、状态、失败和依赖

typed Host 对 then-live 舰船/模块、装甲/组件、护盾/幅能执行同步 Rust调用。舰体碰撞按调用者现有 pair 顺序，position separation → 两root syncModuleTree → relVel → sound/velocity → first target damage/components/particles/hull → second target → floating/debris/shake。小行星按实际动态数组外层正序（碎裂后i自增，不能擅自换snapshot）、舰船正序；碰撞反馈可改变真实shield/root或bounds，下一pair须读取实时值。星云更新所有舰船倍率1，包括死舰；不会创建新规则。失败或过期generation返回错误，root整个world transaction克隆恢复实体、碎片/序列、damage和两个RNG，禁止发半步。

残骸逆序age/motion、fighter10.5s删除；每source首次遇到时只冷却一次真实scar/shield/第一system；随后按shared sequence首次出现顺序推进，过冲丢弃、按最大包围面积第一strict赢家分裂，所有同序列子块共享间隔、remaining decrement和下次RNG。失败cut仍消耗尝试RNG和remaining；无矩形fallback。源舰存活metadata/伤痕保留，slot registry不改变。接口处理gravityFixed/Managed，不从摄像机删除物理残骸。

实施先几何/typed state与真实Asteroid/Ship碰撞，再完整fracture/split/drift/sharedsequence，最后实际TS Node与全新无头dedicated Worker集中差分。主任务导入terrain常驻状态与authorcloud配置，接现有gravity和worlddamage，做完整七包/部署/联机验收。联机权限沿用唯一权威Worker；存档本块不直接变格式，若生产需要持久化序列/实体generation由root版本迁移。没有待用户新的产品取舍。

验收严格比較HP/flux/组件、eligibility/surface/pair ordering、实体新增删除、RNG/id、breakup次数/slot/stats不额外增；几何限定既定容差。覆盖partial/offset/void shields、concave hull、root station、coincident/tangent、nearest tie、fixed asteroid、large wrap、shatter动态数组、fighter hulk expiry、holes/doubledbridge及无效fracture。只通过query/record damage不等于本块真实闭包，探针通过不等于整款可玩。

补充接口范围：NebulaSystem.init 按传入 authored definitions 逐项生成常驻云，保留数组索引 id、spriteUrl、thickness 和 atlas0，不消耗 RNG。world_damage::Hulk 由 terrain.admit_hulk 接收，源舰级、spriteHeight 与 slot 坐标来自 resident metadata，创建独立共享 sequence 后子块沿用；不得再抽一次碎裂 RNG。残骸 commit_hulk 必须调用真实同步 Rust EnvironmentHost::environment_impact（live projectile 位移→现有 sound/glow/fade/rocket/effect/immediate explosion/shake→invalidate）再 sparks10/debris1；后续穿透/删除仍由 root 的现有弹道规则决定。地形暴露实际 CombatFXSystem spark 密度/工厂与 authentic explosion 工厂，原位置消费视觉 RNG，含720上限和实际 active particle 占用；只发回放描述不能推迟 RNG。对应证据为 `ProjectileCollisionHandler.ts:477–524`、`CombatFXSystem.ts:364–423,501–532,344–360`。残骸冷却集中验收调用实际 updateHulkFragments，而非手抄其遍历。

## 主任务接线合同

模块为 `native/combat-core/src/terrain_world.rs`。`Terrain` 可克隆，常驻保存 asteroid/hulk/nebula 和共享碎裂序列；必须同 resident world、源舰装甲/伤痕、ordnance、输出、两个 RNG 一起进入事务和回滚。正常碰撞中没有新增统计或即时死亡分派：ShipCollisionSystem 和 AsteroidSystem 仅执行现有 hull 伤害，死亡扫描仍由外层在现有阶段执行。小行星 id 保留 binary64（碎裂后是 gameplayRandom.next），不能强制转为整数。

1. 场景建成后调用 `initialize_asteroids`，取当前 authored 文件的 spriteUrl/x/y/opacity 生成 `NebulaDefinition` 调用 `initialize_nebulae`；云 width/height 仍属 immutable authored presentation metadata，init/update 不消费 RNG。每帧 `nebula(host)` 恢复当前 Web terrainSpeedMult=1。
2. Host.ship 每次按身份代次读取 then-live pose/vel/shield/bounds/root、station、碰撞忽略、CR/system倍率；team 提供当前 combatTeam 的归一结果（含 player fallback）。`move_root` 修改真实root位移/速度，`sync_modules` 按真实树同步。`shield_absorb` 使用当前真实 Shield，`shield_flux` 使用真实 Flux；不得把 oracle 的固定 absorption 服务带进生产。
3. `Host::armor` 的 damage 已由规则在指定位置应用 CR，impactStrength 仍是未缩放 raw；resident Armor 适配不可再乘一次 CR。复用真实组件与伤痕，组件传入正确 source/目标武器和引擎倍率。`armor_sparks` 立即用 world_damage::armor_particles，`debris` 立即用 world_damage::debris（当前均为 small），`sparks` 立即按 `spark_count(requested,所有真实activeParticles+recipe particles)` 后 `spark_particles`；死亡、武器命中和地形必须共享同一占用计数。`impact_explosion` 用当前半径/颜色/rings/duration/velocity 创建真实 puffs，输出可携带回放配方，但 RNG 必须已消费。
4. ship_collision 按外层 pair 正序；advance_asteroids 按既有位置推进；resolve_asteroids 保持真实动态数组 splice 顺序。projectile query/commit 提供 nearest asteroid 和真实 hp/shatter。生产 WeaponSimulationSystem 的 terrain优先级、穿透、didDamage、blast可能删除前序missile后的身份重查由外层保留；无需调用旧 fallback resolveProjectileCollisions 再处理一次同颗弹丸。
5. world_damage 输出 Hulk 时调用 `admit_hulk(h,sizeOrdinal,spriteHeight,slotPositions)`。CombatShip size0..4 必须 +1；缺舰级保留 None。slotPositions 按当前 spec.weaponSlots 优先、其后 mounted relativePos 解析；不存在坐标的slot按现有TS丢弃。admit 不再抽 RNG，独立 sequence serial 起于1、同源子块共享 sequence，source generation必须保持。真实源舰Armor/Scars/Shield/primary System 不能在移除 active roster 时销毁。
6. `advance_hulks` 接 `resident_split_armor` 和 `resident_cool_hulk_source`。后者在 scar→shield→第一个system 的实际边界更新；Shield temporary facing/aim override 在返回前恢复，不改变真实瞄准输入。只更新第一系统，与TS的 sourceShip.system.update 相同。gravityFixed/Managed 按 gravity_world 已有接口写入同一片残骸。
7. wreck query 后可 `commit_hulk`（验证当前Terrain有此id），或在真实 owner 已核实实时 hulk id 后调用无Terrain借用的 `hulk_impact`，允许其 `EnvironmentHost::environment_impact` 重入立即爆炸/死亡/地形。该必需Host实现必须同步运行 live projectile position→sound/glow/fade→rocket detach/destructionVisual条件→registered hitEnvironment→immediate spawnProjectileExplosion→shake→invalidate。不能 drain一个动作列表后在JS运行这些规则。之后严格 sparks10/debris1。Asteroid commit 后亦在现有弹道阶段调用同一 EnvironmentHost，携带正确 asteroidId；保留击碎后cost判定，不改变 hulk源舰HP。

## 实际集中验收与交付状态

`scripts/check-rust-terrain-world-module.mjs` 对真实 TS `AsteroidSystem`、`NebulaSystem`、`ShipCollisionSystem`、`ProjectileCollisionHandler.queryHulkCollision/checkHulkCollision`、`CombatFXSystem.updateHulkFragments`、`HulkGeometry/HulkVisuals` 做Node与全新无头dedicated Worker差分。两端各 **44 scenes，15,773 strict fields，6,530 geometry fields，281 ordered records**；所有严格值一致。Node maxgeometry `1.4210854715202004e-14`，Worker `9.094947017729282e-13`，符合已批准容差。Wasm编译、owned TS/MJS ESLint通过；此fixture及其 imports 的 tsc 零诊断，未跑完整项目/默认全套测试。没有可见窗口/桌面输入。

证据 `artifacts/rust-combat-core-20261008/verification-terrain-world/result.json`；isolated Wasm **1,580,651 bytes**，SHA256 **ec496256b93830f6dd8abf274d8ce27be6fd832ce1f69a3b7ed6471b6196ff10**。真实装甲、组件、伤痕、幅能及小行星 hp/splice/新实体、完整火花/爆炸puffs随机数、残骸槽位/共享碎裂、真实源舰Shield/primary lifecycle（第二系统不前进）已覆盖。原版实机和画面仍未验证。

oracle 的舰体碰撞 shield absorption 与 environment_impact owner 边界明确仍为record service：完整生产必须接入上文真实Host并做实战，不能据本探针宣称武器effect/immediate explosion已在terrain owner内闭合。sourceShip.system的generic lifecycle为真实模块；隔离harness的world=None特殊system_owner回调意外调用会assert，不把未知插件默默映射成默认。光效camera/floating输出为有序描述；最终渲染与七包/部署/联机可游玩验收由主任务继续。

进度：来源与策划、独立模块实现、44场景集中验收已完成；生产接线、完整权威Worker实战及正常游玩尚待主任务完成。没有 stage/commit/push/release。
