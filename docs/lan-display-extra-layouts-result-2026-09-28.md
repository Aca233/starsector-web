# 高频 display-v1 静态恢复候选：离线通过、联机未晋升（2026-09-28）

## 最终裁决
本轮补齐14个高频静态恢复布局。正确性与唯一完整五段ABBA通过，但生产式双无头浏览器的基线和候选都在主机启动阶段持续过载，未进入可操控输入测量。**保留默认关闭的候选，不计作已默认落地的联机提速，不报告输入延迟降低，不宣布整体优化完成。**

没有改Hz、精度、战斗规模、画质、接收校验、ACK/权限或过载门槛；没有改原版安装、提交/发布或打包未完成生涯。未操作桌面/可见窗口，未启动子代理。保留ContentValidation的arkFighter白名单修复及其它任务的改动。

## 实现范围
- 既有生产文件仅改src/network/DisplaySnapshotCodec.ts：原36静态布局优先，完整校验键表后，额外布局仅在VITE_LAN_EXTRA_DISPLAY_LAYOUTS严格等于字符串true时启用；未知、增删字段、重排键均回退通用恢复。
- 新增src/network/DisplayRecordRestoreExtra.generated.ts、scripts/lib/display-restore-extra-shapes.json、scripts/generate-display-extra-restorers.mjs。
- 每字段保留value读取→depth检查→guard→旧值读取→标量写/递归顺序。没有eval/Function，不执行网络提供的代码，不用对象身份跳过许可校验。
- 按上一轮审计样本估算字段静态恢复覆盖率从13.27%到97.43%；这是样本覆盖率推算，**不是性能收益百分比**。
- 生产式主bundle从1811679增至1900651bytes（未压缩；额外静态代码的成本）。未测网络压缩体积或冷下载收益。

## 正确性和已有验证
- 单次集中typecheck、改动文件oxlint、生成器--check通过。
- 1344次新布局guard/value/read/write/error顺序对照；方法/getter/继承方法、深度0/62/63/64、首中末字段拒绝、增删重排回退、嵌套Vector身份、旧本地字段、批量第二行出错的部分写入语义、危险键拒绝通过。
- 真实host初始化/重初始化，176实体、734挂点；60步完整扰动链路，三组wire逐字相等，tick20/60权威+隐藏随机/火控状态、完整receiver图一致；见contracts-result.json。
- 既有check-native-capture.mts综合入口在执行任何测试前被已删除的orion_device依赖阻断，**不能称全套通过**。未恢复旧玩法；通过TypeScript AST原样提取其中3个codec相关用例，3/3通过，正文SHA和范围已保存。

## 唯一正式离线ABBA
固定Node v24.13.0、相同冻结源码/3498资源/依赖；A0→B1→B2→A3，每臂150冷步+120热步，全程simulation→capture→encode→decode→apply，无Profiler，不择优重跑。源码对照只改变上述codec和新增生成模块。

|配对|基线热ms/完整步|候选热ms/完整步|热耗时下降|冷耗时变化|
|---|---:|---:|---:|---:|
|A0→B1|182.056|138.386|23.99%|-38.25%|
|A3→B2|147.156|139.709|5.06%|-3.54%|

两对达到预登记热改善≥3%、冷回退≤3%、init增量≤max(10ms,10%)。两对幅度差异较大，不能宣传稳定24%提速或与旧实验叠加；即使较小的5.06%也只是这次离线配对结果，不是实际联机延迟改善证明。

四臂wire SHA256：abae05311a58545f838ee4ced8d882ad222a544b2f3cb0cb55caa2bcfb46c5a4；authority+hidden：2aa6f6d94348de134f25bec753c54903d22c4a0831ad773e2be5bb8a84833f38；receiver：54092cd0530c0901581e3dfecb0455a3261af4415e02b93d31987072490e616f，总wire字节一致。Node串行五段不等于真实线程调度、网络、渲染和输入ACK。

## 生产式双无头浏览器
沿用完整真实LanBattle/host/socket/relay/WebGL/桌面helper路径；生产React、minify、ES Workers、COOP/COEP、冻结完整CSS及资源；2玩家20AI、seed917、3200DP、三舰循环、1280×720 D3D11。所有原五项模拟实验、display definitions、presentation/AI/serializer Worker显式false；仅候选臂打开本轮新flag。两臂无CPU采样，无预推进、场景缩减或保护放宽。

第一次加载器在harness执行前写未创建的输出目录报ENOENT：无浏览器、无权威模拟或性能样本。仅预建目录修复；v1证据保留。v2是唯一实际的before→after浏览器功能对照。

两臂主/Worker均真实production且无开发/src/或/node_modules/请求；资源各119/119条、均200；requestFailures和页面errors为空。源码映射中的1192/1194个项目源条目与冻结源完全一致。主UI观测插件的sourcemap warning保留，未变换权威Worker，故下面权威异常映射有效。

两端同样观测到176实体（22根舰、56模块、70战机、28轰炸机），仍在同步阶段。两臂实际请求的host Worker逐字一致：d26569d08966258d67b3a198dfa4f911f910c7f62b24d6a4dfd80397f25c46d4，1211973bytes。改动在接收侧，不能直接降低主机fixedUpdate成本。

|最后权威遥测（不是稳态）|基线|候选|
|---|---:|---:|
|tick|20|20|
|lastStepMs|56.99|58.88|
|simulationMs|64.977|62.65|
|captureMs|14.847|13.237|
|encodeMs|7.175|7.151|
|backlogMs|317.6|310.775|

均在worker-runtime失败。相同异常栈映射到冻结host.worker.ts:392的recover预算拒绝、:531的accumulator>250；房间报告持续过载。每臂3条权威HUD记录都重复同一tick20，**不能把它们当3个独立模拟样本，也不能用两臂上述微小差异计算提速**。

beginPresentationMeasure等待可操控HUD超时30秒；measurement阶段日志不是有效测量已开始。没有20秒有效稳态、输入P95/P99、800ms主线程阻塞ACK、同局重连通过证据。外层runner正常exit0只是完成裁决：实际两子进程均exit1，functionalityPassed=false；见browser-verdict-v2.json、browser-analysis.json。

## 保留状态与下一步
候选显式opt-in，默认关闭；源写集逐SHA保持一致。冻结之后其它任务更改了21个源文件（详见source-drift-final.json），保留未覆盖。保护输入、每臂实际Node输入及两臂共享Node输入SHA无漂移。两臂cleanupCompleted=true；没有停止用户的5173服务。

下一优先级仍是主机AI/火控的重复查询和固定步成本，而不是继续扩接收布局或以提高GPU占用率代替定位。当前176实体场景在主机fixedUpdate阶段就超过16.67ms目标预算；此前CPU诊断的AI/火控调用栈相互重叠，不能相加，也不能直接当作本轮无Profiler时间比例。后续候选仍需正确性与完整链路证据，不能复活已否决实验或跳过过载保护。

证据目录：artifacts/lan-display-extra-layouts-20260928。关键：manifest.json、selection.json、contracts-result.json、extracted-existing-tests.json、preregistration.json、verdict.json、browser-preregistration.json、browser-build-comparison.json、browser-run-manifest-v2.json、browser-verdict-v2.json、browser-analysis.json、source-drift-final.json、final-state.json、remaining-processes.json。
