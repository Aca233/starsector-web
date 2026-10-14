# Rust 常驻舰队、目标、火力朝向与站位策划

## 2026-10-09 后续170航道heading、191/194/199/223/229实际profileaim窄方案

profile中心和炮塔target修后真正270原ABBAsource逐word仍同、资源/目标/FireDecision/RNG全同；control首170。currentproduction078e67c4真180只读实际源FleetTactics和准入核对FleetColumnSolver均出相同真实3members `[ship_1x,ship_2d,ship_j]`，xsum=-1978.189834792182/ysum=-7661.002529783374逐位native同；源Math.atan2=-1.8234921828738972/native std=-1.8234921828738975，使actualassignment lane ship_j -2.373492182873897/-2.3734921828738975、ship_2d -1.2734921828738972/-1.2734921828738974。same profile/range/prelane desired，lane error/speed传播strictcontrols。真实后191ship_1h L14 winningprofilearc、194ship_1y L13、199playerWS008、223ship_10 L13、229ship_1x WS009亦已actualtrace同point/muzzle与source中心heading，唯一winningaimstdatan2不同，例如191aim源2.1047146164626427/native2.104714616462643→best/range→strictthrottle。完整数据在 `diagnostic-mixed-profile-turret-integrated/mixed270/result.json` 和 `diagnostic-mixed-fleet-first170/math180/result.json`。

本次仍仅已授权数值迁移修错，无规则/UI/操作/联机/存档新取舍，原版来源与Web启发式边界以下文；原版实机待许可。最窄候选为tactical_ai::fleet实际groupheading一个atan2和profile_at_barrier实际aimHeading一个atan2挂existingcanonical，保orderedmembers/sum/候选/tie/所有trig和signed/RNG/真实门槛；不会全文件替换数学或放controls容差。先本文→onlydiagnosticclone两个候选整合原局270→核source仍ABBAexact及actualcontrols/目标/FireDecision/RNG/资源/FX全字段→给ROOT owner两个production窄挂点，剩余216等独立error入口按next真实首因继续。159防御另交defense，其性能同块不改此规则。现仅根因/候选方案，未称通过或formal可玩。

## 2026-10-09 mixed72严格油门首因与最窄数学方案

真实原ABBA seed917/22舰/78地形/60Hz/autopilot场景、sourceMath/RNG/admission均原样。current-production clone0dce56da的实际前80仍source每22word逐位原ABBA同，首strict控制72ship_1g。`diagnostic-mixed-profile-first72/math80/result.json`只读采源真正对象ShipCombatProfile而非改变env启用batch。same own/target pose、挂点截获点和muzzle逐位同，中心heading的真实输入dy=-893.3709023901517/dx=-282.0111625580397；sourceMath.atan2=-1.8765673382714678/native std=-1.876567338271468。WS009 aimHeading两边同-1.9000635869263285，故base/best source.023496248654860663/native.02349624865486044；cos同、sin是不同input后果。加权中位射程源1071.4673802956356/native1071.4673802956358，fleetEngagement clearance456/pressure.84/reserve0/residual1全同，真实range源972.9925994483339/native972.9925994483341→desiredY→strictthrottle。WS007 aimHeading自身也有stdMath末位差但其base本帧恰抵消，不把相消当全域证明。

此为迁移数学修错，无新玩法/UI/操作/联机/存档/权威/失败流程；原版证据和Web启发式边界仍以下文，不虚称原版DPS策略，实机仍待许可。最小候选先仅profile_at_barrier中心heading挂existing canonical_math::atan2（算法已真实Browser全域验证），保截获/候选次序/原tie/阈值/中位数/角色/RNG/clock；若后续真实aimHeading入口证实再准确扩挂。不改signed或全文件trig，不改source/DTO。实施本文→只diagnosticclone前80集中复核72及实际所有controls→ROOT owner窄生产挂接→当前true270找下一实际首因，最终新formalCargo/七包Ready/网络/页面可玩由ROOT继续。现在仅候选方案，未称72通过或全战斗可玩，无待用户产品取舍。

