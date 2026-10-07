# Combat read-plane / matrix / packet 物化审计 — 2026-10-03

## 0. Source notes、边界与结论等级

- 先读 `C:/starsector-web-master/AGENTS.md` 和既有 `docs/combat-root-cause-brainstorm-2026-10-03.md`、`docs/combat-root-cost-{source-notes,results}-2026-10-03.md`；本轮只沿已列出的 matrix/materialization 候选追 producer 与 consumer，不重做 range/modifier 生命周期。
- 原版目标 **0.98a-RC8**；本轮 `Test-Path C:/starsector-core`、`C:/decompiled` 均为 false。原版数值存储、规划关系表和分阶段实现 **待核实**。没有桌面或实机证据，不将 Web 内部优化建议称为原版等价。
- 最小对照：原版证据缺失 → 预期保持当前已接受 Web 求解、顺序、权限、RNG 和动态写入边界 → 当前存在额外物化/重复遍历 → 后续由主代理复用既有 strict/witness 门禁，再查事实覆盖，最后才决定是否计时。本轮不改变规则或实现。
- **仅新增本文件**。不改生产、census 脚本、主线 ThreatAssessment/WeaponThreat*/DecisionReadPlane 或 nearest 文件；不跑 tsc/lint/build/test/bench，不新建测试工程，不提交/发布，不碰生涯。
- 用户补证：local-combat.worker 启用 phase reads；host.worker 仅 ownForWorker、可选 motion reads，既有 seed917 createLanWorld + ownForWorker 是 **LAN 默认 producer**，不是 local 完整 producer。本轮不审计此差异及 allSystems/phased 重复消费；下文的条件路径不能被概括为“所有 Worker”。`ownForWorker` 也不证明未知 callback 纯性。
- 上轮 fleet source-modifier candidate 已全部撤回（用户补证：修 null gate 后覆盖 3 source，ABBA 33.341→34.653ms）；本轮不恢复、不重试反射资格算法。nearest 保持，其收益不能归给本文候选。
- 下述行号为本轮轻量读取时的当前源位置。所有源码路径相对基点 **`C:/starsector-web-master/`**；主线并行写入后行号可能移动。

### 有限结论

1. **确认 lazy fleet 仍有完整 n² 分配。** `NumericalFleetPlanner.planNumericalFleet:26–28` 每次调用建立 2×Float64(n²) 和（demand=true 时）2×Uint8(n²)，actors 到 :63 才筛。lazy 省了部分公式计算，没省容量与数组初始化语义。
2. **不能简单缩成 actor×target。** distance 有 enemy→escort、friend→target、actor→cover 等消费；pressure 的 at 行包含敌方 candidates/ordered target，而贡献者包含 visible fighters。最小合法切片是 **单次纯数值 solve 内的 pressure 按需行**，不是删 fighter 或 actor 外的行。
3. **确认 batch contacts 重扫。** 同一 source.ships 被每个 entry 再遍历一次；根舰/模块真实共用 queryWorld，故存在可证明的重复。优先边界是 motion 入口的 ordered contact union，而非 whole-tick roster/cache。
4. **core 关掉不等于没有 typed planes；但也不是仍建立 core 的全部大表。** core/motion resident stores 由独立 opt-in 控制；fleet n² 与 fire 16n contact plane 有各自 gate。当前合格 compiled fire 路径已共享 contact plane，不能再报告必有第二个 4n pose buffer/Contact DTO。
5. **存储类型须分清。** core 是对象字段直接绑定 resident numbers；kinematics 是 resident scratch、阶段 capture/commit；scene 是 planning 索引/关系列表；wire 是投影。它们不是一个可跨阶段互相替换的 immutable world。

## 1. 真实 producer 链与 flag 路径

