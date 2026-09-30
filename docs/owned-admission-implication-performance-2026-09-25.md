# 私有 Worker 火控重复资格检查：性能验收（2026-09-25）

## 决定：保留一处小优化

`Ship.ts::hasOwnedFireControlReadHooks` 不再重复读取主/辅助系统的 hasNativeStats。其前置原生 threat-AI 资格递归检查的是更严格的同源定义集合，因此在闭合Worker所有权域中结果不变。只影响此内部函数；通用引擎检查、每舰全名单刷新及全部独立失效条件保留，没有新增权限缓存、降低频率或改变战斗规则。

## 单次真实 Worker 配对

无头Edge153、hardwareConcurrency=16、跨源隔离、200 Onslaught、seed917、dt1/60、150tick预热+180tick测量。使用原生产local Worker、嵌套owner Workers、传输/ACK和主线程生产解码器；本次性能未启用profile/stage/query计数。

双方均在tick26启用4个owner Workers、tick49因no-measured-benefit退出；测量freshBatches=0。没有改并行成本门，结果不代表多核/GPU获得收益。

|指标|before均值 ms|after均值 ms|均值变化|before P95 ms|after P95 ms|P95变化|
|---|---:|---:|---:|---:|---:|---:|
|simulation|45.704|44.809|-1.96%|57.150|53.565|-6.27%|
|encode|22.282|21.408|-3.92%|31.500|29.340|-6.86%|
|roundTrip|68.389|66.639|-2.56%|87.775|83.175|-5.24%|
|decode|11.124|11.653|+4.76%|15.720|15.785|+0.41%|
|往返+解码|79.512|78.292|-1.54%|100.045|97.245|-2.80%|

**只是小幅收益。** 模拟均值约省0.90ms；往返+解码约省1.22ms。编码代码并未改动，编码时间变化可能包含GC/运行时/系统噪声，不能单独归功于此候选；解码均值反而增加4.76%。交付指标不包含渲染、网络链路、帧节拍或输入到画面延迟，不能宣称60Hz、明显体感改善或将跨轮百分比相加。

|连续tick区间|模拟均值变化|往返+解码均值变化|
|---|---:|---:|
|151–180|-2.42%|-2.38%|
|181–210|-1.42%|-0.82%|
|211–240|-5.55%|-4.32%|
|241–270|-2.45%|-1.38%|
|271–300|+0.52%|+1.12%|
|301–330|-0.62%|-1.59%|

5/6区间改善、1/6变慢。这些是同一连续轨迹的分块，不是独立重复试验，不构成跨机型或长时间稳定性的证明。本轮只有一次成功的性能配对；未为寻找有利结果重跑。

## 正确性

- 一次应用类型检查、四个改动代码文件oxlint、既有combat-ai全部48场景通过。测试构建在同一Ship模块附加冻结旧函数，共享native callback WeakMap，不创建第二个Ship类型。
- 64个已注册定义（58个native、含stats-only Eclipse）、外部注册定义和原生定义克隆，共4359组资格/batch对照（3367允许、992拒绝）一致。所有主/辅助定义组合、末尾名单失效与恢复均覆盖；原有外部效果/组件callback/runtime modifiers等逐batch失效对照也通过。
- 原有104挂点/阶段完整火控/RNG对照通过；上一轮预瞄范围19363断言、1152查询、776次剪枝及104挂点/状态对照继续通过。
- 短实际Worker启动/恢复探针：各登记1次、3 rosters、600 batches、0拒绝；witness、完整权威/隐藏状态、显示均一致。
- 主配对330tick，660包对照、662次含init完整显示值/原型/别名对照、11检查点×两臂完整权威/隐藏火控/RNG一致。

## 源图隔离与失败记录

起始302模块与上一轮保留实现逐hash一致。资格测试和激活探针后，首次配对命令在构建阶段遇到同时开发的GlorianaPack引用json当时不可解析；没有进入性能采样，失败日志完整保留（paired-200.log）。另有任务修改内容加载和设计模型，本轮没有回退或覆盖这些文件。

为此给现有benchmark增加--candidate冻结输入，前后两臂固定到起始302模块，after只替换本轮Ship.ts。candidate-input-sources.json与measured-sources.json逐项完全一致：只1个模块变化，其余301不变，无新增/删除。新benchmark参数的scoped lint通过；末尾补齐build-only报告的candidate源图路径。

最终工作区相对受控测量源图仍有并发变动：`src/engine/simulation/Ship.ts`, `src/engine/modding/ModManager.ts`, `src/engine/modding/ContentValidation.ts`, `src/studio/DesignModel.ts`。其中Ship.ts的另一处advanceMotion新增自定义固定推进模块继承父舰指令，与本轮hasOwnedFireControlReadHooks修改不重叠。收尾hash检查发现此项后没有覆盖它，改为逐字核实本轮被优化函数与实测版本相同。

这些并发变动未进入本轮性能结论；不能把固定源图配对说成整个最新工作区/新舰船内容已通过回归。final-files.json记录收尾各文件hash，candidate-files.json保留当时本候选文件hash。

## 工件与边界

`artifacts/owned-admission-implication-20260925/` 保存before字节、baseline-manifest、candidate-input/measured源图、validation.json、combat-ai.log、activation-restore/result.json、paired-200-isolated/result.json、comparison.json、source-graph-comparison.json、acceptance.json及失败日志。

本轮保留生产改动1处、测试/基准增强和文档；不碰生涯WIP，不暂存/提交/推送/打包/发布、不改安装游戏、不启可见窗口。项目版本保持0.2.11。原版实机/界面体验未补验，优化目标仍继续。
