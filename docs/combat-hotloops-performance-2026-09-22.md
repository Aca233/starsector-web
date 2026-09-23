# 战斗热循环优化验收（2026-09-22）

## 范围和结论边界

**结论：本轮缓存候选未通过整体性能验收，生产索引已精确恢复到本轮开始前的版本。没有启用该缓存，也没有撤回此前其它已保留的优化。**

本轮仅在 `src/engine/simulation/collision/ProjectileInterceptionIndex.ts` 上试验。不是重写全套架构，也没有重新接入此前被否决的共享获取目标网格。以下是候选实现的范围，不是当前生产代码状态。

- 复用现有导弹索引条目的数字坐标/半径及格子范围，避免在未改变时重复分格、分配数组。
- 权威数组、`pos.x`/`pos.y`/`radius` 的读取顺序和未知效果的失效重建保留；非数字坐标仍执行原有转换。
- 全部唯一条目已访问且本轮没有重入/删除时，省去第二遍 Map 清扫；其他情况保留完整清扫。
- 缓存数值列用 NaN 初始化。清扫快捷路径增加删除代数守卫，修复已复现的 getter 反例。
- **没有减少舰船/弹丸/特效，没有降 AI/物理更新频率，没有放宽目标扫描周期，没有修改 Worker 数量或调度预算。**

原版依据和改动前审计见 `combat-hotloops-source-audit-2026-09-22.md`。此次没有 UI 变更，没有原版实机验证；全部浏览器测试为后台无头测试。

## 对照方法

- 在既有工作区版本上冻结 272 个模块作为 `before`，不是以 Git HEAD 或此前的 47.55/274.71ms 当基线。
- 每个候选均复用同一份其余模块，只替换本轮拥有的索引文件，防止并行工作的其他改动污染对照。
- `paired.mjs` 运行真正的 `CombatSession.fixedUpdateControlled`、视觉更新和 WebGL 渲染；每步交替前/后执行，另做执行顺序及 iframe 位置反转。
- 240 步包含 60 步预热，统计后 180 步；混编 120 步包含 60 步预热，统计后 60 步。每 30 步比较完整可序列化引擎/玩家 AI/火控跟踪状态。只排除墙钟诊断及空间查询访问标记。
- 混编以 100 艘初始主舰为测试输入，运行时 ships 集合峰值为 300（含后续生成单位），弹丸峰值为 376，前后完全一致；不是删掉生成单位后的“100 个总对象”测试。
- 100/200 艘 Onslaught 必须在第 60 步检测到 **4 个实际 Worker 及成功提交**。24 舰按既有阈值自然走串行。Odyssey/Paragon 混编保留既有资格判定，本轮实际为串行，未强制禁用 Worker。
- 固定步表的“固定步+视觉”不包含渲染，不是 FPS。弹丸/光束阶段也不等于索引函数独占时间。
- 真实 rAF 测试使用生产 `FixedTimestepScheduler`，预热 60 步，再测 15 秒墙钟；FPS 与 TPS 分开记录。包含 WebGL，不包含 React/HUD/音频，不能当作完整客户端帧率验收。
- rAF 用 ABBA/BAAB 顺序，记录整机负载和事件循环延迟。整机负载不是 Worker 利用率，也不足以证明哪项回归由后台进程引起；没有干预用户的其他进程。

## 候选演进（必须区分构建）

- `cells`：最初缓存版，未省第二遍清扫。
- `cells-sweep`：加清扫快捷路径，但缓存数值字段初始化为 undefined，200 舰结果明显变差，不保留该构建。
- `numeric`：改为 NaN 数值列初始化。两轮纯舰队固定步较好，但混编变差，rAF 没有明显稳定改善。**该构建尚未修复 getter 导致旧条目遗留的反例，不能作为最终代码的验收。**
- `guarded`：在 numeric 上加删除代数守卫。但后续发现自定义坐标 valueOf 重入 update 可污染数值缓存，仍不是最终正确性验收版本。
- `coercion-safe`：完成所有坐标转换及分格后才写入缓存，消除上述重入反例；最终结果以该构建为准。

第一次 `cells-r1` 的 200 舰试验在第 60 步发现 Worker 数量为 0 而非 4，测试失败并被排除；不以它宣称 200 舰性能。随后独立 200 舰试验满足 4 Worker 条件。所有有效与不利结果都保留在表中，不挑选最快的一轮代表整体。

