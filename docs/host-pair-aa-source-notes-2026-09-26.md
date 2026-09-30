# Host三臂基准A/A诊断：预写方案（2026-09-26）

## 动机与范围

fleet-cover-scalars唯一正式配对中，模拟均值−3.977%、交付均值−0.989%而交付P95+0.050ms，已按预设门槛撤回。未改动的编码阶段六段全部变慢（均值+4.621%）；之前数个独立候选也有编码变慢现象。原因未知，不能用JIT/GC/测量偏差猜测覆盖原结果。本次只检查基准自身，不改任何玩法、UI、生产代码、采样频率、字段或真实校验，因此无新增原版行为移植。原版实机不操作。

## 源码观察

benchmark-real-workers.mjs当前三臂为serial/before/after，逐tick把整个数组正/反排列。before总在中间；serial与after在首/尾各占一半。两套构建均独立版本URL；serial与before使用before构建，after使用after构建。所有Host/Worker仍独立，各自模拟/编码及权威审计。以上为已读源码事实；尚不能认定其造成稳定偏差。

## 独立同图对照（只跑一次）

使用已回退的fleet-cover V2 baseline-current-sources.json作为baseline和candidate，同一完整320模块；不启用任何性能/距离/字段计数插桩。沿用原参数200 Onslaught、seed917、dt1/60、150warm+180steps、--host-pipeline --serial-pair，无头独立Edge，不连接用户浏览器。保留原所有正确性oracle。记录源图、实际测量图及runner/helper SHA，确认两份bundle内容也一致。

预先固定分析：
- 列出三个臂所有主指标均值/P95；比较after/before、serial/before、after/serial。
- 固定六个连续30tick区间，不删异常点、不重抽样。
- 按已知奇偶tick执行次序分别列均值，观察中间与首尾差异；这只是探索解释，不可作为调整候选性能的系数。
- 同图观察到的差异不等于确定的测量误差、硬件原因或JIT/GC原因；单次结果不能证明稳定性。
- 不凭本次结果重新接受任何已拒绝生产候选；若发现具体方法缺陷，另立显式基准方法修订和控制检查，不静默更改历史结果。

这是诊断不是新性能候选，不追加整项目typecheck/lint或重复原场景。正式runner无改动，仍使用既有完整Host场景；不新建测试工程。
