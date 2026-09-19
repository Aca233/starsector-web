# Steam Sockets 无损状态编码与广播复用（2026-09-19）

## 状态：实质进展，但还不能启用或发布

继续处理桌面 Steam 高延迟后断开的原问题。本轮没有更改默认 legacy 入口，没有启动/登录 Steam、邀请玩家、开端口或修改防火墙，没有覆盖冻结 v3 或生成新发布包。不能用离线模型通过代替真实双账号跨网络验证。

上一轮文档 `steam-sockets-flight-2026-09-19.md` 中的计数、未实现的编码研究，均是当时的历史结果。下面的新编码已经接入**实验** room/session/wire 路径；最终结果见本文件末尾及 `artifacts/steam-sockets-packed-progress.json`。

## 本轮修改

### 1. 完整精度状态编码，不删字段、不降采样

新增 `server/steam/sockets-state-codec.mjs`：

- 对 `steam-state` 锚点/差分快照尝试 MessagePack 表示；将其中 float64 的 8 个字节位置分组存放，再使用原有 deflate level 1 压缩。接收端还原完全相同的 IEEE-754 值和 JSON 数据树。
- 保留对象键顺序、所有数字精度、字符串、数组、null 和布尔值；不量化位置、不省略游戏系统/实体、不改变物理演算、输入采样或浏览器完整状态契约。
- 仅当比既有 JSON 压缩小至少 16 字节时选择该候选。控制、输入、握手以及 oversized full fallback 保持 JSON。
- 孤立 UTF-16 surrogate、`__proto__` 键、过深/过大树、不合适或无收益候选回退到原有无损 JSON 路径，而不是修改或删除数据。
- 冻结/正常 wire/session 的独立旧测试仍使用原 JSON 默认；flight-enabled 的实验 room 使用新候选。

### 2. 有协商与边界的二进制格式

- 新增 capability bit 16，与 receipt bit 8 一起要求：实验房间的 required capabilities 变为 31。只有 receipt 能力的 15 不够，双方必须完整握手确认。
- SWS2 flags bit 2 表示 packed state，仅允许 `anchor` / `snapshot`；未知 flags 和跨分片 flag 冲突拒绝。过期 ticket / nonce 在能力检查前丢弃，不能让旧连接的包破坏当前会话。
- 压缩前的 `SMF1` 数据有 16 字节头，分别记录 magic、结构段字节数、float64 个数和规范 JSON 字节数。后面为去掉 float64 内容的 MessagePack 结构段，以及 8 个 float64 字节分组。
- 在通用 MessagePack decoder 分配数组/对象**之前**自行扫描完整结构：总节点及已声明待访问子节点合计最多 65536、深度最多 96、UTF-8 严格校验、map key 只能是字符串、不接受 binary/extension/unsafe int64/非有限数字。
- 声明长度、float 数量、实际结构、重组长度和规范 JSON 字节数必须一致；原 wire 解压上限和共享重组预算保留。状态层仍校验完整目标的 SHA256、字节数、match/epoch/token/seq，不能拿“能解码”冒充状态一致。

### 3. 房主复用广播编码，不共享会话身份

- 一个 room 共用 `SteamSnapshotEncoder` 和 `SteamSocketStateCodec`，同一广播状态的目标解析、完整候选和相同锚点差分可复用。
- 每个 session 仍有自己的 nonce、锚点状态机、wire id、在途分片及重组状态。客机离开不能清空其他人的共享缓存；关闭整个 room 才清空缓存。
- 新测试检查了缓存身份、相同广播不重复准备、peer close 不清 room 缓存、room close 清空缓存，以及各 peer 的 anchor/nonce 不相同。

## 本轮明确拒绝的窗口实验

仅通过离线注入，把最大 host flight 从 128KiB 改为 208KiB，其余使用同一新编码、单轮 control pass：

- 正常 9 客机约 48.0–49.6Hz，符合原吞吐目标。
- 但 8Mbps → 256Kbps 骤降仍在虚拟约 19.616 秒开始掉线，外部共享 FIFO 峰值 232575 字节。

因此**没有采用这个更大的窗口**。保留原 48KiB 初始 / 24KiB 最小 / 128KiB 最大窗口，也没有延长 8 秒保护。实验源代码散列及逐客机结果保存在 `steam-sockets-packed-208-*.json`；不能只引用它的正常链路好结果。

## 验证层次与剩余工作

