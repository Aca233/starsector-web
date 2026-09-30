# 显示编码按记录写出：验证与撤回（2026-09-25）

**撤回生产候选，不把小幅编码波动当作整体提速。** 编码均值−0.88%，但Worker往返+解码均值+0.49%；六个连续区间三升三降，没有净收益，不择优重跑。仅encoder恢复到本轮开始时的准确字节；301模块逐hash等于baseline，前轮导航优化和其他WIP不变。保留扩容边界回归测试及失败证据。版本0.2.11，目标继续active。

## 完整路径性能

真实production Worker及嵌套owner Workers；全新无头Edge153、16逻辑CPU、cross-origin isolated；200 Onslaught、seed917、dt=1/60，150预热+180测量。before/serial/after逐tick交替，不并发推进，无profiler/计数探针。before tick27启用4 workers、after tick26；双方tick49退出no-measured-benefit，测量freshBatches=0。未改变并行成本门。

|指标ms|before均值|候选均值|均值变化|before p95|候选p95|
|---|---:|---:|---:|---:|---:|
|simulationMs|45.416|45.567|+0.33%|53.465|53.170|
|encodeMs|21.592|21.402|-0.88%|27.500|27.370|
|roundTripMs|67.406|67.382|-0.04%|79.990|80.765|
|decodeMs|10.991|11.396|+3.68%|15.305|15.920|
|deliveredMs|78.397|78.778|+0.49%|93.145|93.150|

模拟、解码代码未改，相关波动不是算法收益。deliveredMs只含本地Worker往返及完整显示解码，不是FPS、网络RTT或输入到屏幕。连续块不是独立重复实验，不声明统计显著性。

## 校验

一次类型检查、改动文件oxlint、完整既有render-projection命令全部exit0：4459断言，包括178组同模块图旧encoder有效包字节/字段对照。新增行写出helper800项断言，64包/32组对照，8种回收缓冲区初始容量（含无效/非2次幂），65,537元素巨行、多级扩容、全9种typed array、同tick增缩、Getter/环/别名/Map/Set/Vector、完整容量及回收未用尾部字节均一致。原型/形状/失败epoch和真实UI projectors的前轮合同继续通过。

真实Worker330tick/660包、含init662次完整显示值/原型/别名对照，11检查点×两臂权威和隐藏火控/RNG一致。源码301模块中仅encoder变化，其余300完全相同。完整测试不代表所有无效宿主状态已经覆盖：审阅还发现被拒绝的reserve循环若调用者在Getter中将recycled缓冲区缩到0，可能无法推进；未来若复用该候选，必须先补零容量/丢失前缀保护。此边界仅源码检查发现，未执行可能挂起的路径；当前已恢复旧实现，不保留新循环。

精确恢复后不重复整套验证：旧源码已作为同模块图及真实Worker参考臂运行。未提交、打包、发布或使用可见窗口/子代理。

## 后续选择

形状缓存、按记录写出两次对照均未建立完整路径收益；停止在这两处继续堆小改动。下一方向转回模拟端的重复资格/候选扫描，先核对原生AI阶段的读写与失效条件，不能通过省略安全检查伪造速度。

证据：`artifacts/presentation-row-writes-20260925/`内baseline/candidate-sources、原/拒绝encoder、contracts/contracts.json、checks.json、paired-200/result.json、graph-comparison.json和acceptance.json。两个源码快照未覆盖。
