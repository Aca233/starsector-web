# 依赖组武器威胁粗筛：实施前（2026-09-27）

## 原版与现有证据
本机0.98a-RC8反编译 combat/ai/private.java:237–265 使用空间候选→阵营/可见性→range→intercept/arc。这里只借鉴保守空间粗筛；Web多秒防御预测并非原版算法的逐字移植。无UI/玩法规则变更，无原版实机验证。本轮重新冻结当前非campaign源图，差异见baseline.json；保留其它任务修改。
前轮warm120模块AI在572104次单源recovery查询中，566241次随后被单舰包络拒绝（98.975%）。仅少读recovery未过3%门槛，已撤回。本轮不恢复该重排：目标是跨observer共享整组边界，减少源循环和get调用。

## 方案与合同边界
新增默认关闭VITE_AI_GROUP_THREAT_BOUNDS，仅在既有private Worker owned-interleaved阶段使用；普通world/exact-only无新权限。复用parent/sourceCarrier连通组，懒建位置AABB、速度分量min/max、最大range+muzzle与maxSpeed。h有限非负，observer坐标/速度/radius有限且radius非负；速度/range非负有限才可拒绝，异常/溢出失败即原名单。用AABB Chebyshev最短距离，与 radius+h*max(1,maxSpeed+maxAbsRelativeVx+maxAbsRelativeVy)+maxRangeAndMuzzle 比较，加1e-5相对坐标/算术余量（大于既有1e-6单源余量）。拒绝必须蕴含既有单源拒绝，不替换剩余精算。
相同队伍整组跳过；混合或异常队号不按队排除。空武器组只有全部get有效且无挂点才排除。projectile/beam仍先走实时原路径。候选按输入roster原顺序，不按组重排；因ships getter返回新数组，核对逐项身份及顺序而非引用。名单新增/减少/重排回退。
前移读取需要原生读者身份与纯数据闭域审计：visibility、phase、flux恢复、shield、motion、系统统计/range等；未知回调/原型/实例覆盖不获新权限。不缓存资格命中。runtime effects/外部phase等不合格，入口拒绝；已审计原生writer不能更换方法/数据描述符/拓扑，invalidate后重查family活动钩子与runtime；失去许可关闭新粗筛至本阶段结束。每次AI和ship.update后原有family invalidation同时清除组边界。close及异常finally清除派生状态。直接修改后不invalidate不属于此内部owned API合同。
所有优化仅临时派生缓存，不新增网络/战斗权威状态，不降低Hz/精度/实体/画质，不放宽过载保护。

## 预登记验收（不得事后降门槛）
集中一次typecheck、三生产文件lint和相关差分合同：真实init/reinit/default176实体734武器；组复用/顺序/父子载机失效、退场/换队/名单变更；距离/速度/系统/护盾/极值；未知读者/runtime/异常/close/exact-only；真实projectile/beam/weapon预测；60步完整状态与隐藏tracker/RNG；20/270步无插桩状态和非计时源扫描计数。仅具体失败定向修复复查。
正确性通过后唯一A0/B1/B2/A3隐藏独立Node，每臂150热身+120完整fixedUpdate；2玩家+20AI三舰循环，seed917、3200DP，四既有实验A/B同开。两组分别至少省5%，终态相同才保留。否则核对全部写集SHA、归档后按before精确回退，保留写集外并发修改。不重测择优。通过才一次既有完整双无头浏览器（同一门槛与功能场景，不冒充已改善Hz/P95）。不提交/推送/打包/发布。

## 首次验证后的定向修复
首次typecheck/lint通过，9合同中6项明确报告粗筛未启用。原因：weapons实际为Ship.prototype原生getter，不是own数据字段。改为验证getter身份，并继续检查weaponControl字段；补入传递读者crMovementMultiplier、externalDamageTakenMultiplier、EngineController.disabledFraction、hasExactThreatPhaseAI。未运行性能计时。首轮另外3项虽通过但未覆盖活动新路径，不能作为候选正确性证据；冻结v2后重查同一九合同，不运行无关全套。旧工件保留。

v2：新路径已真实启用，8/9合同通过，完整270步状态一致。剩余组合同错误地断言初始h=3应零候选，真实长程挂点保守界保留23个源是允许的；改为断言筛选严格减少源、复用不重复构建与预测一致，不改算法/性能门槛。仅重跑该组合同，并补入同域射程/速度/护盾/可见性/退场变化对照；生产v2字节不变。

最终裁决：v2九合同有效通过，但唯一ABBA两组分别慢4.6707%/1.7130%，失败撤回三个生产文件。回退时保留三个写集外并发修改；无浏览器新结果。详见同前缀result文档。