## 2026-10-09 默认源路径装配汇总修正方案

真实生产热步核对发现：默认 `VITE_COMBAT_NUMERIC_DECISION_CORE` 未开启，`CapitalShipAI.refreshTacticalProfile` 调用对象路径 `ShipCombatProfile.combatParts`；此前独立数值域依据 batch 路径，缺少装配贡献。Gloriana 首帧源选 22 门有效炮、8734.709627628785 DPS、bearing -2.8345900353703968；Rust 仅根舰 3 门、2363.3802816901407 DPS、bearing .06883797099209743，导致转向规则反向。这是迁移修错，不能以环境开关改变对照基准或扩大几何容差。

目标是保留默认玩家体验、模块独立开火及根舰驾驶。范围为 resident `Body.parent` 真实拓扑、profile/fleet/position 读取真实存活装配；不新增系统、UI、规则、RNG 或时钟。`ShipCombatProfile.ts:13–15,30–94` 的根舰 DFS 装配、attached 只自身、存活筛选、炮口截获、模块局部炮弧和位置转到根坐标是直接依据；`FleetTactics.ts:56–84,88–95,124–125` 的舰队仅非attached成员、逐owner射程和舰载机汇总，`TacticalPositioning.ts:42–65,96–108` 的整装配炮8门样本、邻居排除双方assembly及foe/lane非attached，是相同阶段的完整规则。

先查看原版 0.98a-RC8 `ShipAPI.java:449,472,524,542` 的parent/module/offset API，以及 `BasicShipAI.java:559–563` 的真实引擎名册目标资格；这些只证明原版装配与目标的存在，不能证明 Web 的 DPS 权重启发式。原版实机/截图仍待许可，本次无界面变动。

流程保持原 AI_PLAN → 全舰队建议 → controller profile/position → controls → effects。先验证完整parent身份、无环拓扑；根递归装配后筛选dead/retreated/docked/HP，attached只自身。保留 source 构造和炮序、tie、截获算术顺序、舰载机最小range，失效输入返回原错误由root整步回滚；不接受每步JS世界上传。不改并发/权威/存档布局，新增观察parent从既有resident world读取，scratch仍可重建。实施顺序为本文 → native三种汇总及两处typed fixture默认parent → 真production Ark/Gloriana首差 → 首次damage与root整场验收。验收要求目标、炮数/DPS、turn/fire/role/task、资源、RNG、计时严格一致，纯几何沿用既定容差；记录实际覆盖和未完成部分。无待用户产品选择；默认/opt-in路径差异及原版UI等价仍明确待核。

2026-10-08。延续全部迁移至可玩授权，补齐已经交付的导航和防御求解器周围的战术规则。本块目标是使 AI 按当前舰队建议选择敌舰、保持主炮射界、在遮挡／危险时选站位，且手动舰船、明确战术命令、舰载机与视野仍按当前习惯处理。无 UI／快捷键／玩法变更。

## 原版证据及当前差异

原版 0.98a-RC8。读取本机 `../starsector-core/data/config/settings.json`、`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatTaskManagerAPI.java:10–58`：舰船任务可为空（默认 search-and-destroy），显式任务和撤退由 task manager 管理；`CombatAssignmentType.java` 区分护航、守点、接敌、避敌等。`starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java:151–208,313–328,408–420,559–620` 区分 order response、attack、threat、防御以及目标失效处理。CFR变量恢复不足，不能按反编译名称猜测完整评分。

直接数值迁移合同是当前 `batch/AITargetSolver.ts`、`AIProfileSolver.ts`、`AIFleetSolver.ts`、`FleetColumnSolver.ts`、`AIPositionSolver.ts` 和 `TacticalPositioningKernel.ts`。它们的 fleetPolicy／战术站位是明确 Web启发式，不冒充原版 doctrine。当前 bundled `learning/combat-policy.json` disabled；训练 action 和有效 policy 的状态分箱／选择仍应保留类型与算法，不能默认启用训练。`AIThreatSolver.ts` 已由 `defense_ai.rs` 独立迁移，不在本块复制第二套。

