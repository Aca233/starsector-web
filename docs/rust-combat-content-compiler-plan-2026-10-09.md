# Rust 战斗一次性内容编译策划

## 2026-10-09 出生模板源绑定补齐（先于实现）

完整flight wire已使用template静态构造。`FighterSystem.ts:101–114` 当前真实出生规格先以carrier truthy point_defense覆盖craft同技能，再构造；编译模板复用这个已存在规则，仍由当前空技能目录的真实准入拒绝非空技能，不能恢复技能。每template补actual MIRV child/system resource/mine的immutable weaponKey+slot/system来源；born craft发布从template字典解析，不能凭动态id猜武器。效果、轻重雷参数和effective hullmod武器与已部署实体用同源计算。本补齐无玩法/UI/存档变更，验收模板source闭包引用全部解析以及现七包构造RNG不变。

## 2026-10-09 reserve 源顺序修正方案（先于实现）

主任务实际 scene authority 对接发现此前 reserve 延迟构造会改变开战 RNG。当前 `CombatEngine.configure/deployment.configure` 先有完整根舰实例再仅为 active carriers 创建 craft；`CombatDeployment.isReserve` 独立过滤，储备并不 docked。修正为 input.ships 原序构造全部 root 与递归模块，完整 entities/constructorInitial 携带显式 deployment=reserve/deployed；所有身体可安装初始 HP/装甲/CR/ammo，而 live scope、wing 初始化与 carrierOrder 仅使用 active。reserves 保留同实际实体的 id/handle/specKey，不能仅模板延迟构造。失败保持候选原子性，不改变玩家操作/DP/存档；验收 actual mixed reserve/deployed 构造 RNG 和真实 flight roster、储备无 craft/未伪装 docked，旧13fit无需无关领域重测。

2026-10-09；P4 静态内容安装。继承用户已确认的浏览器/Electron 共用 Rust/Wasm、限定几何舍入和规则结果严格一致，以及“全部做完，能正常游玩再停”。本块完成不等于整场可玩。

## 目标、范围与玩家体验

玩家使用当前七个内置包、当前实际注册的宿主舰船/装备以及现有部署、模块、联队和储备舰队。开战时将选中的真实 ShipSpec 一次编译为 Rust 所有者的不可变静态规格、初态命令和安装元数据。Rust 接管后不保留 Ship 来步进、不从显示状态回灌规则、不每帧执行 TS modifier/AI/weapon/flight 求解。保留装备顺序、舰船身份、模块挂点、舰载机模板、专用系统发射器、组件身份、两条随机游标及部署名册。

本块不调整玩法、数式、界面或现有配装；不恢复当前空目录的 drone、Mote 或 Chiral 模板；不做生涯、存档 schema、发布或 Git 提交。不把仅有 hostCapability 字符串当作 Rust 规则证书。未知或替换的真实回调在候选安装前拒绝。

## 原版和当前来源对照

原版版本为本机 0.98a-RC8，证据与文件位置引用 [production-readiness-audit](rust-combat-production-readiness-audit-2026-10-08.md) 的 ShipCommand、CombatEngineAPI、CombatFleetManagerAPI。这些证明命令、实体与 reserve/deployed/destroyed/retreated 的接口语义，不证明 Web 初始化数式。迁移的数式以当前已授权 Web 源码为准：

| 当前实际来源 | 编译后的预期 | 当前差异/核验 |
| --- | --- | --- |
| Ship.ts 构造函数及原生 reader identity 证书 | effectiveHullStats、装甲/盾/幅能、系统、武器、递归模块、引擎和 readiness 初态保留 | 当前 Rust 域安装接口不自动代表同样的构造 RNG 顺序；必须输出真实初态及游标见证 |
| HullMods.ts、CombatSkills.ts、ship-systems/Registry.ts 与 immutable DefinitionRegistry | 仅可信注册定义的静态计算执行一次；live 回调由已经迁移的 Rust 规则执行 | 技能目录目前为空；未知技能拒绝，不创建假技能；外部定义不能继承相同 ID 的证书 |
| BundledShipPacks、ShipPack 编译与 ContentRegistry | 实际所选 13 authored fits 的模块/wing/装备/生成器递归闭包 | 24 舰体、32 包内武器是目录数量，包外装备和生成内容也必须进入闭包 |
| 各 actual owner fixture 的一次安装 | 按生产源映射已有 flux/shield/armor/components/engine/weapons/fire/query/readiness/system-world/death-world/gravity 命令 | 不能导入 fixture 到产品；fixture 是字段核对来源，缺少的 AI/flight/aux 协议以 mandatory typed metadata 交主任务安装 |

不更改界面；原版截图与实机状态本次没有许可与新证据，仍标记待核实。编译验收不宣称原版视觉或实际游玩已经通过。

## 数据规则与完整流程

