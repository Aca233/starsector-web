# 封闭Worker私有渲染记录键布局：实测与否决（2026-09-26）

## 结论：否决并精确撤回
本候选尝试仅在封闭Worker内，登记RenderShipProjection自己创建的固定字段记录，首次编码时seal记录并保存私有冻结keys；以后保留全部字段值读取和协议校验，省去这些记录的重复Object.keys。它不是通用对象池，也不是此前已否决的枚举后签名缓存。

语义检查通过，但一次正式200舰配对显示：编码均值 **+30.50%**，Host完整交付均值 **+8.48%**，P95 **+8.24%**。六个连续分段全部退步，不能因枚举数减少就认为优化成立。因此生产Encoder/RenderShipProjection及候选专属测试入口/插桩均恢复到本轮起点；前两轮相位查询和HUD单次投影优化完整保留。**本轮没有新增生产提速。**

## 正式测量
新无头Edge/Chromium 153，hardwareConcurrency=16，crossOriginIsolated=true、SharedArrayBuffer可用。固定种子、固定dt，真实production Worker + LocalWorkerHost；前后均固定串行，不把并发调度变化当实现收益。每臂150tick预热、180tick测量，依次交替执行前后臂，一次正式运行，不反复重测或选最好结果。没有profile、host-stages和fire-query-audit插桩。

| 阶段 | 均值ms，原→候选 | 均值变化 | P95 ms，原→候选 | P95变化 |
|---|---:|---:|---:|---:|
| 模拟 | 35.794 → 36.101 | +0.86% | 45.710 → 47.270 | +3.41% |
| 显示编码 | 18.088 → 23.605 | +30.50% | 23.405 → 30.085 | +28.54% |
| Worker往返 | 54.280 → 60.136 | +10.79% | 69.110 → 75.960 | +9.91% |
| Host呈现处理 | 10.847 → 10.518 | -3.04% | 14.100 → 13.975 | -0.89% |
| Host完整交付 | 65.158 → 70.683 | +8.48% | 81.800 → 88.540 | +8.24% |

P95按排序后floor((n-1)*0.95)计算，均值和P95均与runner原始汇总逐项相符。固定的六段每段30tick：

| tick | 编码均值变化 | 完整交付均值变化 |
|---|---:|---:|
| 151–180 | +31.76% | +8.11% |
| 181–210 | +27.23% | +6.61% |
| 211–240 | +32.55% | +7.88% |
| 241–270 | +25.82% | +8.25% |
| 271–300 | +37.45% | +11.15% |
| 301–330 | +27.54% | +8.14% |

所有正式样本workers=0、mode=serial；freshBatches=0、invalidated=0。330tick共660次witness、662个完整显示图、18,103,234次显示节点访问对照；11个检查点的权威/隐藏火控/RNG一致。Host均ready、pendingTransactions=0，最终tick330。Host呈现处理略快不抵消编码退步。

Host完整交付包含输入复制、排队、ACK、呈现处理和Promise交付，不包含渲染、网络RTT、rAF节奏或input-to-photon；不能直接换算实际FPS或联机延迟。此次单一场景足以否决该实现，不代表所有舰种/机器的定量表现。

## 激活与恢复，单独的非速度证据
默认自动模式另跑200舰、0预热+55tick，开启测试构建fire-query-audit和decode，未用于上表。
- 初始化56次capture、5202个首次登记记录、286110次布局复用。
- 恢复重放结束只捕获一次显示：frames=1、admitted=5202、reused=0，符合生命周期。
- 恢复witness、authority+hidden、display全部一致。
- 自动臂tick27启用4个Owner，tick49因no-measured-benefit回串行；19个fresh批次、invalidated=0。证明候选在真实Worker内启用，并不证明多核更快；没有强制修改生产多核策略。

## 语义验收及两次测试修正
集中执行一次typecheck（10160ms）和6个改动代码/测试文件lint（141ms），均exit0。完整既有render-projection命令**exit1，不宣称完整命令通过**：前面的既有断言执行完，在新布局测试给已发布Vector2加z字段处触发既有“Presentation identity changed type”。这是新测试夹具把Vector节点变成Object节点的错误，并非允许的字段更新；旧/新实现均应拒绝。

