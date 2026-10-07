# 高 ms 的发散根因审计 / 头脑风暴 — 2026-10-03

本轮只读源码、复用已有计时/CPU/工作量证据，另做一次既有 seed917 世界的初始结构探针（无 fixedUpdate、无计时、无轨迹验收）。无生产代码修改、无完整测试重跑、无桌面/子代理/生涯/发布操作。原版目标0.98a-RC8；本机 C:/starsector-core 和 C:/decompiled 再次确认缺失，原版源码/界面/实机待核实。本文件不是完成重写或已经提速的报告。

## 先纠正研究方向

上一轮拒绝候选只是改反射算法与world描述符准备，没有解决实际执行图。当前不能假设有一个占20ms的单函数，也不能把“对象比较多”“JS慢”当充分原因。

最近独立ABBA接受基线34.077ms，60Hz预算16.667ms，若要整步落入预算，需约51.09%的净减少。基线两臂 planning均值11.422ms、fire-query9.652ms，合计约21.074ms，尚未计AI effects及其它阶段。只消除约2.238ms资格路径，即使全额消除，也远不足以解决60Hz预算。此前CPU归因来自另一次含profiler窗口，不能直接相加成此ABBA的时间分解。

## 优先级1：同一个 ships 同时表示“可瞄目标”“友军遮挡”“来源/权限”

**源码核实**：FlightDecisionRoster.ts:36–41 fireShips 返回队友列表加单个target；NumericAcquisitionFrame.ts:214–226 用同一source scope调用tree；NumericAcquisitionTree.ts:21–31先遍历全team敌方树，直到叶子才判members[row]。即在原生craft生产路径里，可瞄敌方目标最多一个（target也可能不可瞄或为空），仍然可能先走全敌方BVH。遮挡/友伤需要保留队友，但不意味着目标获取也需要搜索这些行。

**新结构假设**：94.337%重复scope不仅是数组身份问题，还可能是错误的数据契约让消费者无法知道“目标域仅0/1行”，从而浪费索引遍历与权限转换。

**证伪/确认**：下一次只对实际query统计 permitted eligible enemy count=0/1/many、节点访问、窄相位、排序/materialization，区分root/craft，不运行优化矩阵；若0/1查询少或tree时间小，该方向降级。以前实测tree query全部约0.968ms，因此不能把此项单独包装成10ms收益。

**可替换设计**：原生producer显式输出有序TargetDomain与OccluderDomain，0/1目标走直接精确测试，多目标才空间搜索；generic world保持现有路径。仍须保留友军遮挡、原迭代顺序/平局、目标权限与实际接触规则。

## 优先级2：真正开火资格与昂贵精确预测的顺序

**源码核实**：ShipWeaponControlSystem.ts:449–465 先aim/preAim、aimTurret、decide，最后才以cooldownTimer<=0决定fireRequests。AutofireController.ts:599–615 decide里包含traceTarget与shotObstruction。冷却中仍应跟踪/转炮，但不必由此推定每帧必须重做所有“若现在发射”的安全预测。

**假设，尚未测其占比**：冷却、ammo、group scheduler或其它最终发射门禁阻止的挂点可能在支付完整精确预测。不能说这些预测都是无消费者：诊断reason、ammoAllowed迟滞、tracker及充能/连发状态有可观察依赖，aim的几次trace使用不同方向，不能简单当重复相同查询。

**确认方法**：按最终可发射/冷却/连发/充能/光束状态分桶实际trace/obstruction调用与body CPU；检查结果消费者及memory写。若不是大头，则排除。

**可能重写**：拆跟踪与memory推进、真实发射安全判定、解释性诊断三种工作，保持必需状态与方向更新；不要直接前置continue或更改诊断语义。原版相关行为仍需来源核实。

## 优先级3：全帧轮询 vs 真实依赖版本 / 变更驱动

已有实测：76次防御、677.808次fire-query prepare/步；classification冷构建86.755%；allSystems26500.85、isPhased21348.35、isCollisionless11520.908次/步。数值kernel正在运行，并非compiled开关没生效。

