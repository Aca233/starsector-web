# Changes-only native record templates — 2026-09-22

Implementation scope: transport/replica work only; no gameplay, UI, RNG, simulation rate or precision changes. Retain authority ordering and current 60Hz simulation. Do not enable MutationJournal/write interception. No career modifications or release.

Native weapon/engine records already expose every value through capture. Learn constant scalar fields from those reads: when one changes, permanently promote that slot to the dynamic row for that source/layout. Nested objects always remain dynamic. This removes unchanged scalar fields from per-frame record rows without guessing from a TTL or delayed dirty flag. Definitions contain keys and exact scalar defaults; each packet includes its full used definition table, cached as an immutable SWF3 capsule. Existing bounded binary interning and ACKed byte deltas reuse definition bytes; no new transport ACK/baseline dependency. It is not literally once-only network delivery: standalone/cold frames stay complete.

Receiver validates definitions before applying, decodes a repeated definition only once while the bounded binary cache retains it, and handles only dynamic objects recursively. Static fields are compared with current target values before skipping writes, so client-side prediction/HUD writes are corrected on the next authoritative endpoint. Unknown/generic callers retain full assignments. Source/layout identity is weakly owned; no authority setters or observer proxies. Old fixed-display experiment remains independent and off by default.

Validate one bounded real fixture: capture/encode/decode/apply equality including cold joins, skipped states, local writes, definition promotion, malformed schema and legacy fallback. Measure the whole path and host production, not only the template codec. No claim of four-metric improvement until measured. Keep default OFF while establishing results.


## 测量与默认策略

- 15项针对性检查通过（含native动态字段快路和稀疏定义拒绝）；生产authority capture、SWF3/JSON、冷加入/跳帧、预测回写修复覆盖。
- 32舰同状态ABBA、每臂160样本，完整capture+encode+decode+apply P50：原路径6.9936ms，模板路径7.8934ms；P95 10.8045→12.0477ms。包体P50 140629→127649 bytes，但CPU净回退。新路径继续 **OFF**，不能把包体缩小称为优化完成。
- 原生快路现在直接核对当前常量，仅pack动态字段；标量改变、函数切换或布局改变仍回到完整promotion路径。没有消除完整世界capture，也没有新的dirty写入屏障。
- 本轮改为低CPU默认的是独立的motion-reference压缩策略，**不是关闭运动同步**。见 `network-low-cpu-delta-2026-09-22.md`。
