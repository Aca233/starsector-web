# 本地显示快照索引复用：修改前对照（2026-09-25）

## 证据与范围
当前 CombatPresentationEncoder.ts 的 captureDelta() 每帧分配对象去重 Set、next 快照 Map，所有节点重新插入 Map；旧 Map 下一帧弃用。读取属性值、比较 delta、处理 immutable metadata、校验预算与类型另有既定契约。
此前真实 local Worker 的 200 Onslaught CPU 剖析 artifacts/fleet-cpu-20260924/profile/serial.cpuprofile 中，captureDelta 自身约727ms、包含时间约2053ms；GC 约1164ms。该 profiler 覆盖整段采样，数值不是每帧耗时，不可相加或直接用于宣称优化百分比。

这是 Web 内部 display-only 编码器的数据结构优化，不改变模拟、原版玩法/UI、视觉字段或 wire format。原版没有此 Worker 显示协议；等价基准是修改前的本地协议实现、CombatPresentationWire/Decoder 和既有 render-projection 合同。没有进行或需要原版窗口操作；不宣称原版界面新验收。

## 预期行为 → 方案
- 保持每帧相同的 BFS 访问次序、id 分配、属性读取、类型/预算检查和变化检测。
- 每对象 WeakMap 身份记录增加本帧入队标记，替代本帧 seen Set。不保存权威对象的可变字段值。
- snapshots Map 原地更新，通过不包含任何世界数据的每帧唯一标记判定存活；移除本帧未出现的条目。不积累跨帧失效快照。
- 保存上一帧现有 ids 数组用于按原顺序生成 removed，避免原地 Map 的历史插入顺序改变线上结果。
- 用唯一对象标记而非累计数值代数，避免超过安全整数后标记重合；每帧仅新增一个极小标记对象。
- 异常仍 poison 当前 encoder epoch，不能重试半完成的数据。字段删除、类型变化、元数据及预算错误不能被缓存隐藏。

## 验证与否决条件
扩展已有 render-projection 场景：共享引用、环、重排/移除/重插、Map/Set/typed 数组、可变字段、同 tick 重复捕获、编码失败隔离；可选冻结旧 encoder 与当前 encoder 在同一世界逐包比较有效数字区、所有 packet 字段及 removed 顺序。集中 typecheck + scoped lint + 既有场景。
冻结当下完整源图，用既有真实 Worker 基准测200舰、固定种子与步长、逐 tick 显示/witness/声音/回执/胜负及完整权威/隐藏 RNG 审计。只在编码/往返有实际收益且无正确性回归时保留；不能把新增缓存或删除分配本身当作整体提速。既有成本保护保持默认；不能通过减少实体/模拟频率/审计获得收益。
禁止提交、发布或打包未完成生涯；不改其它任务文件。