**结构原因候选**：多个阶段分别翻译同一可变Ship/Weapon接口，消费者不知道哪些变化影响静态规则、weapon stats、实体关系和当前pose，因此只能全面重新审计与展开。

**改法不是永久WeakMap**：不可变规则图/元数据版本、modifier版本、关系版本、pose版本各自由真实写入口维护；当前动态幅能/相位/冷却读面只在各自合法stage复用，跨effects/碰撞/dispatch立即失效。只有revision维护覆盖所有允许写入口才可授权复用。旧getter-alias core、copied motion和弱命中查询缓存的失败结论保留。

**下一问**：哪些数值在150–270真实窗口的各stage被谁写过，哪个消费者为何重新读？先形成写者→版本→消费者图，再选重写切片，不先建缓存。

## 优先级4：门禁在阻止“本来安全且精确”的只读索引

已有实测heavy的legacy资格false/exact资格true；projectileThreatIndex既受CombatEngine.ts:868的nativeThreatPhase/128门槛控制，还受ProjectileThreatIndex.ts:73的ship.hasNativeThreatPhaseHooks再次拒绝。只改构建门禁仍可能查询全部回退。

实际projectile rows7090.8/步，防御独立consumer不能删除或降频。应把精确只读索引能力与20Hz/compact forecast/未知状态回调等资格分离，索引命中后窄相位/导弹追踪/异常lifetime/顺序仍保持；索引本身构造+排序也必须计入，不能仅看到行数下降就声称快了。

## 优先级5：数值化仍可能每帧分配全世界规模的矩阵

NumericalFleetPlanner.ts:26–28 即使demand惰性计算仍分配两个Float64与两个Uint8 n*n矩阵；:63之后才筛actors。FleetTactics.ts:79–92 readiness覆盖live非vastbulk实体，并包括fighters。

本轮初始结构探针：176units、78major（含固定模块，不是78根舰），仅四个矩阵的buffer字节=18*176²=557568，约0.56MB/规划。若每秒执行60次，仅此容量约33.45MB/s——是结构预算推算，不是本轮分配/GC吞吐实测。少计算数学不等于少分配或零初始化。

应核实真正consumer矩形区域、稀疏度与生命周期，考虑按实际需要存储或容量复用+generation stamp，不删除fighters对pressure的真实贡献，不改变sum/tie方向。已有GC采样约1.161ms，不能把GC宣称为整个34ms主因。

## 优先级6：物理CPU慢之外，还存在逐步发布回合的串行链

源码核实：CombatSession.ts:623–632 有workerStep时不发新step，只有收到frame、acceptWorkerFrame和visual update后finally清除；LocalWorkerHost.pump一次仅一inFlight；local-combat.worker.ts:80–84 simulationMs结束后还要encoder.capture与postMessage。因而单机有效tick间隔还可能包括编码、消息、主线程decode/应用及visual work。

这可以放大真实模拟变慢/延迟，但不能解释掉已测的纯fixedUpdate高成本。LAN host的simulationMs也可能含输入、await和deferred writes，capture/encode另计；local command/init/restore应与step样本区分。不能改显示算法把ms“降下来”。下一步应在同一个tick关联compute/encode/message/decode/queue/backlog，而非只看FPS或一项平均值。

改动方向可以是保持完整60Hz权威tick/命令顺序，解除“每物理步必须完成全展示发布”的不必要依赖；不是跳物理步、丢债务或改变dt。数据发布与原版UI/反馈的节奏取舍需明确。

## 优先级7：多核的并行范围太小，且并行路径与串行工作图不完全一致

WeaponThreatWorkers.ts:83–99分享纯packet并按observer分区；当前数据构建未带observerGroups/候选关系，workers走原全packet路线。既有kernel采样约1.279ms，与整个34ms不是一回事。即使无限加速这一小段，也不可能把整步降到16.7ms；prepare/wait/merge还要付费。

应研究哪段“只读纯数值观察、无共享写、规模足够”才可并行，以及串行/并行是否做相同必要工作。不直接加worker数，也不并行有顺序依赖的claim、effects或damage。

