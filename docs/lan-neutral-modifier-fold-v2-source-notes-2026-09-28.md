# 空修饰器身份折叠：来源与准入（2026-09-28）

## 来源 → 行为 → 差异 → 验证
原版0.98a-RC8，../decompiled/starfarer.api/com/fs/starfarer/api/combat/MutableStat.java:230–248（flat/percent从0累加、mult从1连乘）与MutableShipStatsAPI.java:129–133（各武器类型射程独立）。保留完整有序组合，不能因“近似中性”跳过-0、NaN或任意动态字段。此轮无UI变更、无原版实机验收，不宣称还原完成。

当前ShipSystem.modifiers对不可用或缺省回调构造{}，即使两个分支全缺省，仍递归生成三类空武器对象及枚举字段。候选仅用模块私有标识区分引擎自己生成的两种全空形状：bare与composed。两个私有中性结果之间直接返回composed标识；扩展回调返回的任意对象（包括{}、Proxy、访问器或继承字段）不能据形状取得此身份，仍走原combineSystemModifiers。活动/可用性/辅助链/runtime/父模块回调的调用顺序不变，不存储任何战斗数值。存在Object.prototype.weapons时不消除合并，避免绕开继承读取。

公共唯一复合对象出口readNativeMotionModifiers在私有中性结果处重新物化原形状及新鲜可变对象；所有公共scalar出口仍逐次读取。combineSystemModifiers自身完全不改。private modifiers不是扩展API；不承诺绕过TS private访问的返回身份。无需全舰队准入或每getter对象描述符审核。

此方案不复活已否决的空Object.keys跳过、相位/列表缓存或六stat缓存。一次aim的数据复用仍不准入：canTarget→isCollisionless/externalPhase与traceTarget→getShieldCenter/isShieldPointBlocked存在回调和射手突变边界，没有安全、低成本的局部证明；AutofireController不改。

## 写集、开关、验收
唯一生产写集src/engine/simulation/ShipSystem.ts；VITE_AI_NEUTRAL_MODIFIER_FOLD=true显式实验，默认关闭。五个已有模拟实验全部关闭。候选与旧实现、缺省候选用重新冻结的当前源、依赖、资源构建，固定Node v24.13.0。一次typecheck+单文件lint+集中合同（数值、回调/异常/重入、公开对象身份/变更隔离、真host init/reinit/default、60完整步authority与隐藏RNG/tracker）。

唯一ABBA：2玩家+20AI，三舰循环、seed917、3200DP，初始176实体734挂点；各150热身+120完整步，A0/B1/B2/A3独立隐藏进程。两热配对分别至少3%改善、两冷配对回退不超过3%、init增加不超过max(10ms,10%)；失败精确撤回，不降门槛、不重跑择优。通过才进入生产式浏览器验收，Node绝不当联机延迟结论。不改频率/精度/实体/过载保护、不提交发布。

## 编码期修正v2（未跑过ABBA，不改变门槛）
v1的首步诊断为52412次neutral/value、0次neutral/neutral，Object.keys总数A/B/默认均209844；合成双空技能能命中，但不能证明真实负载受益。身份-only优化不能识别HyperionJump普通{}返回，故不能进入性能计时。

v2额外核实当前src/engine/extensions/ship-systems/HyperionSystems.ts:18–22,85，hyperionAmbushRemaining逐次读取权威冷却、teleport origin、owner在线状态，passiveModifiers只构造两种字面量：{}或{weapons:...}。Registry.ts的hasNativeSystemStats以被冻结定义的私有WeakSet身份准入，不能用相同ID或扩展注册冒充。

仅captured definition通过该身份检查且id===HYPERION_JUMP_ID后，才把此次已经执行完回调所得的空返回规范为私有空标识；有weapons、继承weapons属性及任何未知定义均不触碰/不额外读其对象、仍原组合。不修改原回调的公开返回契约，也不跳过回调或借此复用状态。回调前捕获definition，不能让未知回调在返回前替换成原生definition后误准入。补验真实跃迁COOLDOWN奖励生效/到期/在线变化及伪装ID、callback替换边界。

写集仍仅ShipSystem.ts，before是v1之前真实字节，不是v1候选。新源、依赖、资源重新冻结。旧v1测试工具的初始化getter、旧技能ID和报告输出路径问题不沿用；完整受影响合同以v2新bundle集中执行。
