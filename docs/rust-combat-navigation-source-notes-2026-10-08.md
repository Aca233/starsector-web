# Rust 战斗内核：导航数值域策划与来源

2026-10-09 fleet/profile修后actual182首严格油门窄方案：same source 270仍原ABBAeveryword，真正FleetNavigation.ts fleetApproachVelocity的 `radial.heading()`→signedAngle(assignmentbearing-heading)。ship_j182 samepose/range/bearing-2.3728323386647956、prelane desired，真实dy=-2661.021457987107/dx=-2795.3224394573604；sourceHeading=-2.3808032524703058/native std=-2.3808032524703053。Browser/stdWasmprobe实证既有canonical返回sourceheadingexact，单heading修后stdsigned仍.007970913805510182、sourceerror.007970913805510184；same sin.007970829399823286/cos.9999682324347503，signed内atan2还std末位不同。仅两个atan2（径向heading及该errorwrap输出）调用existingcanonical即可sourceerrorexact，sin/cos无需全局替换。artifact `diagnostic-mixed-fleet-profile-aim-canonical/mixed270/actual-lane-math-analysis.json`；既有226error差但lane已cap，不能假定修此会关所有后续velocity。

范围为approach_velocity这条真实laneerror表达式：先heading=canonical(ry,rx)，delta=bearing-heading，再canonical(delta.sin(),delta.cos())；原候选/资格/门槛、source signed语义、lane时序/速度/limit/RNG保持。不全局改signed_angle，UI/操作/联机/存档/回滚按原下文，无新产品取舍；原版实机待许可。先本文→onlyclone twoatan候选同原局270集中真实strict/geometry+RNG/FireDecision/FX验收→给ROOT navigationowner两个窄入口，source仍ABBAexact；226/257更早velocity和159防御继续独立取证，非full可玩声明。

2026-10-09 yield修后真实70的后续strict控制首因已证明：`diagnostic-mixed-analog-after-yield/math70/actual-trig-analysis.json` 在真实Chromium151对未改Math与原样std Rust数学probe读取实际输入，并用双方sin/cos结果按source相同乘法完整重构avoidance output。41 ship_2u candidate9、heading/speed/ownstate均逐位同，h=1.4430234138241969，source cos=.12742552832580928/native=.1274255283258093，输出X5.061625152941865/5.061625152941866，进strictstrafe；42 ship_1g candidate8同，h=-.8342013881083205，source sin=-.7407602649132917/native=-.7407602649132916，输出Y-36.281668808094935/-36.28166880809493，进strictthrottle；55 ship_1x h=.8195859649177148同，source sin=.7308633035529161/native=.730863303552916，outputY62.12338080199787/62.123380801997854。全部candidate与h/speed和重构数值均保持source/native实际值，无epsilon或规则调整。

真实46 enemy_ship的desired、ownfacing1.7147859900844287、velocity/accel逐位同，SteeringKernel source cos=-.14349262199117915/native=-.14349262199117918→localX→strictthrottle。67player同条件，ownfacing=-1.2841259971548282，source sin=-.9591906885231273/native=-.9591906885231274→localX→strictthrottle。这证明除atan2外，navigation `avoid_collisions` candidate实际sin/cos及`steering` ownbasis亦必须使用对应真实浏览器数学；原版BasicEngineAI和Web策略证据仍如下文，UI、操作、联机/存档/失败事务无新变化。defense另在真实12beam发现相同sin数学差，canonical helper实现归其owner，本agent没有覆盖该文件。最小实施是helper经过真实Browser范围验证后由nav owner将已证明两个函数的对应trig调用接入，保候选顺序/风险门槛/输入与严格control；下一同局70/270集中核验，包括真实防御和发射首差，最终sameformal新Cargo/全部Ready归ROOT，不能以单数学probe或70称可玩完成。

2026-10-09 后续严格侧推23补证：上面的heading窄修已由root挂入生产，真实前10所有body pose和controls逐位source一致。新的23 ship_1侧推首差源-0.9725829888928292/native-0.9725829888928298，only-clone真实前30源仍原ABBAexact；源navapproach/positioning和cached21原desired=[-25.442036163419825,81.10303814197862]均exact，实际21让出友舰射界时 `TacticalNavigation.yieldFireLane` 以 `unit=line.scale(1/length)`（原Vector2.scale明确乘法），native yield_fire_lane_inner以dx/n、dy/n分别除法。same allyship_2f、真实L14、targetship_2，origin[-2495.1641359911687,-1507.6199502512231]、delta[17.51493192734415,2670.2991620144276]、length2670.356603057984、ownstate/desired/资格同，sourceunitY0.9999784893734825/native0.9999784893734827→outputX17.057049634953184/native17.05704963495319，缓存至23strictstrafe。raw及完整中间值保 `diagnostic-mixed-analog-yield/math30/yield-analysis.json`；source line被scale原位更新，trace的line字段表示更新后的unit，native保原delta，这不是输入差。

