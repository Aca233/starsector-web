# 战斗残骸物理碰撞（残骸×残骸 / 舰船×残骸）排查与实装记录

## 1. 现状与原因排查

此前 Web 战斗中残骸（`HulkFragment`，存放于 `engine.fxSystem.hulkFragments`）无碰撞的原因如下：

1. **残骸 × 残骸（`HulkFragment` vs `HulkFragment`）未实现检测**：
   - [`src/engine/simulation/systems/GravityTerrain.ts`](../src/engine/simulation/systems/GravityTerrain.ts) 仅遍历 `hulks × ships`，没有任何 `hulks[i] × hulks[j]` 的多边形碰撞检测与冲量/分离解算。
   - [`src/engine/simulation/systems/CombatFXSystem.ts`](../src/engine/simulation/systems/CombatFXSystem.ts) 的 `updateHulkFragments` 仅积分残骸位置/朝向并推进裂片切割（`updateHulkBreakups`），不进行残骸间碰撞。
2. **活舰 × 普通残骸（`Ship` vs 非引力受控 `HulkFragment`）被门控跳过**：
   - 舰船死亡后标记 `ship.isDead = true`，[`src/engine/simulation/systems/ShipCollisionSystem.ts`](../src/engine/simulation/systems/ShipCollisionSystem.ts) 第 111 行直接跳过 `s1.isDead || s2.isDead`。
   - [`src/engine/simulation/systems/GravityTerrain.ts`](../src/engine/simulation/systems/GravityTerrain.ts) 第 40 行存在门控 `if (!h.gravityManaged && !h.gravityFixed) continue;`，导致只有正在被重力战列舰牵引或锚定的残骸才会与活舰发生碰撞，普通战场残骸完全被跳过。

---

## 2. 原版依据与最小对照（Starsector 0.98a-RC8）

| 维度 | 原版证据（`../decompiled`） | 原版行为 | 实装后 Web 行为 | 验证状态 |
| --- | --- | --- | --- | --- |
| 残骸碰撞层级 | `combat/entities/Ship.java:4446-4452, 4835-4836` | 非舰载机本就是 `CollisionClass.SHIP`；死亡转 `isHulk = true` 后保持 `CollisionClass.SHIP` | 非 `FIGHTER` 残骸（`HulkFragment`）参与活舰×残骸与残骸×残骸刚体碰撞 | 已核实源码 + Node 验证通过 |
| 残骸裂片实体与质量 | `combat/entities/Ship.java:515-805` (`splitShip`)、`combat/entities/H.java:108-140` | 裂片 `ship2 = this.clone()` 仍为 `CollisionClass.SHIP`；按面积比例分配质量，切开时给 `ship2` 叠加 `0.5f` 速度差 | `resolveHulkCollisions` 按多边形面积比例计算有效质量与转动惯量 $I = \frac{1}{4} m r^2$ | 已核实源码 + Node 验证通过 |
| 残骸×残骸、舰船×残骸刚体碰撞 | `combat/E/oOOO.java:66` (`SHIP` vs `SHIP`)、`combat/E/A/ooOO.java:23-106, 272-329` | 1. 接触点力臂+转动惯量解算线速度冲量与角速度变化；<br>2. 持续重叠时沿质心连线按对方质量占比施加分离推力 | `resolveHulkCollisions` 实现 `surfacePairContact`（防深穿背面法线反转）、质量加权位置分离、刚体线性+角速度冲量与重叠平滑分离推力 | Node 定向验证 + `tsc --noEmit` + `oxlint` 通过 |

---

## 3. 实装内容与验收结果

