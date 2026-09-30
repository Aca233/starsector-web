# 显示标量快路径：否决与回退（2026-09-26）

## 结论
**候选已撤回，本轮没有新的生产提速。** 在真实200舰固定串行配对中，显示编码均值17.618→18.144ms（+2.98%），Worker往返＋解码65.318→66.262ms（+1.45%）。六个连续区间中五个更慢。没有为了得到正收益重复测量，也没有用编码P95的轻微下降掩盖均值退化。

唯一生产候选文件CombatPresentationEncoder.ts已按原始字节恢复，SHA-256为`979803d70fcb410ffb06470a594bc369da3eeb13093abc591046103448062226`。前两轮火控静态资格Guard、Owner观察字段直接访问仍保留；本轮只留下回归覆盖、可选基准诊断和否决证据，不更改生产多核选择策略。

## 来源和实验边界
修改前依据见[source-notes](C:/Program Files (x86)/Starsector/starsector-web/docs/presentation-owned-scalars-source-notes-2026-09-26.md)。本机原版0.98a-RC8的CombatEntityAPI位置/速度实时接口仅作为状态语义依据；Web显示图编码没有原版算法对应。未修改玩法、界面、频率、精度、实体/字段数量或校验，未操作桌面，未做原版可见实机验收。

候选只针对封闭Worker的显示图：在确认原生Ship实例判断与Object.is表面未被覆盖后，原始值跳过instanceof Ship；节点已变化后，其余标量仍完整读取和写入，但跳过不能改变最终结果的Object.is。普通/UI路径、对象检查、图遍历、预算、错误/失败epoch、BFS和发布字段均保留。候选通过语义检查但没有速度收益；**不把原因未经验证地归结为JIT**。

## 三种测量分开解释

### 1. 热点定位，不是提速证据
[CPU采样工件](C:/Program Files (x86)/Starsector/starsector-web/artifacts/current-cost-profile-20260926/profile-summary.json)：200舰、150tick预热＋60tick采样；captureGraph自身约368ms、inclusive约865ms，value约146ms、scalar约69ms。value共93次采样hit，其中45个line ticks位于instanceof Ship。整个Worker GC约340ms，不能全部归于编码。
采样时模拟均值44.968ms、编码21.844ms，含采样和审计开销，不能与下面正式速度数据拼接计算收益。

### 2. 无额外计时插桩的正式配对
一次真实production local Worker、production主线程decoder实验；独立无头Edge153、16逻辑CPU、cross-origin isolated。200艘Onslaught，seed917，固定dt，150tick预热＋180tick测量，serial/before/after逐tick交替。
完整311模块前后源图冻结，只改变Encoder；measured图与candidate输入图一致。测试构建固定串行仅为隔离显示开销；两臂测量段freshBatches=0、invalidated=0。没有profile、stages或fire-query-audit插桩。

| 指标 ms | before均值 | 候选均值 | 均值变化 | before P95 | 候选P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 完整模拟 | 37.240 | 37.358 | +0.32% | 43.535 | 45.130 | +3.66% |
| 显示编码 | 17.618 | 18.144 | +2.98% | 23.895 | 23.705 | -0.80% |
| Worker往返 | 55.257 | 55.916 | +1.19% | 66.895 | 68.070 | +1.76% |
| 主线程解码 | 10.061 | 10.346 | +2.83% | 13.050 | 13.530 | +3.68% |
| Worker往返＋解码 | 65.318 | 66.262 | +1.45% | 77.450 | 78.350 | +1.16% |

六个连续30tick区间的编码变化：+3.60%、+3.27%、+6.61%、-1.83%、+3.90%、+2.66%。交付也有五块更慢。这些相关区间不是六次独立实验，不能冒充统计显著性。
Worker往返＋解码不包含渲染、网络或input-to-photon，不换算为实际FPS/TPS。本轮只据此否决候选。

