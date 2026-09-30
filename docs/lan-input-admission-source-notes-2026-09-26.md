# 输入发送准入诊断（2026-09-26）

继续检查事件→发送→累计ACK。已核实飞行边沿保留修复SHA未漂移；代码显示60Hz发送定时器、75/s小突发预算、empty-local-queue准入。I/O Worker原子镜像含pendingSend+nativeBuffered，4ms采样，可靠消费回执与输入共享出口；当前同tick尾部额度只包含input/motion/snapshot，未给消费回执授权输入尾部。上述仅是代码结构，不先假定性能根因。

本轮先用一个已有真实双端headless场景做20秒诊断（主线程呈现，22舰、seed917、完整样式、D3D11），记录实际准入失败、预算失败、坐标不可读和每次本地发送前后bufferedAmount。采样仅测试Vite变换启用，生产无钩子。缓冲读可能与I/O Worker并发变化，因此保存前后两次值，不将采样伪装成锁定精确瞬间。保留主机停顿/重连/清理。

这是带探针诊断，不与先前无探针耗时直接比较，不宣称屏幕响应。保留原复合W/S输入时序及其偏差说明；根据证据再选择候选，不能为了放宽backpressure或凭固定队列大小猜提速。不改玩法/UI，无原版实机补验，不降频/减实体/删效果。

## 既有回归夹具对齐

检查发现 realtime-send-fixture 仍为呈现owner迁移前的作用域（remote/controls/presentation/hasControlPermission不存在），不能将未运行的旧场景当覆盖。修复测试夹具以编译当前实际sendInput片段、使用生产LanPresentationControls坐标投影；仍明确recorders只观察发送完成而非替代物理。原测试断言不减弱，后续集中运行同一既有回归。