| 入口 / 文件函数行号 | 准备时机与实际输出 | core=false 时是否存在 |
|---|---|---|
| `src/engine/simulation/CombatEngine.ts:235–242 planFleetAI` | native/phased/decision/AI-intents gate 合格才 `planFleetTacticsNumerically`，失败走对象 planner | 与 STATE_CORE 无关；由此 gate 决定，不可推定所有 world 都执行 |
| `src/engine/ai/FleetTactics.ts:79–93 planFleetTacticsNumerically` | live、非 vastbulk 的 readiness[] → FleetUnit[] → planNumericalFleet；包括 fighters，major 筛选较晚 | 合格路径仍执行 |
| `CombatEngine.ts:815–819` | STATE_CORE 必须 `==='true'` 且 phased，才建/reconcile core；否则 dispose。无 core 且 NUMERIC_MOTION `==='true'` 才把 kinematics 交给 batch | 默认关闭二者时不建这两个 resident stores |
| `CombatEngine.ts:836–840` → `src/engine/ai/CombatAIPhase.ts:31–35` | 条件成立才建立 CombatDecisionScene；readPlane 的 stage/query gate 与 navigation 构建分开 | scene 不是 core 的附属；本轮不重复 phase producer 资格审计 |
| `CombatEngine.ts:944,958,979–1015` → `src/engine/simulation/Ship.ts:918–920` | 根舰/模块 update 共用实际 queryWorld，enqueue 而非就地模拟 | phased batch gate 成立即可 |
| `CombatEngine.ts:1028–1042` | decks 先运行；wingShips、wingWorld 给 craft，drone world 再采 roster；最后 batch.execute，afterMotion syncModuleTree | 不由 core flag 控制 |
| `src/engine/simulation/ShipStepBatch.ts:68–93 execute` | 全 state → motion/contact union → integrate → afterMotion → weapon-state → CombatFireFrame | core off 仍有 contact union 和 fire frame |
| `src/engine/ai/CombatFireFrame.ts:31–58` | observe store（若有）；合格 no-store native capture 尝试 numeric；sharedPlane 则 :41 直接返回 | no-store compiled capture 是独立路径，非“core fallback 什么都不做” |
| `src/engine/ai/NumericAcquisitionFrame.ts:122–150 create` | NUMERIC_ACQUISITION、实际 batch/owner、native contact 与 rewrite/fire-plane 等独立门禁 | 合格路径仍建 16n plane；非合格/rollback 路径不同 |

`STATE_CORE=false` 的精确答案：不会仅因 batch 存在就建立 entity 38-wide / mount 16-wide core 存储，也不会默认建立 motion 22-wide store；**会继续支付本 producer 其它 gate 已准入的 fleet、scene、fire 物化**。不能把 flags 关闭/默认、资格拒绝和“准备成本消失”混成同一个结论。

## 2. 四张 fleet 矩阵：哪些格子真正有人读

### 2.1 分配与 consumer

`src/engine/ai/NumericalFleetPlanner.ts`：

| 表 | 构造 / 索引 | 实际 consumer 与需要的域 |
|---|---|---|
| distances Float64(n²) | :26；`a.row*n+b.row` (:32–40) | canContribute :89–98、:161；目标 gap :113；ESCORT target→escort :125–126；covers 的 friend→target/ship→target :132–136；anchor actor→friend :137–138；nearFight :141 |
| distanceReady Uint8(n²) | demand=true :28；:34–40 | matrixDistance 去重，距离对称写两格；:35 self 为 0；首次计算使用 **high.row − low.row** 方向，保留 -0/运算方向 |
| pressure Float64(n²) | :26；`at.row*n+u.row` (:42–48) | **只由 influence :72–76 经 dangerAt :81–85 使用**；target danger 影响 score :120，actor danger 影响 back-off/opportunity :139–155。pressure 在 reach/power/speed 上有方向，不能三角化 |
| pressureReady Uint8(n²) | demand=true :28；:44–48 | 同一 ordered (at,u) 去重，避免后续 team 再算同一格；不是每个 team 都另建 n² 表 |

