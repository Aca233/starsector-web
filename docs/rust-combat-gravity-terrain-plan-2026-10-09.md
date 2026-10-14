# Rust 引力残骸真实碰撞

本块接续用户已批准的浏览器/桌面共用 Rust/Wasm 全战斗迁移。目标是在既有引力牵引、固定残骸和舰船撞击时，由同一常驻 Rust 状态即时更新位置、速度、幅能、装甲、组件与船体。玩家操作、界面、残骸阻弹/AI 障碍物身份以及玩法数式沿用当前版本；不增加操作、碰撞声音、伤害统计、残骸 HP 或自动死亡事件。范围仅 managed/fixed wreck 的当前 `advanceGravityTerrain`，普通残骸冷却/碎裂、引力场本身和整场接线由已有域继续负责。没有新增产品取舍。

## 原版与当前来源最小对照

原版版本 0.98a-RC8。本机 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/GravityPullEffect.java:33–91` 已核实暂停不推进、真实质量/半径决定速度外力；`CombatEntityAPI.java:9–11,35–36` 定义即时速度/朝向/质量；`ShipAPI.java:87,449,527,625` 定义残骸、父模块与带模块质量。上述 API 不能证明 Web managed 残骸碰撞的具体系数。多对象引力残骸碰撞是此前已授权扩展，保持现有实现，不冒称原版规则。原版相关实机与界面无截图证据，且用户禁止桌面输入，仍待核实；本块无 UI 修改。

Web 直接依据 `src/engine/simulation/systems/GravityTerrain.ts:11–82`：最深多边形顶点接触、反向 ship 顶点接触、无顶点包含时细长交叉多边形求交均值；护盾在顶点及各边最近点中选最深接触，等深保原数组先序。`HullGeometry.ts:206–257` 提供真实凹多边形边/绕向/退化边/圆 fallback，`ShieldCollisionGeometry.ts:246–266` 提供 active arc 和偏心盾几何。`HulkGeometry.ts:14–17,28–32` 定义有符号面积与最近边投影。`Ship.ts:128–159` 定义深度优先装配树（包括 dead 子模块质量）与即时刚性同步。`GravityTerrain.ts:62–82` 定义 50 最低面积质量、station/fixed 逆质量、先位移/同步后速度、closing>20 才伤害、上限600、CR 仅在真实护盾和装甲入口相乘、组件→船体→装甲粒子→浮字顺序。当前 Rust terrain_world/owner 已有真实宿主，但尚缺此碰撞规则；实现直接复用其同步服务，不能只输出伤害请求或用假质量。

## 操作、状态、权威与失败

现有 F/G/左右键引力输入、牵引/释放/坍缩流程见 `rust-combat-gravity-production-plan-2026-10-08.md`，本块在 status→引力 fields→即时 damage 后、asteroid/pair 前调用。每个 managed 非固定残骸先按 dt 移动/转向；fixed 保持速度与朝向。每个残骸按当前 ship roster 原序检查 dead/collisionless（包含退场、停泊与相位门）和 broadphase；接触后立即修正 root 与 hulk 位置、同步模块，再按原 closing 更新速度。原代码不在速度冲量后第二次同步模块，保持同一顺序，下一接触读取当时真实状态。closing<=0 只分离，0<closing<=20 有冲量无伤害。普通非 managed 残骸无此扩展。

单一 `world_owner::Owned.terrain` 的 Terrain 是残骸权威；独立模块不保存平行对象副本。必需 Host 扩展必须从真实 metadata 读取 source mass/bounds，按完整装配树原序累加质量；不允许缺源时取50或把 root.mass 当完整树。浮点 id/generation 保持现有身份，不能整数截断。源舰即使死亡或不 active 仍须保留相关 metadata。真实 `terrain_owner::Host` 已接护盾、Flux、Armor、components 与 Hull；调用时不注入 JS solver，不到末尾批量伤害。Ripple/floating 使用共享真实 visual factory，其中浮字合并/位置 RNG 必须在原边界发生。

借用采用 take/restore hulks 数组和 then-live Host，调用成功或失败均归还数组。World Hull 可执行真实拦截器、root void 与退场；本阶段不得擅自扫死亡生成残骸，仍交外层原序 death sweep。若特殊 hook 会同步增删原 hulks，root 必须保证同一调用语义，不能覆盖 newly admitted 内容。任何旧 identity、源 metadata、非法树、未知 spec、数值或服务错误上抛，外层恢复完整 bodies/ordnance/所有 owned/两 RNG/输出。客户端仅消费权威发布；不改生涯存档。完整 checkpoint 必须包含 Terrain 已有 managed/fixed/position/velocity/shape/source 等全部字段，不能用只读 publish 替代恢复。

## 实施、依赖与验收

1. 本来源/方案先落盘；新增独立 `native/combat-core/src/gravity_terrain.rs`，复用已验收几何与同步 Host，保留先序 tie、即时质量和真实伤害。
2. 独立 actual TS→优化 Wasm Node→fresh 无头 dedicated Worker 集中对照。使用真实 GravityTerrain、Ship 方法、Shield/Void、FluxTracker、ArmorGrid、ShipDamageState、真实组件与 FX 工厂；Rust 直接调用真实 terrain_owner/ShipState，不能合成 damage 回执。
3. 覆盖 fixed/managed/普通残骸、完整凹/薄交叉/反向 winding/退化边、偏心/窄 arc/void/overload shield、station 与装配树含死子模块、速度阈值及600上限、CR/组件/船体/粒子/浮字原序、两 RNG、连续步和 Clone 恢复。规则/资源/计时/RNG/身份严格一致；位置、角度和纯几何仅 `max(1e-9,32*EPS*scale)`，不扩大容差。集中 scoped lint；只修具体失败，不跑全套。
4. 交付 parent 可执行 API 和 source metadata/borrow/rollback 合同，root 接入生产 shared 事务与整场可游玩验收后方可称完成。本独立通过不代表整场、原版实机或性能已达目标。

## 进度与待核实

独立规则/真实宿主和集中 actual 对照已完成。原版实机待许可，无需为已授权实现重新确认。生产 fullBattleReady 仍为0；整场性能需生产迁移后实际测量。

## 交付 API 与集中实际结果

`gravity_terrain::advance(dt, &mut Terrain, &mut impl Host, random, visual)` 保持当前数组先序。扩展 Host 的 `live_ship` 是 Result（真实 `terrain_owner::Host::read`），保留 metadata/spec 原始错误；`hulk_source` 必须查源 Body/Meta 并返回实际 mass/bounds；`assembly_mass` 按深度优先 children 完整树累加，包括 dead 模块，验证身份/双向父子/重复/循环，不用 root.mass 近似。已直接为生产 `terrain_owner::Host<W>` 实现，无需 root 改 shared trait。

生产推荐调用 `advance_owned(dt, &mut terrain_owner::Host<W>, random, visual)`：仅 take hulks、调用真实服务、成功或失败始终还原。无意料的同步新残骸生成；若某 hook 越过原有 death sweep 时机同步 admit hulk，此 wrapper 保留两组 hulks 并 Err8 交整步 rollback，禁止静默覆盖新内容。它是 borrow wrapper，不承诺独立失败原子性，root 仍须完整事务 rollback。按 gravity production方案放在 fields/damage 后、asteroid 前。

`node scripts/check-rust-gravity-terrain-module.mjs` 在 Node 和 fresh headless Chromium dedicated Worker 均通过。每个 runtime 33 scenes（31 规则场景、恢复 capture/oracle重建），225 完整比较、41 有序 FX 记录、88,387 严格字段零差异、7,998 几何字段；Node 最大几何差0，Worker 2.220446049250313e-16。16 实际 coverage断言覆盖真实薄交叉分离、fixed 伤害、standard硬幅能/ripple、void破盾穿体、overload、rear窄盾暴露舰体、module接触移动root、dead module跳过、dead/retreated/docked/collisionless门、抑制装甲FX、station/fixed零逆质量与station可动残骸。8 metadata/error合同与1完整Clone恢复后继续步通过；scoped oxlint和fixture TypeScript零诊断。

验证使用未改 `advanceGravityTerrain`、真实 Ship prototype 方法、Shield/VoidShield、FluxTracker、ArmorGrid、ShipDamageState、WeaponComponentHealth 和 CombatFXSystem 工厂。Rust 使用真实 Body/ShipState、`terrain_owner::Host`、生产 `world_owner::TerrainWorld`、真实 Hull和FX；不是record-only damage。源码编译存在共享文件已有unused warning，未修改其它任务文件。证据 `artifacts/rust-combat-core-20261008/verification-gravity-terrain/result.json`。

范围如实保留：Ship fixture用真实原型与实际组件，并非重跑所有pack constructor；真实外部相位/特殊Hull拦截器由对应phase runtime继续接，完整shared快照/rollback/生产单一Roster/所有七包可游玩及性能由root集中完成。该独立结果仍 `productionIntegrated=false/fullBattleReady=false`，不宣称完整战斗交付。无可见窗口/桌面键鼠，无stage/commit/push/release。