| 构建/轮次 | 初始主舰数/舰型 | 固定步+视觉 ms（前→后） | 弹丸/光束阶段 ms（前→后） | 状态检查点 | Workers 前/后 |
|---|---|---:|---:|---:|---:|
| cells-r1 | 24 onslaught/onslaught | 31.97 → 32.43 | 5.27 → 5.39 | 8 | 0/0 |
| cells-r1 | 100 onslaught/onslaught | 227.10 → 220.49 | 31.38 → 30.83 | 8 | 4/4 |
| cells-sweep-100 | 100 onslaught/onslaught | 96.22 → 99.27 | 15.23 → 14.92 | 8 | 4/4 |
| cells-sweep-200 | 200 onslaught/onslaught | 378.71 → 398.24 | 66.11 → 72.87 | 8 | 4/4 |
| numeric-r1 | 100 onslaught/onslaught | 105.88 → 102.95 | 16.01 → 14.35 | 8 | 4/4 |
| numeric-r1 | 200 onslaught/onslaught | 251.51 → 245.49 | 44.00 → 38.70 | 8 | 4/4 |
| numeric-r2 | 100 onslaught/onslaught | 99.27 → 97.61 | 15.67 → 14.68 | 8 | 4/4 |
| numeric-r2 | 200 onslaught/onslaught | 255.89 → 246.30 | 42.68 → 37.87 | 8 | 4/4 |
| numeric-mixed | 100 odyssey/paragon | 298.28 → 324.17 | 30.33 → 32.03 | 4 | 0/0 |
| guarded-r1 | 24 onslaught/onslaught | 18.30 → 18.89 | 2.87 → 2.93 | 8 | 0/0 |
| guarded-r1 | 100 onslaught/onslaught | 90.24 → 91.76 | 13.84 → 13.38 | 8 | 4/4 |
| guarded-r1 | 200 onslaught/onslaught | 260.57 → 275.24 | 44.25 → 42.58 | 8 | 4/4 |
| guarded-r2 | 100 onslaught/onslaught | 101.95 → 102.25 | 16.56 → 15.44 | 8 | 4/4 |
| guarded-r2 | 200 onslaught/onslaught | 281.98 → 265.41 | 50.52 → 40.74 | 8 | 4/4 |
| guarded-mixed | 100 odyssey/paragon | 294.09 → 305.55 | 30.01 → 30.27 | 4 | 0/0 |
| guarded-mixed-r2 | 100 odyssey/paragon | 382.45 → 420.23 | 36.32 → 38.75 | 4 | 0/0 |
| safe-final | 100 onslaught/onslaught | 93.21 → 93.72 | 13.91 → 13.00 | 8 | 4/4 |
| safe-final | 200 onslaught/onslaught | 254.83 → 251.02 | 41.34 → 38.88 | 8 | 4/4 |
| safe-mixed | 100 odyssey/paragon | 290.10 → 299.16 | 28.39 → 30.34 | 4 | 0/0 |

| 轮次 | before 平均 FPS/TPS | after 平均 FPS/TPS | 顺序 |
|---|---:|---:|---|
| raf-cells-sweep-abba | 9.138 / 8.739 | 9.107 / 8.941 | ABBA |
| raf-numeric-abba | 9.206 / 8.974 | 9.147 / 9.014 | ABBA |
| raf-numeric-baab | 8.863 / 8.664 | 8.956 / 8.790 | BAAB |
| raf-guarded-abba | 8.799 / 8.535 | 9.158 / 8.859 | ABBA |
| raf-guarded-baab | 9.007 / 8.775 | 8.796 / 8.531 | BAAB |
| raf-safe-abba | 9.196 / 8.897 | 9.127 / 8.994 | ABBA |

### 最终候选判断

- 100 舰固定步+视觉 93.21→93.72ms，略慢；200 舰 254.83→251.02ms，约快 1.5%。
- 200 舰弹丸/光束阶段 41.34→38.88ms，约快 6%；但 100 舰 Odyssey/Paragon 混编整步 290.10→299.16ms，约慢 3.1%，弹丸阶段也变慢。此前 numeric/guarded 混编结果同样不利。
- 最终真实 rAF 的 FPS 9.196→9.127，TPS 8.897→8.994。一个略降、一个略升，不能宣称体感改善或稳定统计收益。
- 因此撤回本轮生产改动，只保留可回放候选、回归检查和证据。多舰卡顿仍未解决。跨轮绝对耗时不可直接比较，更不能与此前不同基线的 47.55/274.71ms 拼接成提速比。

最终 safe 孤立内核试验（每组 8 轮、排除前 2 轮，2000 弹丸/500 导弹、300 合成步，顺序交替）中：未变条目较多场景墙钟 71.72→37.79ms、进程 CPU 80.67→41.83ms；全部导弹都移动的场景墙钟 77.14→42.27ms、CPU 83.50→41.67ms。每合成步仍有多次失效；这不是“每次查询所有对象都运动”的负载，更不是完整游戏 FPS。输出计数完全一致，但不能用内核约一半成本掩盖混编和 FPS 的不利结果。

## 确定性与正确性

新增 `scripts/check-interception-cell-cache.mjs` 和冻结原实现 `scripts/lib/projectile-interception-reference.mjs`。

