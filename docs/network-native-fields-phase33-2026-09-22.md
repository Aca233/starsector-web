# Phase33：主机原生快照字段读取（2026-09-22）

## 本轮范围
只优化显式原生权威捕获的字段读取。`CombatSnapshot.ts` 的 shape 仍校验完整字段顺序，但新增每个保留字段在 raw keys 中的位置；一次 `Object.values` 提取当前数据，并直接在本次新数组内按单调位置原位投影，避免逐字段字符串动态查找，以及第二次数组分配和push扩容。写游标永远不越过读游标，最后裁剪，未来字段不会被覆盖。没有缓存字段值、跳过同步字段、减精度、降低Hz、放大窗口或改动模拟/碰撞规则。泛型、自定义Getter/Proxy保留旧路径。捕获产物仍独立拥有，跨tick不复用可变值。

生产调用链未另设实验开关：`captureAuthorityCombat` → `captureHostCombat` → `captureCombat(nativeCapture=true)`，LAN/Steam/Node共用。Phase32接收端单遍解码/nativeProjection、现有motion字节增量和背压全部保留。未启用Phase31实体胶囊或实验serializer。

## 定位
Phase32保存的5人测试中，simulated约60Hz、produced约27–35Hz且uploaded跟随，没有采样到发送阻塞，因此不能把完整快照低频全怪到Steam/n2n。当前host.worker完成一批physics后才发完整快照；真实计算变贵时可catch-up多个tick而只发最新完整状态。该语义本轮不改；每tick强制额外捕获可能进一步拖慢物理。

本轮CPU采样见 `artifacts/network-stream-20260922/phase33/producer.cpuprofile`：pack自采样1878，动态字段读取392、字段push/递归341、函数检查133。重复capture/encode诊断均值分别2.878/2.074ms（不是实战帧预算）。据此做有限字段提取实验，源码证据/边界见 source-notes。

## 同源离线对照（已通过）
对照是本轮开始的Phase32生产WIP，不是旧git HEAD，也不是pre-Phase32解码器。两边均用Phase32有界解码与nativeProjection恢复。22舰，seed917，同一权威状态依次给两实现，3/5个顺序离线接收副本，30预热+120实测tick；A/B与B/A各一轮。

|离线副本/顺序|捕获P50 原→新(ms)|捕获变化|全管线P50变化|全管线P95变化|
|---|---:|---:|---:|---:|
|3 A/B|3.938→3.256|−17.34%|−1.95%|−8.21%|
|3 B/A|3.712→2.918|−21.37%|−6.03%|−8.88%|
|5 A/B|3.356→2.852|−15.02%|+0.82%|−2.72%|
|5 B/A|4.461→3.554|−20.33%|−1.90%|−1.38%|

完整帧、可靠ordered/motion delta和deflate6后的字节均完全一致；全部4对轨迹SHA一致，恢复后的整世界投影一致。预设门槛是每对捕获P50至少改善10%、总P50不恶化超过3%、总P95不恶化超过10%、字节不增加，4对通过。**不能把捕获15–21%直接说成端到端延迟下降15–21%；全管线总耗时收益很小且有正负波动。**完整结果见 `benchmark-inplace/result.json` 和逐tick pair 文件。

## Chromium同状态生产端（最终候选通过）

纯Chromium同VM、同权威tick、22舰、30预热+120实测、A/B和B/A；逐帧编码完全一致：

|顺序|捕获P50 原→新(ms)|捕获变化|capture+encode总P50变化|
|---|---:|---:|---:|
|A/B|3.340→2.595|−22.31%|−17.50%|
|B/A|2.820→2.295|−18.62%|−10.47%|

该数字不含网络、解码、恢复或渲染，不等于端到端延迟。结果见 `chromium-producer.json`。

保留两份前置非通过证据：`chromium-producer-depscan-contaminated.json`（Vite隐式后台扫描全仓HTML，被判定无效；随后明确关闭依赖扫描），`chromium-producer-separate-array-negative.json`（独立第二数组候选在干净Chromium B/A中capture仅改善7.6%，未过10%门槛）。本轮最终启用的是追加原位投影后的候选，而不是把前一个负例改阈值。

