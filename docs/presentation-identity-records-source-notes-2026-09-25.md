# 显示编码身份记录合并：修改前对照（2026-09-25）

原版0.98a-RC8 WeaponAPI.java:41/83/135分别提供实时角度、位置、规格接口；ShipAPI.java:60–62为目标读写。本轮不改变这些实时读数或UI，只优化Web内部Worker显示编码；原版没有本协议。参照修改前encoder、wire/decoder和render-projection合同，不宣称原版新界面验收，不操作桌面。

## 新证据
artifacts/presentation-cost-profile-20260925：真实200 Onslaught，150预热+60tick、serial CPU采样。captureGraph自身563.682ms、value199.848ms、isImmutableMetadata45.659ms，GC423.813ms（整段采样，不是每帧，不能相加成收益）。捕获热点包括快照Map查找、WeakMap身份查找及元数据分类/集合检查。形状缓存和按记录写出均已否决，本次不重试它们。

## 方案与不变式
WeakMap对象身份记录同时持有已采样的Snapshot及不可变元数据单位数；BFS队列直接携带该记录，避免每个节点再次按数字ID查询Map。上一帧liveEntries按BFS保留Identity而不保留源对象；本帧未入队者按旧顺序输出removed并立即清掉snapshot，重入仍使用原ID但重新全量编码。删除序、同tick独立帧、别名、环、动态键/原型、完整有效包必须与旧版完全一致。

immutableCopy的私有WeakSet只登记新建并递归复制/冻结的对象，没有把已有对象原地晋升为metadata的API。故首次遇见对象时可以记住元数据分类；大小沿用原来只验证一次的策略。各帧唯一空对象标记在Identity上区分当前/上次元数据可达性，替代used/prior Set；消失再出现必须重新发送。UI仍不走metadata通道，保留共享子对象身份。全部节点/单位数/非法类/属性/类型变化预算检查和每帧字段取值保持，不缓存可变payload或跳过decoder安全校验。异常仍poison epoch。

## 验证与保留门槛
保存profile时冻结源图及修改前文件；最终candidate仅替换encoder，其他并发改动不纳入性能对比。改造既有索引合同的内部表示检查（保持相同可达数/删除/回收断言），增加身份记录/元数据连续、间断、重入及UI共享引用测试。旧encoder同模块图逐包对照、完整现有render-projection；集中typecheck和改动文件oxlint。随后一次无插桩真实200舰150预热+180测量配对，保留全部自动调度差异，核对有效显示/权威/隐藏火控和RNG。未建立完整路径收益则精确撤回生产候选，不碰已有效优化和其它任务，不择优重跑，不提交/发布。
