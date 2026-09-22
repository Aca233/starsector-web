# 房主中转只构建校验投影：实现前对照（2026-09-21）

本轮仅优化二进制传输解析，不改变模拟、战斗规则、渲染或原版 UI；不启动可见窗口，不碰生涯/系统网络。原版没有在此实现中提供可照搬的联机协议，不把网络扩展冒充原版功能。沿用已核实的 HostSnapshot/CombatFrameSummary 校验合同。

实际入口证据：server/lan-server.mjs 的二进制 host 上传先 decodeBinaryState，随后 summarizeCombatFrame，r.frame 仅保留 summary；LAN 转发原 raw，Steam 默认 SnapshotPrepareBroker 将 value.bytes 交给实际 Worker再次decode。投影不能等同于信任客户端自己提供 summary。

预期：仍检查整个数据的大小、深度、标签、长度、所有 map key，以及原有 craft/muzzle/deployment/identity 语义；仅在 relay不需要完整对象的情况下不分配未使用数组/对象。原始 SWB1/SWF2 字节、差分、ACK 和发送预算不变。旧 Steam 同步编码/需要完整对象的自定义 transport回退原解析。

验收：完整解析后摘要 vs 直接投影后同一个摘要校验器；畸形键必须在被省略分支仍拒绝，旧UTF8兼容规则不变；多客机实际relay、Steam真实prepare Worker的binary/legacy恢复一致；旧/新录制241帧配对CPU/事件循环探针，不能把解码耗时改进说成端到端延迟改善。
