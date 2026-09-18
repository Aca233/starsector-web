# 屏幕外尾焰剔除与百舰继续排查（2026-09-18）

## 本轮实际落地

仅新增 `src/engine/render/webgl/ShipEngineRenderer.ts` 的保守屏幕外剔除。

计算每个发动机全部羽流层、偏移喷口、外轮廓和两个光晕的包围范围。整个范围确定在视口之外时，不再生成这些顶点、上传 GPU 数据或为它们切换批次。画面内的层数、几何、亮度、UV、混合顺序均不变。

- 包围范围覆盖转向弯折、扇形展开、喷口偏移、系统延长和相位/加速光晕，不只使用舰体半径。
- 额外保留 2 屏幕像素及 Float32/大坐标余量。
- 非法缩放、非有限边界/范围不进行剔除；边界相切仍保留。
- 所有舰船模拟和视觉状态更新继续执行，不删除舰船或可见特效。
- 纹理准备、稳定视觉随机数、SnapshotPlayback / MotionPrediction、网络协议与恢复预算不变。

## 来自实际联机的采样

在旧的百舰生产构建中采集了房主 Worker 和两个显示线程的 CPU profile。为获得启动前的 Worker 句柄，探针暂扣了 ready 通知；错误发生后只暂扣页面处理以保存 profile，Worker 自身仍按原保护立即停止。探针不是用户流程验收，没有改变正式代码的启动/恢复行为。

Worker 热点仍包括目标/威胁判断、运动与世界名单构造；两个显示线程都大量花费在 renderShipEngines / drawEnginePlume、顶点生成和 bufferSubData。一次此类采样的 Worker 诊断约 27.2 ms/步，而之前未采样运行曾记录 49 ms/步。墙钟耗时存在明显运行差异，不能把差额全部归因于显示线程，也不能把某一次 FPS/RTT 当作原因证明。

证据：`artifacts/lan-hundred-worker-live.cpuprofile`、`lan-hundred-display-0.cpuprofile`、`lan-hundred-display-1.cpuprofile`、`lan-hundred-live-profile.json`。

## 渲染一致性与对照结果

### 几何和像素

- 10,000 个固定种子几何案例：旋转、战机/主力舰、展开角、系统专用发动机、加速、相位、插值、大小、极端坐标/非法输入。
- 9,233 个场景成功跳过屏幕外发动机；其原始每个图元的顶点包围盒均与视口不相交。
- 767 个保留案例的图元参数完全一致；异常输入保持原绘制路径。
- 100 艘实际舰船构成的 WebGL2 场景、1200×800 canvas，使用真实纹理和渲染器。7 个视角（缩放 0.1～4、平移、相机震动、空视口）逐通道比较 readPixels，**全部零像素差异**。
- 已查看输出图片 `artifacts/lan-engine-culling-after.png`，确认不是空画面通过。

### 渲染提交成本

真实百舰显示世界，给定发动机/相机状态，冻结模拟，只计 render 调用的主线程墙钟耗时。使用“前、后、后、前”顺序，每组 30 帧预热后采样 150 帧，逐帧等待 RAF；不是联机 FPS 或端到端吞吐基准。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 合计采样帧数 | 300 | 300 |
| 平均提交耗时 | 3.492 ms | 1.596 ms |
| P95 提交耗时 | 5.5 ms | 2.6 ms |
| 本机附近视角 Draw Calls | 1541 | 515 |

本场景提交耗时约下降 **54.3%**，Draw Calls 约减少 **66.6%**。缩到舰队全景时保留更多发动机（0.1 缩放下为 1541 → 1124），收益取决于镜头，不能推广为所有场景 FPS 翻倍。场景启用 hull/shield/weapon/beam/trail/explosion 层；不是所有背景/UI 成本的测量。

证据：`artifacts/lan-engine-culling-validation.json`、`-log.txt`，改动前源码位于 `artifacts/lan-engine-culling-original.json`。验证全部使用 stdin/内存模块，没有新增测试文件或测试运行器。

