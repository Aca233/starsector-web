# LocalWorkerHost完整交付成本：测量前对照（2026-09-26）

上轮已否决PackedVisual槽位候选并精确回退，属于完成实验和改变下一步方向的progress；不继续重跑该候选。
本轮只先扩展既有真实Worker基准，暂不修改生产代码。当前LocalWorkerHost.receive依次做协议/tick/witness验证、decoder.apply、copyTacticalMapSnapshot、copyDeploymentView、display strings登记、ACK frame组装、journal.record，再resolve并pump。旧基准只测原始Worker往返＋decoder.apply，漏掉后续Host复制/日志成本；因此尚无证据说它们是主瓶颈。

原版边界：参考本机0.98a-RC8的CombatEntityAPI.java:8–13实时位置/速度接口；Host事务/回放属于Web实现，不调整原版玩法和UI。仅后台无头测量，不宣称原版实机验收，不改变频率、精度、实体、字段、校验或single-in-flight屏障。

工具方案：给现有benchmark-real-workers增加host-pipeline入口，实例化生产LocalWorkerHost，让它真正创建Worker、提交输入、接收ACK、调用production decoder和journal。审计消息仍只在测试构建、计时外发送，测试包装器在调用原始onmessage之前记录收包时刻，只拦截这种非生产审计消息；真实ACK及receiver原样交给保存的生产handler，校验/处理均由Host执行。原先第二个message监听器会晚于前一监听器产生的promise continuation，初始化观察失败后已改正，失败日志保留。独立Host模块实例保持各自首个epoch=1，逐帧核对所有有效包、显示图、witness/audio/results/outcome，定期核对权威/隐藏火控/RNG。
正式指标区分worker round trip、Host已有presentation耗时（含UI复制，不冒称纯decode）以及从Host.step到promise完成的完整交付。可选host-stages只用于分解诊断，额外计时不会进生产或无插桩速度结论。诊断看清占比后才决定修改，不直接推迟校验、流水线预采样或省略回放。
