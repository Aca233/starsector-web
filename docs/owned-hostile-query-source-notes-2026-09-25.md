# 私有 Worker 敌舰查询事务：修改前对照（2026-09-25）

## 原版证据与行为边界
本轮重新读原版0.98a-RC8的ShipAPI.java:60–62（getShipTarget/setShipTarget）、ShipAIPlugin.java:15（advance）。原版API不证明Web当前的选敌算法。本轮保持现有findCombatHostile的规则：过滤vast bulk/死亡/不可见/同队，显式目标优先，其次当前目标，最后优先非战机的最近目标，严格距离平局保留原名单先后。不改UI，不进行原版可见实机操作，不宣称完整原版AI等价。

## 新证据
artifacts/worker-cost-breakdown-20260925：200舰0预热+90tick诊断，19个实际owner batches及同tick串行参考。串行AI循环11.61ms、计划3.62ms；并行pack16.63ms、wait16.33ms、validate8.70ms。发布targets查询3.75ms、校验targets查询4.19ms。wait包含同步/内核，不能重复加。诊断有计时插桩且覆盖初次trial，不作优化百分比依据。

Protocol的publish/matches分别对每艘船调用engine.findHostile，每次默认重建engine.ships，再过滤整个名单。串行native phase虽已共享phaseShips，仍为每舰重复相同team的候选过滤。值得优化的是该只读名单，不是距离缓存或多核重试门。

## 候选与稳定域
新增只在事务内存在的HostileQueryBatch，按team惰性共享hostiles及非战机名单。每次query仍实时读指定ID、currentTargetShip和所有距离，使用与旧helper相同reduce和严格<，不缓存目标结果或位置。
Engine工厂先要求已有私有Worker登记、原生Engine原型/findHostile及四个roster getter身份，取得当前名单并核对传入名单的长度/引用顺序；至少64舰、整数team、全名单通过现有hasOwnedFireControlReadHooks才创建。公开引擎/custom readers保持原调用和可观察读序，不能因Object.freeze被晋升。

生命周期有两种：
1. Protocol每次publish及matches的targets子调用各建一个独立batch，finally关闭，跨await验证不复用任何候选/权限。
2. CombatEngine现有nativeThreatPhase且phaseShips已被允许的同步AI循环，建立一次batch，追加为内部updateShipAI参数，finally关闭。现有phase代码已约束部署/破坏/生成/模块变化在循环外；原生AI只更新控制/系统/相位/位置。重新检查CapitalShipAI和注册原生ship-systems未见teamId/isDead/visibilityMask/visibilityOverflow/spec赋值；这些候选字段在本域不变，currentTarget和位置则不稳定，必须实时读。闭合Worker和原生完整hook资格是必要前提，不扩展到公开插件环境。

每次forShip还检查active、原数组/长度与成员身份。close清理成员/团队引用；不跨帧留舰船/候选缓存。所有原生资格、Publisher scalar/derived/metadata验证、版本/世代/SAB边界和owner失效/串行屏障完整保留。

## 验证和门槛
冻结当前306模块。扩展既有combat-ai：多队/高编号team可见性、死亡/vast bulk/战机优先、指定/当前/最近/平局/NaN与位置变更；通用引擎/custom getter/替换findHostile回退、关闭/外部船/名单变化。冻结旧Publisher在同Ship类/依赖下对照完整有效packet、metadata、派发后修改的matches拒绝。
集中一次typecheck、改动文件oxlint和该既有场景；测试构建计数证实实际串行phase和publish/matches复用激活，恢复入口状态一致。一次无插桩真实200舰配对（150预热+180测量）核对权威/显示/隐藏火控/RNG、精确源图。未测出实际收益则精确撤回本候选，不择优重跑，不动已保留优化和独立内容工作。不提交/发布，不改版本或占用桌面。

## 验收发现的依赖边界修正
第一版虽通过49项合同和200舰配对，但Protocol的value import把owner.worker静态加载图从2,650,051字节扩大到5,677,116字节（测试构建、未压缩）。这是具体启动成本回归，不能只看稳态均值。修正为Publisher接受可选的authority查询工厂，由OwnershipPool显式传入；Protocol对CombatEngine和HostileQueryBatch都仅作type import，直接构造的通用Publisher默认保留原路径。资格、调用顺序和finally关闭不变。保留第一版全部证据，在isolated-publisher下记录修正后的集中验证、加载边界检查及一次完整无插桩配对，不择优取结果。最终源图变化为3个既有生产模块（Engine/Protocol/OwnershipPool）+1个新模块。