- `check-steam-sockets-state-codec.mjs` 检查数千个随机有限 float64、精度边界、完整 JSON 往返、实际减小 payload、候选缓存/回退、声明容器放大、畸形 UTF-8 / opcode / 长度 / NaN、标记混用、解压边界及确定性字节变异。
- 原生 C++ fixture 已让 4 个 packed 数据包经过实际 native 内存复制，并还原包含 80 组运动坐标和 `Number.MIN_VALUE` 的完整状态。该证据仅为 ABI/字节/所有权验证，真实 Steam DLL 仍只做惰性导出绑定。
- 共享 FIFO/RTT/丢包/乱序模型仍是 JavaScript 调度模型，不是 Valve 实现，也不是 native-backed 共享瓶颈测试。固定丢包序列通过不代表全部相位通过。
- 正常 9 客机吞吐、soak 公平性仍需继续优化；不能以“不断线但更新过慢”替代用户要的正常联机。
- uncertain orphan flight debt 的重连回收、失序/换路时的丢失额度对账假设、真实 native 共享瓶颈及真实两账号跨网络测试仍未完成。

## 可复现成本研究

执行 `node scripts/bench-steam-sockets-state-codec.mjs`，比较 JSON/packed × 私有/共享编码器，并分别测量相同锚点及故意不同的逐客机锚点；两轮反向顺序，预热后记录。仅测合成 9 客机的传输准备及单客机解码/应用，排除游戏演算、初始 JSON 生成、native 调用及渲染；立即模拟 anchor ACK，绝不是网络测试或游戏 FPS。

### 实测成本（本机合成研究，不是游戏 FPS）

| 锚点情况 | 原 JSON / 每人私有编码器：每次 9 人广播中位耗时 | 新 packed / room 共享编码器：中位耗时 |
|---|---:|---:|
| 相同锚点 | 4.37–4.52ms | 1.04–1.09ms |
| 9 个不同锚点 | 4.39–4.42ms | 3.55–3.55ms |

相同锚点代表性差分快照（含应用头，不含 UDP 开销）平均 1708.0 → 1340.6 字节，减少 21.5%。不同锚点时共享差分的收益有限，不能只引用最佳情况。单纯加 packed 而不共享编码器会变慢：本次 9 人私有 packed 约 9.85–9.99ms，因此保留的实现同时包含共享准备。客机解码/应用增加的成本也保存在报告中。

## 最终验证结果

- 全量 `npm run steam:check`：**208 项，205 通过，3 失败，0 跳过**；输入队列独立断言 1470 通过。失败仍保留，不改阈值。
- codec/session/room 定向检查：**66/66 通过**；lint / typecheck 均退出 0。
- 原生离线检查 **1171 项断言**，4 个实际 native-copied packed 数据包；结束 native allocation / listener / connection / reassembly 为零。真实 SDK 初始化/send/receive 为零，真实 DLL 只绑定 21 个不同导出（23 次绑定）。
- 原生证据目录：`C:\Program Files (x86)\Starsector\starsector-web\artifacts\steam-sockets-native-uVh5ZA`；原生测试前后和本汇总再次验证的源码散列一致，成本测试源文件散列也一致。
- 默认入口依赖数量 5 / 29 / 27，实验模块均为 0。冻结 v3 仍为 338243922 字节，SHA256 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482`。

| 固定模型场景 | 当前结果 | 上轮各客机更新 Hz 范围 | 当前 Hz 范围 | 当前状态年龄 P95 最大值 |
|---|---|---:|---:|---:|
| healthy-three | 通过 | 58.80–59.40 | 59.40–60.00 | 164ms |
| collapse-nine | 通过 | 0.80–1.00 | 1.00–1.20 | 1692ms |
| low-start-nine | 通过 | 2.20–3.00 | 2.60–3.20 | 936ms |
| mixed-rtt | 通过 | 15.00–60.00 | 19.60–60.00 | 764ms |
| loss-reorder | 通过 | 3.80–4.60 | 15.80–34.60 | 164ms |
| soak-stall | 未通过 | 5.00–8.40 | 5.40–8.60 | 648ms |
| healthy-nine | 未通过 | 21.80–23.20 | 28.60–30.60 | 180ms |

当前实验路径 7 个固定场景未发生模型断线，其中 5 个通过全部原有门槛；soak 的最慢 peer 和正常 9 人吞吐仍不达标。default legacy 骤降仍在虚拟 20.168 秒出现 1013 / Steam link stalled。Hz 是合成状态到达率，不是渲染帧率；不能由它推断真实 Steam 延迟或稳定性。目标继续 active，尚未完成。

依赖图较上一轮多出的 `server/steam/state-consumption.mjs` 来自工作区已有/并行的 gateway 消费窗口工作（文件修改早于本次最终全量测试）；本轮没有编辑这两个文件。没有将这些变化误记为 packed 编码实现，也没有覆盖它们。
