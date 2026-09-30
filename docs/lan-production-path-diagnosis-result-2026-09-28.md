# 生产式联机战斗 JS 路径诊断结果（2026-09-28）

## 结论
本轮得到了一份**真正生产模式 main/Worker、完整原始启动路径**的有效 CPU 诊断。它仍在 176 实体场景启动阶段触发持续过载；未进入可操控的 20 秒输入测量。因此不是性能 A/B、不是新增提速、不是默认晋升或整个优化目标完成。

**没有修改生产源码、没有打开实验开关、没有放宽过载/回执/权限保护，没有降 Hz、精度、实体数或画质；未暂存、提交、打包生涯或发布。** 只新增本轮 artifacts、诊断说明和结果文档。上一轮惰性排序仍保持撤回；ContentValidation 的 arkFighter 启动修复保留。

## 与旧开发路径的区别
既有 check-normal-multiplayer-browser.mjs 使用 Vite 开发模块；本轮冻结非生涯源码后，独立 production 构建 LanBattle、真实 host/relay/socket Worker，再通过同一个双无头客户端 harness 加载编译产物。使用 esbuild minify、ES Worker、生产 React、原项目 vendor 分块、完整冻结 CSS 与实际资源。不执行 WebP 重编码、不引入 shell/生涯，所以称“生产式战斗 JS 路径”，不冒称与整个安装版逐字节等价。

- 固定 Node：C:/Program Files/nodejs/node.exe，v24.13.0。
- 冻结 772 源码模块，源图 SHA256：f8e85bef651728c2a6bf41283f781c5aad88fd025bd7b01bff573b9023c900fc。
- 完整资源 3486 个文件、156156909 bytes；实际请求 115 条全部 200。
- 有效构建的 main 与 Worker 共 7 项实际配置均 isProduction=true / DEV=false / PROD=true；显式 jsxDev=false。
- 所有 sourcemap 中 1185 条项目源码记录与冻结源逐字相等；没有生涯源码。UI 观测插件有 sourcemap warning，但未变换权威 Worker 源码，后者映射可用于此次 CPU 归因。
- 实际权威 Worker：/assets/host.worker-usi8ICHU.js，1149433 bytes，SHA256：60a4f3297da6f3f26e2bb9536ceb849ae261a84a5f290b85ee44031d6aba7ed2。
- 实际浏览器无 /src/ 或 /node_modules/ 请求；main/vendor/socket/host 编译请求均 200，requestFailures=[]。
- 五项模拟实验、display definitions、呈现 Worker、AI Workers、serializer Worker 显式 false；其它默认语义保留，不强开旧 layered-sync/critical-combat 实验。

## 前置失败均保留，不能混成游戏性能结果
|尝试|真实阶段|裁决与修复|
|---|---|---|
|v1|Node loader 替换锚点不匹配，尚无浏览器|CRLF 归一化，未模拟、未采样|
|v2|页面报 x.jsxDEV is not a function，尚无 authority Worker|样式冻结器留下 development NODE_ENV；分离构建进程并审核实际 production 配置，未模拟|
|v3|页面成功、authority Worker 脚本被 Chromium 阻止，尚未初始化|测试静态 bundle 中间件提前返回，遗漏 Vite 设置的 COOP/COEP；不是游戏过载|
|v4|真实 authority 初始化、两端 loaded、启动模拟；后触发过载|唯一有效生产式 CPU 诊断，功能验收失败；没有为挽救结果再次启动/择优计时|

v3 的定向探针只加载同一个编译 Worker、不发送 init：缺少响应头时 net::ERR_BLOCKED_BY_RESPONSE、0 个 Worker；加入与页面相同 COOP/COEP 后 1 个 Worker、无错误。修复仅在测试托管中间件，未改变生产服务器、浏览器安全功能或模拟代码。v1-v3 日志、旧 loader、旧构建保留。

## 唯一有效运行 v4
原场景：2 玩家 + 20 AI、web_zhuyuan/web_gloriana/web_sc2_hyperion 循环、seed917、3200DP、1280×720、D3D11；不预推进、不缩小战斗。保留原 20 秒输入、800ms 主线程阻塞 ACK、同局重连流程及全部阈值。

两端在 tick14 的呈现观测均为 22 根舰、56 模块、70 战机、28 轰炸机，共176实体；此时无弹体。该观测发生在同步中，不是已可操控稳态。初始734挂点为既有同场景预期，本轮浏览器未独立记录挂点数，不能把它称为本轮实测。

