# 显示编码形状签名缓存：验收与撤回（2026-09-25）

## 结论

**不保留这次生产候选。** 它通过了完整显示/权威状态对照，但没有建立足够稳定的整体性能收益。已在核对候选及301模块hash没有漂移后，仅把`src/engine/runtime/local/CombatPresentationEncoder.ts`精确恢复为本轮开始时的字节；保留新增回归测试、来源记录、候选源码和原始性能数据。**没有撤回上一轮已接受的导航候选索引，也没有覆盖campaign WIP。**

这不是“所有缓存都无效”的结论，也不证明该候选在所有场景都更慢；只是本次固定场景先导不足以支持为不到半个百分点的平均交付收益永久增加形状缓存与逐对象兼容性检查。总目标仍为继续优化。

## 测量方法与结果

无头Edge153，16逻辑处理器、crossOriginIsolated/SAB可用；真实production local Worker及嵌套owner Workers。200 Onslaught、seed917、固定dt=1/60；150预热+180测量tick。before/serial/after三个世界逐tick交替推进，不并发运行模拟，不开profiler/stage计时/计数探针。有效包/权威审计在测量区间外。

|指标（ms）|before均值|候选均值|均值变化|before p95|候选p95|p95变化|
|---|---:|---:|---:|---:|---:|---:|
|simulationMs|46.530|46.119|-0.88%|56.285|54.780|-2.67%|
|encodeMs|21.851|21.319|-2.43%|29.270|29.580|+1.06%|
|roundTripMs|68.774|67.874|-1.31%|86.870|81.435|-6.26%|
|decodeMs|10.988|11.517|+4.81%|15.015|15.480|+3.10%|
|deliveredMs|79.762|79.391|-0.47%|99.020|94.455|-4.61%|

`deliveredMs = roundTripMs + decodeMs`，不包含渲染、网络或输入到屏幕。模拟和解码源码未改变，不能将它们的波动计为算法收益。端到端均值只改善0.371ms（−0.47%）；p95改善4.61%，但编码p95反而增加1.06%。不能挑选最好指标就宣布成功。

|连续区间|编码均值变化|交付均值变化|
|---|---:|---:|
|151–180|-1.82%|+0.08%|
|181–210|+1.81%|+0.79%|
|211–240|-4.28%|-2.26%|
|241–270|-3.99%|-0.39%|
|271–300|-5.59%|-0.98%|
|301–330|-0.01%|+0.11%|

六个连续区间有三个交付略慢；这六段不是独立重复实验，不提供置信区间或显著性结论。未择优重跑。两臂均tick26启用4个owner Worker、tick49因no-measured-benefit退出，测量期间freshBatches=0；没修改并行收益门槛，没把多线程占用率当收益。

## 正确性及一次测试修复

- 一次类型检查、四个改动文件oxlint通过。
- 一次完整既有render-projection场景运行到新增helper时失败：新测试误把裸图作为UI根，decoder正确拒绝`Invalid UI presentation envelope`。此前既有场景以及encoder/decoder索引helper已执行通过；**不能把该完整命令写成exit 0**。
- 只修改新测试：每帧构建规范五字段`lan-presentation-ui`根；生产UI校验不变。针对该helper的oxlint及SHAPES_ONLY复查通过：491断言，232包/116组新旧有效二进制及全部packet字段对照。
- 包括41帧同tick更新/96同形状记录，键增删/重排/整数/Unicode/type，返回旧shape.keys篡改，环/共享引用/Map/Set/typed/Vector，640个形状超过512缓存上限后的淘汰与退休/重新引入，自定义Object.keys/JSON.stringify getter、receiver与异常，Array/Object继承toJSON、遍历后恢复原型的回调，失败epoch隔离。缓存检查只在实现存在时启用，通用回归合同在撤回后继续有效。
- 真HUD/战术图/部署projector经过captureUi/applyUi的8帧检查（7次真实模拟步）；这仍不是UI画面或交互验收。
- 真实Worker性能测试exit 0：330tick、660有效包对照；含init662次完整显示值/原型/别名对照；11检查点×两臂完整权威及隐藏火控/RNG状态一致。
- 本轮baseline与候选均301模块，仅encoder变化，另300模块hash不变。撤回后所有301模块hash等于baseline；冻结的旧encoder已作为同模块图和真实Worker参考实现验过，不在精确恢复后重复跑全套。

## 保留与下一方向

保留`check-render-projection.mjs`对形状helper的集成及SHAPES_ONLY定向入口、新`presentation-shape-contracts.mjs`、两份说明与全部工件。生产编码器没有净改动，版本0.2.11；不提交、不打包、不发布、不使用子代理或可见窗口。

下一轮应优先减少实际重复遍历/取值或数据表示转换，而不是再给昂贵热路径叠加高成本缓存守卫；任何跳过动态字段/安全检查或降低模拟精度的方案不在此范围内。尚未实现新的专用表示优化，不把方向建议算作提速。

证据目录：`artifacts/presentation-shape-cache-20260925/`：`baseline-sources.json`、`candidate-sources.json`、`CombatPresentationEncoder.before.ts`、`CombatPresentationEncoder.rejected.ts`、`paired-200/result.json`、`validation.json`、`acceptance.json`、`final-graph-verification.json`。原始失败与修复日志均保留。