- demand=true：distance 按首次 pair 使用计算；pressure 按 influence 请求计算；danger Map 每个 team 仅按 id 首次请求计算，但 **四张底层表仍先分配**。
- demand=false（STAGE_KERNEL='false'）：没有两个 ready 表；:50–59 显式算完 n(n−1)/2 个 distance pairs 与 n² 个 pressure cells，:79–80 预建该 team 可见各行 danger。不能让 rollback 悄悄变成另外一种求解。
- 所有四表都有消费者，不是“准备后完全无人使用”；未消费的是本调用中没有被访问的格子及 mirror/diagonal 的冗余容量。`distanceRequests` 只统计外层 distance() :61，**不含 pressureAt 内 :46 的 matrixDistance 请求**；`distanceBuilds` / `influenceBuilds` 是已计算值数，不是分配字节或有效 actor 数。

### 2.2 为什么 78 actor 的矩形方案不充分

- :63 actors = major && !retreating；friends=同 team actors；enemies=:68 **所有该 team 可见敌方 units**，不是仅 major。major 敌方优先成为 candidates，没有 major 时用全部 enemies (:69–70)。orders 指定的 ENGAGE/AVOID target 也可能不是 major (:108–111)。
- dangerAt(target) 的 at 是敌方 candidate/ordered target，不属于当前 team actors；dangerAt(ship) 的 at 是 autonomous actor。pressure 的 source 是 friends 或 enemies 的原序 group；enemy fighters 的火力影响仍有真实消费者。
- ESCORT 的 escort=:125 直接查 byId，未限 major/actor；distance(target,escort) 不能改成“只存在 actor 原点行”的表。
- :132–138 cover/anchor 使用同 team friends。claims :88–107、:161–162 为顺序可变 allocation；不可并行、重排，或从相同 target 提前推断相同最终决定。
- 最坏情况下 demand 触达所有 pressure 行，甚至 pressure 全表；目前没有新的 U（实际触达行）或 K（实际 cell）实测。**176/78 只能作为既有初始结构规模，不是全窗口各 tick 的存储比例证书。**

### 2.3 最小可实施候选：仅 lazy pressure 按需行

若主线选择此块，第一版只改 `C:/starsector-web-master/src/engine/ai/NumericalFleetPlanner.ts` 的 demand=true 存储：

1. 用 solve-local row directory；首次 `pressureAt(at,u)` 才为 `at.row` 建 Float64(n) values + Uint8(n) ready。现有 `pressureAt` 公式、distance、高低 operand 方向、influence 顺序与 dangerMap 逻辑全部不动。
2. 行必须用原 FleetUnit.row 寻址，不能重排/过滤贡献者；ready 必须独立于 value，不能把 0/NaN/Infinity/undefined 当“尚未计算”。
3. 仅当前 `planNumericalFleet` 调用有效，返回即废弃；下次重新求值。纯 FleetUnit scalar solver 无 Ship/callback，无需新 reflection/native purity 门禁，也不引入 revision、whole-tick 或 mutable spec 缓存。
4. demand=false 保持完整旧路。先记录 `pressureRowsAllocated`、`pressureCellsBuilt`、`pressureBytes` 等事实，不加内部时钟；若 U≈n，净节省≈0且多了 row 数组/分配头，直接降级/撤回，不再扩大资格范围。
5. 本轮不实现。门禁由主线集中做：完整轨迹/双 RNG/AI-defence/tracker/ordered ties，NaN/-0 与 absent target 边界，flags 两路，之后才看 ABBA。不能由 source-count 或 bytes 下降宣告 ms 收益。

规模：现 demand=true 为 `18n²` bytes；上述**只改 pressure**后为 `9n² + 9nU` bytes（另加 O(n) row refs 与每行对象头，未纳入该 buffer 公式），节省 `9n(n−U)` bytes。若 U=n，payload 不减；没有证据可代入 U=78。