1. **代码修改**：
   - [`src/engine/simulation/systems/GravityTerrain.ts`](../src/engine/simulation/systems/GravityTerrain.ts)：保留原 `advanceGravityTerrain`（维持既有引力残骸及 Rust 模块对齐契约不变），新增 `surfacePairContact` 与 `resolveHulkCollisions(dt, ships, hulks, fx)`：
     - **普通残骸 × 活舰**：对所有非 `FIGHTER`、非 `gravityManaged/gravityFixed` 的普通残骸执行与活舰的护盾/多边形接触检测、质量加权位置分离、接触点线速度+角速度冲量传递，以及高速撞击（`closing > 20`）时的动能伤害结算。
     - **残骸 × 残骸**：对所有非 `FIGHTER` 残骸两两执行多边形接触检测（剔除深穿时指向背面的伪法线）、质量加权位置分离、含力臂转动惯量的刚体线速度+角速度冲量，以及重叠状态下的平滑分离推力（使刚切开的同源裂片及相撞残骸自然推开并产生旋转）。
   - [`src/engine/simulation/CombatEngine.ts`](../src/engine/simulation/CombatEngine.ts)：在 `fixedUpdate` 中紧随 `advanceGravityTerrain` 调用 `resolveHulkCollisions(dt, allShips, this.hulkFragments, asteroidFX)`。
2. **验证记录**：
   - `npx tsc --noEmit`：0 错误。
   - `npx oxlint src/engine/simulation/systems/GravityTerrain.ts src/engine/simulation/CombatEngine.ts`：0 警告、0 错误。
   - Node 定向物理验证：覆盖浅层/深层重叠的**残骸×残骸**碰撞反弹与角速度产生、**同源裂片**切开后持续分离、**普通残骸×活舰**碰撞动量交换与动能伤害，全部断言通过。
   - 未运行原版实机桌面对比（按约定不占用桌面窗口）。

---

## 4. 引力系统与残骸碰撞 CPU 热点优化

### 问题定位
1. [`GravityTractor.ts`](../src/engine/simulation/systems/GravityTractor.ts) 的 `candidates()`：
   - 在判断距离 `point.distanceTo(pos) <= radius + tolerance` 之前先调用了 `resolveGravityBody()`，内部通过 `.find()` 二次遍历数组（弹丸/陨石/残骸较多时退化为 $O(N^2)$），且对每个残骸每次都通过 `.map(([x, y]) => new Vector2(x, y))` 分配数组计算源舰多边形面积。
   - 当 `ai === true` 时，AI 只捕获敌舰，但原逻辑仍遍历并构造了全场所有陨石、残骸和弹丸的 `GravityBody` 后再丢弃。
2. [`GravityFieldPhysics.ts`](../src/engine/simulation/systems/GravityFieldPhysics.ts) 的 `advanceGravityFields()`：
   - 只要场上有引力武器（即使处于 `IDLE` 且无激活的 `emitters` 区域引力场），每帧仍无条件构建 `bodies` Map 并对所有陨石和残骸调用 `resolveGravityBody` 构建 `environments`（而 `bodies` 与 `environments` 仅在 `emitters.length > 0` 时使用）。
3. [`GravityTerrain.ts`](../src/engine/simulation/systems/GravityTerrain.ts) 的 `resolveHulkCollisions()`：
   - 无残骸时可立即早退；源舰多边形面积可直接用元组叉积计算，无需每次 `.map` 分配 `Vector2`；残骸世界坐标顶点可在外层预计算并在位置分离时同步平移，避免在内层循环重复旋转分配。

### 优化方案与验证
- 在**完全保持原有物理数值、判定条件与平局排序不变**的前提下：
  1. `GravityTractor.ts`：抽出直接由实体引用构造 `GravityBody` 的辅助函数（免除二次 `.find()`）与零分配元组面积计算；`candidates()` 在 `ai === true` 时跳过非舰船集合，并在构造 `GravityBody` 前先做半径距离粗筛。
  2. `GravityFieldPhysics.ts`：仅当 `emitters.length > 0` 时构建 `bodies` 与 `environments`，并直接由实体引用构造 `environments` 项。
  3. `GravityTerrain.ts`：`hulks.length === 0` 早退、零分配元组面积计算及外层顶点缓存。
