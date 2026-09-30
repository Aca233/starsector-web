# 私有显示类记录布局复用：修改前对照（2026-09-26）

上一目标轮有证据进展：武器字典登记token候选已否决/回退并完成记录。当前重读AGENTS，主代理后台操作，不使用子代理或桌面。

## 原版及Web证据
本机0.98a-RC8 WeaponAPI.java:158 getCurrAngle、185 getLocation、262 getSpec已重新查看，要求当前动态字段；图序列化无原版算法对应。本次不改玩法、UI、模拟频率、数值精度、实体或字段，不宣称原版实机/视觉等价。
最新已保存200舰CPU诊断中display-graph累计775.039ms/60tick，captureGraph self335.842ms；先前分配诊断显示Object.keys分配可观。它们是热点证据，不是本候选加速比例。源码每节点每帧重新枚举键。RenderShipProjection仅三个new类构造点产出的Ship/System/Weapon记录有固定的写入字段集合；源Ship/WeaponSpec、Vector、数组、选取零原型组件及外来同原型对象都不属于本次固定结构域。

## 与已否决seal方案的实质区别
旧方案对所有私有记录seal并冻结keys，还在每次投影时重复登记；其编码+30.50%，已否决。本候选既不seal记录，也不freeze数组；只在上述三个构造点登记一次provenance，UI和非封闭Worker完全保留Object.keys。只在完整投影后第一次编码这些记录时存私有keys，后续仍读取每个字段。只复用结构，不复用值，不改变对象可扩展性。源值替换不改变这三个输出类的字段集合；当前源码每帧写入所有可选字段（包括undefined），没有delete或条件增键。零原型select存在不同字段族/组件别名可能性，故不列为固定类记录。

结构不变证明依赖现有封闭数据命令Worker所有权：Encoder/Projector及这些记录不逃逸，外部只能收到独立包；Worker没有可执行插件或caller getters。同realm恶意修改私有对象不是该边界承诺。缓存不用于received DTO、公共Encoder/UI或其他projector输出；如果以后输出增删可选键或开放Worker插件必须撤销/扩展此证明。所有原prototype、simulation-type、forbidden-key、字段类型、身份、元数据及预算校验保留，未减少接收端真实校验。

## 外部可变包和ObjectPatch
私有keys不直接进入返回包或snapshot.keys。任何changed行（包括ObjectPatch）都复制一次keys作为该节点的新snapshot.keys；未changed时保留旧snapshot.keys。这精确保留外部修改历史shape.keys、首节点shape共享、值变化时切断历史别名的旧生命周期。数组/maps/vector/metadata及其他普通对象继续逐帧枚举，全部字段和精度不变。

## 验证计划
先冻结当前完整源图；仅Encoder/Projection两处生产候选。既有render-projection增加同realm旧Encoder对照，私有类记录切换owned、同tick数值变化/退休重入/新舰、外来同原型动态键、公共/UI路径、历史包key变更以及ObjectPatch切断旧别名均逐包比较；操作计数只验证触达，不是速度。一次typecheck/改动lint/既有场景；随后唯一无插桩200舰150warm+180step Host serial pair，测完整显示/权威/隐藏火控/RNG一致和交付收益。无净收益则按修改前字节撤回，不重复测速择优。此轮不据源码猜测旧方案失败是否由seal/JIT/GC导致。

## 集中验证结果

一次TypeScript退出0（8935ms）、四处lint退出0（100ms）、既有render-projection退出0（5239ms）。完整场景522564断言；专项6335检查、77个精确包对照、870次私有布局记录检查。专项确认唯一取keys后复用、记录/keys未封闭冻结、foreign与零原型组件保持动态路径，以及ObjectPatch替换snapshot.keys后旧历史包键变更不触发多发。计数只证明触达，不是性能。正式图320模块，唯一生产差异Encoder/RenderShipProjection。

## 最终验收

唯一正式配对编码均值+5.04%，六段全部更慢；交付均值+0.65%，四段更慢。交付P95 -3.59%已披露，但不满足读结果前记录的整体保留门槛。候选已否决，按修改前原字节恢复两份生产文件与测试入口，专项helper归档；320模块与baseline一致，既有避碰与字典未变。见render-record-layouts-performance-2026-09-26.md、acceptance.json、rollback.json。未重复测速、不继续该布局缓存变体，不把减少keys调用当提速。
