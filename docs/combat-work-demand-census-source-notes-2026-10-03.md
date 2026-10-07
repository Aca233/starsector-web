# 实际工作需求普查 — 2026-10-03（先于探针）

原版目标0.98a-RC8；C:/starsector-core、C:/decompiled仍不存在，原版源码/界面/实机待核实。本块只统计Web已存在执行链，不改规则/UI/生产文件，不降频、改dt、缩减实体/挂点或改ms。无桌面、子代理、生涯、提交/发布操作。

## 最小对照
- 证据：FlightDecisionRoster.fireShips=allies+target；NumericAcquisitionTree.query直到leaf才members过滤。ShipWeaponControlSystem.planFire在aim/decide之后检查cooldown；AutofireController.decide先trace/obstruction再ammo迟滞/flux budget。
- 假设1：许多0/1合法目标查询仍付出全敌方树搜索；需统计实际目标基数、节点/叶访问/输出行，分root/module/craft及preAim/scan，不能按源码形状直接声称是大头。
- 假设2：冷却挂点仍执行完整安全预测；需区分idle/charging/burst/active beam与最终fireRequests（不是实际发射），统计diag reason、ammoAllowed写、资源门禁/组调度消费者。不能直接early-continue或把不同角度trace算重复。
- 假设3：静态classification/范围表重复输出，不等于跨阶段缓存权限；观测同挂点分类输出、spec身份、同system range输出及stage，限定为观测，禁止伪造revision。

## 方法
复用同一个seed917 standard 2玩家+20AI/734挂点，150warm+120统计。esbuild onLoad在原方法BODY内插入旁路计数，不替换原型/方法，不跳过原操作/修改返回对象/RNG。一次270逐步与已冻结当前接受bundle对照全原始快照、全部AI/defense与autofire tracker/RNG。源码hash前后不变。

计数证据是主结果。BODY计时含计数、调用栈/时钟与probe分配开销，只作调用分布诊断，不能当性能收益或准确可节省ms；相关uninjected CPU上界复用root-cost既有profile，包容数字不能相加。本块不做ABBA优化候选或浏览器验收，不重跑静态全套（无生产更改）。

## 普查完成
实际270逐步快照/双RNG、全部AI/defense与autofire tracker/per-mount RNG对照通过，六个生产文件hash前后不变。0/1 craft占6.11%树查询、cooling decide占4.00%，两个假设降级；冷却fireControl有真实导航/周期/owner-codec消费者。更密集的是NO_TARGET之后1.5range逐步精确preAim与输出不变的classification/范围表重建。详见combat-work-demand-census-results-2026-10-03.md、artifacts/combat-work-demand-census-20261003/summary.json。没有生产优化候选或提速结论。
