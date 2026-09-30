# 避碰扫掠范围预拒绝：保留（2026-09-26）

## 结论

保留本轮单一生产改动 TacticalNavigation.ts：每段仍访问所有原障碍，只有相对运动线段两个端点在同一坐标轴都严格处于范围同侧之外时，省略必定无贡献的最近点求解。原候选、8段积分、次序、数学精度、风险公式和安全门槛不变。不是少模拟实体、降低频率，也不是跨帧缓存或GPU方案。

200舰真实Worker一次冻结源图配对：模拟均值 **34.855→33.600ms（-3.60%）**；六段模拟均改善。Host完整交付均值 **62.415→61.420ms（-1.59%）**，五段改善、首段+0.0294%近乎持平；P95改善2.25%。这是一项小幅净收益，不是大规模性能问题已经解决。

## 唯一无插桩配对

独立无头Edge153，16逻辑CPU，crossOriginIsolated；200 Onslaught、seed917、dt=1/60，150预热+180测量tick（共5.5秒模拟）；production LocalWorkerHost完整路径，串行参考/旧/新逐tick交替，不并发推进。两臂workers=0、freshBatches=0、invalidated=0；未强制维持一个无收益的多核分支制造优势。没有profile/阶段/计数插桩、没有测速重跑或删峰值。

| 指标 | 旧均值ms | 新均值ms | 均值变化 | 旧P95ms | 新P95ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 34.855 | 33.600 | -3.60% | 42.445 | 40.880 | -3.69% |
| 编码 | 17.614 | 17.884 | +1.53% | 21.265 | 21.845 | +2.73% |
| Worker往返 | 52.847 | 51.875 | -1.84% | 62.790 | 60.500 | -3.65% |
| Host呈现处理 | 9.539 | 9.517 | -0.23% | 12.445 | 12.085 | -2.89% |
| Host交付 | 62.415 | 61.420 | -1.59% | 73.175 | 71.525 | -2.25% |

编码没有修改且均值上升1.53%，不能掩去；不能把Host呈现处理的微小波动另算优化，也没有GC归因证据。六个30tick区间不是独立实验。交付计时包含Host输入复制/队列、Worker往返、接受ACK/解码/呈现复制和Promise交付，不包含网络、渲染、屏幕呈现或玩家input-to-photon。结果不外推所有混编、长局、模组或真实LAN延迟。

## 正确性与兼容

- TypeScript集中一次退出0；改动三文件oxlint退出0。首次lint命令的Windows路径未启动oxlint，改为PowerShell原生调用后仅补lint，无整套重跑。
- 既有simulation-hotpaths **4020断言通过**（新增1826）。新增合同覆盖ULP边界/双向扫掠/相交、signed zero、极小极大/非有限值/负半径、动态desired/stat读取顺序、替换max/min/abs/hypot回调、积分中途修改数学函数后的逐段回退。完整风险结果用deepStrictEqual，不放宽误差。
- 新增窄场景所有 **156584** 障碍段仍被遍历，最近点求解 **156584→53842**；这是测试构建操作数，不是实际Worker剪枝率或加速率。生产没有counter或测试export。
- 真正Worker **660次**包/witness/音频/命令回执/胜负对照一致；含init **662次**完整显示值/原型/别名对照，共 **18103234节点**；11检查点×两臂完整权威/隐藏火控/RNG一致。

## 隔离与保留

前后320模块完整冻结，唯一生产差异为TacticalNavigation.ts，measured图与candidate图完全一致。工具hash无漂移。其他任务同时修改Gloriana内容，按源图隔离，未覆盖；验收时当前图漂移只有 src/engine/content/GlorianaPack.ts、src/engine/content/GlorianaBuiltins.ts。这些并发变化未纳入本轮性能结论。既有ObjectPatch编解码、协议以及AutofireController与测量基线hash相同。

源码和原版来源/数值推理见 navigation-swept-bounds-source-notes-2026-09-26.md。测试扩展只在既有check-simulation-hotpaths中通过NAVIGATION_SWEEP_BASELINE加载冻结前函数，辅助合同位于scripts/lib/navigation-sweep-contracts.mjs。

工件：artifacts/navigation-swept-bounds-20260926/，acceptance.json、performance-analysis.json、candidate.diff.txt、完整源图、每tick样本和日志均保留。更早CRLF锚点失败在生产写入前停止，setup-repair.json已记录；不存在隐藏的候选测试重跑。基准运行退出0，独立浏览器/Worker/HTTP服务器按原脚本finally清理。

未启用子代理、未操作可见窗口/键鼠；未暂存、提交、推送、打包、发布或修改原版安装内容。当前只是本轮优化已验收，总优化工作继续。
