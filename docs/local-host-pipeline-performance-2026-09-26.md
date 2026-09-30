# 真实LocalWorkerHost交付成本分解（2026-09-26）

## 结论：填补测量缺口，不修改生产事务
本轮不是新提速补丁。新增既有基准的真实Host入口，测到200舰默认战斗、战术地图关闭时，地图/部署复制＋显示名称登记＋回放记录合计只有0.032ms；receive总计减decoder.apply仅0.042ms。**这不是当前卡顿的主要来源，不值得为它改变事务屏障、回放或校验。**
同一诊断中的完整Host交付均值60.230ms，主要仍是模拟34.940ms、编码16.603ms、decoder.apply 8.213ms。不能与前几轮不同运行/不同预热及测量长度的数字相减，冒称提速。
整体优化目标仍未完成；本轮进展是用真实生产路径排除错误方向，并留下可复用的完整交付测量能力。前两轮被否决的显示候选仍未恢复，已有有效优化保持。

## 工具如何进入真实路径
修改前记录见[source-notes](C:/Program Files (x86)/Starsector/starsector-web/docs/local-host-pipeline-source-notes-2026-09-26.md)。
- [benchmark-real-workers.mjs](C:/Program Files (x86)/Starsector/starsector-web/scripts/benchmark-real-workers.mjs)新增--host-pipeline，自动包含decode，实例化原生产LocalWorkerHost。它真实执行内容签名、输入复制/排队、发包、ACK验证、解码、UI快照、回放日志、resolve与pump。不是复制这些步骤写一个更容易通过的伪Host。
- [浏览器Host适配器](C:/Program Files (x86)/Starsector/starsector-web/scripts/lib/benchmark-local-host.mjs)仅保存原始Worker onmessage并在转交前观察收包时刻，原事件与receiver原样传入生产handler。只有既有测试构建的benchmark-audit消息在计时外拦截；真实ACK和错误不绕开Host。测试构建仅把Worker .ts URL改为对应.js及测试arm参数。
- 独立入口URL给每个测试世界独立Host模块实例；实际断言它们首个epoch=1，没有修改生产epoch分配。每个Host仍是single-in-flight。
- --host-stages另行启用测试构建分段计时；不开时不向生产模块插入计时。hostPresentationMs明确是原Host的decodeMs（包含UI复制/strings），不会与旧基准纯decoder.apply的decodeMs混用。deliveredMs测Host.step开始至返回promise完成，包含输入复制/等待/解码/日志。
- --fire-query-audit的恢复探针暂需用原始Worker入口单独运行，工具显式拒绝混用，未把旧恢复路径伪称Host恢复验收。

## 一次200舰诊断
冻结312个生产模块，Edge153独立无头浏览器、16逻辑CPU、cross-origin isolated，200 Onslaught、seed917、dt1/60，150tick预热＋60tick测量。两世界逐tick交替；serial关闭Owner，parallel使用原默认策略。后者tick27启用4个Owner、tick49按no-measured-benefit回串行；两臂测量段freshBatches=0、invalidated=0。
**本轮开了host-stages，属于定位诊断，不是无插桩前后速度收益实验。** 下表只报告serial臂，另臂不是“优化后”臂。

| 阶段 ms | 均值 | P95 |
|---|---:|---:|
| 完整模拟 | 34.940 | 39.600 |
| 显示编码 | 16.603 | 23.010 |
| Worker收包前往返 | 51.962 | 60.740 |
| Host presentation（含UI复制） | 8.238 | 11.725 |
| Host.step完整交付 | 60.230 | 68.135 |

### Host内部诊断
| 阶段 ms | 均值 | P95 |
|---|---:|---:|
| ACK/tick/witness验证 | 0.002 | 0.005 |
| decoder.apply | 8.213 | 11.685 |
| 战术地图快照复制 | 0.008 | 0.015 |
| 部署快照复制 | 0.011 | 0.020 |
| 显示名称登记 | 0.004 | 0.010 |
| ACK显示帧组装 | 0.003 | 0.005 |
| 回放日志记录 | 0.010 | 0.015 |
| receive总计（包含上述阶段） | 8.255 | 11.745 |

