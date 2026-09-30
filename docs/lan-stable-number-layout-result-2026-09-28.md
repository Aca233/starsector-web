# 构造期数值槽稳定化：未通过并撤回（2026-09-28）

## 裁决
**没有保留新的生产优化。** 新候选 VITE_SIM_STABLE_NUMBERS 的唯一完整步ABBA分别慢0.1957%、快0.0937%，远低于预登记每组至少省5%的门槛。没有择优重跑、改变门槛、启动浏览器或默认开启。唯一生产文件已归档并逐字恢复，740个非campaign模块和文件集合核验无漂移；其它WIP全部保留，没有删除文件、提交、发布。

这轮从9月27日开始，9月28日凌晨结束；工件保留原目录日期 artifacts/lan-stable-number-layout-20260927。

## 来源及实现范围
先完成单次JIT诊断：部分首次开火/小数伤害阶段仍发生wrong map、not a Smi；但属性组合函数warm未记录到反复deopt。诊断不是性能对照，详细限制及合并日志解析修复见 lan-authored-jit-diagnosis-result-2026-09-27.md。
原版API只核实数值语义：CombatEntityAPI.java:59/87为getHitpoints/setHitpoints；WeaponAPI.java:165、173–175为charge/cooldown float接口。Web现有JS Number双精度不变，没有用Java float当作降低精度许可；无UI改动、无原版实机验证。

最终只在尚未发布的WeaponMount字面量上，将10个原本已有的可变小数槽短暂写0.5再立即写回原数值。没有新增/删除字段，未改descriptor/枚举次序、spec、ammo/RNG等计数状态；热路径没有新分支/查表/缓存。Ship.hullHp的早期构想在编码前排除：原JS字段先声明为undefined，不能声称同样写法可把Tagged表示收窄成Double，且不能因此改变早期构造可观察语义。Ship.ts从未修改，predesign资料仅保留方案演进。

## 正确性与测试修复
- 集中一次全项目typecheck、实际改动文件lint，均退出0。
- 初次合同在before测试bundle导入时出现循环依赖初始化异常，尚未执行任何测试/性能。归档整套产物后，仅将测试入口导出顺序改为Ship在前；生产源码不变；定向重建并重新运行失败合同，没有重跑静态全套。
- 有效4项合同全部通过：真实init/reinit/default的176实体734挂点，完整authority和隐藏RNG/autofire一致；原始keys/descriptors/数字值一致；10类边界数字逐字段Object.is一致（含±0、NaN、±Infinity、极小/极大、安全整数）；真正构造路径接线和enabled20次提示写入/default0次；60步技能/近距开火/排散/低血模块扰动逐步全状态相同。
- 上述写入计数只证明候选执行，不证明V8最终采用何种表示，更不证明提速。

## 唯一独立进程ABBA
A0/B1/B2/A3，每臂真实init后150完整固定步热身、120完整固定步热段计时；冷段只累加fixedUpdate，排除tick20见证捕获。2玩家+20AI、web_zhuyuan/web_gloriana/web_sc2_hyperion循环、seed917、3200DP，176实体734挂点。四既有模拟实验双方同开，不混display-v2，无profiler/计数插桩/renderer/IPC/network，不代表输入延迟。

|臂|init ms|冷150步 ms|热120步 ms|热均值 ms/步|
|---|---:|---:|---:|---:|
|A0 before|94.3166|5358.80|4247.47|35.3956|
|B1 after|99.2458|5370.91|4255.78|35.4648|
|B2 after|95.3994|5350.03|4312.75|35.9396|
|A3 before|98.6372|5414.87|4316.80|35.9733|

- 热段节省：**-0.195693% / +0.093736%**，不通过各≥5%。
- 冷段相对变慢：+0.226088% / -1.197368%，通过不慢于3%的附加限制。
- init变化：+4.9292ms / -3.2378ms，均在max(5ms,10%基底)限制内。
- `passesPrescribedGate=false`；外层exit0仅表示四臂采集和状态断言正常，不是优化成功。
- 4臂20步SHA均 bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
- 4臂270步SHA均 bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6，末态171活跃实体。输入资产和源码均无漂移。

## 收尾与后续边界
恢复前核验实际完整写集当前candidate SHA、before备份SHA和绝对工作区路径；归档候选后只恢复该文件。revert-verification.json验证740源码字节及文件集合完全一致，没有覆盖其它任务。静态检查/合同结果针对候选时点，旧native-capture退休fixture阻断没有本轮修复，不能声称全套回归通过。

这次结果不支持保留数值槽提示，也不能推出“所有JIT问题都不重要”。当前证据没有把反优化总成本、内联数学或GPU可并行占比精确量化。下一轮不得原样重测本提示、再恢复已失败的属性共享/组合程序或此前导航索引。真实176实体开场过载、稳态Hz和输入P95目标仍未解决；总优化goal保持active。

工件包含before/candidate、predesign、源图/依赖/bundle/map、导入失败归档、有效验证、预登记、唯一ABBA、rejected-source、回退预检/验证。全部本轮进程已结束，没有浏览器/测试服务遗留。
