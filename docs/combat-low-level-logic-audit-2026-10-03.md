# 更底层逻辑审计（2026-10-03）

## 范围与结论
本轮只定位底层逻辑，**没有改生产代码，没有又降低多少ms/已60Hz的结论**。核心问题已从“重复数据准备”下探到：**物理实体、独立行动者和规则消费者被混为一种 Ship/通用AI，为无独立运动能力的部件或没有消费者的输入重复求解。数值读面没有消除这层工作图。**

原版目标0.98a-RC8；C:/starsector-core、C:/decompiled缺失，原版源码/实机/相关截图待核实。以下是当前Web内部证据，不冒充原版还原。没有桌面、子代理、UI、生涯、提交/打包/发布操作。

审计对象为上一轮 cache-free 真正最终默认 authority/stage.mjs。三改动文件与final-source hash仍一致。复用917、2玩家+20AI、三种舰船、standard、22根舰/176初始实体/734挂点场景。

## 1. 结构性问题：附属模块被当作可独立机动的行动者
证据链：
- FleetTactics.ts:44 的capital只排除FIGHTER/system drone，**未排除附属模块**；83-89把模块自身速度/火力/flux/target作为major actor提供给舰队求解。
- CombatEngine.ts:905-913 为模块创建CapitalShipAI；CapitalShipAI.ts:248-290 对它们跑approach、站位、让路、避障、steering。
- TacticalPositioningKernel.ts:37-44用模块自己的加减速度做六步自由运动候选；TacticalPositioning.ts:28-38对象oracle也如此，不是只有新数值实现的问题。
- 实际物理相反：Ship.ts:141-153用parent pose/角速度约束模块；1116-1137的attached branch不调用自由平移advanceShipMotion。14个模块的引擎表现也读母舰命令，不是模块自己的油门。

实际执行证据：
- 每步20根舰AI＋56模块AI。两个手动人类根舰不计入20。
- 56模块都有各自fleet assignment；首步56个全输出非零平移、非零转向命令。
- 当前56模块station=0、independentRotation=0、advanceAI callback=0，自有maxSpeed全部28，物理上却不能独立平移。
- 每步模块战术刷新18.667、站位评估18.667、避障56、steering56。不是只有20Hz站位，还包括每步紧急链。

这证明本场景生成了未被物理/模块系统消费的机动命令，并执行对应求解。但**不能删全部模块AI或简单从fleet units中过滤模块**：武器局部目标、hold/flux、护盾/防御、future独立旋转、其它模块/扩展系统及现有诊断/发布字段仍有消费者；模块火力当前还参与压力/claim，直接过滤会改变目标与战斗。

真正边界应是：机动行动者（root/station）与模块的武器/防御/必要旋转能力分开；碰撞/weapon owner部件仍存在；assembly提供部件火力、射程和存活信息。先拆职责/依赖、保留当前规则适配器。新assembly目标/压力规则是否原版等价待核实，不能悄悄默认改变玩家行为。

## 2. 已证明的无消费者工作：系统AI上下文提前求完整前方净空
- CapitalShipAI.ts:296-303为每个advanceAI先计算forwardPathClear，再构造context，即使该回调从不读取该字段。
- 工作窗每步26次；root forwardClear路由每步约5852次isPhased读取、5878次allSystems读取。
- 计划read span在effects前已关闭；不能简单让旧index/phase flags跨effects存活，前面系统/防御effects可能改变相关状态。
- 保留原eager查询与原bool，仅观察transient字段读取：120步3120次计算/传入，**0次读取**。
  - Eclipse840、Gloriana Edict840、Hyperion Yamato720、Hyperion Jump720，全0。
- 静态调用链核实：Eclipse→SystemAI.advanceWeaponBoostAI；GlorianaEdict.advanceAI、HyperionSystems两段advanceAI均不读该字段。jets/drives等其它系统会消费forwardClear，不能统一跳过。