330tick中完成660次有效帧对照、662个完整显示图对照、18,103,234次对象节点访问；11个检查点的权威、隐藏火控和RNG状态一致。语义一致不等于性能合格。

### 3. 默认模式激活/恢复审计，不用于速度结论
另以200舰、0预热＋55tick、fire-query-audit和decode跑一次默认自动模式。新建Worker快路径56帧、通用路径0帧；恢复Worker快路径1帧、通用路径0帧。恢复仅在重放结束时捕获显示，所以1帧正常，不要求56帧。
默认自动臂有19个新Owner批次、invalidated=0，tick27启用4个Owner，tick49以no-measured-benefit退回串行。witness、authority+hidden、display恢复核对通过。这证明候选确实进入过真实Worker快路径，不证明默认多核更快；生产策略未修改。

## 验证与精确回退
- 候选集中验收：类型检查通过；5个改动代码/测试文件oxlint通过；完整既有render-projection通过83,629项检查。
- 新增标量合同：218个包、77次精确旧/新包对照，登记后12次owned capture请求；包括特殊数值、集合、别名/环、同tick、增删键、自定义intrinsic方法/访问器和完整拒绝规则。
- 候选否决后只对两份调整的测试文件做oxlint和定向标量合同，没有重复全套：130项通过，218个包、77次精确对照；ownedCalls=0，符合原始实现没有该快路径入口的事实。
- 回退逐字节与本轮原始文件相同。恢复后的311模块全部等于本轮baseline；最终核对时未发现相对冻结基线的新并发漂移。既存工作区其他改动保留，未用Git重置整个文件集。
- 前两轮五个生产文件均与本轮开始时hash一致，不受回退影响。此结论仅覆盖核对时点，之后的并发改动不能冒称已经由本轮验收。
- 未暂存、提交、推送、打包或发布；未修改安装游戏。

## 留下的支持代码
- [presentation-owned-scalar-contracts.mjs](C:/Program Files (x86)/Starsector/starsector-web/scripts/lib/presentation-owned-scalar-contracts.mjs)：普通/登记引擎、原始值、intrinsic回调和错误路径合同；兼容不提供owned入口的原实现。
- [check-render-projection.mjs](C:/Program Files (x86)/Starsector/starsector-web/scripts/check-render-projection.mjs)及[render-projection-contracts.mjs](C:/Program Files (x86)/Starsector/starsector-web/scripts/lib/render-projection-contracts.mjs)：接入既有测试；新增RENDER_PROJECTION_SCALARS_ONLY定向入口。
- [benchmark-real-workers.mjs](C:/Program Files (x86)/Starsector/starsector-web/scripts/benchmark-real-workers.mjs)：仅fire-query-audit测试构建可选统计fast/generic帧数；当前原始生产Encoder不含候选锚点，不生成该计数。正式速度不启用这些计数。

## 证据索引
- [配对结果](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/serial-pair-200/result.json)、[指标与分块](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/comparison.json)。
- [默认激活与恢复](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/activation-restore/result.json)、[候选验证](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/validation-status.json)。
- [回退后定向验证](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/rollback-validation-status.json)、[回退后合同](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/rollback-contracts/contracts.json)。
- [精确回退](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/rollback.json)、[源图验证](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/source-verification.json)、[最终工作区核对](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/final-workspace-verification.json)。
- [被否决的Encoder存档](C:/Program Files (x86)/Starsector/starsector-web/artifacts/presentation-owned-scalars-20260926/CombatPresentationEncoder.rejected.ts)仅为实验工件，不进入生产构建。

## 后续方向
当前更值得调查的是显示图重复遍历/复制及分配的结构性成本，而不是继续堆叠这个标量分支组合。任何新路径都应保持完整状态、验证和协议语义，并用冻结源图配对验证；不直接复活已经否决的shape缓存、按行预留、decoder复用组合，也不以提高CPU占用率或强制多核代替净延迟收益。
