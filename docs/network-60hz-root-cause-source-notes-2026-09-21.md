# Phase22：60Hz瓶颈调查（先记录假设，不调整限流）

范围：用户要求找出完整状态始终不到60Hz的真正原因。只添加后台诊断/受控实验，不改生涯，不改发布版，不开子代理或桌面。不改原版玩法和可见效果，故本轮不需模拟新的原版机制。

代码证据：protocol.json snapshotHz=60；host.worker.ts 固定1/60物理，step末尾才snapshot，catch-up可合并多tick；display和directI/O各自1个inflight；capture与encode在同一个权威Worker串行执行；AuthorityIoBridge在本地WebSocket.send后发io-snapshot，不等远端游戏ACK。LAN客机state-consumed在同步订阅者保留状态后发出，不等RAF/GPU。LanStateCredits基于空闲RTT给窗口，SnapshotDeliveryWindow只减不凭忙时RTT涨窗口。

已有Phase21五人长测中位数：物理59.96，生产35.86，中转入口35.56，客机完整34Hz；socket skip中位0，credit skip约1.98/s，首先怀疑生产/I/O发布而非所有客机渲染。各指标取样窗口不完全一致，不能直接相减作因果百分比。单帧约211KB、capture约4ms、encode约2.6ms，physics约6.8ms；要查真实每秒累计成本而不是相加几个EMA。

验证：冻结浏览器源图；只在测试Vite变换中给host Worker加固定大小计数/直方图（物理步、回调catch-up、capture/encode、双路重复、I/O回执耗时、发布tick跳跃）。同一图/seed做完整画面、跳过渲染、权威无消费者开销的对照；记录真实中转输入/转发/credit，不修改消费ACK语义。受控消融只能证明瓶颈位置，不能作为交付性能。重新分析用户此前多机日志时区分旧build，不冒充当前版本实测。


最终实测结论见 network-60hz-root-cause-phase22-2026-09-21.md。已区分当前单机五开生产/调度瓶颈与旧多机交付瓶颈；未以泛化GPU或固定窗口上限代替证据。
