# 单舰瞄准阶段武器属性诊断结果（2026-09-27）

## 已得到的证据，不是提速结果
本轮没有活动生产候选、没有修改生产源码，也没有再次运行任何旧候选的性能试验。重新冻结当前738个非campaign源码/JSON模块，运行唯一成对**非计时**诊断：参考源码 vs 只观察原返回值的源码内插桩。自然270步、既有60步技能/靠近开火/排散/模块低HP场景全部通过状态对照；诊断后738/738模块字节仍匹配冻结，没有源漂移。所有命令已结束，没有浏览器/服务遗留。

热身后120步，真实发射前瞄准段内两类getter合计1258370次，而独立瞄准段只有20808个，平均每段60.48次。每段内三武器类型×射程/弹速六个最终数值在所有原modifiers返回点都未发生变化；这是观察范围内的稳定性，不是对任意定义/外部回调的纯度证明。

## 唯一诊断的内容与状态
2玩家+20AI，web_zhuyuan/web_gloriana/web_sc2_hyperion循环，seed917/3200DP，176初始实体734挂点，四个已保留实验A/B同开。参考与观察副本都推进自然270步，然后真实host reinit后执行60步扰动。只在ShipWeaponControlSystem原aim try/finally中进入/离开观察段，在原有两个getter入口及ShipSystem.modifiers返回处观测。不额外调用modifier/getter，不替换返回值，不改参数、顺序或随机数。计数包括独立战机的相同更新入口。

| 窗口 | 瞄准段 | range getter | speed getter | 射手主system的modifiers返回 | 数值变化段 |
|---|---:|---:|---:|---:|---:|
| cold | 26400 | 858843 | 858843 | 1718378 | 0 |
| warm | 20808 | 629185 | 629185 | 1260750 | 0 |
| stress | 10560 | 279776 | 279776 | 560421 | 0 |

cold是自然前150步，不是只取20步；warm是151–270步。rootResults包含同段其它getter引发的主system合成，因此与两类getter之和不同。它不包含作为子调用的auxiliary返回值；不能把这些数当作全引擎所有modifiers次数。

自然20步完整hash：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224
自然270步完整hash：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6
终点171活跃实体；参考/观察一致。60步每一步authority+隐藏tracker/RNG hash全部相等。数量本身不能推断战损。

## 重复集中在哪里
按**射手主system定义**分组，而非按所有回调定义或整个依赖组：

| 定义 | warm瞄准段 | 两类getter次数 | 每段平均 |
|---|---:|---:|---:|
| WEB_ZHUYUAN_ECLIPSE_PROTOCOL | 1080 | 290598 | 269.07 |
| WEB_GLORIANA_BROADSIDE_EDICT | 840 | 320466 | 381.51 |
| NONE | 18168 | 115008 | 6.33 |
| WEB_SC2_HYPERION_YAMATO | 720 | 532298 | 739.30 |

三类自定义根系统占这些getter读取的90.86%，NONE组占其余。含父舰加成的NONE模块依然可能进行完整组合，不能把NONE一律视作恒等零。
假定每个段都能通过未来正确性许可，且只在首次需要时读取一次，读取数量的理想上界可从1258370降到20808（少98.35%）。**这只是潜在重复工作量，不是实际实现次数、耗时或速度收益；资格/生命周期维护仍可能抵消它。**

## 与已否决方案不同的下一步
归档核实：lan-scalar-weapon-modifiers的逐getter字段折叠曾全部获准但整步慢7.21%/9.77%；lan-owned-aim-queries仅单次aim复用prepare，第一组2.97%未过3%；均不能原样恢复。新候选应把复用单位改为**单舰修复完成之后、发射之前的整个瞄准段**，跨挂点及aim/preAim共用原完整组合结果里的这六个数；不再为每个getter重做反射/定义资格，也不重算另一套标量公式。

实现前必须满足以下边界：
1. 从既有owned-interleaved原生writer阶段取得私有许可，沿用其parent/sourceCarrier连通组及失效；不要再创建一份全世界逐目标许可/空间索引。
2. 入口证明world/target/range/fire-budget回调皆为已审计纯读，查询循环及系统定义不能改变被共享值；不从统计稳定直接推出许可。新增显式默认关闭开关。
3. 此次查询只改triggerHeld、currentAngleRad、aimIdleSeconds、tracker/fireControl、故障挂点burst/firing状态；Gloriana模块加成读ammo/isDisabled/生命/flux/锁定输入，不读这些被改字段。Eclipse读flux，Hyperion读系统冷却/在线状态；发射消耗必须发生在共享段关闭之后。未来新定义要独立证明稳定性，不能只复用宽泛hasNativeStats许可。
4. 首次实际需要时执行原modifiers；同段复用，不跨ship.update、发射、事件、tick。undefined武器类型仍不触发原查询。闭合/异常/嵌套/陌生world或shooter/外来callback全部回退，真正发射时幅能、弹药、费用等权威校验照旧实时计算。
5. 固定配对覆盖同一738或重新核实后更新的完整源图；先验收init/reinit/default、两个getter及完整挂点输出、闭合后变化、未知callback顺序、技能和数值runtime/父链，60完整步与270步状态。实际候选需先写门槛再唯一ABBA，通过才浏览器，不把调用减少当净加速。

原版来源核实范围见source-notes。本轮无UI修改、无原版实机验证、无typecheck/lint（未修改生产代码）、无提交/推送/发布。浏览器开场过载和输入P95尚未改善或重验。继续优化目标仍active。