正确入口是**按真实规则消费者依赖准备SystemAI输入**：已核实且身份不变的原生程序只准备消费的查询；未知/替换回调保持完整路径。不硬写true伪造净空，也不取消碰撞安全规则。这一条可作为保持行为不变的内部重写入口。

## 3. 战术20Hz不等于当前威胁预测20Hz
- CapitalShipAI.ts:196-207的compactForecast需要旧weaponThreatEnvelope＋native gate；numeric WeaponThreatFrame本身不满足。
- 20根舰/56模块全部compact=false、refreshForecast=true，每步完整预测76次；数字帧确实存在，不是整体回退。
- 每步forecast source visits13177.767、mount visits6679.358；模块source visits9709.933，模块最终角度计算94.925、接受weapon rows91.650，很多模块来源是逐项排除。原计数中root角度计算为3638.542/步，合计3733.467/步；此前“最终角度计算94.925”未明确模块范围，不能作为全部observer的总量。
- 每步实际投射物威胁扫描7090.800行，与站位20Hz不是同一条工作。
- WeaponThreatKernel.ts:31-64仍是observer×source再mount的ETA循环；Float64Array消除了对象读，没有改变组合复杂度。

不是应“解除”的开关。直接把新数字帧加入旧20Hz门禁会改变远期持有/排散判定，违反本任务不降频边界。应保持頻率与ETA，重写捕获后的保守候选关系及批次消费，保留原source/mount顺序、sum/tie、即时投射物与防御响应；不能直接复制母舰威胁结果给模块。

## 4. 关系树重复展开，不是GC主导
每步计数：isPhased约27837.167、allSystems约32058.567、isCollisionless约11520.908。
Ship.ts:241每次allSystems创建 `[system,...systems.slice(1),defense]`；相位又递归父子/system关系。
未插桩CPU独占采样：isPhased1.020ms、isCollisionless0.772ms、allSystems0.548ms（exclusive可加，不加inclusive）。GC约1.19ms，仅该profile约3%；不把堆增长说成泄漏。

应按只读span捕获关系/能力，真实effects/damage后失效；不能跨整tick缓存phase/dead/shield。已失败getter-alias core/copied-motion不重试。
路径差异：local-combat.worker.ts:39/69启用workerOwnedPhaseReads，LAN host.worker.ts:641-642只启用可选motion/preAim，没有同样phase初始化。这是LAN默认审计，不把这里的allSystems频率套到已启用快读的单人worker；补开快读开关不是模型根治。

## 5. 确定但次要的查询逻辑缺陷
NumericAcquisitionFrame.ts:220/243-244先计算tree.query参数，WeaponAcquisitionKernel.ts:106随后优先检查current，命中即返回；原生只读span中，这时先前BVH扫描/排序没有消费者。
实测优先目标命中每步50.358，总tree queries538.1，约9.36%。可以先解current，失败才展开候选，保留原规则/结果。但本profile整个query桶inclusive约1.00ms，不把这项局部修复包装成剩余20ms根治。本轮记录未修改。

## 当前CPU与多线程边界
当前最终默认150warm＋120 sampled：整步墙钟38.783ms，AI标签12.478ms、fire-query10.342ms。含profiler及机器波动，**不是A/B，不能说上一轮33.44ms退化**。
Weighted CPU：CapitalShipAI.decide inclusive8.183ms；assessThreats2.944ms包含weapon kernel1.284ms，不可相加；站位1.741ms、avoidance1.085ms；fire plan8.484ms、fire capture0.395ms。数据准备层确已降低，通用规则工作仍是主体。

host.worker.ts:495-497只有显式threat workers=true才分摊weapon kernel；469-479旧whole-AI owners需要threat-phase=false且非phased world。此窗口能分摊的weapon kernel仅约1.28ms，开线程不等于并行化整个AI/火控，更不能承诺60Hz。实际UI指标是authority step墙钟，含可选await/调度；未取得用户现场browser分项，不把所有尖峰全归CPU。
护盾sector K²每步约10786.558次比较，但样本无K≥128、很多observer为0；不能凭双循环就称它最大热点。

