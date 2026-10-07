# 实际工作需求普查结果 — 2026-10-03

## 结论先行
这次筛掉了两个容易误判为主因的方向：craft的0/1目标BVH虽然确实白走，但仅占6.11%树查询；冷却中decide只占4.00%，且友伤结果、tracker/弹药迟滞和未来发射目标都有真实消费者，不能直接跳过。更值得重写的是**无射击目标时仍每步运行的扩大范围精确预瞄，以及每frame重新审计/构建输出未变的武器规则分类和范围表**。

这是执行需求普查，不是“已经解决高ms”的报告，也不证明能省17ms。没有生产代码修改，原版源码/实机/UI仍待核实。

## 方法与有效性
- 同一个seed917、standard、2玩家+20AI、初始734挂点。150warm+120统计。
- esbuild只在原方法BODY旁路观察，不替换原型/方法、不跳原操作/改返回值或随机流。使用实际资格/role纯函数统计权限∩team资格及weapon角色资格的目标基数。
- 270逐步原始快照及模拟/视觉RNG严格一致；20790组全部AI/defense memory、195934组autofire tracker及每挂点调度RNG严格一致。
- 原数值plane仍真实使用：120 compiledFrames，scopeFallbacks=0。六个探针目标生产文件hash前后不变。
- 一次既有场景普查完成，无优化候选ABBA、无完整静态检查重跑。BODY时钟包含probe开销/分配，且包容项重叠，不能当作原生ms或可省时间。原生总成本参考上一轮uninjected CPU采样，跨窗口不可直接相加。

## 1. 0/1目标：机制存在，但不是当前大头
120步共64572次树查询，538.1次/步：

| 发起者 | 查询数 | 候选行 |
|---|---:|---:|
| root | 33152 | 186012 |
| 固定模块 | 27477 | 535624 |
| craft | 3943 | 190 |

craft3943次全为0/1目标，其中3487次合法敌方目标为空，456次为一个目标；两类仍访问49683个树节点、51300个叶行。这证明TargetDomain/OccluderDomain混用确实造成无效工作。

但它仅占6.11%树查询，原生整个query包容CPU约0.968ms/步；因此这不应继续作为当前主要优化对象。不能按“98craft”直觉把它想成全部火控查询的主体。

## 2. 冷却预测：有成本，更有真正消费者
- decide共86734次（722.78/步），冷却中3472次，占4.00%。
- traceTarget冷却中7889/44346次；shotObstruction冷却中3157/9002次。少量冷却挂点确实比普通空目标判定更昂贵。
- 2265次decision返回FIRE，但实际plan fireRequests因cooldown拒绝。fireRequests只是计划请求，不等于commit后的实际发射。
- 冷却路径发生2290次ammoAllowed赋值；本probe没有把赋值前后相同与真实变更分开，不能说2290次都是值变化。

**不能删的原因（源码核实）**：
- aim维护scanIn、firingTime、idleFireTime和per-mount RNG，期间仍须转炮/预备下一轮目标；query.delay还包含未来发射延迟，不能把预测理解为“冷却期间假装立即发射”。
- FriendlyFireLaneIndex.ts:19、TacticalNavigation.ts:186–188消费fireControl.reason===FRIENDLY_BLOCKED及targetKind/ID用于友军让路。
- ShipWeaponControlSystem.ts:737–738用fireControl target字段锁定cycleTarget；multicore ObservationWire/Protocol消费这些字段做同步/验证。
- 这不是仅HUD解释性诊断。AuthorityCombatSnapshot里说不属于presentation数据，不等于authority没有消费者。

因此“冷却就跳过精确安全判断”会改变后续导航、迟滞与发射目标，不能作为无行为变化优化直接做。即使设计正确的重用/需求分流，其整步收益尚未证实。