无新增原版截图或实机权限。默认／选中／禁用／命令取消布局沿用当前UI，本块不操作桌面，视觉等价待核实。迁移后现有战术目标、护航／守点／避敌／到点、取消命令、手动切换仍由主任务原有输入链控制；本块只读取已接受的 resident命令。

## 范围和规则

新增独立 `native/combat-core/src/tactical_ai.rs`。World借用真实 Rust ordered roster、挂点和小行星观察、阵营可见性与完整 handle/generation身份；完整属性／拓扑／代次缺失拒绝。安装 metadata包含实际 id／slotId的稳定词法／locale排序位置，不能用随机句柄取代原来源 tie。明确命令和 manual集合持有完整身份，取消后立即不参与显式优先权。

目标预选保留 explicit → current → 最近可见主力 → 最近可见任意的顺序，严格距离同分维持 roster。舰体火力朝向选择当前、零度、各炮弧中心、边界和区间中点；拦截解保留原算术，优先最高覆盖DPS，再中心误差、最小转向。射程使用原DPS加权中位数及角色／幅能／结构／attack window／训练policy残差。

舰队按存活可部署行筛选，计算实际电池／PD／导弹／wing能力和角色。按阵营建立可见敌舰；手动／明确接敌及原承诺先占 claim，逐个自动舰船先扣自身旧claim再评分和补承诺。保留每个 contributors原顺序、压力、目标黏着、护航／守点惩罚、cover资格、REGROUP／DISENGAGE迟滞及空间排列接近航道。舰载机不作为自动主力 actor，但可以是真实敌舰候选／压力贡献。

站位保留原 advisory取样规模（附近12、炮8、小行星8、敌舰4）以及原 tie，而不是截断完整战斗世界。预测3秒／6段真实加速度；按炮弧、转速、同伴射线、来袭炮弧、退出走廊、重叠和射程误差评分。只有原baseline触发门槛满足才评估六个候选，并以>.12门槛改善。候选仅建议速度，真实导航／避碰／控制仍由navigation_ai；不能用站位评分提交实际伤害。

本块不改 shared Core／ABI／生产适配，不迁移任意系统 AI／舰载机生成／特殊命令效果，不提供每步JS世界输入。输出完整代次身份与只读建议；主任务在同一 AI_PLAN边界统一提交，并在系统／防御写入后关闭观察。无新增RNG、真实资源扣费或时钟；既有常驻AI控制器和舰队previousTask／currentTarget是root事务状态。本块纯scratch可重建，policy属于不可变内容指纹；联机宿主输入、并发回执、完整恢复和生涯存档归总方案，不能把建议snapshot当checkpoint。

## 顺序、验收和待核实

本文与来源先于代码 → typed target/profile/fleet/position → 一次Node＋fresh无头Worker实际TSoracle → root接线真实AI控制器／fire／defense／effects → 完整可玩。严格比较目标代次／命令优先／role/task/anchor/claim／炮数DPS／候选身份／门槛类别、资源和RNG。纯bearing/range/velocity及几何score允许既定 `max(1e-9,32*EPS*max(1,abs(a),abs(b)))` 并记录逐项误差；不能放宽选中了哪个炮弧／目标／候选或cover／退避决定。

覆盖手动和明确命令、死亡／撤离／docked／hidden／vast／fighter、PD-only／导弹only／carrier／unarmed、current保留与同分、regroup有无cover及迟滞、overload／vent／phase目标、相同目标多舰航道、近远拦截／硬点／炮塔、训练动作、遮挡／盟友射线／危险／escape、无效身份／拓扑／观察拒绝。没有新玩家产品取舍。仍待核实：完整AI控制器cadence、系统AI效果顺序、生成实体／模块装配输入、locale标识metadata安装、联网恢复、原版实机及整场性能。独立通过不代表完整可玩。

## 实际交付、API 和阶段顺序