窄修范围仅该真实让路unit先k=1.0/n，再ux=dx*k、uy=dy*k；照原source算序，不能将其它normalize（实际使用/=len）也替换。保沿射线/横偏/碰撞半径/firstlane/winner、limit和全部拒绝/回滚/联机/存档。先本文→nav owner接入或diagnostic candidate→实际30严格复核23，之后完整270及最终formal仍待其它defense/math首因闭环。没有新的玩家取舍/界面或桌面操作。

2026-10-09 实际混编严格控制量补证与窄修方案：最终完整游戏验收按现有根代理合同要求 throttle/strafe 逐位一致，覆盖下文早期隔离 fixture 对连续控制采用几何阈值的阶段性范围。原版 `BasicEngineAI.java:21–79` 的 desiredHeading/desiredFacing 分离已重新查看；本次不还原或改写 Web 八步避碰策略，只修浏览器与 Wasm 数学实现不同造成的实际控制差。UI、玩家操作、目标资格、失败回滚、联机和存档沿原方案，没有新的产品取舍，也没有桌面操作授权。

真实原 ABBA 22舰 seed917 装备/网格/78地形/60Hz/autopilot 全不变，`diagnostic-mixed-analog-heading/trace/result.json` 的 source/native 每帧22word均逐位保持原ABBA前10tick，sourceMath/RNG 未patch。只读现场捕获 `TacticalNavigation.avoidCollisions` → `Vector2.heading:127` → 浏览器 `Math.atan2`：3/6 ship_j 原desired=[24.96361928752788,12.681392355233157]、length/speed28、实际candidate4（6tick）和risk同，heading源0.4700230880479589/native std0.47002308804795895，detour outputY源-1.4994017087742502/native-1.4994017087742486。实际 `SteeringKernel` ownfacing/velocity/accel/decel/strafe/sin/cos全同，几何差传播成首6严格throttle差。9 player同原desired=[64.70818281673338,55.11670415179238]、speed84.99999999999999、candidate10，heading源0.7055226713654349/native0.7055226713654348→outputX→首strafe差。完整原值和每字段差保 `avoidance-analysis.json`；已有canonical_math::atan2在两现场输入均返回真实浏览器值逐位。

实施最小范围：在 `navigation_ai::avoid_collisions` 的真实期望heading计算调用已经40226真实browser输入逐位核实的canonical_math::atan2。保所有候选生成运算、次序、风险与既有1e-8比较、实际winner、RNG及控制发布；不扩大到未证明的sin/cos/hypot或其它AI调用，不在DTO修正数值，不松analog容差。先补本文，再由nav owner接入，当前Wasm clone10tick针对首差复核；待其它真实mixed防御修复整合后同局270集中完整严格验收，formal fresh Cargo新SHA及整体可玩门槛仍根代理负责。

日期：2026-10-08。本块受完整 Rust/Wasm 战斗迁移授权，保持已授权 Web 策略；不更换玩家操作或自动驾驶规则。总方案见 `rust-combat-core-plan-2026-10-08.md`，阶段与所有权审计见 `rust-combat-core-ai-audit-2026-10-08.md`。

## 目标、体验与范围

敌舰和友舰继续按现有接敌距离、撤离、整队、避碰和让出射界规则移动；航向与平移独立，转向继续预测角速度的停止角。现有手动/自动驾驶、舰队命令、暂停和撤离界面维持当前布局和流程。

本块提供 Rust 常驻世界可直接读取的借用数值视图，以及无 JS 回调的导航求解器：到点、保持目标距离、接敌航道、整队、有限加减速避碰、系统前方走廊、友舰射界避让和转向/油门/侧推。模块不拥有权威世界，也不接受生产每步 JS DTO 还原；主内核从常驻状态建立观察，按原 AI 阶段提交结果。舰队目标分配、威胁预测、武器剖面、局部战术位置评分、防御/系统效果和 CapitalShipAI 记忆暂由对应后续块接入，不能以本块宣称完整自动驾驶或正常游玩。

## 原版证据 → 预期行为 → 当前差异 → 验证

