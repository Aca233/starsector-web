# Phase50：私有快照tape直接转码（编码前）

2026-09-22。Phase49当前有效编译实测：权威Worker idle0.99%，完整状态约28–29Hz，物理约60Hz。Phase24已否定capture→tape→重建对象→编码→回权威的整条异步链路，不能重新启用开关冒充优化。

本块先移除辅助线程的整图重建：对私有可信tape直接输出相同SWF2 MessagePack字节；显示/网络的差异只在sounds字段，不再为两路复制/遍历整图。沿用固定版本@msgpack/msgpack 3.1.3的既有数值/字符串写入器、4MiB tape、2MiB mailbox、协议字节预算和128层深度。原同步路径及默认关闭的serializer开关不变。

范围是同机快照表示/编码，不更改游戏AI、动作、伤害、射速、绘制或UI。原版0.98a-RC8的战斗机制对照沿用既有移植证据；原版没有该Web网络私有tape，不把此结构称为原版机制。本块不涉及需补拍的原版界面变化。源码依据为SnapshotTape、SnapshotEncodeJob、BinarySnapshot、SnapshotEncodeMailbox以及固定依赖Encoder实现；新实现必须保持原字节、预算、错误回退、转移所有权、取消/旧ID不发布。

验证：集中一次类型、改动文件oxlint，扩展既有check-snapshot-encoder-worker的字节/畸形数据/声音双路/真实Worker测试。随后用既有22舰原生场景的真实捕获作转码旧新配对；分别报告准备、辅助工作与串行总成本，不能把局部速度当成实际Hz/RTT。未验证整链路前不默认启用。无桌面、无生涯、无发布。

## 实际联机整合验收（局部测试通过后，运行前声明）

继续复用check-normal-multiplayer-browser：同一冻结源码、5个独立headless浏览器、22舰、seed917、既有steady起止tick121→1021、真实LanBattle/WebGL/LAN桥、输入与完整checkpoint比较、800ms阻塞/同局重连/清理。对照是当前默认同步编码，候选是本轮直接tape编码辅助线程，不把Phase24旧异步作为更容易超过的主对照。

按A/B再B/A运行；任何功能失败先记录并停止，不自动重跑挑成功。每对候选的各席完整Hz须至少为对照1.05倍，输入确认及状态age尾值不超过1.10倍，FPS不低于.95倍，物理不低于59Hz；全套原断言不放宽。该受控源Vite场景早于Phase49的重负载窗口，不冒称晚期实际编译产物或远程Steam验收。即便此局部网络门槛通过，也仍需编译/晚期负载证据才考虑默认启用。