完成 `tactical_ai.rs` 和独立 harness/check/runner；未触碰lib/state/battle/projectile/protocol／生产入口。公开API为 `World::validate/find/visible`、`hostile`、`battery_rows`、`profile`、`engagement_range`、`fleet`、`position`，以及只读Policy校验和action。输出完整Identity、Profile、Assignment和PositionChoice（含实际candidate序号）。`FleetScratch`缓存全单位距离／压力，`PositionScratch`持有可重建候选；它们没有RNG或跨步权威记忆。root必须把currentTarget、previousTask、命令、manual及控制器时钟放在其常驻事务中；本块不凭空建立第二套时钟。

顺序要求：以真实resident AI_PLAN观察先计算整舰队`fleet`，再按原controller阶段进行`hostile/profile`，stationkeeping/navigation后可调用`position`，最后真实导航避碰和steering；系统／防御effects之后关闭计划观察，live threat／forward重查沿用defense_ai/navigation_ai。`World`中的武器range/speed/DPS/delay、raw shield、wing power/carrier range必须由resident规则生产，不能每步上传TS DTO。数组顺序就是语义roster和挂点顺序。Body的id用于原UTF-16词法排序；Body/Weapon的locale_rank必须在一次实际metadata安装时按来源`localeCompare`的关系得到，稳定等价ID共享rank，不能用句柄代替。动态spawn的metadata安装仍需root闭包实现。

Policy默认准确对应当前bundled disabled模型；实现enabled表格动作和training残差，但本块只验证实际disabled bundled和四种training action，enabled表格尚未单独差分，不能把它报告成已验收。原版doctrine／learning训练、任意系统AI、完整CapitalShipAI cadence、多率记忆和模块聚合生产仍未接线。本块返回当前生产batch算法，非完整原版BasicShipAI。

## 实际集中验收

`node scripts/check-rust-tactical-ai-module.mjs`最终Node和fresh无头Chromium dedicated Worker均通过30场景×40步（1,200步）、6,680条Assignment、78,807次严格字段和26,040次预登记几何字段。Node几何最大差0；Worker最大 `8.881784197001252e-16`（251项逐字段日志）。目标／代次、role/task/anchor、battery炮数/DPS、assignedPower、clearFire、adjusted/reason、实际原TS选中candidate均严格相同；验证runner只在实际AIPositionSolver原结果写入位置额外记录候选索引，没有改其评分／门槛／顺序。七种失效观察拒绝通过。

全部六角色和七任务都有实际输出：REGROUP80、DISENGAGE40、FINISH280、SEARCH240；242次站位调整包括42次COVER及200次FIRE_LANE。原速度、四个侧向候选和半速候选都有实际选择；停止候选代码已迁移，但该组场景未选中，不冒充此选择覆盖。明确命令／manual、carrier/unarmed/PD-only/missile-only、主力优先、无目标、死亡／撤離／hidden／vast、训练残差、偏移武器和硬点／beam均包括；完整docked输入链和联网恢复不在此独立检查。

Wasm182,690bytes，SHA256 `523f00a2c6319b18b81f7762fbecbf3afb8b82019594af9685a6f7ec18d56331`，逐项geometry日志、源码及Wasm hashes保留 `artifacts/rust-combat-core-20261008/verification-tactical-ai/result.json`。改动文件严格ESLint通过，未运行全项目类型检查或全套测试。无真实资源／RNG写入、无可见窗口、无生涯／暂存／提交／推送／发布；`fullBattleReady`保持false，完整可玩仍由主任务继续。

2026-10-09：only profile中心canonical候选107fdb的实际前80，source仍原ABBA每word逐位，所有舰实际controls严格相同，72/78关闭；尚余37防御上游炮塔。ROOT已仅中心heading窄生产挂接；全270及最终installed验收仍待，不称全部可玩。

2026-10-09 ROOT已按1cd5559c候选true270证明窄接production实际profileaim和fleetgroupheading各一canonicalatan2。source每word仍ABBA同，首170及191/194/199/216/221/229/236/249关闭；剩159防御和182/223/226/257controls共6diff未过，继续当前首因。非最终installed证明。
