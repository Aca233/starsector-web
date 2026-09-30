# 运动修饰合并后的启动诊断结果（2026-09-27）

仅一次短冷启动 CDP 采样，首次启动失败后收集并清理；没有生产修改，也不是重跑性能挑最好结果。2.596894秒、1783样本：fixedUpdate 77.37%，CapitalShipAI.update 29.20%，ShipWeaponControlSystem.update 27.89%，assessThreats 15.20%，捕获显示快照5.29%，编码3.10%，GC2.98%。桶为包含调用栈并集，相互重叠不可相加。不能从这些百分比推断稳态利用率或GPU收益。

preAim inclusive367.829ms，canTarget291.791ms，isPhased238.355ms；allSystems self97.330ms。下一块有界候选应针对预瞄目标筛选，不原样恢复已失败的全名单火控资格扩容。

运行加载的是motion候选冻结图，无harness/asset漂移。当前工作树另有5个TS/TSX和13份CSS并行改动（完整列表见 startup-diagnosis-status.json），不等于运行源被漂移污染。下一实验使用最新图共同基底，特别核实新的同尺寸装配限制，不覆盖其它任务修改。

完整证据：artifacts/lan-post-motion-diagnosis-20260927；cleanup=true，无存活测试进程。真实房间开场过载尚未解决，没有可报告的新稳态Hz、输入P95、停顿ACK或重连结果。
