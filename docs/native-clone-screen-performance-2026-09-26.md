# 原生完整显示图克隆：架构筛选结果（2026-09-26）

## 决策

**不把“每帧整幅显示图 structuredClone”接入生产。** 当前乐观诊断的准备+原生复制+验证/原型恢复均值49.052ms、P95 54.380ms；同期原有编码+Host呈现/解码参考均值23.689ms、P95 27.555ms。原生clone这一段自身均值已达23.455ms。

这不是生产A/B性能百分比，也没有说所有原生克隆协议必然慢。诊断从已解码显示图开始，省略了source projection、跨线程排队、跨帧身份维护和Immutable私有品牌恢复；当前实现加入了自己的显式声明校验，不能当作所有布局/校验算法的数学下界。结论仅是：本次完整图原生克隆方案没有值得继续集成的耗时余量，保留现有增量图+密集视觉协议。

本轮没有改生产TS或默认协议，也没有启用实验开关。整体优化目标未完成。源码/原版边界见 [source-notes](C:/Program Files (x86)/Starsector/starsector-web/docs/native-clone-screen-source-notes-2026-09-26.md)。没有原版实机或双机网络、GPU、最终帧率/input-to-photon新验收。

## 实现与覆盖边界

- 新增 `scripts/lib/native-clone-graph-probe.mjs`：记录允许的原型和冻结状态，调用浏览器真实structuredClone，检查完整节点表唯一性/类型、全部边可达、标量/非法键/访问器/预算，再恢复已审计原型和冻结状态；不执行传入构造器，不导入到生产。
- 支持本场景的Map、Set、typed arrays、循环和共享引用、Vector2、ProjectedRenderShip/System/Weapon、HudContactRecord，以及null原型。Map/Set/typed的额外字段会被原生clone丢弃，探针因此明确拒绝；没有静默删数据。
- **不承诺跨帧对象身份、原Immutable品牌、原ACK/replay/内容签名/失败事务语义。** 专项明确证明metadataBrandPreserved=false，不能把本探针冒充可直接替换的生产协议。
- 原 `scripts/benchmark-real-workers.mjs` 新增显式 `--native-clone-screen`，只允许否则无插桩的Host串行对照；默认关闭。每tick在原Host全部校验完成后探测serial的完整显示图，恢复后的图与原图按Object.is值/键序/别名/原型完整比较。原始packet、witness、权威/隐藏火控/RNG验证仍然原样执行。
- 探针使用同一个生产模块realm，避免不同Vector2构造器造成假失败；原生克隆不传到第二Worker，所以该计时不是IPC延迟。

## 一次集中验证

仅改.mjs工具，没有改生产TS，本轮不重跑全项目typecheck。四个改动文件oxlint --deny-warnings通过；既有render-projection通过，48项新增专项通过。覆盖完整图、循环、Map键/Set别名、NaN/−0/Infinity、冻结/null原型/类恢复、getter不执行、不可克隆标量、行为键覆盖、原生会丢的字段、重复/缺失/不可达/非法类型节点表，并验证失败校验之前不恢复原型、不冻结输入。

没有失败或修复，没有重复全套检查。

## 一次固定200舰诊断

[工件目录](C:/Program Files (x86)/Starsector/starsector-web/artifacts/native-clone-screen-20260926)。冻结324个生产模块，三个角色均使用相同基线、固定串行、balanced六排列；无头Edge153、16逻辑CPU、跨源隔离；200 Onslaught、seed917、150tick预热+60tick测量。每一实际tick都执行一次完整clone，未重复使用静止画面。

| 同realm clone阶段 | 均值ms | P50 ms | P95 ms |
|---|---:|---:|---:|
| 源图检查/节点原型表 | 11.726 | 11.170 | 14.195 |
| 原生structuredClone | 23.455 | 23.305 | 25.650 |
| 全图校验/原型及冻结恢复 | 13.871 | 13.645 | 16.130 |
| 合计 | 49.052 | 48.975 | 54.380 |

合计为每样本完整计时，不能把各阶段P95相加。测量段平均29170对象节点、146904标量、37441边；这些是探针定义的工作量，不是传输字节/显存。

同期原协议参考取三个相同源码实例的encodeMs+hostPresentationMs，共180样本：均值23.689ms、P95 27.555ms。探针会影响主线程竞争/分配/GC，因此不把比值2.071/1.974当独立A/B退化倍数或最终fps。本轮预写要求该未完整集成路径至少有30%均值/P95余量，均未满足。

210份native显示图逐值/别名/原型对照通过；原路径420次packet/见证、422次显示图对照（9307702节点），7个权威/隐藏火控/RNG检查点通过。所有Host最终ready、pendingTransactions=0、tick210。完整324模块测量图与冻结基线相同，生产/工具hash无漂移。

## 后续边界

保留可选诊断工具，默认运行不增加任何clone或图遍历。不复活每帧完整对象图传递；若研究新协议，应仍保留增量和密集数值通道，在实际对象身份/metadata/命令事务边界上验证。不能为了接入原生复制省略已有安全验证或显示字段。