次选而非首块：distances 可按原 high/low 方向存 packed strict triangle，self 单独 return 0，保留 ready bits，约 `9n(n−1)/2` bytes；pressure 仍不能三角化。n=176 时 triangles=15400 pairs、138600 bytes，原 distance+ready=278784，静态容量少140184。随机寻址算术与复杂性可能反而亏；不凭这一预算添加第二实现。

## 3. ShipStepBatch：准备规模与真实 ordered union

`src/engine/simulation/ShipStepBatch.ts`：

- :25–27 若 gate 成立，constructor `new Set(owner.ships)` 保存 batch 实际 provenance；不是每 tick 全 n² 表。
- enqueue :49–57 每次 rest args 数组 + Entry 对象，ships[]/members；新 craft :52–55 必要时再次采 owner.ships。entries 不等于只有 root：modules/craft 都可能是实际 queued work。
- execute :71–75 新 contacts Set；**每 Entry 加 ship 后，再完整扫 entry.args[5].ships**，没有数组身份去重。已有 shared source 仍反复扫描；最终 Set 只消结果重复，不消扫描工作。
- :76 `this.core?.reconcile([...contacts])` 只有 core 对象存在时才求参数，故 **core off 不会为这行创建 contacts 数组**。:93 则无条件 `[...contacts]` 给 fire frame。core on 有两次 union materialization，并有 Engine :817 和此处两次 reconcile；中间已发生状态/部署写入，不能无条件删后一次。
- :100–102 roster 由 source.ships 数组身份复用，source world spread 每合法 firing Entry 一次；numeric sealScope 也以 source 身份索引，不是每个挂点重建 contacts。
- :105–109 frame/rosters 在所有 fire commit 前关闭。这是 observation 与 recoil/emission 的实际界限，不延长到 finish/下个 tick。

真实 producers：

- `CombatEngine.ts:944,958,979–1015`：根舰/模块同一 queryWorld.ships；即使每次最后 contacts 相同，B_root 次重新扫依然发生。
- `CombatEngine.ts:1028–1036`：decks 后 wingShips/wingWorld 另采；:1040 drone world 的 ships 再采；不能用 pre-AI roster 替代这些实际 source。
- `src/engine/simulation/systems/FlightDecisionRoster.ts:36–41 fireShips`：每 craft `allies.slice()` + target 按原 order 插入 + self 补齐；相同有序权限仍能有新数组身份。这是已有 root-cost scope 重复事实的 source，不在此重做 target/obstruction 算法。

### 最小 boundary：只在 motion 的 union 构造消同源重扫

未来改动点是 `C:/starsector-web-master/src/engine/simulation/ShipStepBatch.ts:71–75`（若需要 producer 私有契约，再涉及 `CombatEngine.ts`，**本轮均未改**）：

- 保持 entry 顺序和每次先 `contacts.add(entry.ship)`；原生 owner 提供的稳定 source array 首次出现时按原数组序扫，后续同一 identity 只跳过其已证明未变的成员扫描。contacts 的 first-insertion order 必须严格一致。
- 采样点仍是 **全 prepareStep 完成后的 motion 入口**。prepareStep 中 statusEffects/hullmods/系统、decks/new craft/退场可能改变世界，不能移到 enqueue/AI prelude 就预扫。
- 未认证 world getter/Proxy、可变自定义 source、会在读取时改另一 source 的 callback 保留旧循环。不能因为 batch belongs to worker 就授权省 getter/迭代；不做一套全图反射算法，只为 Engine 真正创建并私有持有的 producer contract 设计窄入口。
- source 包含未 queued 联系人及已退场但仍在早 source roster 的对象；`this.ships`、最新 `owner.ships` 都不是其等价替代。
- 只用 identity 去重能保证 root/module shared source 覆盖，但 **不能合并 craft 新 arrays**。后者需要真实 producer 显式稳定 ordered domain，且 target/ally 变更有正确边界；与主线 scope/权限执行图协调，不能本轮另写。