最后收到的权威遥测 tick20：lastStepMs=58.670、maxStepMs=72.100、simulationMs=60.735、captureMs=15.135、encodeMs=7.760、backlogMs=320.935。随后重复 HUD 样本仍是同一 tick20，不能算三个独立模拟样本或稳态均值。

房间报告“计算主机持续过载或暂停过久，恢复失败”。原始错误的编译栈经源映射指向 frozen host.worker.ts:392（recover 预算拒绝）与 :531（accumulator > 250），不是 JSX/Worker/资源加载问题。日志到达 measurement 标记仅表示开始等待可操控画面；beginPresentationMeasure 的 waitForFunction 30秒超时，**有效输入测量尚未开始**。没有输入P95/P99、有效稳态Hz、800ms阻塞ACK或同局重连通过证据。

外壳 exit0 不代表成功；diagnosis-status-v4 中实际子进程 exitCode=1、functionalityPassed=false、cleanup=true、productionJsOnly=true。

## CPU：区分真正忙碌与中断后的空闲
一个 profile，3339 样本、累计5010.433ms（profile wall5010.689ms），带 profiler 开销。总样本中 idle=3169.599ms（63.26%）；最后一段连续 idle=3161.603ms，最后非 idle 样本结束于1848.830ms。后3秒已没有有效模拟工作，**不能据此说“运行中CPU还有63%余力，提高占用就会更快”**。

下表分母是同一份 profile 的非 idle 样本1840.834ms，含GC及其它工作；不是全机器CPU利用率、GPU占用或无插桩墙钟时间。均为包含下游调用的桶，互相重叠，不能相加。

|采样调用栈|ms|占非idle样本|
|---|---:|---:|
|完整 fixedUpdate|1569.423|85.26%|
|CapitalShipAI|677.174|36.79%|
|ShipWeaponControlSystem|502.532|27.30%|
|ThreatAssessment（包含于AI等调用）|332.737|18.08%|
|ShipMotion|189.059|10.27%|
|system modifiers 组合|183.809|9.99%|
|phase 读取|190.964|10.37%|
|战机/轰炸机系统|130.502|7.09%|
|AuthorityCombatSnapshot 文件|99.429|5.40%|
|编码文件|58.088|3.16%|
|GC|48.998|2.66%|

“GC占2.66%”不等于分配总成本只有2.66%，也不能由此否定所有对象池；它仅不支持把GC当作此样本最大瓶颈。没有专用compile样本不代表不存在JIT开销。函数聚合含递归时可能重复计算 inclusive，表格采用每个样本每桶只计一次的统计。

## 对下一步的约束
1. 生产打包并未自动消除大场景启动过载。不能把旧开发态与本次生产式冷启动数字相除，声称编译优化收益。
2. 优先削减同步模拟中AI/火控的整体重复工作；当前没有证据支持仅靠序列化Worker、对象池或GPU迁移就能解决。此诊断没有测试GPU，也不能宣称GPU无效。
3. 不恢复已失败的惰性排序、相位小缓存、逐getter修饰程序等；这些已有完整步否决证据，不能用热点占比替代净收益验收。大结构候选必须先证明查询/写入边界，避免用昂贵资格检查抵消计算节省。
4. 五项已保留实验仍默认关闭。本次测的是全关默认路径，不能当作五项组合在生产构建下通过或失败的新证据。新的生产候选要重新冻结当前源码、保留相同场景和保护、先正确性后唯一完整步对照；通过后使用已修好的生产式浏览器路径验收。

## 漂移、清理和交付范围
有效运行保护输入和127项实际Node输入无漂移；分析结束时再次审核保护输入仍全部匹配。冻结后其它任务继续改变了9个源码文件，详见 diagnosis-status-v4.currentSourceDrift；未覆盖它们。因此该772模块证据不自动代表最新持续变化的工作树。

全部本轮浏览器/helper/relay按原harness关闭，cleanupCompleted=true；定向进程检查未发现本轮诊断runner或normal-multiplayer测试残留，未结束用户或其它任务的进程。没有桌面操作或可见窗口。未改生产文件，故不重复全项目typecheck/lint；定向头部探针与真实浏览器失败诊断是本轮实际验证范围。原版实机/UI本轮未验收。继续优化目标保持active。

证据目录：artifacts/lan-production-path-diagnosis-20260928。关键文件：build-manifest-v2.json、embedded-source-audit-v4.json、run-manifest-v4.json、browser-v4/result.json、host-startup.cpuprofile（在browser-v4内）、cpu-summary.json、cpu-mapped-nodes.json、summary.json、busy-window-analysis.json、worker-header-probe.json、remaining-processes.json。