## 否决的计算侧实验

还实验了普通舰体 assemblyShips 叶节点路径、combatShips 的循环展平、普通火控提早排除友舰。四轮同种百舰世界各 1200 步；16 个战斗快照检查点，以及层级顺序/增删与返回数组独立性检查通过。

但剔除每轮前 60 步后，合计平均 **20.725 → 21.175 ms/步**，P95 **29.5 → 32.4 ms**，未取得可靠收益。因此三处实验修改已撤回，不进入本轮交付。

回撤仅移除了本任务的三个片段。Ship.ts、CombatEngine.ts 与实验前记录一致；AutofireController.ts 同时出现了其他任务的 FireTargetUtility / CombatPolicy 修改，已保留这些改动以及上一轮预瞄优化，没有用旧文件覆盖它们。

证据：`artifacts/lan-roster-hotpath-original.json`、`lan-roster-hotpath-rejected.json`、`lan-roster-hotpath-validation.json` 和日志。后续物理优化必须重新基于当前工作树定位，不用被否决的实现冒充成功结果。

## 生产构建与未解决的问题

- typecheck、lint、隔离构建通过；存在已有的大 chunk 提示。
- 新构建：`artifacts/lan-culling-preview`，build ID **2026-09-18T01:18:36.975Z**，协议 21。
- 普通 dist 未覆盖，3005/3007/3008/3009 未重启；没有新开常驻入口。
- 构建也包含当时其他任务的 AI/策略改动，因此不能将整体版本的战斗变化归因于尾焰剔除。

### 真实双端仍未通过中大型战斗验收

2 真人 + 同队 AI，初始实帧确认全部部署。沿用现有 start 协议开战，不宣称完成按钮操作全流程：

| 场景 | 结果 |
| --- | --- |
| 32 舰（2 守护者 + 30 锤头） | 前段接近实时，约 18.6 秒时中止；权威 tick 907、最后转发 tick 869；129 份快照、2 次恢复、0 pageerror。错误窗口 simulationMs 86.18 ms、最近一步 136 ms。 |
| 100 舰（2 守护者 + 98 锤头） | tick 19 时触发原有过载中止；仅初始快照，2 次恢复、0 pageerror。错误窗口 simulationMs 141.11 ms。 |

**这两项是失败记录，不能宣称大型联机卡顿已解决。** 没有放宽保护、减舰船、降低物理步频或用慢动作运行来改成通过。

又对同一个已记录的百舰 match，在无 React、无战场显示、无服务器转发的空页中直接运行生产 host Worker，依旧启用二进制快照与消费确认，两个真人席位标记在线：

| 顺序 | 构建 | 中止 tick | 末窗口 ms/步 |
| --- | --- | ---: | ---: |
| 1 | 上轮 hundred-preview | 203 | 21.13 |
| 2 | 本轮 culling-preview | 178 | 22.23 |
| 3 | 本轮 culling-preview | 189 | 22.46 |
| 4 | 上轮 hundred-preview | 203 | 21.74 |

四轮仍超出 16.7 ms/步预算。这不是尾焰算法的物理 A/B（Worker 根本不渲染，两个构建也含其他代码差异）；它证明计算侧问题仍然独立存在。空页运行与真实房间的 seed/加载握手/输入状态不完全相同，无法仅凭数字定位实际房间里的 100ms+ 停顿。

证据：`artifacts/lan-culling-live-final.json` / `-log.txt`、`lan-worker-only-comparison.json` / `-log.txt`。

下一步：实际房间保存完整 match（尤其 seed）、输入/加载时序后，以同场景再对照，结合 Worker CPU/GC 与两端解析还原成本定位长停顿。现有末次实时记录没有保存完整 match，不能假装能逐步重放该失败。百舰物理/中大型联机、长期稳定性和跨机网络验证仍未完成，整体目标保持 active。