工作量公式：旧扫描 `Σ_entry |source_e|` 次 Set.add（另有 B 次 entry.ship），新为 `Σ_distinct stable source |source_s|`，加 O(B) directory probe，保留未知 sources 旧扫。若 B 个 entries 真的同一 n roster，则 nB→n；没有当前 B/U 实測，本轮不把旧 96.392 scopes 当这个循环的次数或 ms。

## 4. Scene / resident stores / fire：何处确实复制，何处已经共享

### 4.1 CombatDecisionScene 不是 n² 数值关系矩阵

`src/engine/ai/CombatDecisionScene.ts`：

- constructor :74 建 identities slice、members Set、**eager navigation tree**；tree :19–28 又 identities slice，并为每个非 fighter B_nav 建 {ship,order,x,y,radius,speed} Body。没有每实体完整 Ship DTO，没有每 pair distance 表。
- build :30–38 每层扫 bounds；非叶节点 slice+sort 临时 Body references。成员≤8 才叶子；树形规模 O(B_nav)，各层 bounds 与临时引用工作不能称 O(1)。
- team lists :77–79 每 distinct team 扫 ships，敌方 all/main 数组+members Set，规模 O(Tn)，不是 n² matrix（除非另证 teams 随 n 增长）。ids Map :76 保存 references。
- hostile :92–100 消 ordered/current target 与 team list，距离仍 live reduction；nav :41–57 consume copied broadphase scalars；每 select 还 O(n) every 验 identities，new orders/stack，最后 sort/map 成 Ship[]。
- scene.matches :89 也每次 O(n) every；`CombatAIPhase.ts:49,53,62` 有多处匹配。是否由更窄读面契约替代，留主线 phase producer/DecisionReadPlane 审计，本文不提新反射门禁。
- nav 实际 consumer 是 `src/engine/ai/TacticalNavigation.ts:63–74` 的 select→原顺序 candidates→精确 live obstacle 检查。索引没有删掉后面的精确读取，这是合理的 broadphase，不是完全重复求解。
- STAGE_KERNEL/QUERY_READS=false 在 scene :75 仅使 readPlane 不建，**不使 :74 的 eager tree 不建**；SCENE 是否存在还受 :83–87 和 Engine/AIPhase 门禁控制。

可选小边界：仅在已证明 planning 静止的私有 span 中让 navigation tree 延迟到首次实际 select；没有 select 的 phase 不建 Body/tree。若延迟期间 controller/custom plan 能写 pose/radius/velocity，就会改变原 capture 时刻，必须保留 eager 旧路。shared scalar plane 替代 Body capture 也须保留 shield.radius 的保守上界（不同于仅 active shield 的 fire extent）及非 fighter 策略。无新 query 覆盖数，不优先实现。

### 4.2 CombatKinematicsStore：容量复用，但重复阶段采样存在

`src/engine/simulation/CombatKinematicsStore.ts`：

- :24–39、:161–165 是 world resident WeakMap store。22-wide Float64 buffer 仅 :75–77 几何扩容时 new + set(old)，不是每步 new 22n。
- capture :55–90 对成员/slots reconcile，并 **写6n pose scalars**。beginMotion :97–101 capture 一次、清 commit state；queue :103–135 填 stats/controls，solve :137–140 计算。
- commit :142–152 把6个 pose scalar 写回对象，并每合法 commit 返回 flags 对象。observe :92–95 在 fire frame 建立时 **再 capture contacts 的6c**，新一个 observation lease。
- 若启用且实际走 numeric motion，n_motion 个实体存在 object→resident→object→post-motion resident 的链；若 motion boundary 拒绝，本 batch 仍可能用已传入 kinematics 做 fire observe，不能按 motionSolved 数推断 fire capture 数。
- 不能直接复用 solve output：`Ship.integrateStep:1045` syncModulePose、afterMotion root sync、weapon-state 位于两者之间；未知 integrate/hooks 也可能改 later entity。适用的新单一面必须由真实 post-motion/weapon-state producer 写入并在 fire query 关闭，或 motion 成为真正数值 ownership，而不是再复制一个 pose cache。

