# Phase34：真实主机采样、避碰剪枝实验与3/5人验证

日期：2026-09-22。**阶段性进展，不是延迟/60Hz目标完成。没有启用新的生产优化。**

## 实际做了什么

- 给无头联机验收脚本增加可选的 Worker 时间账本、真实 authority Worker 的 CDP CPU profiler；不把页面主线程 profile 冒充模拟线程。
- 加入显式的已编译 CSS 复用模式：只允许当前 `dist/assets` 且被当前 index 引用的主样式，核对记录的 CSS 源文件哈希。默认测试方式不变。此模式是诊断工具，不是发布构建，也不宣称证明任意后来新增的 Tailwind class 都已重新生成。
- 时间账本/逐阶段插桩只在冻结测试源图中；未往生产 Worker 加每帧采样开销。
- 实作避碰风险下界剪枝候选，完成同源、同输入、反转执行顺序的整场模拟比较。**未过性能门槛，不接入生产。**
- 没有修改生涯、发布、推送、开启可见窗口或操作桌面。未改4ms定时器、60Hz目标、保护预算或精度。

## 1. 调度假设并不成立

`probe-5-unstyled` 保留了一次真实过载退出：晚期每秒约48个物理tick，回调间隔约0.4–2ms/秒，yield约18–20ms/秒，快照约100ms/秒。大多数时间在计算，并不是定时器空等。因此没有为了“提高Hz”贸然换定时器或删除保护。

`profile-5-fixed` 是另一轮成功的无样式诊断，不能同前一次混成性能对照。逐阶段采样末期每步约9.53ms，其中 fleetAI约4.93、shipsWeapons约3.14、projectilesBeams约1.03ms。CPU self样本包含捕获pack、编码、威胁评估、武器控制、避碰。wall-time和CPU样本不能直接混为CPU百分比。

保留两个无效/不完整探针：`probe-5` 是 styled 启动阶段240秒看门狗，不是战斗性能证据；`profile-5` 是插桩调用错 `report()`，修正为 `getReport()` 后才得到有效 `profile-5-fixed`。没有放宽超时或断言掩盖它们。

## 2. 避碰实验：行为测试通过，但收益不足

生产 `TacticalNavigation.ts` 未改。`scripts/lib/navigation-experiment.mjs` 是带SHA校验的**被拒绝测试候选**，不被生产导入。其前提是普通原生phase；不是任意自定义/proxy AI的通用替代方案。

- 6000组有限随机几何；零速、阈值附近、极大/非有限坐标和半径；普通自定义运动方法、向量方法、坐标getter、Math覆盖及依赖记录顺序测试：5组通过。
- 确认实际进入5023次native分支，提前淘汰31718次、跳过468次无胜算候选，而非开关未启用。
- 22舰、3/5个确定性控制席位，真实开火，240 tick预热、600 tick计时；每个tick在计时外比较整个编码快照与两个RNG状态。两种顺序轨迹哈希分别一致，52–191颗弹体。
- 两个独立bundle只替换导航，其余源码来自同一冻结图，包含既有Phase32/33成果。没有将并行AI更改算作本实验收益。

|场景|顺序|整步P50变化|整步P95变化|
|---|---|---:|---:|
|3席|A/B|−3.69%|+0.04%|
|3席|B/A|−0.78%|−1.87%|
|5席|A/B|−0.64%|−1.42%|
|5席|B/A|−1.46%|−0.57%|

预先约定每对P50至少改善5%、P95不恶化超过10%。**FAIL**；脚本exit1是有意保留的性能拒绝结果，不是崩溃，也不应通过降低门槛改成绿色。

## 3. 带完整界面的现有默认路径验证

真实 `LanBattle + host.worker + DesktopLanBridge + WebGL`，seed917、22舰，1280×720、NVIDIA RTX5060 D3D11，开火/本地预测/确认弹体、800ms主机画面阻塞、同局断线重连均通过，错误0。读取了3人截图确认完整HUD和场景，并用断言确认所有canvas尺寸。

**同一电脑跑多个无头客户端，loopback；不是Valve/n2n/多台物理电脑的性能证明。使用默认生产导航，不是被拒绝候选。**

|人数|主机物理Hz（HUD中位）|客机关键运动Hz|完整状态Hz|画面FPS|输入确认P95|
|---|---:|---:|---:|---:|---:|
|3|59.81|58|44–45|约60|69.7–73.4ms|
|5|59.17|49–54|15–18|30.0–35.6|96.8–135.7ms|

测量窗口按tick/墙钟算分别58.85、59.06Hz；与HUD滚动窗口不同，均保留。主机阻塞中间450ms仍发布25次/7次，客机ACK均推进；重连matchId不变。功能通过**不等于5人性能通过**。

主机HUD阶段耗时中位（不是同一个tick的配对求和）：

|阶段|3人|5人|
|---|---:|---:|
|模拟|5.435ms|12.515ms|
|捕获|3.703ms|4.931ms|
|编码|1.316ms|2.729ms|
|应用|4.826ms|6.145ms|
|渲染|4.861ms|5.840ms|

结论：物理Hz、运动Hz、完整状态Hz和FPS是不同瓶颈。5人完整更新和输入尾延迟仍有明显问题；本轮不宣称网络已经60Hz，也不把降完整状态频率当作修复。下一阶段应优先看捕获/编码、客户端应用与模拟总预算，而非继续打磨仅占很小收益的避碰候选。

## 证据和复现

根目录 `artifacts/network-stream-20260922/phase34/`：

- `navigation-before.json`：不可变公共源码图；`navigation-before.ts` / `navigation-candidate.ts`：当时源码。
- `navigation-benchmark/result.json`、4个pair文件：完整计时、逐阶段统计和sha；`check-navigation.log`：差分测试。
- `css-validation-3/`、`css-validation-5/`：原始样本、测量窗口、结果、截图、主机负载。
- `profile-5-fixed/host.cpuprofile`、`worker-loop.jsonl`：有效真实Worker诊断。
- `validation-summary.json`：精简汇总、测试冻结源与当前源漂移。

结束检查发现 `src/engine/simulation/collision/ProjectileInterceptionIndex.ts` 被其他工作改变。没有覆盖它；上述浏览器和模拟A/B使用同一个已冻结图，因此结果不受后来的漂移污染，但**不能声称已验证漂移后的全部最新源码**。本轮未重建/发布游戏；仍保留Phase33本地构建，已安装版未自动替换。

独立功能测试（默认从仓库内的SHA校验候选运行，不依赖ignored实验文件）：

```powershell
node scripts/check-navigation-pruning.mjs
node --test scripts/check-host-worker-profiler.mjs
```

严格复现计时：

```powershell
$env:NAVIGATION_FROZEN='artifacts/network-stream-20260922/phase34/navigation-before.json'
$env:NAVIGATION_OUT='artifacts/network-stream-20260922/phase34/navigation-repeat'
node scripts/benchmark-navigation-pruning.mjs
# 该候选预期未过5%门槛，不要为了exit0改变门槛。
```

不设置 `NAVIGATION_FROZEN` 会用当前公共源码，而不是上述历史测量；仍是两臂同源，但不能期待同一耗时/轨迹。