## 证据真实性与验收边界
- 本轮：后台文件检查、一次新无头CPU采样、一次函数body工作量probe及同场景完整captureCombat＋RNG终态对照、定向首步entity model、120步transient输入消费probe。未改生产代码，所以未重复tsc/lint/发布build或全套场景，没有新建测试工程。
- body插桩保留方法原型/捕获身份和native生命周期；完整终态＋RNG与未插桩当前默认相等。其计时包含大量计数开销，不能把body probe的8.12/7.83ms根舰/模块时间当真实CPU占比；未插桩CPU时间和实际工作次数分开报告。
- 字段消费probe保持原eager查询，仅对得到的bool读取计数；末态实体/投射物、完整双方统计、RNG与未插桩profile相同，不声称又跑270步逐字段轨迹验收。
- 初期probe有脚本语法、换行匹配、局部变量命名错误，日志可见；修正后才得到数据，不当成生产故障。没有原版/UI/browser/transport/跨机新验收。
- 当前三生产改动文件hash与上轮冻结一致；本轮只写audit/artifacts，未改行为。

证据：artifacts/combat-low-level-audit-20261003/ 下 weighted-hotspots.json、work-diagnostic.json、entity-model.json、system-input-consumption.json、audit-summary.json、audited-source-hashes.json。


## 后续实施状态（2026-10-03）
第2项已接入真实 authority 的 SystemAI 输入依赖执行层；完整结果见 combat-system-inputs-results-2026-10-03.md。每步26个无人消费的净空扫描降至0，原推进/未知回调仍完整查询，最终270步逐步快照与RNG一致。第1/3/4/5项未因此宣称解决。

第3项的重复来源/挂点关系筛选已接入同母舰模块cohort，保留根舰和模块的独立原预测；最终含准备来源访问减少62.4%、挂点6.7%，实际270逐步/每observer row/RNG一致。全部真实角度精算未减少，根舰真实精算及模块自由机动职责仍未解决；性能漂移不支持稳定提速结论。详见combat-threat-relations-results-2026-10-03.md。

第1项的固定模块自由机动职责已拆分（只在 standard/真实原生 Worker plan 权限下）：每步56固定模块的站位/让路/避碰/steering实际调用归零，局部目标/火控/防御/舰队任务保留。270步严格非导航快照/AI memory/双RNG对照及原始回滚通过。最终整步均值34.243→33.938ms，但AI均值11.832→12.009ms，漂移明显，**未证明稳定提速、未解决整体高ms**。资格检查成本与火控/剩余AI仍待处理；详见combat-attached-module-ai-results-2026-10-03.md。

## 剩余执行成本审计（2026-10-03，生产未改）
新的当前默认CPU/函数body证据确认：上块attached门禁本身约2.238ms/步、229.442次全实例资格检查、57580.975次hasOwn；每步96.392份新scope中94.337%重复同frame有序权限集合；挂点分类冷审计86.755%；current命中前丢弃约44.895%的materialized候选行，但整个query约0.968ms，不能包装成总收益。通用可覆写对象接口的资格/可变metadata/关系准备仍夹在高频规则循环中，数值kernel没有拆掉这层执行模型。完整记录及阶段失效边界见combat-root-cost-results-2026-10-03.md；没有新生产改动/提速或60Hz结论。

## 2026-10-03 资格算法候选（拒绝）
组件own属性交集检查+原生冻结world生产者候选：270步全原始快照/全部AI memory/双RNG及27项边界一致；独立ABBA无收益（整步34.077→38.845ms，AI11.998→12.620ms）。全部本轮生产修改已逐字节撤回，证据保留在combat-admission-rewrite-20261003，详见combat-admission-rewrite-results-2026-10-03.md。不能将换反射算法包装成已解决约2.238ms资格路径；实际Worker独占执行入口与通用可变API分离尚未完成。