### 4.3 CombatStateCore：真同一数字存储，不是每步 pose DTO

`src/engine/simulation/CombatStateCore.ts` / `OwnedCombatNumbers.ts`：

- core :35–36 entity WIDTH=38、mount WIDTH=16，allocate/attach 是 incoming admission 时，resident capacities 用 `OwnedCombatNumbers:52–59` 几何扩容。
- `OwnedCombatNumbers:27–35,71–84` 在原对象数字字段装 accessor，直接读写同一个 typed buffer；`core.move:118–142` 算同一 row，**不存在 pose capture/commit 全表复制**。不能把它描述成“另一个 Ship snapshot”。
- reconcile :68–116 每调用新 members Set、incoming filter、weapon/vector/flux 三个 alias Sets，并遍历 ships/weapons、检查完整 bindings；不是零准备成本。Engine :817 和 batch :76 都会调用（conditional）。其中回调和 roster 变化的真实 revision 未证明，不能只以“本 tick 上次成功”跳过。
- observe :152–162 零 pose scalar copy，但 new members Set、ships.map(slot) 数组、slots Set、span closures；revision/close 与 first6字段读取权限真实有效。未知 writes 不许跨 span；也不能用 lease 授权 live spec/inputs freeze。
- pose :145–150 每次仍返回 **新8-number JS array**；`CoreCollisionIndex.refresh:40–41` 只取 x/y，`src/network/CaptureMotion.ts:12–14` 又组 MotionRow。core-only 下可设计 caller-owned sink 或消费受控 slot scalar，省中间8数组，但这不是默认 core-off 的高ms根因。collision 需 live refresh，不可借 post-motion snapshot 替代。
- read(handle) :49–52 有 `[...entities.values()].some`，潜在 O(n) 和临时数组；本轮查到的实际 hot consumer 走 pose/observe，未找到该 handle-read 的直接消费者。**不以“存在一个坏 helper”推断实际 ms 大头。**

### 4.4 Fire frame 当前已做消重；fallback / store path 分开

`src/engine/ai/CombatFireFrame.ts:31–58,66–82`：

- no-store 且 nativeCapture 合格、numeric.sharesContactPlane=true：不建4n Float64，不 eager建 Contact[]，:41 直接 return。numeric 16n 是这条路径唯一 captured contact scalar plane。**不要再实现一遍“避免 double contact capture”。**
- sharedPlane generic fallback 的 targets 首次调用 :70–74 才从 captured numeric rows 建 n个Contact +2n个 pos/vel对象和对象 acquisition index，不能以 live pose 重读替代。
- store observation 路径：observation 避免4n buffer，但 :42–53 仍 eager建上述3n对象；:54 还尝试 numeric。若 numeric 合格则又写16n数字，故有 **store + DTO + numeric** 的物化可能性，不是所有 core/motion 输入都必然有 numeric。
- 没有 rewrite 或 stage rollback 时 :57–58 eager建对象 index；queryBlockers :79 按需建 blocker index；默认编译路径不应把二者一律计入。

`src/engine/ai/NumericAcquisitionFrame.ts:96–119,153–161`：

- 每 frame `Float64Array(16c)`，hulls.map、rows Map；每 row `.set([16 scalars])` 另一个临时16-element JS tuple，getShieldCenter 及实际 pose/shield 采样。微型 scalar stores 替代 tuple 只省中间物化，不消 16c 主 plane；没有它占大头的证据。
- per-team eligibility `Uint8(c)` 和对应 trees，是 O(Tc)；scope 才是 per-distinct-source arrays：Uint32(source.length)、Uint8(c)、Int32(c).fill(-1)。**这里不是每个实体都建 n² relation matrix。**
- scope buffer 总量 `4Σ|source_s| + 5cS` bytes，S 是当前 frame 真正创建的 scope 数；以 row order 和 membership 授权，不能用无序 Set 合并。
- root-cost 旧 LAN 窗口：120/120 compiledFrames、scopeFallbacks=0；96.392 scopes/步、5.458 distinct ordered masks/步、94.337% 同 frame 重复。本轮没有新采样，不能直接套给 nearest 修改后的当前窗口，更不能套给 local 完整 producer。