## 正确性与回归（已通过）
新增7组：字段增删/顺序/numeric keys/枚举性/wide fallback；函数值变化与特殊数值；稀疏和自定义数组、typed data、容器、循环、Ship引用；原型/路径省略；捕获所有权；泛型Getter/Proxy读取及异常次序；180tick实际22舰战斗、跳tick后的真实恢复。

- network:check：655 tests，0失败（含新增7及Phase32新增13）。
- network:check:shared：120 tests，0失败。
- steam:check：342 tests，0失败；这是自动化回归，不是远程Valve会话验证。
- typecheck、lint通过。

## 实际无头LAN对照（最终候选已测）

先前的单独数组候选完成了3人A/B、B/A；其5人**旧版对照**触发主机计算持续过载而中断。原始失败保留在 `browser-5-0-before/result.json`，不能说已由本轮修复，更不能通过扩大恢复预算掩盖。

最终原位投影候选重新冻结共同源码。在此期间，其他任务的AutofireController/FireControlQueryBatch改动进入了**新旧两臂共同基线**，明确不归功于本轮；详见 `browser-retry/basis.json`。两臂唯一差异为CombatSnapshot字段提取。服务器源码全程无漂移。

实际host Worker、LanBattle、独立desktop helpers、WebGL/D3D11。5人各15秒，A/B和B/A；所有4轮以及最终3人检查均通过真实开火/炮塔/弹体预测、800ms主线程阻塞期间客机ACK继续进展、同战斗断线重连，无JS错误、无战斗失败。不放宽任何断言或超时。

|5人对照顺序|主机捕获P50 原→新(ms)|客机完整状态Hz 原→新|结果|
|---|---:|---|---|
|A/B|5.438→4.100（−24.60%）|20 → 33–37|功能验收通过|
|B/A|5.141→4.502（−12.43%）|34–35 → 31–33|功能验收通过|

**捕获阶段两方向均改善，但完整状态Hz与输入确认延迟没有稳定改善，不能只挑第一组宣称提高了17Hz或彻底降延迟。** 新版5人输入确认P95范围约84–109ms（非网络RTT），没有稳定优于旧版；主机物理约59.8–59.9Hz，不等于客机完整状态60Hz。不同采样/平滑的simulation、capture、encode数字不能机械相加作单帧预算。

最终3人单次功能检查：物理59.95Hz、客机完整39/41Hz、motion60Hz、FPS约60；这不是该规模最终候选的新旧成对性能结论。

所有浏览器共享同机CPU/GPU，瞄准由墙钟驱动，实际轨迹不逐字节一致；机器负载也有波动，但不据此断言任何一次变慢就是其他软件造成。不等同Steam/n2n远端测量。进一步整体收益仍需真实多机日志及模拟/接收/呈现阶段定位。

## 构建与交付边界
- 最终network655 + shared120 + Steam342 = **1117项回归全部通过**；最终typecheck、lint通过。
- 当前生产CombatSnapshot SHA与最终Node门槛候选完全相同。`final-validation.json`汇总测试、保留失败、冻结基线、源码SHA和构建。
- 本地战斗入口构建完成：`2026-09-21T17:14:52.921Z`，北京时间**2026-09-22 01:14:52**；入口`main-BekLC6Mm.js`。构建依赖排除campaign，源码与构建记录无漂移。
- 编译产物主菜单及LAN入口无头启动、真实已加载LAN JS模块中的构建号与后端`/lan/info`一致，无JS错误。首次冒烟断言错误地要求构建号一定在main.js；已按实际代码分包改为验证已加载LAN模块图，没有绕过构建一致性断言。`built-smoke.json`是最终通过证据。
- 构建启动冒烟不等于编译版跨机联机验收；完整联机验收使用冻结源码/Vite路径。未实际测试远端Valve/n2n。
- 本轮未修改生涯源码、未提交/推送/打包发布；未打开可见窗口或操作用户游戏。已经安装或正在运行的旧版不会因为本地dist更新就自动替换。

本轮已落实的收益是减少主机快照捕获CPU与临时分配；**不是已完成整个联机底层重做，也没有解决满载客机完整60Hz和全部延迟问题。**