## 优先级8：几何表达让同一方向反复做昂贵三角变换

Angles.ts:2 signedAngle=atan2(sin(angle),cos(angle))；既有独占CPU约0.808ms/步。WeaponThreatKernel每合格挂点用heading、hullTurn、turretTurn等三角函数；火控也有重复角度/射线几何。

可以研究同stage同几何输入的复用、方向向量/dot-cross阈值表示；不能直接全局改成余数公式或float32，因为±π、-0、NaN、极大角及临界射界可能改变。原版与当前数值边界要核实。规模约1ms级，不当作单项根治。

顺手证伪了一项容易误判的假设：kernel在FreeAim时仍先计算角度，然后将turn=0，源码确有“计算后不用”；但本轮初始734挂点的FreeAim=0，此场景不能靠这项宣称收益。后续状态占比未测。

## 优先级9：表示/观测契约与运行时形状，不能靠工作量数字判断

拒绝候选的独立ABBA中，候选不仅目标AI项增加，projectile/wings/collision等未直接修改阶段也上升；这可能来自额外分配/GC/对象形状/JIT、CPU负载/温度或窗口漂移，现有证据不能择一归因。原baseline臂本身35.968→32.186ms也有明显漂移。

对象更少/hasOwn更少、typed array/WASM/更多workers都不自动等于更快。诊断应先问新增桥接、建表、排序、封装/拆封是否抵消kernel收益；需要把这些成本归入生产者而非只测消费者。当前失败方案已撤回，不重试同一算法包装。

## 不优先追的路线

- GPU/FPS或解除限速不能消除headless fixedUpdate的真实CPU成本。
- 单GC、单VFX不是已证实主因；trailsMinesFX约0.331ms还混有真实mine gameplay，不能整段搬走或删除。
- 按物理family合并完整防御/射界或缩减实体/挂点违反当前精确consumer，不允许以优化名义删逻辑。
- 整体WASM迁移仅是候选：没有稳定常驻输入/真实owner写入口时，转换、权限证明和回拷仍在，不能据“JS慢”承诺收益。

## 建议的最小下一轮调查（尚未执行）

只复用一次既有场景做定向工作图普查：
1. query的eligible目标基数0/1/many及BVH节点/排序/候选成本；
2. fire安全预测按实际冷却/充能/连发/能否发射分桶；
3. stage内变化写者与consumer依赖，尤其metadata/stat/relationship重建；
4. exact索引双门禁导致的真实回退。

先发现至少一块具有可观整步成本且无必要consumer的工作，再实现该块；不要同时启动多个优化候选或重复全套验证。浏览器逐tick管线实测另待用户许可/后台无头可用条件，不能占用桌面。

## 后续实测修正
2026-10-03 work-demand-census已完成：craft 0/1只占6.11%树查询，非当前主因；cooling decide占4.00%，fireControl reason/target被FriendlyFireLaneIndex、TacticalNavigation、cycle target和owner codec实际消费，不是仅HUD解释性诊断。NO_TARGET占79.81%，扩大范围精确preAim与不变classification重建优先级更高。本文假设应以combat-work-demand-census-results-2026-10-03.md的新证据为准；没有生产更改/提速声明。

## 2026-10-03 当前实现后补排除：Worker回执链不能冒充同步step根因
后台核实 local/local-combat.worker.ts:79–83：simulationMs在encoder.capture与replayWitness/telemetry/outcome之前结算，encodeMs另计；LocalWorkerHost.step/pump/receive确实至多一step pending、消息/解码后才回执。链路可以约束端到端吞吐，但不是本轮同步CombatEngine.fixedUpdate ABBA约35ms的解释，不能用它替代CPU执行图问题，也不能通过改计时边界伪造模拟提速。LocalCombatKernel.stepScheduled标准大world prepare返回null、不启动旧whole-AI prediction；因此该同步参考场景不得归因于旧pool等待。渲染/编码/传输端到端大小仍未重新实测，未重写调度或改变暂停/输入采样。