- 验收：`tsc --noEmit`、改动文件 `oxlint`、既有 `gravity-v6-scenarios` / `gravity-v8-scenarios` 及残骸碰撞验证通过。

---

## 5. `万有引力 · 潮汐攻坚` 团战 20Hz（~57 ms/帧）瓶颈定位与消除

### 问题复现与分阶段剖析
在用户反馈的 `万有引力 · 潮汐攻坚` 场景（场上 4 艘存活 `万有引力号` + 3 具聚拢的 `万有引力号` 残骸）中，仿真频率降至 `20 Hz`（单帧耗时 **~56.7 ms**）。通过分阶段剖析定位到：
- `万有引力号`（`gravity-battle-art.json`）的碰撞多边形 `bounds` 含有 **277 个顶点**（普通原版舰船通常为 20~50 个顶点）。
- 单帧 **56.71 ms** 中，`terrainStatus` 阶段占 **52.99 ms（93.4%）**，其余全部 AI、弹道、光束、尾迹与舰船碰撞合计仅 **3.72 ms**：
  - `advanceGravityTerrain`：**23.66 ms/帧**
  - `resolveHulkCollisions`：**25.40 ms/帧**
- **直接原因**：
  1. `polygonContact` 与 `surfacePairContact` 在外接圆重叠后直接对双方 277 个顶点逐一调用 `getHullCircleContact(surface, p, 0)`（每次内部遍历 277 条边同时计算射线奇偶交叉与点到线段最近距离 projection），单对多边形即执行 $2 \times 277 \times 277 = 153,458$ 次边投影。
  2. 当两具细长舰体/残骸外接圆重叠但多边形未接触时，`best` 为空，落入双层边相交循环（$277 \times 277 = 76,729$ 次 `intersection`），且原 `intersection(a, b, c, d)` 每次调用无条件分配 3 个临时 `Vector2` 对象（单对非接触多边形每帧产生 **23 万次堆分配**）。
  3. `GravityTractor.ts` 的 `hulkHit` 在检测牵引视线遮挡时未先做残骸外接圆粗筛，每次直接旋转端点并遍历残骸全部 277 条边。

### 优化方案（零行为差异）
1. **世界坐标 AABB 交集框（Overlap Box）粗筛**（[`GravityTerrain.ts`](../src/engine/simulation/systems/GravityTerrain.ts)）：
   - 在 `polygonContact` 与 `surfacePairContact` 中先计算双方世界坐标顶点的 AABB 交集框 `[oMinX, oMaxX] × [oMinY, oMaxY]`；若无交集直接返回 `undefined`。
2. **零半径点内含前置过滤（`pointInsideSurface`）**：
   - `getHullCircleContact(surface, p, 0)` 在 `circleRadius === 0` 时仅当点在多边形内部（`inside === true`）才会有 `penetration > 0`。
   - 对落入交集框内的顶点，先执行零分配的局部坐标 AABB 与射线奇偶内含判定；仅当 `inside === true` 时才调用 `getHullCircleContact(surface, p, 0)` 计算最近边界点与法线，跳过 99% 外部顶点的 277 边距离投影计算。
3. **零分配线段相交与交集框剪枝**：
   - `intersection(a, b, c, d)` 先做线段 AABB 排斥并改用标量运算，仅在真正相交时构造返回点（消除每对 23 万次临时 `Vector2` 分配）。
   - `crossings` 外层循环先过滤不与交集框重叠的边，避免进入内层循环。
4. **`advanceGravityTerrain` 顶点与舰船外接半径复用 + `hulkHit` 外接圆粗筛**：
   - `advanceGravityTerrain` 外提残骸顶点旋转并在推开时同步平移，复用 `tupleBoundsArea`；`GravityTractor.ts` 的 `hulkHit` 先做外接圆粗筛再测多边形边。


