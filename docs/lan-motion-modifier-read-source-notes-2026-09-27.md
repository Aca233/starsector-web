# 单次运动查询合并系统修饰读取：实施前（2026-09-27）

## 本轮定位与原版证据
前一goal turn有实质进展：两种候选都按预先性能门槛否决并撤回，改变了下一行动；当前无运行测试/外部阻塞。
重新读现行ThreatAssessment确认它**已经**为每个敌舰在单次assessThreats内复用motion，不能重复宣称这里还缺缓存。真正的重复位于ShipMotion.shipMotionStats：速度、转向加速、加减速与转向等10个scalar getter，每个都会重新递归组合ShipSystem.modifiers，父舰模块buff和多槽也重复展开。

本机0.98a-RC8，重新读取`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/null.java:452–486`：disabled取1，分别读当前修改后的加/减速、速度、转向速度/加速度，转向减速为一半，并有最小值限制；BasicEngineAI.java:68–96使用当前运动/命令。反编译缺损符号不直接复制。本轮保持Web现有算式、求值次序中的数值运算、浮点精度、字段、频率、RNG；不移植/调整原版规则，不改UI，无实机视觉验证。

## 方案：一次函数调用，而非跨帧缓存
仅LAN私有Worker init时通过显式实验开关`VITE_LAN_OWNED_MOTION_READS=true`启用。其它主线程/通用Ship默认保持旧getter调用。ShipMotion模块只存闭合Worker域权限，不保存任何船/属性值。
shipMotionStats计算mult/boost之后，仅对已审核纯stats定义尝试一次实时modifiers读取，再用这一个对象给原10个算式提供scalar。函数返回后不保留对象，下一次重新读。不是对象池、tick快照、修改系统生命周期或减少模拟次数。

资格沿用hasNativeSystemStats的明确纯读集合，包含NONE/日蚀/敕令/大和炮/跃迁，不扩大它。已读EclipseProtocol.modifiers、GlorianaEdict.edictModuleModifiers、HyperionSystems两modifiers和hyperionAmbushRemaining；它们只读本次时点的flux/lifecycle/模块/弹药/跃迁cooldown。parent/module关系在此同步函数内不会改变。非空runtimeModifiers（自身/父舰）、未审核定义/辅助或父舰定义回退原10次getter。Worker输入是cloned数据，不引入外部可执行插件；不是同realm任意monkeypatch安全沙箱。若将来开放Worker插件，需要重新审计或禁用此接线。

## 验证和预注册门槛
1. 原host.worker处理器初建/重建init均ready且有snapshot；测试仅尾部导出私有engine/handler，self.postMessage为测试接收器，不冒充浏览器Worker时钟。
2. 176实体完整名单逐舰运动字段深比较，额外覆盖activation、flux、boost、parent/module状态、双技能、disabled、非有限值与excludedSystemSpeedFlat；计数证明健康纯读路径从每查询10次根modifiers到1次，未知callback及runtime回退仍原次数/顺序和异常。
3. 60完整fixedUpdate步（技能/近距/排散/隔舱），captureCombat、隐藏tracker/RNG逐步完全相等。
4. 唯一一次同源ABBA，每臂150热身+120计时，根舰exact-threat两臂true，前两轮已撤回候选保持不存在。两组各自整fixedUpdate至少省5%，四终态hash相同。任何一组不达门槛不重复测量找好数；阶段诊断不得替代门槛。
5. 一块完成集中typecheck、改动lint、合同；门槛通过后一次既有176实体正常双浏览器场景，冻结原CSS/资产/源码，只叠加本轮3个生产文件。仍要求20秒输入（普通＋70ms压力）、800ms主机停顿ACK、重连与无过载；不得放宽保护或减少实体。未完成/失败不称联机改善、不默认开启、不提交/发布。
性能对照细化（测量前）：A臂使用本轮实施前备份的3个生产文件，B臂使用候选3文件，其余冻结图一致；不是把带新增分支的候选关闭开关后冒充原生产基线。根舰实验设置保持一致。候选默认关闭的行为用独立合同验证，不用这条路径夸大收益。
