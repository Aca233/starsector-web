# 弹丸碰撞实际执行图审计 — 2026-10-03

## Source notes / 范围

- 已先读 `docs/combat-root-cause-brainstorm-2026-10-03.md`、`docs/combat-root-cost-results-2026-10-03.md`；不重复武器分类生命周期，不进入主代理负责的 ThreatAssessment / WeaponThreat* / DecisionReadPlane / census 脚本。
- 只轻量读取源码和已有 root-cost JSON；只新增本文件，无生产修改、helper、测试、构建、bench、桌面、生涯或发布操作。
- 原版目标 **0.98a-RC8**；`C:/starsector-core`、`C:/decompiled` 已在本任务确认缺失，原版源码/实机/UI **待核实**。原版证据 → 预期 → 当前差异 → 验证：没有原版来源；本块目标仅保持现有 Web 弹丸顺序/最近接触/穿透/最终射程段；差异是已存在有序接触查询重复准备/重复求解；后续由主代理在既有场景验证完整状态/RNG与独占计时。本报告不是原版等价或提速验收。
- 下述文件路径均以 `C:/starsector-web-master/` 为根；行号为本次读取版本。

## 1. 直接回答：哪些重复成立，哪些不成立

| 问题 | 源码结论 |
|---|---|
| 一颗弹丸每步都先重建 ship index？ | **否**。`WeaponSimulationSystem.updateProjectiles:49–64` 每次调用先统一 `prepareShipCollisionFrame`；`ProjectileCollisionHandler:60–62` 一次rebuild全ship grid。之后各弹丸query同grid。即使0弹丸、全mine/disabled，本入口也先建ship grid：这是确定的无消费者准备分支，真实占比未测。 |
| build后每个query再完整native资格反射？ | **否**。此链无全实例descriptor/prototype/nativeMember审计。query滤source/damaged/team/dead/collisionless（handler:105–118）；kernel的`canUseWasm:232–239`只逐候选检查bounds长度，不是native证书。不要把其它执行域的资格问题套过来。 |
| 发生fallback后又全世界扫描？ | **不一般成立**。TS backend扫描query已有候选，不自动重扫allShips。ship grid未prepared时createRuntimeQuery才退到allShips，但标准入口早已prepare。interception另有明确线性fallback，见第3节。 |
| circle后polygon是不是重复同一碰撞？ | **通常不是**。TS对每候选先shield circle，再hull polygon，是不同表面；无bounds hull circle与polygon是互斥分支。wreck的distance-to-segment circle是保守gate再polygon，不能删除精确轮廓。真正重复来自同段ship query被多个消费者分别求解。 |
| 普通ballistic一直以大批运行？ | **不保证**。只要`hasMissiles`为true，普通bullet也进209–213行拦截段，**先flush之前的ship批次**，再查是否实际碰到missile。连续普通bullet之间可被逐个flush，batch size退化到1，Wasm阈值8永远到不了；实际发生比例未测。 |

## 2. 实际执行图 / 重复接触查询

### 每次 updateProjectiles

```text
创建 interceptionIndex（此刻没有建grid）
→ 包装真实explosion入口：每次spawn均invalidate interception
→ explosions.update
→ allShips / hasMissiles一次some扫描
→ shipIndex.rebuild(allShips)，与是否存在实际ship collision需求无关
→ 降序遍历projectiles，保持发射/伤害的原顺序
  → 非batch特殊弹先flush之前普通弹
  → mine/生命周期/移动/disabled等门禁
  → 近炸：更新当前missile，queryRadius；有真实爆炸则invalidate
  → missile interception：先flush，再query；实际命中后invalidate，可继续穿透
  → terrain选择：wreck/asteroid preview；存在候选才flush并重新preview
  → 求shipT与terrain比较；terrain穿透改变剩余段、伤害，继续重新查询
  → 普通弹排入batch，特殊弹立即checkShipCollision
→ 最终flush剩余普通弹
```

具体来源：`WeaponSimulationSystem.ts:49–105,171–228,230–301`。

### A. 拦截遮挡预查丢失结果 → 正常ship collision再求解

`ProjectileCollisionHandler.checkMissileInterception:331–356`：先按原序扫描missile candidates并选择最近t；**没有实际missile contact时立即return**，不会做ship blocker。这部分已是按需，不应重做已存在的优化。

若存在nearest missile，349行 `findHits([createRuntimeQuery(p,ships)])` 求完整最近ship hit，仅用`t`作遮挡；若missile在ship/terrain后则356行return null，丢弃已计算的ship命中记录。主循环继续terrain/normal ship路径，再做同段查询（`WeaponSimulationSystem:241,277,282`）。这是确定的重复求解路径，不代表每颗弹丸都走到这里。

### B. terrain比较丢失命中记录 → 同段ship collision再求解

`WeaponSimulationSystem:235–241` 先wreck/asteroid preview；有障碍才flush并重复preview，再 `findShipHitParameter`。后者（handler:394–395）实为完整`findHits`，不是cheap bounds t。

