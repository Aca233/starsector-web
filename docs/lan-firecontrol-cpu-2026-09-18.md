# 火控真实计算 CPU 调查与否决结论（2026-09-18）

## 结论

**两个候选均未采用，正式 `AutofireController.ts` 保持本任务开始时的原文，不交付火控性能补丁。**

延迟分配候选在 100 舰第一轮略慢、第二轮仅略快；附加端点标量化的候选在 100 舰两轮分别只快 **0.275% / 0.934%**（平均步时合并约 0.606%）。不足以证明值得引入额外代码的稳定、实用整体收益。没有把小幅均值差异、对象数量减少或短正确性检查当作整机性能改善；按协调要求停止，不追加微基准或扩大改造。

本轮不是生产 LAN / Worker / WebGL 完整链路验收，不能据此宣称 100 舰已实时、FPS 改善或网络问题解决。正式高负载进程已经退出，窗口已交 restore 的最终 roster-only 复测，再由主任务执行生产完整链路 A/B。

## 范围与基线保护

- 先保存当前火控原文及其相对 Git 的既有差异，未使用 Git HEAD 覆盖已有修改。
- 起始和最终 SHA-256 均为：`41408a53af484951fb731145d30ee958c462d4bda3d1be8ee55a5d3cc2cae7a1`；最终逐字比较也相同。
- 候选仅保存在忽略目录 `artifacts/firecontrol-cpu-20260918-181652/`，从未写入正式 src；没有新增专属 helper。
- 本任务唯一工程报告为本文件；未写 network、其他 AI/数学文件或别人的报告，未回滚任何其他任务修改。
- 没有更改物理步长、扫描/AI 频率、候选顺序、射击安全判定、随机消费或数值精度；没有重试已失败的空间格网/距离 cache。
- 没有新增项目测试文件或 runner。诊断从 stdin 执行，冻结图、隔离 bundle、stdin 文本及结果仅保存在 artifacts。3005 服务、普通 dist 和原浏览器均未修改/重启。

## 静态分析与隔离候选

先阅读 `docs/lan-acquisition-investigation-2026-09-18.md` 和 `docs/lan-core-distance-investigation-2026-09-18.md`。前者的完整保护格网、后者的两类距离缓存均无收益，本轮不复做。

1. **Deferred**：在 `solveWeaponAim` 内保留 `predictWeaponIntercept` 的逐项运算顺序，先以标量执行拦截、距离和射界检查，通过后才构造 point / AimSolution。不改变公开 prediction helper 的实现，不改变 `targetRadius` 的读取次数或护盾回调顺序。
2. **Trace**：在 Deferred 之上，将 `traceTarget` 的相对速度和射程偏移作为标量，仅分配两个扫掠端点。保留原先的两次加法，不合并成不同括号的表达式；保留 `fromAngle` 的默认参数语义。对 clone/sub/add/addScaled/fromAngle 的非原方法走原向量调用回退。

资格检查包含存活、可见性、碰撞状态、阵营和扩展方法等可变读取，没有跨候选/跨帧缓存这些结果。也没有复用上一次的射线命中结果跳过护盾或舰体检测。

这些只是未采用的实验，不能将 artifacts 中的候选误认为现有功能。对任意运行中恶意原型改写或 getter 安装不作形式化等价声明；未因其补齐复杂保护继续扩大无收益改造。

## 正确性检查

- 6,376 项短差分检查全部通过：5,000 组有限数的拦截/扫掠、169 组零/负零/次正规/极大数/NaN/Infinity 配对、5 种向量方法回退、1,200 组实际舰体/护盾（其中 300 组动态 getShieldCenter 回调）、2 组 undefined 向量/射程默认参数。
- 边界检查使用严格深比较，包含返回接触 time/distance 与预测坐标；不是只看命中与否。
- 先做过 8 舰 10 步短回放。正式回放为 8/32/100 舰各 1,200 tick、两轮、三个独立世界版本。
- 每 30 tick 比较完整 `captureCombat` 投影（含 muzzleEvents）、simulation/visual RNG 的全部可枚举状态；另比较所有已存在挂点的 target、scanIn、firingTime、idleFireTime、ammoAllowed、调度 RNG 和 fireControl 决定。
- 包含 tick 0，每规模每轮 41 个检查点；共 246 个基线检查点、**492 次候选对照**，均完全相同。
- 候选以内存覆盖方式进行了项目 TypeScript 无输出检查：无诊断；未生成工程编译产物。