## 5. packet 与递归投影：不能当同一 step 里的第四个 authority

### 5.1 owned AI packet 是 optional producer，buffer 已 resident

`src/engine/ai/multicore/Protocol.ts`：NumericStore :51–59 一次建 SAB Float64+tags；packet :94–97 只包装已有 buffer/dictionary/count，**不是每次 new/clone 完整数值 buffer**。Publisher 构造 :268–269 分配 own/world capacities；encode :271–298 每 publish 重写 scalar observations/weapon data/projectile values；:302–308 则新 beams/asteroids DTO、jobs/targets/currentTargets/tactical 数组与 fleetPlan entries。

真实调用：`src/engine/ai/multicore/OwnershipPool.ts:110–123 prepare` 在 previewNativeAI 中 publisher.publish；commit 验证 :155 调 matches。`Protocol.ts:381–387` 验证重做小 metadata DTO，值验证不是另一次完整 geometry 编码。`src/network/host.worker.ts:479–485` 只有 THREAT_PHASE='false'、非 phased、multicore/budget gate 才 prepare old whole-AI proposals。因此不能把这些 packet 成本强加给当前 phased read-plane 窗口，也不能把异步 validated forecast packet 当 live scalar authority。

### 5.2 display capture 确有递归投影，但在不同计时域

- `src/network/AuthorityCombatSnapshot.ts:831–856` capitals Set、engine.ships refs Map、各 root project，再 project world；:863 后遍历 refs 补非 root ship records。packFresh :279 对嵌套 Ship 写 `$ship` reference，Vector2 :280 写 vector tuple；不能凭 parent/child引用声称每条边都递归复制整舰一次。
- 数字普通数组 :328–341 新 rows；object fields :409–429 在当前 capture-owned arrays 内复用/递归；仍不是用于战斗 consumer 的 live read-plane。native projection、plain/generic/refs 等模式不同，不能把 generic pack 预算当 production fixed display 实测。
- `src/network/CaptureMotion.ts:8–16` 另建 active roots/MotionRow[]，core 模式又有中间 pose[]；这是受 motion publication gate 约束的显示路径。
- `src/engine/runtime/local/local-combat.worker.ts:80–84` simulationMs **在 encoder.capture 之前结束**；`src/network/host.worker.ts:510–513` lastStepMs 结束，snapshot 的 :278–293 另计 captureMs，且 :284–286 已有同 tick successful publication reuse。
- 结论：wire/display 重复位置数字值得单独端到端发布审计，但不能用它解释已测纯 fixedUpdate 高ms，不能把发布 reused projection 回喂下一 tick authority。本文不扩大到消息链/UI、也不审计新 phase producer 差异。

## 6. 工作规模预算（非性能测量）

定义：n=fleet units；c=batch contact union；m=实际 mount数；B=queued entries；S=created source scopes；T=teams；U=pressureAt 首次触达 at 行；capacity 不是 entityCount。

