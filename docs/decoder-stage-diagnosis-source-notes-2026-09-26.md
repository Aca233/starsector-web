# 显示解码阶段诊断：来源与边界（2026-09-26）

目的不是再启用已否决的解码条目池、入队去重或渲染字段缓存，而是在当前真实LocalWorkerHost里分解剩余解码成本。现有local-host-pipeline报告只证明Host外围复制/登记/回放成本很小；presentation-decode-plans报告没有证明某一解码子阶段可获益。

本轮不改原版玩法、UI或生产代码，没有新的原版算法/界面还原承诺。原有Web包与事务为对照：CombatPresentationDecoder.applyGraph逐项验证header/shape/metadata/计划、信封、完整可达图和预算，然后分配、写入、重绑定及提交；apply再提交已验证visuals。错误路径和全部顺序均保留。

测试构建新增可选--decoder-stages（要求--host-pipeline），通过精确锚点仅插入计时/计数，不替换循环或规则。区分互斥阶段与包含阶段：graph各阶段之和可与graphTotalMs核对；visualsMs是apply外的单独阶段，不重复相加。计数包括计划数/键数、完整可达边/元数据引用数、BFS pending长度/唯一节点数、重绑数量。计数不是分配或GC实测。

生产源码在插桩前冻结完整图；独立无头浏览器，200 Onslaught、seed917、固定dt、150tick预热+60tick诊断，无重复择优。保留原有serial/default两世界、逐帧witness/完整显示图与检查点审计。此运行含计时及计数开销，不把它用于宣称提速。先一次语法/lint、插桩范围检查，然后一次真实场景。若根据证据继续做生产候选，另冻结前后图并按无插桩净交付验收，不直接从诊断数字推导加速比例。

继续遵守不操作桌面、不启用子代理、不发布和不覆盖并发工作。