原版版本为本机 0.98a-RC8。

| 来源 | 能核实的原版行为 | 当前 Web 与本次要求 | 验证方法 |
| --- | --- | --- | --- |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/movement/BasicEngineAI.java:23–31,68–79` | 分别持有 desiredFacing、desiredHeading、desiredSpeedFraction；可同时执行移动与朝向控制。 | `SteeringKernel.ts` 与 `AINavigationSolver.ts` 用独立期望速度和朝向，保留其实际数值与判定。 | 原 TS 求解器对照，移动与朝向独立场景。 |
| 同文件 `:167–197` | 根据角速度、转向减速度预测停止角；一度误差内不再下转向命令，过冲时反向制动。 | Web `PlayerControls.cursorTurnCommand` 使用弧度及 signedAngle，保留一度门槛和退化减速度处理。反编译混淆命令名不作为新规则来源。 | 角速度过冲、零减速度、角误差临界和多圈朝向对照。 |
| `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:96–125` | 引擎、攻击、威胁、防御、排散和系统模块组合，并持有碰撞检查 interval。 | 本块只是当前 Web 导航数值域，Web 八步有限加速风险评分和候选顺序为明确改编，不能称其为原版完整 AI。 | 当前 TS 实际候选排序与碰撞资格对照。 |

没有本次相关的原版截图、可见窗口或输入控制授权，本次不操作原版实机；默认/选中/禁用/确认取消状态的原版界面等价仍待核实。本块不改 UI，原版证据只确认已查看的源码行为。

## 规则与完整流程

主内核在 AI_PLAN 阶段提供语义 roster 顺序的船体、武器及障碍物，包含真实姿态、有效运动属性、护盾和完整代次身份。到点使用 `sqrt(2*deceleration*(distance-tolerance))` 限速并叠加目标速度；接敌按剩余制动距离逐渐跟随目标速度。撤离取朝目标的反向最大速度。航道修正保留 role 和 approachBearing 的实际条件与顺序，整队保持双方半径加 180 的间距。

避碰保留同装配族/死亡/相位/舰载机过滤、盟友 void 护盾过滤、舰船再障碍物顺序、八次有限加速度预测、候选 `[半速,停止,+30,-30,+60,-60,+90,-90,+135,-135,180]` 与原风险/偏差门槛。相位船直接保留速度。前方走廊只读当前状态，不推进 controller 时钟。射界避让以 roster/mount 顺序找到第一条真实 FRIENDLY_BLOCKED 舰船射线，再给出横向速度；无有效目标或已无阻挡时维持原速度。

现有 opt-in 数值路径 `AINavigationSolver.solveAIYield` 跳过自己而不是整个 assembly；隔离数值 fixture 保留该源合同。2026-10-09 实际默认热战核实默认 numericDecisionCore=false，`TacticalNavigation.ts:187–213` 对象 `yieldFireLane` 明确排除同assembly。Ark 第14帧双方 profile/facing/target 完全一致，但 native 根舰因自己肩模块的 FRIENDLY_BLOCKED 让开自己的炮，desiredvelocity 从源 (.0004240860421001742,-23.535416662845844) 偏成 (10.953857333666067,-19.234107616956603)。本修新增相同数值算法的装配资格入口供真实默认controller使用；保留原batch数值入口，不切换env，不增加资源/RNG/时钟，不改界面/操作、并发/存档或几何容差。源炮序、target资格和每个计算/限速/tie完全保留，坏观察仍原错误由整步回滚。实施为本文补源方案 → navigation新assembly wrapper → ai_owner默认调用 → 真实Ark14后continuation。验收target/profile/turn/yielding/fire/RNG严格、geometry既定容差；完整整场仍root负责，无新产品取舍。障碍物列表由 Rust 常驻实体按现有生产资格提供：存活小行星和 gravityManaged/gravityFixed 碎片，不填默认障碍或截断候选。

玩家取消自动驾驶、切换命令、死亡/撤离和目标失效由 controller 域处理；本模块不保留命令或控制记忆，不把一次建议缓存为后续真实命令。失效 owner/target/blocked lane 代次或无效观察在公开边界返回错误，整步回滚由主内核提供，不发布部分结果。

## 权威、并发、存档与阶段

求解器读取同一 Rust authority 的借用观察，只有可复用 scratch 障碍物数组，没有额外 RNG、时钟或写入。控制结果在所有 AI plan 完成后按原 roster 统一提交，系统与防御效果随后按原顺序执行；系统走廊重查应读取实时效果后的视图。联机 authority、回执、保存和恢复不新增 JS 状态源；导航 scratch 可重建，无须写入存档。

先交付 `native/combat-core/src/navigation_ai.rs` 与隔离对照，再由主代理接入 shared lib/state/协议与 controller。子块不修改其它代理的模块或生产入口。

## 验收与未完成项

集中一次 Node 和无头 Chromium dedicated Worker 的真实 Wasm 对照，调用现有 `AINavigationSolver` 与 `SteeringKernel`，覆盖到点/跟随/撤离/接敌/整队、各种舰船和障碍资格、碰撞候选选择、射界顺序、锁转/过冲，以及失效代次拒绝。严格比较离散 controls、avoid/yield/forward 判定和候选身份；只对坐标、角度、连续线性控制和几何评分使用总方案批准的几何误差阈值，并单独记录。全部世界/协议整合、完整 AI/controller 与生产可玩仍由总策划验收，不以隔离检查替代。

本块无新玩家取舍。待核实：完整 Web AI 的全步数值验收、七包装配族与生成实体接线、原版实机/界面等价、生产暂停/退出/恢复和整场性能。

## 本块交付与实际验收

策划与来源先于功能代码写入。完成 `native/combat-core/src/navigation_ai.rs`、隔离验证 ABI `scripts/lib/rust-core-navigation-harness.rs`、调用现有 TS 求解器的 `scripts/lib/rust-core-navigation-check.ts` 以及 `scripts/check-rust-navigation-module.mjs`。本块不修改 shared `lib.rs/state.rs/ship_state.rs`、协议、内容登记和生产入口。

运行 `node scripts/check-rust-navigation-module.mjs`：Node 和新建无头 Chromium dedicated Worker 均通过 18 场景 ×240 步（各 4,320 步）、43,200 次严格比较、56,160 次预登记几何比较。Node 几何差异 643 项，最大 `1.4210854715202004e-14`；Worker 差异 828 项，最大 `7.815970093361102e-14`。逐字段 actual/expected/error 日志、coverage、源码与 Wasm SHA256 保存在 `artifacts/rust-combat-core-20261008/verification-navigation/result.json`，没有只保留最大值。

实际覆盖 3,334 次避碰、2,350 次射界避让、3,360 次前方阻挡、720 次制动；左右转向及原输入/九个 detour 候选有实际选择。半速和停止候选实现保留原顺序，本组场景没有选中二者，不冒充全部候选的选择覆盖。10 种无效输入拒绝包括零身份、重复 handle、非法属性、失效目标 generation、未知 owner、失效 assembly root、重叠武器拓扑、非法 row 和非有限 destination。

预登记几何字段是位置/速度和纯几何风险评分，另外连续油门/侧推值来自旋转后的点积除以有效加速度。两者直接受到 Wasm/JS `sin/cos` 的微小舍入影响，曾定向核实到 `0.3878336905402795` 对 `0.3878336905402794`，因此记录在同样的几何阈值内；turn/brake、avoid/yield/forward、候选身份、射线身份以及油门/侧推 `NaN/0/-1/1/continuous` 门控类别均严格比较，非有限输出严格匹配。此项不能据以放宽真实资源/计时/目标/阈值判定。若生产合同要求连续控制逐位一致，则仍需相同三角函数实现，不能悄悄扩大容差。

仅改动文件的严格 ESLint 已通过。尝试对新 TS 对照入口做严格 tsc 时，依赖图包含既有 `ImportMeta.env` 声明缺失、StageProducer/CapitalShipAI/CombatPolicy 等严格空值和 CombatEngine FX 签名错误；新入口无报告，但整项类型检查没有通过，未修改无关依赖。

Rust 对外接口为 `World::new`（只读借用、完整身份/拓扑校验）、`position_velocity`、`approach_velocity`、`regroup_velocity`、`avoid_collisions`、`forward_path_clear`、`yield_fire_lane`、`steering` 和 `cursor_turn_command`。`Scratch` 仅复用障碍候选 buffer，整步 rollback 无需保存其内容。root 接入时须从 resident roster 提供真实 assembly 代次、有效 motion stats、原 shield type、raw active、队伍和 mount diagnostics；不能调用验证 ABI 每帧重传 TS 世界。

状态：本块数值导航已交付，生产尚未接入，完整 AI/controller/fleet/profile/threat/positioning、整场可玩与性能均未完成；`fullBattleReady` 没有启用。本次没有可见窗口或原版实机/UI 验证。