| 项 | 确认的准备规模 | 示例/限制 |
|---|---|---|
| demand fleet 四表 | `18n²` buffer bytes/solve | 既有初始 n=176：557568 bytes，若60 solves/s则33.45408 MB/s容量预算；不是实测分配吞吐/GC/ms |
| demand=false fleet | `16n²` bytes，distance n(n−1)/2 与 pressure n²公式 | 176：495616 bytes；不能把少2n² ready bytes误作净提速 |
| pressure row候选 | `9n²+9nU` bytes + row refs/headers | U未测；不代入78，不承诺收益 |
| motion resident | `8*22*capacity` bytes；capture 6n_motion +6c scalar writes（启用且相应阶段运行） | 176 slots要按增长到256容量预算=45056 bytes；buffer不是每步重建 |
| core resident | `8*(38*entityCapacity+16*mountCapacity)` bytes | 实体176→256例为77824 bytes，mount容量未知；steady admission不重写全pose |
| numeric fire | `128c` bytes + tuples/maps/trees；eligibility `Tc` bytes | c=176示例22528 bytes，不含index/hulls/map头 |
| standalone legacy fire | `32c` bytes（无observation/sharedPlane）+3c个Contact/pose对象 | c=176示例5632 bytes；合格sharedPlane不支付这一份 |
| source scopes | `4Σ|source_s|+5cS` bytes，并 clear members / fill orders | 是 frame内各scope域，不是全 pair 矩阵；不由scope CPU反推全部fire-query时间 |
| contacts union | `Σ_entry |source_e| + B` 插入尝试、O(c) Set与frame array | core off仅frame那次union array；native stable同源去重可降扫描，不改变联系人域 |
| scene nav / team lists | O(B_nav) captured Body/Node，分层sort临时refs；O(Tn)列表；每select O(n)身份验证+候选数组 | 不是完整typed world，也不是明确n² matrix |

这些预算未含 JS object headers、array backing stores、JIT消除、allocator lazy zero/page行为、mesh caches 或 GC。不能将 logical bytes/reads 数直接换成 ms。既有 root-cost GC约1.161ms是旧 profiler窗口的采样归因，不表示全部可消除，更不能与最新 ABBA相加。

## 7. 主线下一步建议与禁止跨越的边界

**若只选一个可验证 storage 切片：** `NumericalFleetPlanner.planNumericalFleet` 的 **demand-only pressure row materialization** 最窄，无生产资格扩张、无 callback purity 反射问题；先由事实计数确认 U/n。U≈n就不值得继续；本轮不自行实现或计时。

**若选 producer 结构切片：** `ShipStepBatch.execute` 的 motion-entry stable source ordered union。原生 roots/modules 的 shared source 确认存在，可避重复扫描；必须保持 first-insertion order 与状态后采样，未知来源回退。不要顺便合并权限、删联系人、延迟读 callback，或把准备搬到整个 tick 最前端。

优先于重新启用 state core/motion 的原因：后两者已是默认 opt-out、不同生命周期，getter binding/descriptor和对象回写成本未因此自动消失。core enabled 专属 `pose()` 中间数组、store路径 DTO double capture 可作为明确条件下的小后续，不称默认当前高ms根因。

后续事实验收只需合并到主代理既有流程，不新增工程：
- planner calls/units/pressure row与cell覆盖/buffer bytes；保持现 distanceRequests/builds定义清楚；
- batch entries、source identity种数/扫描rows、contact union size/order；core reconcile次数及 admissions；
- fire frames 区分 no-store compiled/shared、store observed、fallback DTO/index；不得混成一个“Worker enabled”计数；
- baseline/source producer/local-vs-LAN flags明确记录；先 strict/RNG/AI-defence/tracker，再计时，计数不加计时时钟。

任何阶段单一读面都必须由真实写 producer 授权，并在本 span close：AI effects、prepareStep/hullmod callbacks、motion/module同步、weapon advance、fire commit recoil/emission、碰撞/terrain、deferred world writes 之间不能凭同 tick 复用；spec/input 也不能因数值表存在就冻结。单一读面的目标是消除 **同一个合法只读时点的重复 projection**，不是消除各时点为实际变更而必须重新采样的工作。

## 8. 修改与验证状态

- 本轮独占修改文件：**`C:/starsector-web-master/docs/combat-read-plane-materialization-audit-2026-10-03.md`**。
- 生产修改：**无**；新 helper：**无**；脚本/测试工程：**无**。
- 执行过的验证：仅源码轻量读取、原版目录存在性检查和本文件写入后检查；**未执行 tsc/lint/构建/测试/bench/计时**。
- 已核实的是 Web 当前结构/消费者/条件调用；原版源码、原版实机、当前 local 完整producer的实际计数、候选净ms收益均 **待核实**。