随后只做失败点和未执行部分的定向验证，没有重跑全场景或正式测速：
1. 改为合法坐标变化，另单测两实现对类型变化都拒绝。新布局合同8016项通过：72个逐包精确对照、1470个私有记录封闭检查，指定对象6次capture的Object.keys调用原6次→候选1次；动态外来记录、源数据不seal、可写字段值、历史packet.shape.keys变更语义均保留。包含Onslaught/Paragon、Doom/Harbinger、Astral/Sunder、Gloriana/Paragon。
2. 补跑失败点之后的HUD合同，发现原测试假设参考实现一定尚未做HUD单次投影；本轮参考已经包含上一轮优化，旧“参考必须更多读取”断言不适用。修正测试识别参考实际是否调用captureReadonly：未优化参考仍须有更多读取；已优化参考须与当前相同。当前每帧仍强制一次readonly入口、每源身份只投影一次，保留逐包/完整显示对照，不弱化候选义务。
3. 只补剩余6组共81407项：HUD 524、scalar 130、index 29372、decoder 50096、shapes 485、rows 800；定向lint通过。scalar报告的owned调用来自本候选captureGraph的第四参数，不表示以前否决的标量快路径恢复。
4. 撤回生产候选后，仅再验收保留的HUD测试修正：524项、64个精确包对照通过。不重复typecheck、全场景或性能测量；其他撤回文件通过逐字节hash确认与已知基线相同。

## 冻结来源及并发保护
初始V1冻结315模块。验收之后、任何本轮性能运行之前，检测到另一任务修改GlorianaArmory.ts舰装数据；没有新增import或依赖。保留V1并记录incoming-armory-update.json，新建V2 baseline-current-sources.json/candidate-current-sources.json，**两臂都纳入同一最新舰装文件**，差异仍仅Encoder/RenderShipProjection。没有覆盖另一任务，也没有因结果不好重新选基线。

早期合同使用V1构建；真实Worker/Host测量使用V2。这不意味着已经检查最新舰装的所有玩法、外观或原版等价。正式measured源图315项逐字节等于V2候选；activation源图314项只少LocalWorkerHost.ts。

撤回前核对所有本轮活动文件hash，保留全部候选代码到rejected-candidate。两生产文件和三个入口/benchmark文件恢复本轮备份；候选专属helper移入实验工件目录，不进入活动测试。唯一保留的活动代码改动为通用HUD参考测试修正。撤回后315模块全部等于V2 baseline，未发现新漂移；Ship.ts/local-combat.worker.ts相位优化hash、上一轮HUD Encoder hash均保留，最新Armory仍在。核对只覆盖记录时点，不保证以后并发改动。

未操作桌面，未启动子代理，未降低频率/精度/字段/验证，未暂存、提交、推送、打包或发布，未修改游戏安装内容。

## 解释与后续边界
此轮确认：**少做Object.keys，不等于更低总成本**。新增身份登记/所有权查询、seal、冻结keys和结构表示变化可能影响整体性能；本轮没有分离实验或CPU剖析，不能把30.50%退步全部归因于其中某项，也不能把枚举次数当作实测GC/内存收益。

后续应优先寻找可以真正省去整段重复投影、遍历或跨线程复制的工作，再验证完整交付，而不是继续给通用图遍历堆缓存或为占用率强制多核。本记录不否定所有对象池/GPU方案，只否决此份候选实现；不得无新证据原样复活。

## 证据
- 正式结果：artifacts/owned-render-layouts-20260926/host-serial-pair-200/result.json
- 重算指标、六分段和候选hash：artifacts/owned-render-layouts-20260926/performance-analysis.json
- 激活/恢复：artifacts/owned-render-layouts-20260926/activation-restore/result.json
- 初次验证及失败：artifacts/owned-render-layouts-20260926/verification-status.json、contracts.log
- 定向合同：artifacts/owned-render-layouts-20260926/targeted-contracts/contracts.json、remaining-contracts.json
- 撤回后HUD合同：artifacts/owned-render-layouts-20260926/restored-hud-contracts/contracts.json
- 回退/最终源图与hash：artifacts/owned-render-layouts-20260926/rollback.json、final-verification.json
- 被否决代码：artifacts/owned-render-layouts-20260926/rejected-candidate；未进入活动测试的helper另保存在rejected-layout-contracts.mjs
