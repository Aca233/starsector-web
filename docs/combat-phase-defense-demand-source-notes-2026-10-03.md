# 真实producer相位读路径与防御需求普查

- 原版目标0.98a-RC8，core/decompiled再次检查缺失；源码/实机/UI待核实。本块只调查Web执行图，不改玩法/UI/频率/规模/dt/ms，不操作桌面。
- 当前已接受native nearest版本作为基线。旧weighted profile在nearest重写前，不能照搬其函数占比当现有收益。
- 新源码事实：local-combat.worker.ts:39,69注册owner后调用enableWorkerOwnedPhaseReads；network/host.worker.ts:639–641只注册owner及可选motion读取，没有该phase开关。既有createLanWorld+ownForWorker场景对应LAN默认，不是所有Worker的统一模式。
- Ship.ts:241 allSystems每次构造slice+新array；:763 isPhased已存在闭合Worker的两成员snapshot路径，单slot且未覆写allSystems时不用展开数组。LAN默认不启用该分支。需确认真实工作数与行为，不先声称修好ms。
- 防御待测：ThreatAssessment:209–237对imminent<128进行n²扇区覆盖；CapitalShipAI:207计划预测，:332vent前可复查live。统计真实返回的imminent/重复direction/双评估、projectile index供给和stage forecast消费；不能删独立防御或vent复查。
- 方法：构建三独立bundle（LAN默认、既有phase-read路径启用、启用+原函数BODY插桩）。不替换原型/方法，数值门禁仍保留；270逐步raw/双RNG/AI防御/tracker严格对照，150warm120计数，BODY无时钟，数量不转换成ms。核实这五生产文件hash无修改。若后续要接producer，先补其闭合数据契约证据，再一次集中类型/lint+相关场景/独占ABBA；未知可变realm不擅自启用。