## 3. 真正密集的查询是 NO_TARGET 后的精确预瞄
- 69222/86734次decide为NO_TARGET，占79.81%。
- aim实际全局scan是14574次（121.45/步），采用既有scanIn节奏。
- 无solution的fallback preAim调用69222次；其中49998次进入数值预瞄（416.65/步），其它如HARDPOINT会早返回。不能把全部preAim调用都当重搜索。
- AutofireController.preAim:398–399把range乘1.5，仍经角色/射界/拦截/真实接触几何测试；它只用于跟踪点，并非射击许可。
- 固定模块preAim产生503078行，占全部721826候选行的69.69%。
- 6043次current target命中，丢弃此前已经物化的324063行，约44.90%；其中模块4564次命中丢弃271307行。current优先测试发生得太晚。

**执行结构问题**：完整武器目标扫描按scanIn进行，而没有射击解时的辅助预瞄却每步走更宽范围的精确搜索。这不是凭空可删的无效AI：提前转炮确有消费者，但其候选生成/准备不能继续被当作低成本点计算。

原生CPU参考：AutofireController.preAim包容约2.483ms/步、NumericAcquisitionFrame.preAim约1.702ms、nearestNumericPreAim约0.366ms、tree全部query约0.968ms，均重叠，不能相加或直接当收益。也不能把probe观测的5.699ms说成原生preAim成本。

**重写边界**：每步预瞄响应、1.5range、当前目标优先、精确接触、原顺序平局均保留；先处理合法current，再按需生成全局候选，输入/资格证明与静态规则通过真实生产者准备。不能通过延长preAim计时器来伪装提速。

## 4. 不变规则被当成每frame冷数据
120统计步：
- 实际classification冷构建67994次（566.62/步），classHits10381次。
- 67994次输出全部与同挂点上次观测一致：roles/beam/guided/alwaysAim与spec身份都没变，new/changed/specReplaced均0。早期预热已建立观察基线。
- 需要getWeaponRangePercent的实际范围表60639次，39832次为同system同tick重复相同BALLISTIC/ENERGY/MISSILE范围输出，占65.69%；同tick观察到范围输出改变0次。
- 范围表读遍布enginePrelude20807、fleetAI25567、fire-query14265次。

这些数字证明**这段窗口里重复建表/分类没有得到新的规则输出**。但不证明未来战斗或unknown callback也不变化，更不授权跨stage缓存整张modifiers：effectLevel、辅助system、parent moduleModifiers、runtimeModifiers和owner状态都是实际写/依赖入口。

Writer/consumer核实：有效武器spec在HullMods.effectiveHullModWeaponSpec与ShipWeaponControlSystem构造出口建立，当前仍声明可变；snapshot/owner/replay restore还可能通过generic decode写对象。源码检索未见当前native combat直接改这几个WeaponSpec分类字段，不等于没有外部/动态写入口。必须覆盖真实refit/restore/spec替换和允许的原地修改，不能冻结用户spec或永久WeakMap冒充revision。

## 新的优先顺序
1. **火控规则与实际阶段输入的执行层**：区分挂点创建/refit/hydrate输出的静态分类事实、动态幅能/冷却/状态和stage几何；未知可变接口继续完整原路径。目标是去掉“没有发生规则变化却重新证明/翻译”的工作，不重试失败的13字段ballistics WeakMap比对。
2. **辅助预瞄执行图**：保持60Hz响应，current精确命中优先，再按需生成全局候选；准备、搜索、精确验证分离。不能把0.968ms全部tree成本或2.483ms全部preAim直接承诺为可省。
3. craft0/1搜索与scope身份重复是后续次级问题，不再当主要根因；冷却路径必须保留真实导航/周期消费者。

本块没有提出新的降频、AI/威胁时钟、实体/挂点减少、显示ms或UI改动。尚未实现下一块生产重写、没有稳定提速/60Hz/原版等价结论。

证据：artifacts/combat-work-demand-census-20261003/result.json、summary.json、run-census.mjs、injected-source与源码hash。
