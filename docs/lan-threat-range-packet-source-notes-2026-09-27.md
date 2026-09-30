# 威胁评估中的短寿命射程修饰包（2026-09-27，编码前）

## 前轮与证据
前轮有实质进展：否决逐scalar组合并精确撤回，非计时计数显示120步4,018,150个顶层资格查询全部成功；不能继续将问题归于回退。本轮改为减少调用次数，不重开逐scalar快路/导航/相位候选。
重新核对本机0.98a-RC8 MutableShipStatsAPI.java:196–199射程stat独立按武器类读取、MutableStat.java:345–348读取当前值。这里只保留Web现行数学/玩法，不据原API签名宣称原版实机等价，不改UI。
Web ThreatAssessment对每敌舰已复用motion，但每门武器依旧经combatWeaponRange重新取getWeaponRangePercent。其boundWeapons原本只在纯stat/原生range钩子下工作，并在第一次add（可能调用目标护盾钩子）后无条件关闭。这是更短、更容易证明的共享边界，不把根AI缓存延长到ship.update。

## 实现范围
四文件：ShipSystem/WeaponRange/ThreatAssessment/host.worker。独立默认关闭VITE_LAN_THREAT_RANGE_PACKET，仅host私有数据命令域init/reinit启用。六武器getter保持原样，无每getter新增gate，也不改全对象组合器。
在没有既有envelope、现有boundWeapons=true且来源至少4挂点时，第一次真实range查询处惰性借用一次完整原modifiers对象。此时motion和recovery回调已发生；同一敌舰后续武器共享其中按weaponType的rangePercent。仍每挂点执行同一个resolveWeaponRange，保留ECM/航母加成/武器可变字段/浮点次序、遍历/平局/ETA和全部预测频率。
调用新的已准备modifier入口只替代重复system scalar读取，不合并或近似射程数学。空runtime、原生system/aux原型与定义、无own modifiers/available或射程getter覆盖、无父舰allSystems覆盖且父舰定义已知才借用；失败原getter逐门执行。舰装/航母range钩子未知也不借用。协议不能注入函数/访问器；此为关闭的Worker数据域，不声称支持任意同realm元编程篡改。
**第一次add之后无条件丢弃包，与boundWeapons同时关闭**，包括已审核护盾。这保证未知护盾damage callback修改技能、挂点、父舰、ECM或递归评估时，后续武器仍读实时状态。包不跨敌舰、assessment、模块AI、ship.update或await；不缓存完整射程，不提前读取被disabled/ammo/DPS筛掉的武器修饰。少于4挂点只是原路径，不删减实体或计算。

## 预登记验收
固定三舰循环/2玩家+20AI/seed917/3200DP/初始176实体734挂点，三保留实验A/B均开。一次集中typecheck、四生产文件+脚本lint；合同覆盖init/reinit/default实际packet+getter次数、所有挂点准备射程公式精确比较与未知source/aux/parent/runtime回退、8类threat全结果、护盾callback突变/异常/重入后的逐武器顺序、60完整步权威+隐藏tracker/RNG完全一致。
唯一顺序独立隐藏Node进程ABBA，各150热身+120计时完整fixedUpdate；两组各至少降低3%且终态一致才保留。不以调用计数代替性能，不重复择优。离线通过才一次完整现有无头联机场景：10秒普通+10秒输入后70ms忙任务、800ms停顿ACK、同局重连；冻结完整源/CSS/资产。过载失败则无稳态Hz/P95结论。撤回前核对全部候选hash再恢复before，不提交/发布，不默认启用。

## 最终裁决
一次集中检查全通过，唯一ABBA省0.9818%/4.3856%，未同时达3%。四生产文件已核对候选hash后恢复，完整725模块before一致。没有浏览器/重复测速/发布。详见同名result。