- 随机有序操作：移动/update、remove、插入、身份替换、同长度重排、重复引用、rocket 标记变化、查询方式和半径变化。
- 极端/非有限几何、原 getter/数值转换的调用顺序与次数、从自定义坐标转换恢复为数字、有限/无限边界转换。
- 精确复现并防止：对象坐标转换时重入 update，导致外层 cells 与内部缓存描述不同姿态；恢复为数字坐标后查询漏更新。
- 精确复现并防止：rebuild 中 isRocket 第一次返回 true、update 第二次返回 false，加上另一个同长度替换掉的旧条目，导致“已访问数=Map 大小”却留有幽灵候选。修复后的原/新结果均为空。
- 控制计数夹具中，100 个未移动条目连续 10 次失效，分格计算 **1010→10**；多余清扫访问 **1000→0**。这些是算法工作量计数，**不是 FPS 提升倍数**。

最终候选 coercion-safe：13,323 项索引检查通过；100/200 Onslaught 共 16 个状态检查点、100 混编 4 个检查点一致；实际 4 Workers 的提交、WebGL 无错误及释放后 0 Worker 检查通过；暂停/同 tick、驾驶/防御回执、星图开关、阻挡输入及释放检查通过。TypeScript 和 scoped oxlint 通过。

撤回后：普通脚本默认测试生产基线并断言其原有计算次数；设置 INTERCEPTION_INDEX_SOURCE 和 INTERCEPTION_EXPECT_CACHE=1 可以独立回放保存的候选。候选的性能计数不冒充当前生产实现。生产基线和保存候选各 13,323 项检查通过；另有 24 项 combat AI、12 项 system movement intent、TypeScript 和 scoped oxlint 的恢复后回归。

## 排除的其他方案和下一热点

- 不重新启用此前失败的共享 AI 获取目标网格。证据见 `shared-grid-performance-2026-09-22.md`。
- 禁用既有火控批次的诊断使舰船/武器阶段约 60.50→71.32ms，因此保留批次。
- 用 Object.getOwnPropertyDescriptors 批量替代资格检查，在独立测试中约慢 7 倍，没有接入生产。
- 60 步预热后的百舰 CPU 采样仍显示火控、资格检查、发布/编码与 GC 热点；例如 `aim` 的一个采样调用节点累计约 4184.7ms，`encode` 约 1504.1ms。采样累计值不是每帧耗时，各节点也不能相加当作总时间。
- 最终混编基线的 fleetAI 阶段约 145.52ms、shipsWeapons 约 86.92ms，合计约占 290.10ms 固定步+视觉的 80%。应优先处理这些主耗时及混编的现有 Worker 资格覆盖，而不是继续围绕约 28.39ms 的整个弹丸阶段宣称架构问题已解决。
- `Protocol.NumericStore` 的 mixed unknown[] 原值保存可能产生数值装箱，但目前仅调查，未修改。未来若尝试分离数值存储，必须保持 Object.is 的 NaN/-0/引用语义、独立于可变 wire 的原始值校验，以及按实际用量增长，不能盲目按 2,000,000 容量额外分配完整私有缓冲区。

## 复现和产物

所有冻结源码、CPU 采样、原始逐步/逐帧 JSON、控制检查及日志保存在 `artifacts/combat-hotloops-20260922/`；正确性脚本单次产物保存在 `artifacts/interception-cells/`。未删除历史产物，未暂存、提交、推送或发布。

候选固定构建与 before 的差异只有索引文件。恢复时先确认工作区索引仍与最终候选逐字一致，再恢复 before 的精确内容；没有使用 git reset/checkout，没有覆盖其它文件：

- baseline source SHA-256: `a7f66953a993a5f70c31dfadfec29166fb6830b841d2bcfca771704c7138241e`
- guarded source SHA-256（历史试验）: `26fd73f1530bc5788bb270f6614c352095161c85aa32ac3eb0b9333c012fe6eb`
- coercion-safe source SHA-256（保存候选）: `429a4f0248621b36bee5e667aea2a3f27932a985641c5b789ae089d59461271d`
- 当前生产文件 SHA-256 与 baseline 相同。

后台复现示例（PowerShell；避免性能测试与其他重测试同时运行）：

```powershell
# 当前生产基线
node scripts/check-interception-cell-cache.mjs
# 保存候选的正确性
$env:INTERCEPTION_INDEX_SOURCE='./artifacts/combat-hotloops-20260922/coercion-safe-index.ts'
$env:INTERCEPTION_EXPECT_CACHE='1'
node scripts/check-interception-cell-cache.mjs
Remove-Item Env:INTERCEPTION_INDEX_SOURCE; Remove-Item Env:INTERCEPTION_EXPECT_CACHE
# 使用已保存的不可变浏览器构建，不重新用当前生产文件覆盖它
$env:AFTER='browser-coercion-safe'
$env:COUNTS='100,200'
$env:STEPS='240'
$env:EXPECT_BEFORE='4'; $env:EXPECT_AFTER='4'
$env:TAG='safe-repeat'
node artifacts/combat-hotloops-20260922/paired.mjs
$env:ORDER='before,after,after,before'
$env:EXPECT_WORKERS='4'
$env:DURATION='15000'
node artifacts/combat-hotloops-20260922/raf.mjs
```

不要使用 NAME=before 覆盖已冻结的基线。工件目录不入 Git；常规回归脚本和原实现 oracle 可以不依赖该工件目录重新运行。