计时分辨率和插桩开销会影响这些微小数字，只能认定该场景下它们远小于毫秒级主成本，不宣称精确微秒收益。receive总计包含各子项，不能与它们重复相加。
Worker收包前往返减模拟＋编码约0.419ms，包含输入准备/IPC/主线程调度等残余，不能全归因于某一种等待。

## 验证、工具失败和修复
- 改动的两个.mjs文件oxlint通过。没有生产TS修改，本轮未重跑全项目typecheck或无关全套测试。
- 首次工具启动在init阶段失败：独立第二个message监听器观察结果可能晚于原handler产生的promise continuation，settle尚未拿到ACK。没有进入预热/测量，不是生产模拟失败。保留[原失败日志](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/startup-failure.log)与修复说明。
- 只修测试适配器的观察顺序，改为在保存的原始handler之前观察并转交，生产Host未改。随后完整200舰诊断exit0。
- 210次有效帧字节/头字段与witness/audio/results/outcome对照，211次完整显示图对照，4,653,851次对象节点访问；7次权威/隐藏火控/RNG检查点一致。每tick额外对照两个真实Host公布的战术地图/部署快照。
- 两个Host结束均ready、pendingTransactions=0、tick=210、sequence=211；生产checkpoint witness与最后ACK相同，RLE的一条step记录完整覆盖210次已提交输入，不是漏记209帧。
- 原始Worker默认入口和不带host-stages的Host入口各跑既有2舰、3tick短场景通过，作为工具兼容性验收，不用这些启动数据作速度结论。
- 最后把原始driver的retainedObjects数量断言移到两种入口共用位置，防止Host模式漏掉每帧保留量审计；针对这个断言再跑2舰3tick Host场景通过，没有重跑200舰诊断。200舰诊断原本已通过结尾保留数量及所有逐帧完整图对照，报告不冒充它运行了后加的逐帧数量断言。

## 场景和结论限制
未开启战术地图，没有高频变动的手动输入/大量命令，没有实际React/音频播放/画面渲染/网络/后台tab节拍，故不能把结果当实际FPS、LAN或input-to-photon。日志样本为相同autopilot输入的RLE路径，不声称所有操作组合的日志成本相同。
源码检查[FixedTimestepScheduler.ts](C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/FixedTimestepScheduler.ts)已有异步tick完成后调用drain，并不是每一步固定等待下一次rAF；仍有maxSubSteps/预算/clockRevision等边界。本轮没有测真实绘制循环或更改调度器，不能据此宣称所有额外等待为零。

## 下一方向
继续回到已有采样确认的火控热路径。源码中FireControlQueryBatch.targets已在本次只读阶段逐舰确认资格，而AutofireController遍历这个已合格列表时又逐目标查同一个targetStatus。候选方向是复用本次扫描已证明的资格，消除重复查表，而不是跨帧缓存状态。尚未实现；必须先证明闭合Worker/原生只读域、当前目标与fallback语义、重入与闭合失效、稳定选择顺序，再做旧/新完整权威对照和包含Host的正式配对。不能跳过原始资格扫描或公共/自定义回调路径。

## 工件与工作区
[200舰完整结果](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/diagnostic-200-fixed/result.json)、[分析摘要](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/analysis.json)、[短场景状态](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/smoke-status.json)、[最终定向验证](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/final-validation-status.json)、[冻结/当前文件核对](C:/Program Files (x86)/Starsector/starsector-web/artifacts/local-host-pipeline-20260926/final-workspace-verification.json)。
最终核对所有冻结生产模块无漂移，本轮生产净修改0。保留测量脚本和报告；未暂存、提交、推送、打包、发布、修改安装游戏或启动子代理/可见窗口。
