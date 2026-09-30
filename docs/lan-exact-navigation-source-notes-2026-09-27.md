# 根舰纯AI阶段导航索引（2026-09-27，编码前）

## 来源、差异与边界
最大航速标量候选整步未达3%，生产已精确撤回；不恢复它或逐障碍资格方案。本轮改为减少全名单扫描，在既有exactThreat资格内复用现有保守导航索引。

本机0.98a-RC8反编译 combat/ai/movement/BasicEngineAI.java:50–76保留碰撞状态和独立heading/speed意图。它不能证明Web算法完全等价。本轮不改Web任何避障决策、刷新频率、UI或原版玩法；无原版实机操作许可，不声称原版实机等价。

Web证据：CombatEngine根舰AI循环与后续模块AI/ship.update分离；CapitalShipAI:180–205每次仍完整计算avoidCollisions/forwardPathClear；ShipSystem:155–184只排队激活，CombatShipStatusSystem:101–102才dispatchEvents/advanceCombat。HyperionSystems:66–71、112–121临时准星写入后恢复；Eclipse/Edict已被exactThreat定义身份集合审计为纯读/本舰激活。纯AI段不推进几何与实体成员，但系统/盾/排散状态实时变化，父舰/模块/载机依赖必须整组失效。

## 方案
- 独立默认关闭VITE_AI_EXACT_NAVIGATION=true，必须已有exactThreatEnvelope，绝不扩大nativeThreatPhase，不启用compactForecast、batch、hostileQueries或模块阶段索引。
- exact envelope记录本次资格使用的同一名单数组；工厂只接受该数组。新index以私有WeakMap绑定原生updateShipAI新建的TacticalWorld及对应观察舰，普通调用者不额外读取任何world属性getter。仅导航world复用名单，findHostile保持原调用。
- obstacles一次scan内复用观察舰motion并使用现有保守X索引，候选恢复原序，phase/死亡/盾/精确距离仍实时检查；小行星仍完整遍历。不改变数学公式、实体、频率/精度。
- 索引关闭、envelope关闭、数组替换/长度变化、不同观察舰、未知资格、recorder或替换观察函数回退。索引资格不是公开字符串开关或同realm恶意猴补沙箱。只有私有Worker同步阶段才能绑定。
- 每个根AI结束后，用已有parent/sourceCarrier连通组同时失效威胁和导航；位置变化则关闭导航，半径/速度只扩张界；finally关闭两者，绝不跨物理阶段。

## 预登记验收
固定2玩家+20AI、三舰循环、seed917、3200DP，初建/重建176实体734挂点。前三个保留实验A/B均true。先一次集中typecheck/四文件和脚本lint/差分合同：默认关闭和engine自动接线；8类导航场景（78根舰/模块）；候选数量/调用量；family/close/名单替换/异常关闭；未知getter和回调原路径；60完整步权威+隐藏tracker/RNG逐项一致。历史失败仅定向修复不重跑择优。

唯一顺序独立隐藏Node进程ABBA，每臂150热身+120完整fixedUpdate；两组整步各至少省3%、四臂状态与活跃名单完全一致才保留。初始必须176；270步自然推进后的活跃名单可变化，不据数量推断战损。不改门槛，不取最好一次。只在离线通过后跑一次既有完整无头联机场景（10秒普通+10秒输入后70ms忙任务、800ms停顿ACK、同局重连），冻结完整源/CSS/资产；仍过载则没有稳态Hz/P95改善结论。默认不开启，不提交/发布。

## 最终裁决
一次验证全通过；唯一ABBA整步省5.7529%/2.7132%，第二组未过3%。已核对全部候选hash并精确撤回四生产文件，完整725模块before图一致；没有重复测量或浏览器运行。详见同名result报告。