## 2026-10-03 发散根因审计（只读）
见 combat-root-cause-brainstorm-2026-10-03.md。新方向：TargetDomain与OccluderDomain混用（craft至多一个目标却先全敌方BVH后叶子权限过滤）、最终冷却门禁晚于完整安全预测（占比待测）、全n²矩阵即惰性模式仍分配、local Worker逐物理步编码/回执/主线程串行链、projectile index构建与query双legacy门禁。没有生产修改/提速声明。初始结构探针176units、78major、矩阵557568字节、734mount FreeAim=0，初始结构不是计时/轨迹验收。60Hz从34.077ms需约51.09%净减少，不能继续将1–2ms级单点包装成根治。

## 2026-10-03 实际需求普查（只读，假设修正）
同既有场景一次270轨迹+150warm/120计数。craft 0/1查询3943/64572=6.11%，不是主因；cooling decide3472/86734=4.00%，冷却友伤/target字段有实际让路、cycle目标和owner-codec消费者，不能直接跳过。NO_TARGET69222/86734=79.81%；preAim数值搜索49998次，模块preAim候选503078占69.69%，current命中后丢弃已生成候选324063占44.90%。67994次分类冷构建输出与上次观测全相同；范围表同tick重复值39832/60639=65.69%，不能由此授权跨stage缓存。优先实际规则生命周期/阶段输入与预瞄执行图，而非craft索引或cooldown early-continue。270 raw快照/双RNG、20790 AI/defense、195934 autofire tracker/per-mount RNG一致；生产hash不变，无提速声明。详见combat-work-demand-census-results-2026-10-03.md。

## 2026-10-03 原生预瞄执行图重写
单独current-first减少324063候选但ABBA整步35.234→35.498ms，已逐字节撤回。进一步tree.nearest直接求最近合法目标，不物化/排序预瞄全候选，270步raw/双RNG/AI防御/tracker与rollback严格一致，1024组定向kernel通过。当前保留两生产文件改动；ABBA观察整步38.202→35.736ms，fire-query 10.691→9.320ms；有其它阶段漂移，不能把全部净差归因/外推稳定收益，更不能称60Hz已达成。候选721826→56216，nearest49998。详见combat-native-nearest-preaim-results-2026-10-03.md。并行生命周期审计形成classification immutable rule publication和source只读modifier准备方案，尚非已验证生产收益。

## 2026-10-03 source局部modifier候选（拒绝）
两代理生命周期审计后实现仅fleet readiness range+motion局部一次求值。初版null-parent门禁错误使覆盖0，定向修正后仍仅每步3source（360/20807请求）；ABBA整步33.341→34.653ms，AI11.933→13.118ms，已拒绝并只撤回本块2旧文件+1新增helper，accepted nearest两文件hash不变。进一步证明准备/反射/权限层成本须计入，不能以窄path逻辑一致/重复值相同冒充高ms根治。详见combat-fleet-source-modifiers-results-2026-10-03.md；classification永久cache因live writer hooks证据未集成。

## 2026-10-03 LAN producer与需求存储收尾（10-04记录）
已保留LAN既有phase读初始化接入和pressure按访问行分配；各自独立ABBA观察33.441→32.481及32.268→31.386ms，不串加。raw/双RNG/全部AI防御/tracker严格对照及边界通过。实际计数否定重复防御假设，确认对象getter位于实体二层循环；threat明细约91%非imminent。总体高ms未解决；结果与限制见对应results文档。

## 2026-10-04 硬砍半目标：实际两块
ThreatFacts虽然270严格/58边界通过但AI两个ABBA相邻对回归，全部6文件撤回。原生producer/team-target权限组+union+私有phase/factory事实复用保留：270全raw/双RNG/AI/defense/tracker一致、44边界、3未知provider兼容通过，独占ABBA41.127→37.443ms（-8.96%），AI14.918→13.083。目标-50%明确未完成，不能串加不同基线；下一层规则publication与大块并行执行仍未实施。详见combat-planning-producers-results-2026-10-04.md。