完整回放比较的是 JSON 表现投影加上述 RNG/火控状态，不是所有私有对象/所有种子/所有模组的穷举证明，也不是逐帧所有数值的位级证明。正确性通过不能替代性能达标。

## 正式同图回放方法

- 窗口已经与主任务、codec、restore 协调；先做静态与短正确性，待其他正式计时停止后才运行本节负载。
- 使用 `artifacts/lan-current-display-sources.json` 的完整冻结 src 图，并复制为专属 `frozen-sources.json`（471 条目）。三个版本唯一游戏源码差异为 AutofireController；额外导出私有 traceTarget 仅供诊断，三个 bundle 一致处理。
- esbuild 完整世界 bundle，target ES2023、useDefineForClassFields=true，Node v24.13.0；没有内存 loader 回读变化中的 src。
- 使用 `artifacts/lan-hundred-baseline.json` 的 match，seed=2232494901，两真人守护者；两队各 `size/2-1` 艘 hammerhead，总规模为 8/32/100。3200 DP、初始 1600 DP。
- 玩家加入 externallyControlledShipIds，每步 applyPlayerControls neutral；权威连续 contrail 关闭并挂接 HostMuzzleEvents，与已用 LAN 物理诊断口径一致。
- 真实 `fixedUpdate(1/60)` 演进，不是静止状态重复查询。三个版本每 tick 轮换先后，第二轮再偏移顺序；每轮剔除前 60 tick，记录剩余 1,140 步。计时包含中立输入与 fixedUpdate，不含每 30 tick 的 capture/比较，不开 CPU profiler。
- 所有模拟都在一个独立 Node 子进程，进程内不同版本的 JIT/GC 相互影响以及系统噪声仍是限制；不把 1% 左右差异解释为已证实的因果收益。两轮绝对步时也存在预热差异。

## 结果

单位：平均 ms/步；正的 Trace 改善表示候选均值较低。

| 轮次 | 舰数 | 基线 | Deferred | Trace（含 Deferred） | Trace 改善 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 1.8742 | 1.8597 | 1.8396 | 1.848% |
| 1 | 32 | 4.8467 | 4.8175 | 4.8069 | 0.822% |
| 1 | 100 | 16.9579 | 17.1293 | 16.9113 | 0.275% |
| 2 | 8 | 1.1737 | 1.1821 | 1.1708 | 0.248% |
| 2 | 32 | 4.4913 | 4.4317 | 4.4555 | 0.797% |
| 2 | 100 | 17.0924 | 17.0682 | 16.9327 | 0.934% |

100 舰 P95：第一轮基线 22.3335 / Trace 22.5356 ms（反而略差），第二轮基线 22.5006 / Trace 22.2424 ms。Deferred 第一轮 100 舰平均慢约 1.01%，第二轮快约 0.14%。这些结果不足以支持源码落地。

最终进程 PID 42268，退出码 0。没有追加局部微基准来覆盖整体结果；正式源未经历“先改后回滚”，因此不存在回滚误伤别人的源码变更。

## 证据

目录：`artifacts/firecontrol-cpu-20260918-181652/`

- `AutofireController.baseline.ts`、`baseline.diff.txt`：任务起始原文与既有 Git 差异。
- `AutofireController.candidate.ts`、`AutofireController.trace-candidate.ts`：未采用候选。
- `frozen-sources.json`、三个隔离 `*.mjs` bundle、`build.stdin.txt`：同图构建证据。
- `boundary-results.json`、`ship-boundaries.json` 及对应 stdin 文本：短正确性结果。
- `candidate-typecheck.txt`：内存候选 TypeScript 检查。
- `replay-benchmark.stdin.txt`、`replay-benchmark.json`：实际回放方式、逐步计时与每检查点投影哈希。
- `disposition.json`：源码哈希、检查数、完整计时摘要、最终否决结论。
