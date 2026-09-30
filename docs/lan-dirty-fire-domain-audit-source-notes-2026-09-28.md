# 火控依赖组增量资格审核：只读诊断（2026-09-28）

上一轮neutral modifier候选已精确回退，7组行为与唯一ABBA提供了可验证的新证据（progress），没有活进程需要等待。此轮先审计新数据流，不复活旧全舰队重审火控批处理，也不修改生产。

原版0.98a-RC8 combat/ai/private.java:244–260继续逐目标检查阵营/角色/射程/提前量。拟议优化仅减少内部重复资格审核，不改变候选或数学。无UI修改或原版实机验收。

当前旧火控事务在motion/系统/repair之后开始、emission之前关闭。历史authored-fire-query虽通过行为，整体变慢；其每次begin全舰队检查和非空runtime全局回退值得单独量化。新假设：已核实只写自身及parent/carrier依赖组的writer前后标脏，仅重查脏组；初始全查一次。未知writer、关系/名单变化关闭区间，不缓存外部回调许可，不放宽权威/过载保护。

仅在artifacts中对当前真实before bundle插桩；先逐SHA核实当前776源码、依赖和3489资源仍与该before图一致。生产ShipSystem保持5a38de44f46a27d5f26ca973fc32eb0b9988aa5735ef05eff29335e1a1a7854b。使用真实host init、2玩家20AI、三舰循环、seed917/3200DP、默认实验全关。一次270步非计时观察，20/270完整authority+隐藏RNG/tracker必须等于既有未插桩before见证，所有实际query点同时逐行比对影子增量结果与完整实时oracle。

统计cold150与warm120：完整资格行检查次数、增量所需行数、closed原因、strict（非空runtime拒绝）与data-only（递归描述符只含数值/undefined/null）两种假设的真实覆盖。data-only只是本负载中的资格研究，不是生产许可，也不因对象形状授予未知system回调纯度。五个系统定义须原注册身份，slots/armor/shield钩子与现行构造回调一致；父舰/载机组均在观察名单。

这不证明所有未知扩展、任意未来写者或方法覆盖安全；源码/生命周期审计与针对性异常合同仍是实施前提。数字不能当提速，工具不启用任何原本关闭的实验、不改实际查询结果、不启动浏览器/桌面，不跑ABBA。新方向有覆盖且增量/全量一致后才编写实现。
