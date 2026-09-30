# 根舰纯AI阶段导航索引结果（2026-09-27）

## 结论
**行为合同通过，但未达到预登记性能保留门槛，四个生产文件已精确撤回。** 默认未开启；没有联机浏览器测量，也没有输入P95/稳态Hz改善结论。总体目标仍active，176实体真实开场过载仍未解决。

## 实现与证据
独立VITE_AI_EXACT_NAVIGATION仅在已有exactThreat资格、私有Worker及同步根舰AI段内开启。相同已审核名单数组和WeakMap绑定TacticalWorld，原生findHostile不顺带共享名单，nativeThreatPhase、compactForecast、模块交错阶段不扩容。采用现有保守索引，候选按原顺序精确检查；沿用parent/sourceCarrier连通组通知失效、finally关闭。

固定2玩家+20AI、seed917、三舰循环、3200DP；初始化/重建均176实体734挂点。三个既有保留实验在A/B均开启。本轮只更改4个生产文件，完整冻结725模块图无无关源变化。

## 验证
一次集中TypeScript、改动文件lint通过；6项行为合同和1项测量执行测试均通过（**测量程序成功不等于性能门槛通过**），无需修复或重复测量。
- 初建/重建示例forwardPathClear：障碍遍历176→22，完整motion计算79→1，结果相同；默认缺省保持176/79。不是全局每帧的固定比例。
- 真实Engine第一步自动创建1个exact索引、调用select 46次、离开阶段已关闭；默认和原基线均未创建。
- 8类状态×78根舰/模块，原始obstacle记录、forwardPathClear（含零/负/NaN/Infinity horizon）、avoidance向量/风险/原对象引用语义均一致。
- family通知、扩张后不缩小的速度/盾界、位置变化关闭、名单身份/长度、错观察舰、未知定义拒绝、envelope关闭与异常finally清理通过。
- 12类未知回调/异常/嵌套scan的原路径顺序一致；普通world三个属性accessor读取顺序与缺省均一致。
- 60完整fixedUpdate含技能激活、近距离位置变化、排散、模块状态，逐步完整权威及隐藏tracker/RNG一致。

## 唯一ABBA
预登记每臂独立隐藏Node进程，顺序A0/B1/B2/A3；150热身+120计时完整fixedUpdate。不计启动、导入、预热及终态序列化；未重跑择优。门槛：两组各至少省3%。

| 臂 | 120步耗时ms | 单步ms |
| --- | ---: | ---: |
| A0原基底 | 4910.2978 | 40.9191 |
| B1候选 | 4627.8139 | 38.5651 |
| B2候选 | 4536.1557 | 37.8013 |
| A3原基底 | 4662.6633 | 38.8555 |

两组分别降低5.7529%/2.7132%，第二组未达3%。这既不能证明方案毫无价值，也不足以按既定规则保留；不事后降低门槛或拿其它轮绝对值相减累计收益。四臂自然推进后的活跃名单均171，全状态hash均为60469c9c42c5d3674b1c281a867ef027621588cc45718b5770079460eaf01e52。数量变化本身不等于战损证明。

## 最终文件状态
先一次核对全部候选文件仍等于candidate-manifest，再核对全部before字节，随后恢复NavigationObstacleIndex.ts、WeaponThreatEnvelope.ts、TacticalNavigation.ts、CombatEngine.ts。final-state记录完整725模块均与before相同；此前已保留的三个默认关闭实验未改动。脚本默认使用冻结历史候选，只用于重放，不能据此认定当前源码仍有此功能。无提交/打包/发布。

工件：artifacts/lan-exact-navigation-20260927，尤其check-1/abba.json、init-default-probe.json、navigation-comparison.json、lifecycle.json、whole-state-hashes.json、world-accessors.json及final-state.json。脚本：scripts/check-lan-exact-navigation.mjs。

## 下一步约束
不原样重跑这次索引、逐障碍资格或最大航速标量候选。根舰导航查询量明显降低但整步余量不足，下一轮应重新区分根AI与模块/武器阶段的工作量，寻找减少更大范围重复求解的方案；当前结果不授权把根AI资格延长到与ship.update交错的模块阶段，也不证明多线程或GPU能直接修复。
