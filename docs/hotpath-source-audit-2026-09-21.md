# 多船热路径/多核成本守卫：编码前审计（2026-09-21）

> 最终状态：所有自动调度/数量策略与数组快路均已撤回。仅保留OwnershipPool可显式选2/4分区的能力与125项回归；生产默认仍4。本轮未证明默认百舰性能改善。全部反例见`combat-owner-partitions-performance-2026-09-21.md`。

## 原版证据
本机日志 0.98a-RC8，源目录 ../decompiled/starfarer_obf/com/fs/starfarer/。
- combat/CombatEngine.java:1485–1503：这一段逐舰执行 AI.advance 和 Ship.advance。不能据此声称整个原版无多线程；也没有证据支持 Web 必须强制四 Worker。
- combat/entities/Ship.java:5006–5007：isPhased 直接返回当前 phased 状态，不为每次查询分配系统列表。Web 多系统组合仍需实时查询，不能照搬一个不失效的跨帧缓存。
- combat/ai/private.java:393–422：遮挡精确逻辑基于当前武器、位置和碰撞类型。本轮不改此逻辑/频率、不削减实体、物理或防御反应。

## 当前问题 → 预期实现
- 新鲜无头百舰 CPU profile：hasNativeQueryLoop 约513ms自身采样，isPhased约371ms、allSystems约214ms（整个录制含初始化/预热；不能当帧时）。武器缓存资格审计和临时数组确有开销，不先盲改碰撞。
- CombatMulticore.record 明确排除 legacy-native；AuditedCombatMulticore.prepare 同样豁免 legacy 的成本准入。改为本地两类所有者路径共同遵守原有成本守卫，保留LAN策略。
- 每次仍执行完整权威步。串行/并行选择是 Web 宿主优化，不是游戏内AI降低频率。昂贵路线经实际样本验证后退回串行，迟滞避免每帧反复创建线程。
- 单系统 allSystems 若测试有收益，可避免无意义的空 slice+spread；返回值仍是新数组、按原顺序、实时包含当前主系统/防御系统，多系统/自定义数组行为保留原路。不改 phase 状态机。

## 验证
开始编码前已冻结当前272模块源码图。分别构建/测量调度与分配候选，不以小循环或函数次数代替完整FPS/TPS。新旧同种子全战斗状态、串行/Worker混合步骤、成本准入/拒绝与dispose、动态舰队；类型检查、范围lint、现有AI回归、普通入口无头smoke。真实rAF ABBA/BAAB及固定步分别记录；无益的候选不留在默认路径。
不改UI；原版实机因用户禁止桌面操作未做。本轮不暂存/提交/推送/发布，不使用子代理，不删除历史 artifacts。

## 追加的编码前诊断：串行追帧阻塞（在实现串行调度修改之前记录）
成本守卫+数组候选真实rAF：旧9.36FPS/9.19TPS，候选1.97FPS/7.73TPS。守卫拒绝Worker后，FixedTimestepScheduler的无限CPU追帧预算在一次绘制前执行多个重同步步，造成主线程长任务；不是开启多核成本校验就能解决。
计划把重载本地串行权威步也交给可取消的MessageChannel宏任务，与Worker路径共用CombatTickHost的pending/flush/discard生命周期。先采样输入，单一待提交步；pause/命令仍flush，dispose仍discard。每步dt/顺序不变，不修改调度器maxCatchUpWorkMs、maxSubSteps和backlog上限。阈值只依据上一完整步是否超过固定步预算，且仅大舰队。明确这是Web宿主调度，不是原版玩法改动或“整场模拟已移出主线程”。
必须同时改善/不恶化TPS及FPS，否则拒绝候选；补宏任务重入、晚回调、flush/dispose、失败回调及真实浏览器测试。先前负样本完整保留。

## 追加试验（编码前）：专用所有者的任务粒度
成本守卫及宏任务串行方案尚未获得整体收益，撤回这些候选，不改变默认scheduler/权威事务。保留证据，不能以“可以画更多帧”当成提速。
接着单独测量默认Onslaught专用codec的两Owner分区：当前固定4份只读世界重建和同步，其prepare/merge开销不随kernel下降；原版证据没有固定四线程要求。只调整本地专用tier，通用/LAN仍按既有策略。分区内预测+权威原序commit不变，验证同seed全状态和实际FPS/TPS，再决定是否保留；不得仅因线程数更少就宣布更快。

## 两Owner资格入口补审计（修改前）
OwnershipPool构造器本地分支明确count!==4直接拒绝，先前browser-two测试实际是serial，不可用作线程数量性能结论。Protocol、分区和commit没有四分区常量；分区仅决定每个独立owner预测哪些ship，权威仍按原序提交。候选仅允许本地count=2或4（默认构造参数仍4），完整supportsOwnership不变，LAN原有1–4检查不变。补实际workers=2且commits>0断言；全状态一致性、失败/释放及真实性能不过则还原。

## 数组候选回退
补充兼容性探针发现多系统自定义constructor getter被候选读取两次，原实现只读取一次。135个普通/自定义slice/species/iterator用例通过不足以覆盖该副作用。为保持扩展契约，撤回整个allSystems候选，不用微基准收益掩盖行为差异。接着独立构建two-only（只改变本地Owner数量和对应入口），重新测全状态/FPS/TPS。

## 大舰队补测后的收窄（修改前）
50/74/200舰各120步、4检查点全部一致；200舰固定步两Owner228.91→252.86ms，约10%回退，不能继续把所有50–200本地专用舰队默认改成2。按每Owner至多约50舰的分区粒度收窄：50–100用2，更大沿用4，通用/LAN不变。50/74固定步也略慢（34.98→35.96、59.27→61.69ms），还须补实测rAF/TPS；不推广百舰结论。

## 最终策略回退
50舰真实rAF补测：原四Owner两次TPS3.73/3.79，两Owner3.66/3.00；FPS29.23/27.68→28.32/31.52，不能以多画帧掩盖TPS回退。74舰也受明显波动影响（原2.53/8.78TPS、候选3.60/10.00），不支持按单一舰数固定选2。撤回AuditedCombatMulticore全部自动数量修改，与起始源码完全相同。只保留OwnershipPool经完整资格与状态验证的可选2/4分区能力，构造默认值和生产入口均仍4。125项回归相应明确默认不变；本轮不声称默认百舰性能改善。