当ship更近，260行break，不改剩余段，随后277/282行重新提交ship collision求解：**full hit先投影成number再被丢弃**。若没有真实terrain候选，此比较不发生。若terrain真的命中/穿透，`applyEnvironmentImpact`可触发effects/explosion；263行还改变prevPos，这时后续重新查询是必需的，不能复用旧hit。

两次wreck/asteroid preview分别在flush前后（235/239），flush可改变世界/弹丸，不能无条件删除第二次。仅在pending batch为空且几何调用native无副作用时两次preview才有可合并证据；generic callback不得假定pure。

### C. batch内接触后的重算不是无条件重复

`ProjectileCollisionHandler.checkShipCollisionsBatch:72–94` 先批求hits，然后按原顺序施加伤害。较早impact可能死亡/盾过载；83–89行对失效hit过滤当前候选，走TS重新找最近。这是有具体失效理由的requery。`checkShipCollision:427–436` 的循环处理void shield崩塌/穿透后同段继续接触，也不能删除。

## 3. 两个index的真实成本 / 失效

### ship grid：`SpatialShipIndex.ts`

- `rebuild:20–58` 每次清空grid，O(S) live资格读取 + O(所有入格ship bounds顶点) hull extent reduce + 每个覆盖cell插入ordinal。shield未开启也以radius/offset覆盖，利于shield变化时保守候选；当前dead/collisionless会被排除。
- `querySegment:65–113` 扫segment AABB覆盖cells，以visit epoch去重；稀疏分支sort原ordinal并map回Ship，密集分支**扫描所有S个visitMarks恢复原顺序**。这个O(S) recovery不是fallback窄相位重扫，不要混称“索引没用”。
- handler `createRuntimeQuery:105–118` 又分配`.filter()`数组并读取候选活的dead/collisionless等；`RuntimeCollisionKernel.findHitTypeScript:217–229`再次遍历过滤结果，shield/hull各求一次。`applyShipCollisionHit:440–442`再读live资格是commit保护，不与读取阶段无条件等价。
- `SpatialShipIndex.isPrepared:61–63`只是bool，没有owner/roster/pose revision、close或碰撞后失效。正常流程每步重建；准备期间native死亡/盾关闭可被live过滤覆盖，但自定义on-hit teleport、phase解除使此前被排除ship重新可碰、插入ship等**没有本链显式grid refresh证据**。不能因此假定整步geometry immutable，更不能加跨tick缓存。

### missile grid：`ProjectileInterceptionIndex.ts`

- `new`在每步50行，但grid **lazy**：`query/queryRadius:119–145`，少于64弹丸直接用原array；query几何不合法/覆盖cells>4096也用原array（23–28,141–145），duplicate-object导致linearOnly同样fallback。普通query还排除flare/didDamage/不追指定projectile的rocket；radius query不能复用这组语义。
- `rebuild:91–115` 即使保留未变bucket，也重新扫描**整个P个权威弹丸**，只为isRocket建entry；不是只扫描一次可永久复用。每次真实hit/fuse/MIRV/explosion invalidate后，下一合法indexed query再做O(P)扫描。
- 普通remove是69–73行增量维护sourceLength，update是78–89行更新surviving missile cells；不需把每次普通bullet删除都描述成full rebuild。命中后invalidate是215行明确effects边界，不能凭“看起来只删一个missile”取消。
- `queryCells:146–156`为候选建立Set、sort原弹丸order、map回对象。它查询的是**当前missile center extents**，窄相位341行segment-circle则test swept shot；不同用途不是重复同一circle。

## 4. Kernel backend与geometry证据

- `RuntimeCollisionKernel.ts:92,106–109,156–190`：batch>=8、Wasm ready、所有候选有polygon才使用Wasm。构造auto-load还要求`typeof window !== 'undefined'`；真正dedicated Worker和Node没有window，本次检索仅找到构造auto-load与函数定义，没有生产显式loadWasm调用。**所以Node无头场景/dedicated Worker默认应为TS，不能以Wasm包装成本解释其高ms；用户浏览器实际backend需telemetry核实。**
- TS `findHits`对即使单颗也执行2次reduce统计、queries.map、hit数组及telemetry时钟；single-shot消费者调用的是`findHits([query])`，不是直接nearest接口。没有证据量化这些小分配/时钟各占多少ms。
- TS `findShieldHit:241–267` circle roots + arc；`findHullHit:271–305` polygon包含点/边相交。后者先创建两个local Vector2，然后才检查有无bounds；无polygon的circle fallback里这两个local向量未使用。这是native纯geometry路径可删准备，但native舰通常有bounds，其规模/收益未测，**不列为主方案**。
- Wasm `canUseWasm:232–239`按候选pairs遍历bounds；`findHitsWasm:355–403`随后重新收集unique ships/spec outlines、flatten polygon、再次reduce hull extent（390–393）。ship grid build也算过extent，但未传给kernel。这是**不同batch重复准备**，不是每颗完整native资格。当前默认TS未执行，故不能声称这是本场主因。

