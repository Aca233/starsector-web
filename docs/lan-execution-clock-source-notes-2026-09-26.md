# LAN 显示执行时钟候选：预注册（2026-09-26）

## 转向依据

上一轮片段驻留已否决并回退，CPU定位属于有效进展。继续审阅发现批量Object.getOwnPropertyDescriptors已有明显负收益的诊断（combat-hotloops-performance/source-audit-2026-09-22），不原样复活批量读取、seal/布局缓存或validator微调。

另有尚未单独验证的直接延迟证据：lan-post-block-timeline诊断中，忙任务之后的rAF stamp普遍落后回调实际执行60–70ms。默认LanBattle把这个旧stamp同时用于SnapshotPlayback、MotionReplica、MotionPrediction及250/500ms新鲜度门槛；网络和输入的时间却来自同realm的performance.now。MotionPrediction.render只重放time<now的输入，旧stamp可能位于已经发生的输入边沿之前。这与额外输入边沿绘制是不同候选：本轮不增加帧、不改Worker或网络准入。

本轮只是Web显示调度，不修改原版移动/武器/物理/界面规则，不需要新原版实机交互；不声称原版等价验证。

## 改动及合同

仅在默认页面LanBattle的现有rAF回调通过disposed检查后，以同realm performance.now采样一次执行时间，后续原流水线统一使用它。保留单rAF链、隐藏/同步/权限检查、50ms视觉dt上限、500ms快照重置、最多最后两端点恢复、原输入/ACK预算。

不增加预测上限、不降低频率/精度、不减少实体/字段/效果、不跳过原有验证。remote分支只有页面同步检查使用执行时间，Worker自己的呈现循环不改，也不默认开启。

## 验证与统计（修改前写定）

- 从真实LanBattle源码提取frame回调，验证旧stamp/实际执行时间错位时，apply/sync/pose/draw共享执行时间、dt上限、隐藏/未就绪/销毁、remote及异常停用；不复制一份假生产实现。
- 给既有测试态呈现探针记录实际传给renderPose的poseAt，统计WebGL提交减poseAt。缺失/非法时间不填0。该指标叫**显示时钟年龄**，不是输入到光子、网络ping或运算耗时。
- 一次typecheck、改动lint、时钟/测量/既有post-block合同，之后复用真实联机场景。
- 四臂main before/after/after/before，各20秒，2玩家+20AI、seed917、1280×720、D3D11、普通10秒+DOM输入后主线程70ms忙任务10秒。含主机800ms实际停顿、同局重连、清理。
- 冻结上一有效LAN基线的全部JS/JSON和52份附属CSS、三入口编译CSS；先确认当前LanBattle与该基线hash一致，组内仅覆盖LanBattle。不是最新所有UI源码的验收。
- 配对1-before/2-after和4-before/3-after。**每对**忙时显示时钟年龄P95至少减少30ms且至少40%；普通该指标P95不增加超过3ms。两阶段control→submit、累计ACK覆盖后draw、帧间隔P95均不得增加超过3ms；发送/控制覆盖>=95%且缺失不增加；帧数不得超过基线1.05倍；模拟Hz不得下降超过5%。所有安全场景必须通过。
- 时钟年龄必须覆盖每个真实draw；不会以重新标注时间代替行为验收。探针记录生产renderPose实际参数，源码提取测试验证下游全部使用该参数。
- 没有达标就精确回退生产行；不放宽门槛，不重复择优。默认Worker/v2状态不变。