1. 输入为可信启动种子/两条 RNG 初态、已选根舰/储备、初始 pose/team/player、持久成员绑定和当前内容 revision。先核查实际注册 definition identity、技能/装配合法性和递归依赖；失败产生具体 source path，候选未改变权威 DP、名册或随机游标。
2. 只在编译期构造真实 Ship。保留其内部递归模块顺序，记录各 weapons/engine/readiness tracker 初态和构造前后两 RNG checkpoint。初始化代码可以执行已经核实的静态 apply/initialize；动态 callback 不在此模拟。
3. 展开模块、联队/craft、reserve 与当前实际专用发射器/轻重雷模板。模板不伪装成已部署实体，分别形成 immutable dictionary 与 mandatory spawn policy。记录每项 content source ID、weapon slot→组件 ID、父/子与 carrier 关系。
4. 输出已有 ABI 的 typed commands、不可变内容 dictionaries、mandatory AI/flight/aux 与构造初态安装记录、startup RNG witness。若某域尚无 wire，明确需要的域和 typed 字段；生产 kernel 必须完整消费后才能开战，不能忽略后仍标 fullBattleReady。
5. 主任务私有候选按固定身份与命令序列安装，再导入实际 tracker/最终 RNG checkpoint。constructor 在 Rust 中产生的额外抽样不能冒充与 TS 顺序一致。安装拒绝/取消/content revision 改变时销毁候选，不修改现有已确认战斗。
6. 完成后丢弃编译用 Ship 与所有规则回调引用。产物只允许纯值和不可变内容，步骤中不能重新访问 TS simulation 对象。

几何数值的验收容差为 max(1e-9,32*EPSILON*max(1,abs(a),abs(b)))；资源、伤害、计时、随机 state/draw count、target/source/component/slot/顺序严格相等。Infinity 只允许当前 source 规则认可的无限持续时间、未命中时间和原生雷 range 等具名字段，不做通用放宽。

## 联机、并发与存档

编译发生在开战/部署 prepare 的候选边界，实际 host 权威安装；客户端不能提交 damage/stat/callback 或裸 Wasm 数据。保留 revision/epoch/sequence 和原子失败语义。内容指纹覆盖选中闭包、静态 policy、技能/系统/hullmod/effect 证书及编译规则版本；同构建恢复核对这些字段。不修改用户持久存档；reserve 的成员绑定/未出击记录由主任务结算管线使用。

## 实施顺序与集中验收

先核查真正的 registry identity 与七包闭包；再实现字段映射、一次构造与 startup witness；最后交付 mandatory domain 元数据及针对性验证。主任务负责 RNG/初态 wire、实际 production kernel、显示和可玩验收。

本块最少验收：真实七包 13 配装均编译成功，递归模块/联队/专用装备来源与真实构造一致；产物不存在 Ship/函数/Map 可变规则引用；两 RNG 的开始/结束游标和 tracker state 能准确重放；未知技能/系统/hullmod/effect/被替换回调被拒且无候选外副作用；已有命令通过 typed encoder，能在正式 core 上安装的域验证真实 read-only snapshot。缺少 wire 的元数据必须有明确完成状态，不冒充安装成功。只对失败做定向修复，不重跑未受影响全套领域场景。

## 待核实、已完成与阻塞

已完成：生产审计与当前 Ship/registry/protocol、world fixture 最小对照；本策划。待完成：内容编译功能、实际清单和集中验收。待主任务确认：initial RNG checkpoint 命令以及 components/engine/readiness constructor tracker 初态的原子导入方式；AI/flight/aux 安装 wire。没有新增玩家取舍待确认。

## 2026-10-09 实际交付与集中核验

编译功能已落 `RustContentCompiler.ts`、独立 Fields/Flight，复用实际 `RustAIAdmission`。候选 spawn → domains → relations → constructor 110–117 分批，完整 mandatory 元数据装全之后才 finalize104，导入实际构造期 tracker 和两条最终游标。Flight StaticShip 包含所有固定构造数组、有效 FireSpec/QueryMount、系统 definition、模块递归模板、carrier refit变体、所有 authored wings与真实初始 Formation；sample tracker仅用于核验，生成时原生构造重新采样。Aux 元数据直接采用已落 protocol105 的类型。

一次集中 Node 与 fresh headless DedicatedWorker均通过当前7包13配装，857个严格比较、5个真实准入拒绝；产物递归 frozen，无 Ship、函数、Map/Set 求解器引用。Scoped TypeScript和改动文件 ESLint均零诊断。结果位于 `artifacts/rust-combat-core-20261008/verification-content-compiler/result.json`。Gloriana两配装分别包含23/24实体、8模块及14/15craft；Ark含19实体、4模块和14craft；其余根舰均保持全部当前挂点。储备不部署、不推进battle RNG。

未完成验收：新增constructor/aux/AI/flight wire的生产安装与整场可玩；当前正式Wasm需要主任务更新后再执行optional realinstall检查。已定位真实Yamato入口只装基础delivery而未装实际blast170/passMissiles/impacteffect；完整delivery需主任务闭合。Flight formation需要原生一次导入，不能从renderer重建。以上明确属于剩余实现，不以pure-source检查宣称正常游玩或完整原版等价。