## 5. 现有工作量证据与缺口（不新增探针）

复用 `artifacts/combat-root-cost-audit-20261003/audit-summary.json:1–20`：seed917、150warm+120sample、带profiler整步37.517ms，**projectilesBeams合计2.902335ms/步**，含guidance/beam/其它弹丸工作，不是这段碰撞的独占CPU，也不是当前无profilerABBA。仅此域全部移除也不足以解释/解决约35ms→16.67ms的缺口。

`current-hotspots-summary.json:323–325` 最后一刻170entities/90projectiles仅是一个terminal sample，不是平均碰撞规模。root-cost的7090.8 projectileRows/步是**独立防御消费者遍历**，不等于物理弹丸collision query数；本报告不挪用这个数字。

**尚无计数证据**：batch大小分布/hasMissiles逐弹flush次数、ship query次数及重复同segment次数、平均cell/candidate/outline edges、dense recovery比例、interception rebuild/fallback次数、terrain blocker分支比例、zero-projectile rebuild频率、实际Wasm backend。因此只能给源码机制与成本式，不能给节省ms。

成本式（每步）：ship grid `O(S + ΣV + 插入cells)`；query `O(访问cells + touched/sort 或S恢复 + C过滤 + Σcandidate edges)`；interception full rebuild `O(P)`乘实际invalidations后的首次query数；有consumed/expired的flush还在 `WeaponSimulationSystem:78–90`扫完整live P数组删除，否则已有early return，不是每flush都全P删除扫描。

## 6. 最有希望的一个结构修正：**有序单弹接触事务，不把完整hit退化成t再重求**

建议优先切片为 **`ProjectileContactWork`（当前弹丸、当前剩余段、当前同步接触span的私有执行记录）**，不是跨弹丸/跨stage缓存，也不是WeakMap或反射wrapper：

1. 给单颗TS查询真实direct nearest入口：index产出原ordinal顺序的候选序号到私有scratch；把现有source/team/damaged/live过滤与nearest shield/hull求解放进一个直接循环，避免`Ship[]→filter Ship[]→RuntimeQuery[]→map hit[]`链。保留原顺序、strict `<`平局、shield/hull两个不同表面；真正batch/Wasm另走原batch入口，不将single硬塞成size1 batch。
2. 当前contact work **lazy求一次完整nearest ship hit**。missile遮挡、terrain排序、最终ship处理消费同一个`RuntimeCollisionHit`，不经`findShipHitParameter`丢掉除t以外的信息；这属于显式数据流传递，不猜对象身份命中。
3. 只复用**没有实际写/未知callback介入**的连续同步span。missile/terrain真实impact、damagedTargetIds变化、剩余segment变化、shield collapse/death、pending batch apply、未知on-hit/explosion/geometry callback都结束work；新段重新求解。generic getter/overrides保持原调用语义，不拿ownForWorker作安全证书。
4. 必须保留现有flush/伤害/生命周期次序。普通弹如果仍需deferred batch，不能提前commit来省查询：下一颗guidance/target读能观察伤害。只有延后期间已证明无可达geometry writer才携带prepared hit，否则在原flush点求解。**第一版可只覆盖非batch弹中blocked interception→无terrain写→最终ship commit的同步连续路径**，再根据真实重复计数扩大，不急着重写所有batch。
5. lazy建ship index作为同一需求入口的小配套：只有实际请求ship接触才build；zero/all-disabled/all-mine场景不准备。不能因Wasm不可用就删ship index，TS同样消费它；当flush effects改变可入格集合/pose则重建，未知能力不授予跨effects geometry复用。

### 为什么选它，而不直接删除hasMissiles flush

- 源码已明确出现同段full hit被投影成t并丢弃；可以用函数返回值/结构化执行记录改变执行图，无需WeakMap或新反射证明。
- 真实Worker/Node默认TS，single direct path有实际消费者；只优化Wasm packing很可能优化不到当前计时域。
- `hasMissiles`导致batch串行化虽更显眼，但pending较早ship hit可以通过death/on-hit/explosion影响后续missile资格/pose。**在拦截query前简单跳flush，或先query得到empty再当作无影响，都无正确性证据**（pending effect可能生成/移动missile）。重写barrier需要effect写域证据，当前不应抢先落地。
- 此方案仍是候选，不保证正收益；初始切片命中占比可能低。主代理若后续只加一个轻量计数，最有价值的是 `missile blocker full query / terrain full query / final ship query / 同段无写重复` 与batch size分布；本次不运行或编写census脚本。

**最终状态**：源码执行链、可删准备分支、不可删接触后重算、fallback边界已定位；具体比例/独占时间/原版行为仍待核实。仅本审计文档，无生产更改或性能结论。

